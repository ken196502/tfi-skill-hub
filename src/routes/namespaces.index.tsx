import { useState, type FormEvent } from 'react'
import { createFileRoute, Link, Navigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '../lib/api'
import { useSession } from '../lib/auth'
import { useT } from '../lib/i18n'
import { Loading, ErrorBox, PageHeader, formatDate } from '../components/ui'

export const Route = createFileRoute('/namespaces/')({
  component: NamespacesPage,
})

function NamespacesPage() {
  const { user, booting } = useSession()
  const queryClient = useQueryClient()
  const t = useT()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ slug: '', displayName: '', description: '' })
  const [error, setError] = useState('')

  const list = useQuery({
    queryKey: ['namespaces'],
    queryFn: api.listNamespaces,
    enabled: !!user,
  })

  const create = useMutation({
    mutationFn: () =>
      api.createNamespace({
        slug: form.slug.trim(),
        displayName: form.displayName || undefined,
        description: form.description || undefined,
        type: 'team',
      }),
    onSuccess: async () => {
      setForm({ slug: '', displayName: '', description: '' })
      setShowForm(false)
      setError('')
      await queryClient.invalidateQueries({ queryKey: ['namespaces'] })
    },
    onError: (e) => setError(e instanceof Error ? e.message : t('创建失败', 'Failed to create')),
  })

  if (booting) return <Loading />
  // Namespace administration is administrator-only; the matching server-side
  // posture lives in `routes.ts`.
  if (!user || user.role !== 'admin') return <Navigate to="/skills" />

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.slug.trim()) {
      setError(t('请填写标识名。', 'Please enter a slug.'))
      return
    }
    create.mutate()
  }

  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <PageHeader
        title={t('命名空间', 'Namespaces')}
        subtitle={t(
          '团队协作空间：成员、技能与知识库的归属，以及团队 Token，都在这里管理。',
          'Team workspaces: members, ownership of skills and knowledge bases, and team tokens are managed here.',
        )}
        actions={
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? t('取消', 'Cancel') : t('新建命名空间', 'New namespace')}
          </button>
        }
      />

      {error && <ErrorBox message={error} />}

      {showForm && (
        <form
          onSubmit={onSubmit}
          className="login-form"
          style={{ marginBottom: 28, maxWidth: 520 }}
        >
          <h3 className="card-title" style={{ fontSize: '1rem' }}>
            {t('创建命名空间', 'Create a namespace')}
          </h3>
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">{t('标识名', 'Slug')}</label>
            <input
              className="form-input"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              placeholder="acme-team"
            />
            <div className="form-hint">
              {t('仅限小写字母、数字和连字符，如 acme-team', 'Lowercase letters, digits, and hyphens only, e.g. acme-team')}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">{t('显示名称', 'Display name')}</label>
            <input
              className="form-input"
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="form-label">{t('描述', 'Description')}</label>
            <input
              className="form-input"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={create.isPending}>
            {create.isPending ? t('创建中...', 'Creating...') : t('创建', 'Create')}
          </button>
        </form>
      )}

      {list.isLoading ? (
        <Loading />
      ) : (list.data?.data.length ?? 0) === 0 ? (
        <p className="detail-summary">{t('你尚未加入任何命名空间。', "You haven't joined any namespaces yet.")}</p>
      ) : (
        <div className="skill-grid">
          {list.data!.data.map((ns) => (
            <Link to="/namespaces/$slug" params={{ slug: ns.slug }} key={ns.id}>
              <div className="card">
                <div className="card-title">{ns.displayName || ns.slug}</div>
                <div className="card-tags">
                  <span className="tag">{ns.type === 'personal' ? t('个人', 'Personal') : t('团队', 'Team')}</span>
                  <span className="tag">{ns.slug}</span>
                </div>
                <div className="card-summary">{ns.description || t('暂无描述', 'No description yet')}</div>
                <div className="card-meta">
                  <span>{t('创建', 'Created')} {formatDate(ns.createdAt)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
