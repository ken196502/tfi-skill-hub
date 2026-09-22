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
import { AdminNav, AdminStatus } from '../components/AdminShell'
import { ErrorBox, Loading, PageHeader, formatDate } from '../components/ui'
import type { User, UserRole } from '../lib/types'

export const Route = createFileRoute('/admin/users')({ component: UsersPage })

const ROLES: UserRole[] = ['user', 'moderator', 'admin']

function UsersPage() {
  const { user, booting } = useSession()
  const client = useQueryClient()
  const [filter, setFilter] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [showToken, setShowToken] = useState<User | null>(null)
  const [tokenValue, setTokenValue] = useState('')
  const [createForm, setCreateForm] = useState({ handle: '', displayName: '', email: '', role: 'user' })
  const [tokenForm, setTokenForm] = useState({ label: '', scope: 'full' })

  const users = useInfiniteQuery({
    queryKey: ['admin-users'],
    queryFn: ({ pageParam }) => adminListUsers(pageParam),
    initialPageParam: '',
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
  })

  const create = useMutation({
    mutationFn: () => adminCreateUser({ ...createForm, role: createForm.role }),
    onSuccess: () => {
      setCreateForm({ handle: '', displayName: '', email: '', role: 'user' })
      setShowCreate(false)
      void client.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })
  const role = useMutation({
    mutationFn: ({ id, nextRole }: { id: string; nextRole: string }) => adminSetRole(id, nextRole),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['admin-users'] }),
  })
  const ban = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => adminBanUser(id, reason),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['admin-users'] }),
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

  const error = create.error ?? role.error ?? ban.error ?? token.error
  return <div className="container page-container">
    <AdminNav active="users" />
    <PageHeader
      title="用户管理"
      subtitle={`共 ${allUsers.length}${users.hasNextPage ? '+' : ''} 位用户；管理员操作会写入审计日志。`}
      actions={<button className="btn btn-primary" type="button" onClick={() => setShowCreate((value) => !value)}>{showCreate ? '收起表单' : '创建用户'}</button>}
    />

    {showCreate && <form className="admin-form-card" onSubmit={(event) => { event.preventDefault(); create.mutate() }}>
      <div className="admin-form-grid">
        <label><span className="form-label">Handle *</span><input className="form-input" required value={createForm.handle} onChange={(event) => setCreateForm({ ...createForm, handle: event.target.value })} /></label>
        <label><span className="form-label">显示名称</span><input className="form-input" value={createForm.displayName} onChange={(event) => setCreateForm({ ...createForm, displayName: event.target.value })} /></label>
        <label><span className="form-label">邮箱</span><input className="form-input" type="email" value={createForm.email} onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })} /></label>
        <label><span className="form-label">角色</span><select className="form-input" value={createForm.role} onChange={(event) => setCreateForm({ ...createForm, role: event.target.value })}>{ROLES.map((item) => <option key={item} value={item}>{roleLabel(item)}</option>)}</select></label>
      </div>
      <div className="admin-form-actions"><button className="btn btn-primary" disabled={create.isPending} type="submit">{create.isPending ? '创建中…' : '确认创建'}</button></div>
    </form>}

    {showToken && <div className="admin-token-card">
      <div className="admin-token-header"><div><strong>为 {showToken.handle} 签发 API Token</strong><p className="muted">完整 Token 只会显示这一次，请立即复制并妥善保存。</p></div><button className="icon-btn" type="button" onClick={() => { setShowToken(null); setTokenValue('') }}>×</button></div>
      {!tokenValue ? <form className="admin-form-grid" onSubmit={(event) => { event.preventDefault(); token.mutate() }}>
        <label><span className="form-label">标签</span><input className="form-input" placeholder="例如 CI 发布" value={tokenForm.label} onChange={(event) => setTokenForm({ ...tokenForm, label: event.target.value })} /></label>
        <label><span className="form-label">权限范围</span><select className="form-input" value={tokenForm.scope} onChange={(event) => setTokenForm({ ...tokenForm, scope: event.target.value })}><option value="full">Full（读写）</option><option value="read">Read（只读）</option><option value="publish">Publish（发布）</option></select></label>
        <div className="admin-form-actions"><button className="btn btn-primary" disabled={token.isPending} type="submit">{token.isPending ? '签发中…' : '签发 Token'}</button></div>
      </form> : <div className="admin-secret-row"><code>{tokenValue}</code><button className="btn btn-secondary btn-small" type="button" onClick={() => void navigator.clipboard?.writeText(tokenValue)}>复制</button></div>}
    </div>}

    {error && <ErrorBox message={error instanceof Error ? error.message : '操作失败，请重试。'} />}
    <div className="admin-toolbar"><input className="form-input admin-search" placeholder="搜索 handle、名称或邮箱" value={filter} onChange={(event) => setFilter(event.target.value)} /><span className="muted">显示 {filteredUsers.length} 位</span></div>

    {users.isLoading ? <Loading /> : users.isError ? <ErrorBox message="加载用户失败，请稍后重试。" /> : <div className="admin-table-wrap">
      <table className="admin-table"><thead><tr><th>用户</th><th>角色</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody>
        {filteredUsers.map((item) => <tr key={item.id}>
          <td><strong>{item.displayName || item.handle}</strong><small className="admin-cell-sub">@{item.handle}{item.email ? ` · ${item.email}` : ''}</small></td>
          <td><select className="admin-inline-select" value={item.role} disabled={role.isPending || item.id === user.id} title={item.id === user.id ? '不能修改自己的角色' : undefined} onChange={(event) => role.mutate({ id: item.id, nextRole: event.target.value })}>{ROLES.map((value) => <option key={value} value={value}>{roleLabel(value)}</option>)}</select></td>
          <td><AdminStatus value={item.isBanned ? 'banned' : 'active'} />{item.banReason && <small className="admin-cell-sub">{item.banReason}</small>}</td>
          <td className="muted">{formatDate(item.createdAt)}</td>
          <td><div className="admin-actions"><button className="btn btn-secondary btn-small" type="button" onClick={() => { setShowToken(item); setTokenValue('') }}>签发 Token</button><button className="btn btn-danger btn-small" disabled={item.isBanned || item.id === user.id || ban.isPending} type="button" onClick={() => handleBan(item, () => ban.mutate({ id: item.id, reason: window.prompt('请输入封禁原因（可选）', '') ?? '' }))}>{item.isBanned ? '已封禁' : '封禁'}</button></div></td>
        </tr>)}
        {filteredUsers.length === 0 && <tr><td colSpan={5} className="admin-empty">没有匹配的用户。</td></tr>}
      </tbody></table>
    </div>}
    {users.hasNextPage && <div className="load-more"><button className="btn btn-secondary" disabled={users.isFetchingNextPage} type="button" onClick={() => void users.fetchNextPage()}>{users.isFetchingNextPage ? '加载中…' : '加载更多用户'}</button></div>}
  </div>
}

function roleLabel(role: string): string {
  return { user: '普通用户', moderator: '审核员', admin: '管理员' }[role] ?? role
}

function handleBan(item: User, action: () => void): void {
  if (window.confirm(`确定封禁 ${item.handle} 吗？封禁后该账号将无法继续使用。`)) action()
}
