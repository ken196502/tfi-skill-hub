import { useState } from 'react'
import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useInfiniteQuery } from '@tanstack/react-query'
import { adminAuditLogs } from '../lib/api'
import { useSession } from '../lib/auth'
import { AdminNav } from '../components/AdminShell'
import { ErrorBox, Loading, PageHeader, formatDate } from '../components/ui'

export const Route = createFileRoute('/admin/audit-logs')({ component: AuditLogsPage })

const ACTIONS = [
  ['', '全部操作'],
  ['admin_create_user', '创建用户'],
  ['set_role', '调整角色'],
  ['ban_user', '封禁用户'],
  ['admin_create_token', '签发 Token'],
  ['replace_featured_skills', '更新首页精选'],
  ['review_skill_approve', '通过技能审核'],
  ['review_skill_reject', '拒绝技能审核'],
  ['set_skill_visibility', '设置技能可见性'],
  ['review_plugin_approve', '通过插件审核'],
  ['review_plugin_reject', '拒绝插件审核'],
  ['set_plugin_visibility', '设置插件可见性'],
] as const

const RESOURCE_TYPES = [
  ['', '全部资源'],
  ['user', '用户'],
  ['api_token', 'API Token'],
  ['skill', '技能'],
  ['plugin', '插件'],
  ['featured_skills', '首页精选'],
] as const

function AuditLogsPage() {
  const { user, booting } = useSession()
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

  return <div className="container page-container">
    <AdminNav active="audit" />
    <PageHeader title="审计日志" subtitle="查看管理员对用户、内容和首页配置执行的操作。" />
    <div className="admin-toolbar admin-toolbar-spaced"><div className="admin-filter-group"><select className="form-input admin-filter-select" value={action} onChange={(event) => setAction(event.target.value)}>{ACTIONS.map(([value, label]) => <option key={value || 'all'} value={value}>{label}</option>)}</select><select className="form-input admin-filter-select" value={resourceType} onChange={(event) => setResourceType(event.target.value)}>{RESOURCE_TYPES.map(([value, label]) => <option key={value || 'all'} value={value}>{label}</option>)}</select></div><span className="muted">已加载 {items.length}{logs.hasNextPage ? '+' : ''} 条</span></div>
    {logs.isLoading ? <Loading /> : logs.isError ? <ErrorBox message="加载审计日志失败，请稍后重试。" /> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>时间</th><th>操作</th><th>资源</th><th>详情</th><th>来源 IP</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td className="muted">{formatDate(item.createdAt)}<small className="admin-cell-sub">{formatTime(item.createdAt)}</small></td><td><strong>{actionLabel(item.action)}</strong><small className="admin-cell-sub">{item.action}</small></td><td><span>{resourceLabel(item.resourceType)}</span>{item.resourceId && <small className="admin-cell-sub admin-mono">{item.resourceId}</small>}</td><td className="admin-details">{item.details || '—'}</td><td className="muted admin-mono">{item.ipAddress || '—'}</td></tr>)}{items.length === 0 && <tr><td colSpan={5} className="admin-empty">没有匹配的审计记录。</td></tr>}</tbody></table></div>}
    {logs.hasNextPage && <div className="load-more"><button className="btn btn-secondary" disabled={logs.isFetchingNextPage} type="button" onClick={() => void logs.fetchNextPage()}>{logs.isFetchingNextPage ? '加载中…' : '加载更多日志'}</button></div>}
  </div>
}

function actionLabel(value: string): string {
  return Object.fromEntries(ACTIONS.map(([key, label]) => [key, label]))[value] ?? value
}

function resourceLabel(value: string): string {
  return Object.fromEntries(RESOURCE_TYPES.map(([key, label]) => [key, label]))[value] ?? value
}

function formatTime(value: string): string {
  const time = new Date(value)
  return Number.isNaN(time.getTime()) ? '—' : time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
