import { useState, type FormEvent } from 'react'
import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '../lib/api'
import { useSession } from '../lib/auth'
import { useT } from '../lib/i18n'
import { Loading, ErrorBox, PageHeader, formatDate } from '../components/ui'

export const Route = createFileRoute('/namespaces/$slug')({
  component: NamespaceDetailPage,
})

type Tab = 'members' | 'invitations' | 'tokens'

function NamespaceDetailPage() {
  const { slug } = useParams({ from: '/namespaces/$slug' })
  const { user } = useSession()
  const queryClient = useQueryClient()
  const t = useT()
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
    onError: (e) => setError(e instanceof Error ? e.message : t('添加成员失败', 'Failed to add member')),
  })
  const removeMember = useMutation({
    mutationFn: (handle: string) => api.removeNamespaceMember(slug, handle),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof Error ? e.message : t('移除成员失败', 'Failed to remove member')),
  })
  const invite = useMutation({
    mutationFn: ({ handle, role }: { handle: string; role: string }) =>
      api.inviteToNamespace(slug, handle, role),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof Error ? e.message : t('发送邀请失败', 'Failed to send invitation')),
  })
  const createToken = useMutation({
    mutationFn: (input: { label: string; scope: string; expiresIn: string }) =>
      api.createNamespaceToken(slug, input),
    onSuccess: (result) => {
      setNewToken(result.token)
      void invalidate()
    },
    onError: (e) => setError(e instanceof Error ? e.message : t('创建 Token 失败', 'Failed to create token')),
  })
  const revokeToken = useMutation({
    mutationFn: (id: string) => api.revokeNamespaceToken(slug, id),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof Error ? e.message : t('吊销 Token 失败', 'Failed to revoke token')),
  })

  if (ns.isLoading) return <Loading />
  if (ns.isError) {
    return (
      <div className="container" style={{ paddingTop: 60 }}>
        <h1 className="detail-title">{t('命名空间不存在', 'Namespace not found')}</h1>
        <Link to="/namespaces" className="btn btn-secondary">
          {t('返回命名空间列表', 'Back to namespaces')}
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
        subtitle={n.description || t('暂无描述', 'No description yet')}
        actions={
          <Link to="/namespaces" className="btn btn-secondary btn-small">
            {t('返回命名空间列表', 'Back to namespaces')}
          </Link>
        }
      />

      <div className="tab-bar">
        <button
          type="button"
          className={`tab-btn${tab === 'members' ? ' active' : ''}`}
          onClick={() => setTab('members')}
        >
          {t('成员', 'Members')}
        </button>
        <button
          type="button"
          className={`tab-btn${tab === 'invitations' ? ' active' : ''}`}
          onClick={() => setTab('invitations')}
        >
          {t('邀请', 'Invitations')}
        </button>
        {!isPersonal && (
          <button
            type="button"
            className={`tab-btn${tab === 'tokens' ? ' active' : ''}`}
            onClick={() => setTab('tokens')}
          >
            {t('团队 Token', 'Team tokens')}
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
  const t = useT()
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
          placeholder={t('成员用户名', "Member's username")}
          aria-label={t('成员用户名', "Member's username")}
        />
        <select className="form-input" value={role} onChange={(e) => setRole(e.target.value)} style={{ width: 140 }}>
          <option value="member">member</option>
          <option value="admin">admin</option>
          <option value="reader">reader</option>
        </select>
        <button className="btn btn-primary btn-small" type="submit">
          {t('添加', 'Add')}
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
              {t('移除', 'Remove')}
            </button>
          </li>
        ))}
        {data.length === 0 && <li className="version-item">{t('暂无成员。', 'No members yet.')}</li>}
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
  const t = useT()
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
          placeholder={t('被邀请人用户名', "Invitee's username")}
          aria-label={t('被邀请人用户名', "Invitee's username")}
        />
        <select className="form-input" value={role} onChange={(e) => setRole(e.target.value)} style={{ width: 140 }}>
          <option value="member">member</option>
          <option value="admin">admin</option>
          <option value="reader">reader</option>
        </select>
        <button className="btn btn-primary btn-small" type="submit">
          {t('发出邀请', 'Send invitation')}
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
        {data.length === 0 && <li className="version-item">{t('暂无邀请。', 'No invitations yet.')}</li>}
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
  const t = useT()
  const [label, setLabel] = useState('')
  const [scope, setScope] = useState('publish')
  const [expiresIn, setExpiresIn] = useState('720h')

  if (loading) return <Loading />

  return (
    <div>
      {newToken !== '' && (
        <div className="code-block" style={{ marginBottom: 20 }}>
          <div className="form-label" style={{ color: 'var(--text-muted)' }}>
            {t('请立即复制该 Token —— 关闭后将无法再次查看。', 'Copy this token now — it cannot be viewed again after you leave.')}
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
            placeholder={t('标签', 'Label')}
            aria-label={t('Token 标签', 'Token label')}
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
            <option value="24h">{t('1 天', '1 day')}</option>
            <option value="168h">{t('7 天', '7 days')}</option>
            <option value="720h">{t('30 天', '30 days')}</option>
            <option value="2160h">{t('90 天', '90 days')}</option>
            <option value="8760h">{t('365 天', '365 days')}</option>
          </select>
          <button className="btn btn-primary btn-small" type="submit">
            {t('创建 Token', 'Create token')}
          </button>
        </form>
      )}

      <ul className="version-list">
        {data.map((tk) => (
          <li className="version-item" key={tk.id}>
            <span>{tk.label || '—'}</span>
            <span className="version-date" style={{ fontFamily: 'var(--font-mono)' }}>
              {tk.prefix}…
            </span>
            <span className="version-tag">{tk.scope}</span>
            <span className="version-date">
              {tk.expiresAt ? `${t('到期', 'Expires')} ${formatDate(tk.expiresAt)}` : t('永久', 'Never expires')}
            </span>
            <button className="filter-btn" type="button" onClick={() => onRevoke(tk.id)}>
              {t('吊销', 'Revoke')}
            </button>
          </li>
        ))}
        {data.length === 0 && <li className="version-item">{t('暂无团队 Token。', 'No team tokens yet.')}</li>}
      </ul>
    </div>
  )
}
