import { useMemo, useState } from 'react'
import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  adminListPlugins,
  adminListSkills,
  adminReviewPlugin,
  adminReviewSkill,
  adminSetPluginVisibility,
  adminSetSkillVisibility,
  type AdminPlugin,
} from '../lib/api'
import { useSession } from '../lib/auth'
import { useLang, useT, localizedName } from '../lib/i18n'
import { AdminNav, AdminStatus } from '../components/AdminShell'
import { ErrorBox, Loading, PageHeader, formatDate, skillPath } from '../components/ui'
import type { SkillWithOwner } from '../lib/types'

export const Route = createFileRoute('/admin/content')({ component: ContentPage })

type ContentType = 'skills' | 'plugins'
type ContentFilter = '' | 'pending' | 'public' | 'private'

function ContentPage() {
  const { user, booting } = useSession()
  const t = useT()
  const [type, setType] = useState<ContentType>('skills')
  const [filter, setFilter] = useState<ContentFilter>('pending')
  const client = useQueryClient()
  const skills = useInfiniteQuery({
    queryKey: ['admin-content-skills', filter],
    queryFn: ({ pageParam }) => adminListSkills(filter, pageParam, 20),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor || undefined,
    enabled: type === 'skills',
  })
  const plugins = useInfiniteQuery({
    queryKey: ['admin-content-plugins', filter],
    queryFn: ({ pageParam }) => adminListPlugins(filter, pageParam, 20),
    initialPageParam: '',
    getNextPageParam: (page) => page.nextCursor || undefined,
    enabled: type === 'plugins',
  })

  const reviewSkill = useMutation({
    mutationFn: ({ ref, action }: { ref: string; action: 'approve' | 'reject' }) => adminReviewSkill(ref, action),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['admin-content-skills'] }); void client.invalidateQueries({ queryKey: ['admin-skills'] }) },
  })
  const setSkillVisibility = useMutation({
    mutationFn: ({ ref, visibility }: { ref: string; visibility: string }) => adminSetSkillVisibility(ref, visibility),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['admin-content-skills'] }); void client.invalidateQueries({ queryKey: ['admin-skills'] }) },
  })
  const reviewPlugin = useMutation({
    mutationFn: ({ ref, action }: { ref: string; action: 'approve' | 'reject' }) => adminReviewPlugin(ref, action),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['admin-content-plugins'] }),
  })
  const setPluginVisibility = useMutation({
    mutationFn: ({ ref, visibility }: { ref: string; visibility: string }) => adminSetPluginVisibility(ref, visibility),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['admin-content-plugins'] }),
  })

  const items = useMemo(() => type === 'skills'
    ? skills.data?.pages.flatMap((page) => page.data) ?? []
    : plugins.data?.pages.flatMap((page) => page.data) ?? [], [plugins.data, skills.data, type])
  const activeQuery = type === 'skills' ? skills : plugins
  const mutationError = reviewSkill.error ?? setSkillVisibility.error ?? reviewPlugin.error ?? setPluginVisibility.error

  if (booting) return <Loading />
  if (!user || user.role !== 'admin') return <Navigate to="/login" />

  return <div className="container page-container">
    <AdminNav active="content" />
    <PageHeader title={t('内容审核', 'Content review')} subtitle={t('审核提交内容，控制技能和插件的审核状态及公开范围。', 'Review submissions and control the moderation status and visibility of skills and plugins.')} />
    <div className="admin-tabs">
      <button className={`admin-tab${type === 'skills' ? ' active' : ''}`} type="button" onClick={() => setType('skills')}>{t('技能', 'Skills')}</button>
      <button className={`admin-tab${type === 'plugins' ? ' active' : ''}`} type="button" onClick={() => setType('plugins')}>{t('插件', 'Plugins')}</button>
    </div>
    <div className="admin-toolbar admin-toolbar-spaced">
      <div className="admin-filter-group">{([['pending', t('待审核', 'Pending')], ['', t('全部', 'All')], ['public', t('公开', 'Public')], ['private', t('私有', 'Private')]] as Array<[ContentFilter, string]>).map(([value, label]) => <button key={value || 'all'} className={`filter-btn${filter === value ? ' active' : ''}`} type="button" onClick={() => setFilter(value)}>{label}</button>)}</div>
      <span className="muted">{items.length}{activeQuery.hasNextPage ? '+' : ''}</span>
    </div>
    {mutationError && <ErrorBox message={mutationError instanceof Error ? mutationError.message : t('操作失败，请重试。', 'Action failed. Please try again.')} />}
    {activeQuery.isLoading ? <Loading /> : activeQuery.isError ? <ErrorBox message={t('加载审核列表失败，请稍后重试。', 'Failed to load the review list. Please try again later.')} /> : type === 'skills' ? <SkillTable items={items as SkillWithOwner[]} onReview={(ref, action) => reviewSkill.mutate({ ref, action })} onVisibility={(ref, visibility) => setSkillVisibility.mutate({ ref, visibility })} pending={reviewSkill.isPending || setSkillVisibility.isPending} /> : <PluginTable items={items as AdminPlugin[]} onReview={(ref, action) => reviewPlugin.mutate({ ref, action })} onVisibility={(ref, visibility) => setPluginVisibility.mutate({ ref, visibility })} pending={reviewPlugin.isPending || setPluginVisibility.isPending} />}
    {activeQuery.hasNextPage && <div className="load-more"><button className="btn btn-secondary" disabled={activeQuery.isFetchingNextPage} type="button" onClick={() => void activeQuery.fetchNextPage()}>{activeQuery.isFetchingNextPage ? t('加载中…', 'Loading…') : t('加载更多', 'Load more')}</button></div>}
  </div>
}

