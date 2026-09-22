import { useMemo, useState } from 'react'
import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  adminBanUser,
  adminCreateToken,
  adminCreateUser,
  adminListUsers,
  adminSetRole,
} from '../lib/api'
import { useSession } from '../lib/auth'
import { useT } from '../lib/i18n'
import { AdminNav, AdminStatus } from '../components/AdminShell'
import { ErrorBox, Loading, PageHeader, formatDate } from '../components/ui'
import type { User, UserRole } from '../lib/types'

export const Route = createFileRoute('/admin/users')({ component: UsersPage })

const ROLES: UserRole[] = ['user', 'moderator', 'admin']

function UsersPage() {
  const { user, booting } = useSession()
  const client = useQueryClient()
  const t = useT()
  const [filter, setFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showToken, setShowToken] = useState<User | null>(null)
  const [tokenValue, setTokenValue] = useState('')
  const [createForm, setCreateForm] = useState({ handle: '', displayName: '', email: '', role: 'user' })
  const [tokenForm, setTokenForm] = useState({ label: '', scope: 'full' })

  const users = useInfiniteQuery({
    queryKey: ['admin-users-paged'],
    queryFn: ({ pageParam }) => adminListUsers(pageParam),
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
  const token = useMutation({
    mutationFn: () => adminCreateToken({ userId: showToken?.id ?? '', ...tokenForm }),
    onSuccess: (result) => setTokenValue(result.token),
  })

  const allUsers = useMemo(() => users.data?.pages.flatMap((page) => page.data) ?? [], [users.data])
  const filteredUsers = allUsers.filter((item) => {
    const q = filter.trim().toLowerCase()
    return q === '' || [item.handle, item.displayName, item.email].some((value) => value?.toLowerCase().includes(q))
  })

  if (booting) return <Loading />
  if (!user || user.role !== 'admin') return <Navigate to="/login" />

  const roleLabel = (value: string): string =>
    ({ user: t('普通用户', 'User'), moderator: t('审核员', 'Moderator'), admin: t('管理员', 'Admin') })[value] ?? value

  const error = create.error ?? role.error ?? ban.error ?? token.error
  return <div className="container page-container">
    <AdminNav active="users" />
    <PageHeader
      title={t('用户管理', 'Users')}
      subtitle={`${t('共', 'Total')} ${allUsers.length}${users.hasNextPage ? '+' : ''} ${t('位用户；管理员操作会写入审计日志。', 'users; admin actions are written to the audit log.')}`}
      actions={<button className="btn btn-primary" type="button" onClick={() => setShowCreate((value) => !value)}>{showCreate ? t('收起表单', 'Hide form') : t('创建用户', 'Create user')}</button>}
    />

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
    <div className="admin-toolbar"><input className="form-input admin-search" placeholder={t('搜索 handle、名称或邮箱', 'Search handle, name, or email')} value={filter} onChange={(event) => setFilter(event.target.value)} /><span className="muted">{t('显示', 'Showing')} {filteredUsers.length} {t('位', '')}</span></div>

    {users.isLoading ? <Loading /> : users.isError ? <ErrorBox message={t('加载用户失败，请稍后重试。', 'Failed to load users. Please try again later.')} /> : <div className="admin-table-wrap">
      <table className="admin-table"><thead><tr><th>{t('用户', 'User')}</th><th>{t('角色', 'Role')}</th><th>{t('状态', 'Status')}</th><th>{t('创建时间', 'Created')}</th><th>{t('操作', 'Actions')}</th></tr></thead><tbody>
        {filteredUsers.map((item) => <tr key={item.id}>
          <td><strong>{item.displayName || item.handle}</strong><small className="admin-cell-sub">@{item.handle}{item.email ? ` · ${item.email}` : ''}</small></td>
          <td><select className="admin-inline-select" value={item.role} disabled={role.isPending || item.id === user.id} title={item.id === user.id ? t('不能修改自己的角色', 'You cannot change your own role') : undefined} onChange={(event) => role.mutate({ id: item.id, nextRole: event.target.value })}>{ROLES.map((value) => <option key={value} value={value}>{roleLabel(value)}</option>)}</select></td>
          <td><AdminStatus value={item.isBanned ? 'banned' : 'active'} />{item.banReason && <small className="admin-cell-sub">{item.banReason}</small>}</td>
          <td className="muted">{formatDate(item.createdAt)}</td>
          <td><div className="admin-actions"><button className="btn btn-secondary btn-small" type="button" onClick={() => { setShowToken(item); setTokenValue('') }}>{t('签发 Token', 'Mint token')}</button><button className="btn btn-danger btn-small" disabled={item.isBanned || item.id === user.id || ban.isPending} type="button" onClick={() => handleBan(item, t, () => ban.mutate({ id: item.id, reason: window.prompt(t('请输入封禁原因（可选）', 'Enter a ban reason (optional)'), '') ?? '' }))}>{item.isBanned ? t('已封禁', 'Banned') : t('封禁', 'Ban')}</button></div></td>
        </tr>)}
        {filteredUsers.length === 0 && <tr><td colSpan={5} className="admin-empty">{t('没有匹配的用户。', 'No matching users.')}</td></tr>}
      </tbody></table>
    </div>}
    {users.hasNextPage && <div className="load-more"><button className="btn btn-secondary" disabled={users.isFetchingNextPage} type="button" onClick={() => void users.fetchNextPage()}>{users.isFetchingNextPage ? t('加载中…', 'Loading…') : t('加载更多用户', 'Load more users')}</button></div>}
  </div>
}

function handleBan(item: User, t: (zh: string, en: string) => string, action: () => void): void {
  if (window.confirm(`${t('确定封禁', 'Ban')} ${item.handle} ${t('吗？封禁后该账号将无法继续使用。', "? The account will no longer be usable.")}`)) action()
}
