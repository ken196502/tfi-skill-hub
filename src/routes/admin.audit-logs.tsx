import { useState } from 'react'
import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useInfiniteQuery } from '@tanstack/react-query'
import { adminAuditLogs } from '../lib/api'
import { useSession } from '../lib/auth'
import { useT } from '../lib/i18n'
import { AdminNav } from '../components/AdminShell'
import { ErrorBox, Loading, PageHeader, formatDate } from '../components/ui'

export const Route = createFileRoute('/admin/audit-logs')({ component: AuditLogsPage })

/** Action / resource labels, bilingual: `[zh, en]` keyed by the raw value. */
const ACTION_LABELS: Record<string, [string, string]> = {
  admin_create_user: ['创建用户', 'Create user'],
  register_user: ['用户注册', 'Register account'],
  review_user_approve: ['通过用户审核', 'Approve account'],
  review_user_reject: ['驳回用户注册', 'Reject account'],
  set_role: ['调整角色', 'Change role'],
  ban_user: ['封禁用户', 'Ban user'],
  admin_create_token: ['签发 Token', 'Mint token'],
  replace_featured_skills: ['更新首页精选', 'Update featured skills'],
  list_skill: ['上架技能', 'List skill'],
  unlist_skill: ['下架技能', 'Unlist skill'],
}

const RESOURCE_LABELS: Record<string, [string, string]> = {
  user: ['用户', 'User'],
  api_token: ['API Token', 'API token'],
  skill: ['技能', 'Skill'],
  skill_version: ['技能版本', 'Skill version'],
  knowledge_base: ['知识库', 'Knowledge base'],
  knowledge_base_version: ['知识库版本', 'Knowledge base version'],
  featured_skills: ['首页精选', 'Featured skills'],
}

/**
 * The shelf actions are one endpoint for both kinds of entry, so their wording
 * has to read the resource beside them — a knowledge base going live is
 * "上架知识库", not "上架技能".
 */
const LISTING_LABELS_BY_RESOURCE: Record<string, [string, string]> = {
  knowledge_base: ['上架知识库', 'List knowledge base'],
}
const UNLISTING_LABELS_BY_RESOURCE: Record<string, [string, string]> = {
  knowledge_base: ['下架知识库', 'Unlist knowledge base'],
}

function AuditLogsPage() {
  const { user, booting } = useSession()
  const t = useT()
  const [action, setAction] = useState('')
  const [resourceType, setResourceType] = useState('')
  const logs = useInfiniteQuery({
    queryKey: ['admin-audit-logs', { action, resourceType }],
    queryFn: ({ pageParam }) => adminAuditLogs({ limit: 50, cursor: pageParam, action, resourceType }),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor || undefined,
  })
  if (booting) return <Loading />
  if (!user || user.role !== 'admin') return <Navigate to="/login" />
  const items = logs.data?.pages.flatMap((page) => page.data) ?? []

  const actionLabel = (value: string, resourceType: string): string => {
    if (value === 'list_skill') {
      const listing = LISTING_LABELS_BY_RESOURCE[resourceType]
      if (listing) return t(listing[0], listing[1])
    }
    if (value === 'unlist_skill') {
      const unlisting = UNLISTING_LABELS_BY_RESOURCE[resourceType]
      if (unlisting) return t(unlisting[0], unlisting[1])
    }
    const pair = ACTION_LABELS[value]
    return pair ? t(pair[0], pair[1]) : value
  }
  const resourceLabel = (value: string): string => {
    const pair = RESOURCE_LABELS[value]
    return pair ? t(pair[0], pair[1]) : value
  }

  const actionOptions: Array<[string, string]> = [
    ['', t('全部操作', 'All actions')],
    ...Object.entries(ACTION_LABELS).map(([value, pair]) => [value, t(pair[0], pair[1])] as [string, string]),
  ]
  const resourceOptions: Array<[string, string]> = [
    ['', t('全部资源', 'All resources')],
    ...Object.entries(RESOURCE_LABELS).map(([value, pair]) => [value, t(pair[0], pair[1])] as [string, string]),
  ]

  return <div className="container page-container">
    <AdminNav active="audit" />
    <PageHeader
      title={t('审计日志', 'Audit logs')}
      subtitle={t('查看管理员对用户、内容和首页配置执行的操作。', 'Review admin actions on users, content, and homepage curation.')}
    />
    <div className="admin-toolbar admin-toolbar-spaced"><div className="admin-filter-group"><select className="form-input admin-filter-select" value={action} onChange={(event) => setAction(event.target.value)}>{actionOptions.map(([value, label]) => <option key={value || 'all'} value={value}>{label}</option>)}</select><select className="form-input admin-filter-select" value={resourceType} onChange={(event) => setResourceType(event.target.value)}>{resourceOptions.map(([value, label]) => <option key={value || 'all'} value={value}>{label}</option>)}</select></div><span className="muted">{t('已加载', 'Loaded')} {items.length}{logs.hasNextPage ? '+' : ''}</span></div>
    {logs.isLoading ? <Loading /> : logs.isError ? <ErrorBox message={t('加载审计日志失败，请稍后重试。', 'Failed to load audit logs. Please try again later.')} /> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{t('时间', 'Time')}</th><th>{t('操作', 'Action')}</th><th>{t('资源', 'Resource')}</th><th>{t('详情', 'Details')}</th><th>{t('来源 IP', 'Source IP')}</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td className="muted">{formatDate(item.createdAt)}<small className="admin-cell-sub">{formatTime(item.createdAt)}</small></td><td><strong>{actionLabel(item.action, item.resourceType)}</strong><small className="admin-cell-sub">{item.action}</small></td><td><span>{resourceLabel(item.resourceType)}</span>{item.resourceId && <small className="admin-cell-sub admin-mono">{item.resourceId}</small>}</td><td className="admin-details">{item.details || '—'}</td><td className="muted admin-mono">{item.ipAddress || '—'}</td></tr>)}{items.length === 0 && <tr><td colSpan={5} className="admin-empty">{t('没有匹配的审计记录。', 'No matching audit records.')}</td></tr>}</tbody></table></div>}
    {logs.hasNextPage && <div className="load-more"><button className="btn btn-secondary" disabled={logs.isFetchingNextPage} type="button" onClick={() => void logs.fetchNextPage()}>{logs.isFetchingNextPage ? t('加载中…', 'Loading…') : t('加载更多日志', 'Load more logs')}</button></div>}
  </div>
}

function formatTime(value: string): string {
  const time = new Date(value)
  return Number.isNaN(time.getTime()) ? '—' : time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
