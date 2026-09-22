import { useState, type FormEvent } from 'react'
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '../lib/api'
import { useSession } from '../lib/auth'
import { Loading, ErrorBox, PageHeader, formatDate } from '../components/ui'

export const Route = createFileRoute('/namespaces/$slug')({
  component: NamespaceDetailPage,
})

type Tab = 'members' | 'invitations' | 'tokens'

function NamespaceDetailPage() {
  const { slug } = useParams({ from: '/namespaces/$slug' })
  const { user } = useSession()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('members')
  const [error, setError] = useState('')
  const [newToken, setNewToken] = useState('')

  const ns = useQuery({
    queryKey: ['namespace', slug],
    queryFn: () => api.getNamespace(slug),
    retry: false,
  })
  const members = useQuery({
    queryKey: ['namespace', slug, 'members'],
    queryFn: () => api.listNamespaceMembers(slug),
    enabled: tab === 'members' && ns.isSuccess,
  })
  const invitations = useQuery({
    queryKey: ['namespace', slug, 'invitations'],
    queryFn: () => api.listInvitations(slug),
    enabled: tab === 'invitations' && ns.isSuccess,
  })
  const tokens = useQuery({
    queryKey: ['namespace', slug, 'tokens'],
    queryFn: () => api.listNamespaceTokens(slug),
    enabled: tab === 'tokens' && ns.isSuccess,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['namespace', slug] })

  const addMember = useMutation({
    mutationFn: ({ handle, role }: { handle: string; role: string }) =>
      api.addNamespaceMember(slug, handle, role),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof Error ? e.message : '添加成员失败'),
  })
  const removeMember = useMutation({
    mutationFn: (handle: string) => api.removeNamespaceMember(slug, handle),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof Error ? e.message : '移除成员失败'),
  })
  const invite = useMutation({
    mutationFn: ({ handle, role }: { handle: string; role: string }) =>
      api.inviteToNamespace(slug, handle, role),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof Error ? e.message : '发送邀请失败'),
  })
  const createToken = useMutation({
    mutationFn: (input: { label: string; scope: string; expiresIn: string }) =>
      api.createNamespaceToken(slug, input),
    onSuccess: (result) => {
      setNewToken(result.token)
      void invalidate()
    },
    onError: (e) => setError(e instanceof Error ? e.message : '创建 Token 失败'),
  })
  const revokeToken = useMutation({
    mutationFn: (id: string) => api.revokeNamespaceToken(slug, id),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof Error ? e.message : '吊销 Token 失败'),
  })

  if (ns.isLoading) return <Loading />
  if (ns.isError) {
    return (
      <div className="container" style={{ paddingTop: 60 }}>
        <h1 className="detail-title">命名空间不存在</h1>
        <Link to="/namespaces" className="btn btn-secondary">
          返回命名空间列表
        </Link>
      </div>
    )
  }

  const n = ns.data!
  const isPersonal = n.type === 'personal'
  const canManageTokens = !isPersonal && (n.ownerId === user?.id || user?.role === 'admin')

  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <PageHeader
        title={n.displayName || n.slug}
        subtitle={n.description || '暂无描述'}
        actions={
          <Link to="/namespaces" className="btn btn-secondary btn-small">
            返回命名空间列表
          </Link>
        }
      />

      <div className="tab-bar">
        <button
          type="button"
          className={`tab-btn${tab === 'members' ? ' active' : ''}`}
          onClick={() => setTab('members')}
        >
          成员
        </button>
        <button
          type="button"
          className={`tab-btn${tab === 'invitations' ? ' active' : ''}`}
          onClick={() => setTab('invitations')}
        >
          邀请
        </button>
        {!isPersonal && (
          <button
            type="button"
            className={`tab-btn${tab === 'tokens' ? ' active' : ''}`}
            onClick={() => setTab('tokens')}
          >
            团队 Token
          </button>
        )}
      </div>

      {error && <ErrorBox message={error} />}

      {tab === 'members' && (
        <MembersTab
          loading={members.isLoading}
          data={members.data?.data ?? []}
          onAdd={(handle, role) => {
            setError('')
            addMember.mutate({ handle, role })
          }}
          onRemove={(handle) => {
            setError('')
            removeMember.mutate(handle)
          }}
        />
      )}

      {tab === 'invitations' && (
        <InvitationsTab
          loading={invitations.isLoading}
          data={invitations.data?.data ?? []}
          onInvite={(handle, role) => {
            setError('')
            invite.mutate({ handle, role })
          }}
        />
      )}

      {tab === 'tokens' && !isPersonal && (
        <TokensTab
          loading={tokens.isLoading}
          data={tokens.data?.data ?? []}
          canManage={canManageTokens}
          newToken={newToken}
          onCreated={(input) => {
            setError('')
            setNewToken('')
            createToken.mutate(input)
          }}
          onRevoke={(id) => {
            setError('')
            revokeToken.mutate(id)
          }}
        />
      )}
    </div>
  )
}

