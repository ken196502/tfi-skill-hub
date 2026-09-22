import { useState, type FormEvent } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from '../lib/api'
import { useSession } from '../lib/auth'
import { Loading, ErrorBox, PageHeader, formatDate } from '../components/ui'

export const Route = createFileRoute('/namespaces/')({
  component: NamespacesPage,
})

function NamespacesPage() {
  const { user, booting } = useSession()
  const queryClient = useQueryClient()
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
    onError: (e) => setError(e instanceof Error ? e.message : '创建失败'),
  })

  if (booting) return <Loading />
  if (!user) {
    return (
      <div className="container" style={{ paddingTop: 60 }}>
        <PageHeader title="命名空间" subtitle="请先登录后管理命名空间。" />
        <Link to="/login" className="btn btn-primary">
          登录
        </Link>
      </div>
    )
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.slug.trim()) {
      setError('请填写标识名。')
      return
    }
    create.mutate()
  }

  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <PageHeader
        title="命名空间"
        subtitle="团队协作空间：成员、技能归属与团队 Token 都在这里管理。"
        actions={
          <button className="btn btn-primary" type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? '取消' : '新建命名空间'}
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
            创建命名空间
          </h3>
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">标识名</label>
            <input
              className="form-input"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              placeholder="acme-team"
            />
            <div className="form-hint">仅限小写字母、数字和连字符，如 acme-team</div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label className="form-label">显示名称</label>
            <input
              className="form-input"
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
            />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="form-label">描述</label>
            <input
              className="form-input"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <button className="btn btn-primary" type="submit" disabled={create.isPending}>
            {create.isPending ? '创建中...' : '创建'}
          </button>
        </form>
      )}

      {list.isLoading ? (
        <Loading />
      ) : (list.data?.data.length ?? 0) === 0 ? (
        <p className="detail-summary">你尚未加入任何命名空间。</p>
      ) : (
        <div className="skill-grid">
          {list.data!.data.map((ns) => (
            <Link to="/namespaces/$slug" params={{ slug: ns.slug }} key={ns.id}>
              <div className="card">
                <div className="card-title">{ns.displayName || ns.slug}</div>
                <div className="card-tags">
                  <span className="tag">{ns.type === 'personal' ? '个人' : '团队'}</span>
                  <span className="tag">{ns.slug}</span>
                </div>
                <div className="card-summary">{ns.description || '暂无描述'}</div>
                <div className="card-meta">
                  <span>创建 {formatDate(ns.createdAt)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
