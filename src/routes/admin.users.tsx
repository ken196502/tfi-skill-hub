import { useMemo, useState } from 'react'
import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  adminBanUser,
  adminCreateToken,
  adminCreateUser,
  adminListUsers,
  adminReviewUser,
  adminSetRole,
} from '../lib/api'
import { useSession } from '../lib/auth'
import { useT } from '../lib/i18n'
import { AdminNav, AdminStatus } from '../components/AdminShell'
import { ErrorBox, Loading, PageHeader, formatDate } from '../components/ui'
import type { User, UserRole, UserStatus } from '../lib/types'

export const Route = createFileRoute('/admin/users')({ component: UsersPage })

const ROLES: UserRole[] = ['user', 'admin']

/** `''` = no filter (every account). */
type StatusFilter = '' | UserStatus

function UsersPage() {
  const { user, booting } = useSession()
  const client = useQueryClient()
  const t = useT()
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('')
  const [showCreate, setShowCreate] = useState(false)
  const [showToken, setShowToken] = useState<User | null>(null)
  const [tokenValue, setTokenValue] = useState('')
  const [createForm, setCreateForm] = useState({ handle: '', displayName: '', email: '', role: 'user' })
  const [tokenForm, setTokenForm] = useState({ label: '', scope: 'full' })

  const users = useInfiniteQuery({
    queryKey: ['admin-users-paged', statusFilter],
    queryFn: ({ pageParam }) => adminListUsers(pageParam, statusFilter),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
  })

  const create = useMutation({
    mutationFn: () => adminCreateUser({ ...createForm, role: createForm.role }),
    onSuccess: () => {
      setCreateForm({ handle: '', displayName: '', email: '', role: 'user' })
      setShowCreate(false)
      void client.invalidateQueries({ queryKey: ['admin-users-paged'] })
    },
  })
  const role = useMutation({
    mutationFn: ({ id, nextRole }: { id: string; nextRole: string }) => adminSetRole(id, nextRole),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['admin-users-paged'] }),
  })
  const ban = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => adminBanUser(id, reason),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['admin-users-paged'] }),
  })
  const review = useMutation({
    mutationFn: ({ id, action, note }: { id: string; action: 'approve' | 'reject'; note: string }) =>
      adminReviewUser(id, action, note),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['admin-users-paged'] }),
  })
  const token = useMutation({
    mutationFn: () => adminCreateToken({ userId: showToken?.id ?? '', ...tokenForm }),
    onSuccess: (result) => setTokenValue(result.token),
  })

  const allUsers = useMemo(() => users.data?.pages.flatMap((page) => page.data) ?? [], [users.data])
  /** Same on every page of the response, so the first one is representative. */
  const pendingCount = users.data?.pages[0]?.pendingCount ?? 0
  const filteredUsers = allUsers.filter((item) => {
    const q = filter.trim().toLowerCase()
    return q === '' || [item.handle, item.displayName, item.email].some((value) => value?.toLowerCase().includes(q))
  })

  if (booting) return <Loading />
  if (!user || user.role !== 'admin') return <Navigate to="/login" />

  const roleLabel = (value: string): string =>
    ({ user: t('普通用户', 'User'), admin: t('管理员', 'Admin') })[value] ?? value

  const statusTabs: Array<{ value: StatusFilter; label: string }> = [
    { value: '', label: t('全部', 'All') },
    { value: 'pending', label: t('待审核', 'Awaiting review') },
    { value: 'approved', label: t('已通过', 'Approved') },
    { value: 'rejected', label: t('已驳回', 'Rejected') },
  ]

  const error = create.error ?? role.error ?? ban.error ?? token.error ?? review.error
  return <div className="container page-container">
    <AdminNav active="users" />
    <PageHeader
      title={t('用户管理', 'Users')}
      subtitle={`${t('共', 'Total')} ${allUsers.length}${users.hasNextPage ? '+' : ''} ${t('位用户；管理员操作会写入审计日志。', 'users; admin actions are written to the audit log.')}`}
      actions={<button className="btn btn-primary" type="button" onClick={() => setShowCreate((value) => !value)}>{showCreate ? t('收起表单', 'Hide form') : t('创建用户', 'Create user')}</button>}
    />

    {pendingCount > 0 && statusFilter !== 'pending' && <div className="admin-callout">
      <span>{t(`${pendingCount} 位用户等待审核。`, `${pendingCount} account(s) are waiting for review.`)}</span>
      <button className="btn btn-primary btn-small" type="button" onClick={() => setStatusFilter('pending')}>{t('去审核', 'Review now')}</button>
    </div>}

    {showCreate && <form className="admin-form-card" onSubmit={(event) => { event.preventDefault(); create.mutate() }}>
      <div className="admin-form-grid">
        <label><span className="form-label">Handle *</span><input className="form-input" required value={createForm.handle} onChange={(event) => setCreateForm({ ...createForm, handle: event.target.value })} /></label>
        <label><span className="form-label">{t('显示名称', 'Display name')}</span><input className="form-input" value={createForm.displayName} onChange={(event) => setCreateForm({ ...createForm, displayName: event.target.value })} /></label>
        <label><span className="form-label">{t('邮箱', 'Email')}</span><input className="form-input" type="email" value={createForm.email} onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })} /></label>
        <label><span className="form-label">{t('角色', 'Role')}</span><select className="form-input" value={createForm.role} onChange={(event) => setCreateForm({ ...createForm, role: event.target.value })}>{ROLES.map((item) => <option key={item} value={item}>{roleLabel(item)}</option>)}</select></label>
      </div>
      <div className="admin-form-actions"><button className="btn btn-primary" disabled={create.isPending} type="submit">{create.isPending ? t('创建中…', 'Creating…') : t('确认创建', 'Create')}</button></div>
    </form>}

    {showToken && <div className="admin-token-card">
      <div className="admin-token-header"><div><strong>{t('为', 'Mint an API token for')} {showToken.handle}</strong><p className="muted">{t('完整 Token 只会显示这一次，请立即复制并妥善保存。', 'The full token is shown only once — copy and store it now.')}</p></div><button className="icon-btn" type="button" onClick={() => { setShowToken(null); setTokenValue('') }}>×</button></div>
      {!tokenValue ? <form className="admin-form-grid" onSubmit={(event) => { event.preventDefault(); token.mutate() }}>
        <label><span className="form-label">{t('标签', 'Label')}</span><input className="form-input" placeholder={t('例如 CI 发布', 'e.g. CI publishing')} value={tokenForm.label} onChange={(event) => setTokenForm({ ...tokenForm, label: event.target.value })} /></label>
        <label><span className="form-label">{t('权限范围', 'Scope')}</span><select className="form-input" value={tokenForm.scope} onChange={(event) => setTokenForm({ ...tokenForm, scope: event.target.value })}><option value="full">{t('Full（读写）', 'Full (read/write)')}</option><option value="read">{t('Read（只读）', 'Read (read-only)')}</option><option value="publish">{t('Publish（发布）', 'Publish')}</option></select></label>
        <div className="admin-form-actions"><button className="btn btn-primary" disabled={token.isPending} type="submit">{token.isPending ? t('签发中…', 'Minting…') : t('签发 Token', 'Mint token')}</button></div>
      </form> : <div className="admin-secret-row"><code>{tokenValue}</code><button className="btn btn-secondary btn-small" type="button" onClick={() => void navigator.clipboard?.writeText(tokenValue)}>{t('复制', 'Copy')}</button></div>}
    </div>}

    {error && <ErrorBox message={error instanceof Error ? error.message : t('操作失败，请重试。', 'Action failed. Please try again.')} />}
    <div className="admin-toolbar">
      <div className="admin-filter-group">
        {statusTabs.map((tab) => <button key={tab.value} type="button" className={`admin-tab${statusFilter === tab.value ? ' active' : ''}`} onClick={() => setStatusFilter(tab.value)}>
          {tab.label}{tab.value === 'pending' && pendingCount > 0 ? ` (${pendingCount})` : ''}
        </button>)}
      </div>
      <input className="form-input admin-search" placeholder={t('搜索 handle、名称或邮箱', 'Search handle, name, or email')} value={filter} onChange={(event) => setFilter(event.target.value)} />
      <span className="muted">{t('显示', 'Showing')} {filteredUsers.length} {t('位', '')}</span>
    </div>

    {users.isLoading ? <Loading /> : users.isError ? <ErrorBox message={t('加载用户失败，请稍后重试。', 'Failed to load users. Please try again later.')} /> : <div className="admin-table-wrap">
      <table className="admin-table"><thead><tr><th>{t('用户', 'User')}</th><th>{t('审核', 'Review')}</th><th>{t('角色', 'Role')}</th><th>{t('状态', 'Status')}</th><th>{t('创建时间', 'Created')}</th><th>{t('操作', 'Actions')}</th></tr></thead><tbody>
        {filteredUsers.map((item) => <tr key={item.id}>
          <td><strong>{item.displayName || item.handle}</strong><small className="admin-cell-sub">@{item.handle}{item.email ? ` · ${item.email}` : ''}</small></td>
          <td><AdminStatus value={item.status} />{item.status === 'rejected' && item.reviewNote && <small className="admin-cell-sub">{item.reviewNote}</small>}</td>
          <td><select className="admin-inline-select" value={item.role} disabled={role.isPending || item.id === user.id} title={item.id === user.id ? t('不能修改自己的角色', 'You cannot change your own role') : undefined} onChange={(event) => role.mutate({ id: item.id, nextRole: event.target.value })}>{ROLES.map((value) => <option key={value} value={value}>{roleLabel(value)}</option>)}</select></td>
          <td><div className="admin-status-row"><AdminStatus value={item.isBanned ? 'banned' : 'active'} />{item.isBanned && item.banReason && <small className="admin-cell-sub">{item.banReason}</small>}</div></td>
          <td className="muted">{formatDate(item.createdAt)}</td>
          <td><div className="admin-actions">
            <button className="btn btn-primary btn-small" type="button" disabled={review.isPending || item.status === 'approved' || item.id === user.id} onClick={() => review.mutate({ id: item.id, action: 'approve', note: '' })}>{t('通过', 'Approve')}</button>
            <button className="btn btn-danger btn-small" type="button" disabled={review.isPending || item.status === 'rejected' || item.id === user.id} onClick={() => handleReject(item, t, (note) => review.mutate({ id: item.id, action: 'reject', note }))}>{t('驳回', 'Reject')}</button>
            <button className="btn btn-secondary btn-small" type="button" onClick={() => { setShowToken(item); setTokenValue('') }}>{t('签发 Token', 'Mint token')}</button>
            <button className="btn btn-danger btn-small" disabled={item.isBanned || item.id === user.id || ban.isPending} type="button" onClick={() => handleBan(item, t, () => ban.mutate({ id: item.id, reason: window.prompt(t('请输入封禁原因（可选）', 'Enter a ban reason (optional)'), '') ?? '' }))}>{item.isBanned ? t('已封禁', 'Banned') : t('封禁', 'Ban')}</button>
          </div></td>
        </tr>)}
        {filteredUsers.length === 0 && <tr><td colSpan={6} className="admin-empty">{t('没有匹配的用户。', 'No matching users.')}</td></tr>}
      </tbody></table>
    </div>}
    {users.hasNextPage && <div className="load-more"><button className="btn btn-secondary" disabled={users.isFetchingNextPage} type="button" onClick={() => void users.fetchNextPage()}>{users.isFetchingNextPage ? t('加载中…', 'Loading…') : t('加载更多用户', 'Load more users')}</button></div>}
  </div>
}

function handleBan(item: User, t: (zh: string, en: string) => string, action: () => void): void {
  if (window.confirm(`${t('确定封禁', 'Ban')} ${item.handle} ${t('吗？封禁后该账号将无法继续使用。', "? The account will no longer be usable.")}`)) action()
}

function handleReject(
  item: User,
  t: (zh: string, en: string) => string,
  action: (note: string) => void,
): void {
  if (!window.confirm(`${t('确定驳回', 'Reject')} ${item.handle} ${t('的注册申请吗？该账号将无法登录。', "'s registration? The account will not be able to sign in.")}`)) return
  const note = window.prompt(t('填写驳回理由（可选，会记录在审计日志中）', 'Reason (optional, recorded in the audit log)'), '')
  // A cancelled prompt is still a decision to reject — only the note is skipped.
  action(note ?? '')
}
