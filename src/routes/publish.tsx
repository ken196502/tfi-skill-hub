import { useState, type DragEvent, type FormEvent } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { publishSkillWithProgress, categories } from '../lib/api'
import { useSession } from '../lib/auth'
import { ErrorBox, Loading, PageHeader } from '../components/ui'

export const Route = createFileRoute('/publish')({
  component: PublishPage,
})

/**
 * Skill upload form.
 *
 * Files are collected from a directory picker or drag-and-drop and posted as a
 * single multipart request. Client-side checks mirror the server's required
 * fields so users get immediate feedback, but the server remains authoritative.
 */
function PublishPage() {
  const { user, booting } = useSession()
  const queryClient = useQueryClient()

  const [files, setFiles] = useState<File[]>([])
  const [dragover, setDragover] = useState(false)
  const [form, setForm] = useState({
    slug: '',
    version: '1.0.0',
    displayName: '',
    summary: '',
    tags: '',
    category: 'general',
    visibility: 'private',
    namespace: '',
    changelog: '',
  })
  const [progress, setProgress] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ ref: string } | null>(null)

  const cats = useQuery({ queryKey: ['categories'], queryFn: categories, staleTime: Infinity })

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return
    setFiles((prev) => [...prev, ...Array.from(incoming)])
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setDragover(false)
    addFiles(e.dataTransfer.files)
  }

  const hasSkillMd = files.some((f) => f.name === 'SKILL.md' || f.webkitRelativePath.endsWith('SKILL.md'))

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!form.slug.trim() || !form.version.trim()) {
      setError('请填写所有必填字段。')
      return
    }
    if (files.length === 0) {
      setError('请至少添加一个文件（SKILL.md 为必需）。')
      return
    }
    if (!hasSkillMd) {
      setError('上传根目录必须包含 SKILL.md 文件。')
      return
    }

    setBusy(true)
    setError('')
    setProgress(0)
    setDone(null)

    const body = new FormData()
    body.set('slug', form.slug.trim())
    body.set('version', form.version.trim())
    if (form.displayName) body.set('displayName', form.displayName)
    if (form.summary) body.set('summary', form.summary)
    if (form.tags) body.set('tags', form.tags)
    if (form.category) body.set('category', form.category)
    if (form.visibility) body.set('visibility', form.visibility)
    if (form.namespace) body.set('namespace', form.namespace)
    if (form.changelog) body.set('changelog', form.changelog)
    // The server reads every file part regardless of field name.
    for (const file of files) {
      body.append('files', file, file.webkitRelativePath || file.name)
    }

    try {
      const result = await publishSkillWithProgress(body, setProgress)
      setDone({ ref: result.skill.namespaceSlug ? `@${result.skill.namespaceSlug}/${result.skill.slug}` : result.skill.slug })
      setFiles([])
      await queryClient.invalidateQueries({ queryKey: ['skills'] })
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误')
    } finally {
      setBusy(false)
    }
  }

  if (booting) return <Loading />
  if (!user) {
    return (
      <div className="container" style={{ paddingTop: 60 }}>
        <PageHeader title="发布技能" subtitle="请先登录后再发布技能。" />
        <Link to="/login" className="btn btn-primary">
          登录后发布
        </Link>
      </div>
    )
  }

  return (
    <div className="container" style={{ paddingTop: 40, maxWidth: 760 }}>
      <PageHeader title="发布技能" subtitle="直接上传技能文件或使用 API。" />

      {error && <ErrorBox message={error} />}
      {done && (
        <div
          className="error-box"
          style={{
            background: 'var(--accent-bg)',
            borderColor: 'var(--accent)',
            color: 'var(--accent)',
          }}
        >
          发布成功！{' '}
          <Link to="/skills/$" params={{ _splat: done.ref }} style={{ textDecoration: 'underline' }}>
            查看技能页面
          </Link>
        </div>
      )}

      <form onSubmit={onSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Field label="标识名" hint="仅限小写字母、数字和连字符，如 code-review">
            <input
              className="form-input"
              value={form.slug}
              onChange={(e) => set('slug', e.target.value)}
              placeholder="my-skill"
            />
          </Field>
          <Field label="版本号" hint="语义化版本格式：1.0.0">
            <input
              className="form-input"
              value={form.version}
              onChange={(e) => set('version', e.target.value)}
              placeholder="1.0.0"
            />
          </Field>
        </div>

        <Field label="显示名称">
          <input
            className="form-input"
            value={form.displayName}
            onChange={(e) => set('displayName', e.target.value)}
          />
        </Field>

        <Field label="简介">
          <input
            className="form-input"
            value={form.summary}
            onChange={(e) => set('summary', e.target.value)}
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <Field label="分类">
            <select
              className="form-input"
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
            >
              {(cats.data?.categories ?? ['general']).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="可见性">
            <select
              className="form-input"
              value={form.visibility}
              onChange={(e) => set('visibility', e.target.value)}
            >
              <option value="private">私有</option>
              <option value="public">公开（需审核）</option>
            </select>
          </Field>
          <Field label="归属命名空间" hint="留空则发布到你的个人空间">
            <input
              className="form-input"
              value={form.namespace}
              onChange={(e) => set('namespace', e.target.value)}
              placeholder="acme-team"
            />
          </Field>
        </div>

        <Field label="标签" hint="用逗号分隔">
          <input
            className="form-input"
            value={form.tags}
            onChange={(e) => set('tags', e.target.value)}
            placeholder="coding,automation"
          />
        </Field>

        <Field label="更新日志">
          <textarea
            className="form-input"
            rows={3}
            value={form.changelog}
            onChange={(e) => set('changelog', e.target.value)}
            placeholder="本版本变更说明..."
          />
        </Field>

        <Field label="技能文件" hint="必须包含 SKILL.md，支持文件夹和多文件。">
          <div
            className={`drop-zone${dragover ? ' dragover' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragover(true)
            }}
            onDragLeave={() => setDragover(false)}
            onDrop={onDrop}
          >
            <p style={{ marginBottom: 12 }}>拖放文件夹或文件到这里</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <label className="btn btn-secondary btn-small" style={{ cursor: 'pointer' }}>
                选择文件夹
                <input
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => addFiles(e.target.files)}
                  {...({ webkitdirectory: 'true', directory: 'true' } as Record<string, string>)}
                />
              </label>
              <label className="btn btn-secondary btn-small" style={{ cursor: 'pointer' }}>
                选择文件
                <input
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => addFiles(e.target.files)}
                />
              </label>
            </div>
          </div>
        </Field>

        {files.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 8,
              }}
            >
              <span className="form-hint" style={{ marginTop: 0 }}>
                已选择 {files.length} 个文件
                {hasSkillMd ? '' : '（缺少 SKILL.md）'}
              </span>
              <button
                type="button"
                className="filter-btn"
                onClick={() => setFiles([])}
              >
                清除全部
              </button>
            </div>
            <ul className="version-list">
              {files.slice(0, 12).map((f, index) => (
                <li className="version-item" key={`${f.name}-${index}`}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                    {f.webkitRelativePath || f.name}
                  </span>
                  <span className="version-date">{Math.max(1, Math.round(f.size / 1024))} KB</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? `上传中... ${progress}%` : '发布技能'}
        </button>
      </form>
    </div>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div style={{ marginBottom: 20 }}>
      <label className="form-label">{label}</label>
      {children}
      {hint && <div className="form-hint">{hint}</div>}
    </div>
  )
}