function MembersTab({
  loading,
  data,
  onAdd,
  onRemove,
}: {
  loading: boolean
  data: Array<{ id: string; userId: string; handle: string; role: string; createdAt: string }>
  onAdd: (handle: string, role: string) => void
  onRemove: (handle: string) => void
}) {
  const [handle, setHandle] = useState('')
  const [role, setRole] = useState('member')

  if (loading) return <Loading />

  return (
    <div>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          if (handle.trim()) onAdd(handle.trim(), role)
          setHandle('')
        }}
        style={{ display: 'flex', gap: 8, marginBottom: 20, maxWidth: 520 }}
      >
        <input
          className="form-input"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="成员用户名"
          aria-label="成员用户名"
        />
        <select className="form-input" value={role} onChange={(e) => setRole(e.target.value)} style={{ width: 140 }}>
          <option value="member">member</option>
          <option value="admin">admin</option>
          <option value="reader">reader</option>
        </select>
        <button className="btn btn-primary btn-small" type="submit">
          添加
        </button>
      </form>

      <ul className="version-list">
        {data.map((m) => (
          <li className="version-item" key={m.id}>
            <span className="owner-info">
              <span className="owner-avatar">{m.handle.slice(0, 1).toUpperCase()}</span>
              <span>{m.handle}</span>
            </span>
            <span className="version-date">{m.role}</span>
            <button
              className="filter-btn"
              type="button"
              onClick={() => onRemove(m.handle)}
            >
              移除
            </button>
          </li>
        ))}
        {data.length === 0 && <li className="version-item">暂无成员。</li>}
      </ul>
    </div>
  )
}

function InvitationsTab({
  loading,
  data,
  onInvite,
}: {
  loading: boolean
  data: Array<{ id: string; inviteeHandle: string; role: string; status: string; createdAt: string }>
  onInvite: (handle: string, role: string) => void
}) {
  const [handle, setHandle] = useState('')
  const [role, setRole] = useState('member')

  if (loading) return <Loading />

  return (
    <div>
      <form
        onSubmit={(e: FormEvent) => {
          e.preventDefault()
          if (handle.trim()) onInvite(handle.trim(), role)
          setHandle('')
        }}
        style={{ display: 'flex', gap: 8, marginBottom: 20, maxWidth: 520 }}
      >
        <input
          className="form-input"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
          placeholder="被邀请人用户名"
          aria-label="被邀请人用户名"
        />
        <select className="form-input" value={role} onChange={(e) => setRole(e.target.value)} style={{ width: 140 }}>
          <option value="member">member</option>
          <option value="admin">admin</option>
          <option value="reader">reader</option>
        </select>
        <button className="btn btn-primary btn-small" type="submit">
          发出邀请
        </button>
      </form>

      <ul className="version-list">
        {data.map((inv) => (
          <li className="version-item" key={inv.id}>
            <span>{inv.inviteeHandle}</span>
            <span className="version-date">{inv.role}</span>
            <span className="version-tag">{inv.status}</span>
            <span className="version-date">{formatDate(inv.createdAt)}</span>
          </li>
        ))}
        {data.length === 0 && <li className="version-item">暂无邀请。</li>}
      </ul>
    </div>
  )
}

function TokensTab({
  loading,
  data,
  canManage,
  newToken,
  onCreated,
  onRevoke,
}: {
  loading: boolean
  data: Array<{
    id: string
    label?: string
    prefix: string
    scope: string
    createdAt: string
    expiresAt?: string
  }>
  canManage: boolean
  newToken: string
  onCreated: (input: { label: string; scope: string; expiresIn: string }) => void
  onRevoke: (id: string) => void
}) {
  const [label, setLabel] = useState('')
  const [scope, setScope] = useState('publish')
  const [expiresIn, setExpiresIn] = useState('720h')

  if (loading) return <Loading />

  return (
    <div>
      {newToken !== '' && (
        <div className="code-block" style={{ marginBottom: 20 }}>
          <div className="form-label" style={{ color: 'var(--text-muted)' }}>
            请立即复制该 Token —— 关闭后将无法再次查看。
          </div>
          <code style={{ wordBreak: 'break-all' }}>{newToken}</code>
        </div>
      )}

      {canManage && (
        <form
          onSubmit={(e: FormEvent) => {
            e.preventDefault()
            onCreated({ label: label.trim(), scope, expiresIn })
            setLabel('')
          }}
          style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}
        >
          <input
            className="form-input"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="标签"
            aria-label="Token 标签"
            style={{ maxWidth: 200 }}
          />
          <select className="form-input" value={scope} onChange={(e) => setScope(e.target.value)} style={{ width: 130 }}>
            <option value="publish">publish</option>
            <option value="read">read</option>
          </select>
          <select
            className="form-input"
            value={expiresIn}
            onChange={(e) => setExpiresIn(e.target.value)}
            style={{ width: 140 }}
          >
            <option value="24h">1 天</option>
            <option value="168h">7 天</option>
            <option value="720h">30 天</option>
            <option value="2160h">90 天</option>
            <option value="8760h">365 天</option>
          </select>
          <button className="btn btn-primary btn-small" type="submit">
            创建 Token
          </button>
        </form>
      )}

      <ul className="version-list">
        {data.map((t) => (
          <li className="version-item" key={t.id}>
            <span>{t.label || '—'}</span>
            <span className="version-date" style={{ fontFamily: 'var(--font-mono)' }}>
              {t.prefix}…
            </span>
            <span className="version-tag">{t.scope}</span>
            <span className="version-date">
              {t.expiresAt ? `到期 ${formatDate(t.expiresAt)}` : '永久'}
            </span>
            <button className="filter-btn" type="button" onClick={() => onRevoke(t.id)}>
              吊销
            </button>
          </li>
        ))}
        {data.length === 0 && <li className="version-item">暂无团队 Token。</li>}
      </ul>
    </div>
  )
}
