import { useState, type DragEvent, type FormEvent } from 'react'
import { createFileRoute, Link, Navigate } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { publishSkillWithProgress, categories } from '../lib/api'
import { useSession } from '../lib/auth'
import { useT } from '../lib/i18n'
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
  const t = useT()

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
      setError(t('请填写所有必填字段。', 'Please fill in all required fields.'))
      return
    }
    if (files.length === 0) {
      setError(t('请至少添加一个文件（SKILL.md 为必需）。', 'Add at least one file (SKILL.md is required).'))
      return
    }
    if (!hasSkillMd) {
      setError(t('上传根目录必须包含 SKILL.md 文件。', 'The upload root must contain a SKILL.md file.'))
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
      const message = err instanceof Error ? err.message : ''
      const known: Record<string, string> = {
        'Network error': t('网络错误', 'Network error'),
        'Upload timed out': t('上传超时', 'Upload timed out'),
      }
      setError(known[message] ?? message ?? t('未知错误', 'Unknown error'))
    } finally {
      setBusy(false)
    }
  }

  if (booting) return <Loading />
  // Publishing is administrator-only. The page is never linked from the header,
  // but it is reachable by URL, so the guard has to live here as well.
  if (!user || user.role !== 'admin') return <Navigate to="/skills" />

  return (
    <div className="container" style={{ paddingTop: 40, maxWidth: 760 }}>
      <PageHeader
        title={t('发布技能', 'Publish a skill')}
        subtitle={t('直接上传技能文件或使用 API。', 'Upload skill files directly, or use the API.')}
      />

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
          {t('发布成功！', 'Published!')}{' '}
          <Link to="/skills/$" params={{ _splat: done.ref }} style={{ textDecoration: 'underline' }}>
            {t('查看技能页面', 'View the skill page')}
          </Link>
        </div>
      )}

      <form onSubmit={onSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Field label={t('标识名', 'Slug')} hint={t('仅限小写字母、数字和连字符，如 code-review', 'Lowercase letters, digits, and hyphens only, e.g. code-review')}>
            <input
              className="form-input"
              value={form.slug}
              onChange={(e) => set('slug', e.target.value)}
              placeholder="my-skill"
            />
          </Field>
          <Field label={t('版本号', 'Version')} hint={t('语义化版本格式：1.0.0', 'Semantic version, e.g. 1.0.0')}>
            <input
              className="form-input"
              value={form.version}
              onChange={(e) => set('version', e.target.value)}
              placeholder="1.0.0"
            />
          </Field>
        </div>

        <Field label={t('显示名称', 'Display name')}>
          <input
            className="form-input"
            value={form.displayName}
            onChange={(e) => set('displayName', e.target.value)}
          />
        </Field>

        <Field label={t('简介', 'Summary')}>
          <input
            className="form-input"
            value={form.summary}
            onChange={(e) => set('summary', e.target.value)}
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <Field label={t('分类', 'Category')}>
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
          <Field label={t('可见性', 'Visibility')}>
            <select
              className="form-input"
              value={form.visibility}
              onChange={(e) => set('visibility', e.target.value)}
            >
              <option value="private">{t('私有', 'Private')}</option>
              <option value="public">{t('公开（需审核）', 'Public (review required)')}</option>
            </select>
          </Field>
          <Field label={t('归属命名空间', 'Namespace')} hint={t('留空则发布到你的个人空间', 'Leave empty to publish to your personal namespace')}>
            <input
              className="form-input"
              value={form.namespace}
              onChange={(e) => set('namespace', e.target.value)}
              placeholder="acme-team"
            />
          </Field>
        </div>

        <Field label={t('标签', 'Tags')} hint={t('用逗号分隔', 'Separate with commas')}>
          <input
            className="form-input"
            value={form.tags}
            onChange={(e) => set('tags', e.target.value)}
            placeholder="coding,automation"
          />
        </Field>

        <Field label={t('更新日志', 'Changelog')}>
          <textarea
            className="form-input"
            rows={3}
            value={form.changelog}
            onChange={(e) => set('changelog', e.target.value)}
            placeholder={t('本版本变更说明...', "What changed in this version...")}
          />
        </Field>

        <Field label={t('技能文件', 'Skill files')} hint={t('必须包含 SKILL.md，支持文件夹和多文件。', 'Must include SKILL.md; folders and multiple files are supported.')}>
          <div
            className={`drop-zone${dragover ? ' dragover' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragover(true)
            }}
            onDragLeave={() => setDragover(false)}
            onDrop={onDrop}
          >
            <p style={{ marginBottom: 12 }}>{t('拖放文件夹或文件到这里', 'Drop a folder or files here')}</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
              <label className="btn btn-secondary btn-small" style={{ cursor: 'pointer' }}>
                {t('选择文件夹', 'Choose folder')}
                <input
                  type="file"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => addFiles(e.target.files)}
                  {...({ webkitdirectory: 'true', directory: 'true' } as Record<string, string>)}
                />
              </label>
              <label className="btn btn-secondary btn-small" style={{ cursor: 'pointer' }}>
                {t('选择文件', 'Choose files')}
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
                {t('已选择', 'Selected')} {files.length} {t('个文件', 'files')}
                {hasSkillMd ? '' : t('（缺少 SKILL.md）', ' (SKILL.md missing)')}
              </span>
              <button
                type="button"
                className="filter-btn"
                onClick={() => setFiles([])}
              >
                {t('清除全部', 'Clear all')}
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
          {busy ? `${t('上传中...', 'Uploading...')} ${progress}%` : t('发布技能', 'Publish skill')}
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
