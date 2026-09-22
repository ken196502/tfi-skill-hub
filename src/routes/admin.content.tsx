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
import { AdminNav, AdminStatus } from '../components/AdminShell'
import { ErrorBox, Loading, PageHeader, displayNameOf, formatDate, skillPath } from '../components/ui'
import type { SkillWithOwner } from '../lib/types'

export const Route = createFileRoute('/admin/content')({ component: ContentPage })

type ContentType = 'skills' | 'plugins'
type ContentFilter = '' | 'pending' | 'public' | 'private'

function ContentPage() {
  const { user, booting } = useSession()
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
    <PageHeader title="内容审核" subtitle="审核提交内容，控制技能和插件的审核状态及公开范围。" />
    <div className="admin-tabs">
      <button className={`admin-tab${type === 'skills' ? ' active' : ''}`} type="button" onClick={() => setType('skills')}>技能</button>
      <button className={`admin-tab${type === 'plugins' ? ' active' : ''}`} type="button" onClick={() => setType('plugins')}>插件</button>
    </div>
    <div className="admin-toolbar admin-toolbar-spaced">
      <div className="admin-filter-group">{([['pending', '待审核'], ['', '全部'], ['public', '公开'], ['private', '私有']] as Array<[ContentFilter, string]>).map(([value, label]) => <button key={value || 'all'} className={`filter-btn${filter === value ? ' active' : ''}`} type="button" onClick={() => setFilter(value)}>{label}</button>)}</div>
      <span className="muted">{items.length}{activeQuery.hasNextPage ? '+' : ''} 条</span>
    </div>
    {mutationError && <ErrorBox message={mutationError instanceof Error ? mutationError.message : '操作失败，请重试。'} />}
    {activeQuery.isLoading ? <Loading /> : activeQuery.isError ? <ErrorBox message="加载审核列表失败，请稍后重试。" /> : type === 'skills' ? <SkillTable items={items as SkillWithOwner[]} onReview={(ref, action) => reviewSkill.mutate({ ref, action })} onVisibility={(ref, visibility) => setSkillVisibility.mutate({ ref, visibility })} pending={reviewSkill.isPending || setSkillVisibility.isPending} /> : <PluginTable items={items as AdminPlugin[]} onReview={(ref, action) => reviewPlugin.mutate({ ref, action })} onVisibility={(ref, visibility) => setPluginVisibility.mutate({ ref, visibility })} pending={reviewPlugin.isPending || setPluginVisibility.isPending} />}
    {activeQuery.hasNextPage && <div className="load-more"><button className="btn btn-secondary" disabled={activeQuery.isFetchingNextPage} type="button" onClick={() => void activeQuery.fetchNextPage()}>{activeQuery.isFetchingNextPage ? '加载中…' : '加载更多'}</button></div>}
  </div>
}

function SkillTable({ items, onReview, onVisibility, pending }: { items: SkillWithOwner[]; onReview: (ref: string, action: 'approve' | 'reject') => void; onVisibility: (ref: string, visibility: string) => void; pending: boolean }) {
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>技能</th><th>作者</th><th>审核</th><th>可见性</th><th>更新时间</th><th>操作</th></tr></thead><tbody>{items.map((item) => {
    const ref = skillPath(item)
    return <tr key={item.id}><td><strong>{displayNameOf(item)}</strong><small className="admin-cell-sub">{ref}{item.category ? ` · ${item.category}` : ''}</small></td><td>{item.ownerHandle}</td><td><AdminStatus value={item.moderationStatus} /></td><td><AdminStatus value={item.visibility} /></td><td className="muted">{formatDate(item.updatedAt)}</td><td><ModerationActions status={item.moderationStatus} visibility={item.visibility} pending={pending} onReview={(action) => onReview(ref, action)} onVisibility={(visibility) => onVisibility(ref, visibility)} /></td></tr>
  })}{items.length === 0 && <tr><td colSpan={6} className="admin-empty">当前筛选下没有技能。</td></tr>}</tbody></table></div>
}

function PluginTable({ items, onReview, onVisibility, pending }: { items: AdminPlugin[]; onReview: (ref: string, action: 'approve' | 'reject') => void; onVisibility: (ref: string, visibility: string) => void; pending: boolean }) {
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>插件</th><th>作者</th><th>审核</th><th>可见性</th><th>更新时间</th><th>操作</th></tr></thead><tbody>{items.map((item) => {
    const ref = item.namespaceSlug ? `@${item.namespaceSlug}/${item.slug}` : item.slug
    return <tr key={item.id}><td><strong>{displayNameOf(item)}</strong><small className="admin-cell-sub">{ref}{item.category ? ` · ${item.category}` : ''}</small></td><td>{item.ownerHandle || '—'}</td><td><AdminStatus value={item.moderationStatus} /></td><td><AdminStatus value={item.visibility} /></td><td className="muted">{formatDate(item.updatedAt)}</td><td><ModerationActions status={item.moderationStatus} visibility={item.visibility} pending={pending} onReview={(action) => onReview(ref, action)} onVisibility={(visibility) => onVisibility(ref, visibility)} /></td></tr>
  })}{items.length === 0 && <tr><td colSpan={6} className="admin-empty">当前筛选下没有插件。</td></tr>}</tbody></table></div>
}

function ModerationActions({ status, visibility, pending, onReview, onVisibility }: { status: string; visibility: string; pending: boolean; onReview: (action: 'approve' | 'reject') => void; onVisibility: (visibility: string) => void }) {
  return <div className="admin-actions"><button className="btn btn-primary btn-small" disabled={pending} type="button" onClick={() => onReview('approve')}>{status === 'approved' ? '重新通过' : '通过'}</button><button className="btn btn-danger btn-small" disabled={pending} type="button" onClick={() => onReview('reject')}>拒绝</button><select className="admin-inline-select" disabled={pending} value={visibility} onChange={(event) => onVisibility(event.target.value)} aria-label="设置可见性"><option value="public">公开</option><option value="private">私有</option></select></div>
}
