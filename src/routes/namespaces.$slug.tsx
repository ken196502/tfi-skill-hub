import { useState, type FormEvent } from 'react'
import { createFileRoute, Link, Navigate, useParams } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '../lib/api'
import { useSession } from '../lib/auth'
import { useT } from '../lib/i18n'
import { Loading, ErrorBox, PageHeader, formatDate } from '../components/ui'

export const Route = createFileRoute('/namespaces/$slug')({
  component: NamespaceDetailPage,
})

type Tab = 'members' | 'invitations'

function NamespaceDetailPage() {
  const { slug } = useParams({ from: '/namespaces/$slug' })
  const { user, booting } = useSession()
  const queryClient = useQueryClient()
  const t = useT()
  const [tab, setTab] = useState<Tab>('members')
  const [error, setError] = useState('')

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

  if (booting) return <Loading />
  // Declared after every hook so the call order stays stable across renders.
  if (!user || user.role !== 'admin') return <Navigate to="/skills" />

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