function SkillTable({ items, onReview, onVisibility, pending }: { items: SkillWithOwner[]; onReview: (ref: string, action: 'approve' | 'reject') => void; onVisibility: (ref: string, visibility: string) => void; pending: boolean }) {
  const { lang } = useLang()
  const t = useT()
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{t('技能', 'Skill')}</th><th>{t('作者', 'Author')}</th><th>{t('审核', 'Review')}</th><th>{t('可见性', 'Visibility')}</th><th>{t('更新时间', 'Updated')}</th><th>{t('操作', 'Actions')}</th></tr></thead><tbody>{items.map((item) => {
    const ref = skillPath(item)
    return <tr key={item.id}><td><strong>{localizedName(item, lang)}</strong><small className="admin-cell-sub">{ref}{item.category ? ` · ${item.category}` : ''}</small></td><td>{item.ownerHandle}</td><td><AdminStatus value={item.moderationStatus} /></td><td><AdminStatus value={item.visibility} /></td><td className="muted">{formatDate(item.updatedAt)}</td><td><ModerationActions status={item.moderationStatus} visibility={item.visibility} pending={pending} onReview={(action) => onReview(ref, action)} onVisibility={(visibility) => onVisibility(ref, visibility)} /></td></tr>
  })}{items.length === 0 && <tr><td colSpan={6} className="admin-empty">{t('当前筛选下没有技能。', 'No skills match the current filter.')}</td></tr>}</tbody></table></div>
}

function PluginTable({ items, onReview, onVisibility, pending }: { items: AdminPlugin[]; onReview: (ref: string, action: 'approve' | 'reject') => void; onVisibility: (ref: string, visibility: string) => void; pending: boolean }) {
  const { lang } = useLang()
  const t = useT()
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{t('插件', 'Plugin')}</th><th>{t('作者', 'Author')}</th><th>{t('审核', 'Review')}</th><th>{t('可见性', 'Visibility')}</th><th>{t('更新时间', 'Updated')}</th><th>{t('操作', 'Actions')}</th></tr></thead><tbody>{items.map((item) => {
    const ref = item.namespaceSlug ? `@${item.namespaceSlug}/${item.slug}` : item.slug
    return <tr key={item.id}><td><strong>{localizedName(item, lang)}</strong><small className="admin-cell-sub">{ref}{item.category ? ` · ${item.category}` : ''}</small></td><td>{item.ownerHandle || '—'}</td><td><AdminStatus value={item.moderationStatus} /></td><td><AdminStatus value={item.visibility} /></td><td className="muted">{formatDate(item.updatedAt)}</td><td><ModerationActions status={item.moderationStatus} visibility={item.visibility} pending={pending} onReview={(action) => onReview(ref, action)} onVisibility={(visibility) => onVisibility(ref, visibility)} /></td></tr>
  })}{items.length === 0 && <tr><td colSpan={6} className="admin-empty">{t('当前筛选下没有插件。', 'No plugins match the current filter.')}</td></tr>}</tbody></table></div>
}

function ModerationActions({ status, visibility, pending, onReview, onVisibility }: { status: string; visibility: string; pending: boolean; onReview: (action: 'approve' | 'reject') => void; onVisibility: (visibility: string) => void }) {
  const t = useT()
  return <div className="admin-actions"><button className="btn btn-primary btn-small" disabled={pending} type="button" onClick={() => onReview('approve')}>{status === 'approved' ? t('重新通过', 'Re-approve') : t('通过', 'Approve')}</button><button className="btn btn-danger btn-small" disabled={pending} type="button" onClick={() => onReview('reject')}>{t('拒绝', 'Reject')}</button><select className="admin-inline-select" disabled={pending} value={visibility} onChange={(event) => onVisibility(event.target.value)} aria-label={t('设置可见性', 'Set visibility')}><option value="public">{t('公开', 'Public')}</option><option value="private">{t('私有', 'Private')}</option></select></div>
}
