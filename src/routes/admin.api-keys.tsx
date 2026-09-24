import { useEffect, useState } from 'react'
import { createFileRoute, Navigate } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminCreateApiKey, adminListApiKeys, adminRevokeApiKey, listNamespaces } from '../lib/api'
import { useSession } from '../lib/auth'
import { useT } from '../lib/i18n'
import { AdminNav, AdminStatus } from '../components/AdminShell'
import { CodeBlock, ErrorBox, Loading, PageHeader, formatDate } from '../components/ui'
import { API_KEY_SCOPES, type AdminApiKey, type ApiKeyScope } from '../lib/types'

export const Route = createFileRoute('/admin/api-keys')({ component: ApiKeysPage })

const SCOPE_COPY: Record<ApiKeyScope, { title: [string, string]; hint: [string, string] }> = {
  'skills:read': {
    title: ['读取技能', 'Read skills'],
    hint: ['搜索、列表、详情、文件与下载', 'Search, lists, details, files and downloads'],
  },
  'skills:publish': {
    title: ['发布与更新', 'Publish & update'],
    hint: ['发布新版本、更新技能文件', 'Publish new versions and update skill files'],
  },
  'skills:delete': {
    title: ['删除与恢复', 'Delete & restore'],
    hint: ['删除技能、恢复、彻底清除', 'Delete, restore and purge skills'],
  },
  'skills:moderate': {
    title: ['审核与可见性', 'Review & visibility'],
    hint: ['下架与弃用标记、审核结果、公开范围', 'Yank, deprecate, review results and visibility'],
  },
}

const SCOPE_SHORT: Record<ApiKeyScope, [string, string]> = {
  'skills:read': ['读取', 'Read'],
  'skills:publish': ['发布', 'Publish'],
  'skills:delete': ['删除', 'Delete'],
  'skills:moderate': ['审核', 'Review'],
}

/** Values are Go-style durations, which the server parses directly. */
const EXPIRY_OPTIONS: Array<{ value: string; label: [string, string] }> = [
  { value: '', label: ['长期有效', 'Never expires'] },
  { value: '720h', label: ['30 天', '30 days'] },
  { value: '2160h', label: ['90 天', '90 days'] },
  { value: '8760h', label: ['365 天', '365 days'] },
]

/**
 * Copy-and-paste samples shown on the page.
 *
 * Each example declares the capability it needs, so a key's own usage text only
 * contains the calls it is actually allowed to make. `<namespace>`/`<slug>` are
 * placeholders — the point is the shape of the request, not a real target.
 */
interface ApiExample {
  scope: ApiKeyScope
  label: [string, string]
  command: (origin: string, token: string) => string
}

const API_EXAMPLES: ApiExample[] = [
  {
    scope: 'skills:read',
    label: ['列出技能', 'List skills'],
    command: (o, k) => `curl -H "Authorization: Bearer ${k}" ${o}/api/v1/skills?limit=20`,
  },
  {
    scope: 'skills:read',
    label: ['搜索技能', 'Search skills'],
    command: (o, k) => `curl -H "Authorization: Bearer ${k}" "${o}/api/v1/search?q=deploy&limit=10"`,
  },
  {
    scope: 'skills:read',
    label: ['查看技能详情', 'Get a skill'],
    command: (o, k) => `curl -H "Authorization: Bearer ${k}" ${o}/api/v1/skills/@<namespace>/<slug>`,
  },
  {
    scope: 'skills:publish',
    label: ['发布新版本', 'Publish a version'],
    command: (o, k) =>
      `curl -X POST -H "Authorization: Bearer ${k}" \\\n  -F slug=<slug> -F version=1.0.0 -F "files=@SKILL.md" \\\n  ${o}/api/v1/skills`,
  },
  {
    scope: 'skills:publish',
    label: ['更新详情内容', 'Update the detail body'],
    command: (o, k) =>
      `curl -X PUT -H "Authorization: Bearer ${k}" -H 'Content-Type: application/json' \\\n  -d '{"html":"<h2>使用说明</h2>"}' \\\n  ${o}/api/v1/skills/@<namespace>/<slug>/detail-html`,
  },
  {
    scope: 'skills:delete',
    label: ['删除技能', 'Delete a skill'],
    command: (o, k) => `curl -X DELETE -H "Authorization: Bearer ${k}" ${o}/api/v1/skills/@<namespace>/<slug>`,
  },
  {
    scope: 'skills:delete',
    label: ['恢复已删除的技能', 'Restore a deleted skill'],
    command: (o, k) => `curl -X POST -H "Authorization: Bearer ${k}" ${o}/api/v1/skills/@<namespace>/<slug>/undelete`,
  },
  {
    scope: 'skills:moderate',
    label: ['审核通过 / 拒绝', 'Approve or reject'],
    command: (o, k) =>
      `curl -X POST -H "Authorization: Bearer ${k}" -H 'Content-Type: application/json' \\\n  -d '{"action":"approve"}' \\\n  ${o}/api/v1/admin/skills/@<namespace>/<slug>/review`,
  },
  {
    scope: 'skills:moderate',
    label: ['设置公开或私有', 'Set visibility'],
    command: (o, k) =>
      `curl -X POST -H "Authorization: Bearer ${k}" -H 'Content-Type: application/json' \\\n  -d '{"visibility":"public"}' \\\n  ${o}/api/v1/admin/skills/@<namespace>/<slug>/visibility`,
  },
]

/**
 * Builds the plain-text usage sheet for one key.
 *
 * `token` is the full key when it is still on screen (right after creation) and
 * the stored display prefix otherwise — the secret itself is never recoverable,
 * so an older row can only offer the reminder of what it starts with.
 */
function buildUsageText(input: {
  name: string
  token: string
  scopes: ApiKeyScope[]
  origin: string
  t: (zh: string, en: string) => string
}): string {
  const host = input.origin === '' ? 'https://<your-host>' : input.origin
  const lines: string[] = [
    `# ${input.t('SkillHub 接口调用示例', 'SkillHub API examples')} — ${input.name}`,
    `# ${input.t('把示例中的密钥换成完整值即可调用', 'Replace the key in each example with the full value and run it')}`,
    '',
  ]
  for (const example of API_EXAMPLES.filter((e) => input.scopes.includes(e.scope))) {
    lines.push(`# ${input.t(example.label[0], example.label[1])}`)
    lines.push(example.command(host, input.token))
    lines.push('')
  }
  return lines.join('\n').trim()
}

function statusOf(key: AdminApiKey): 'active' | 'revoked' | 'expired' {
  if (key.revokedAt) return 'revoked'
  if (key.expiresAt && Date.parse(key.expiresAt) <= Date.now()) return 'expired'
  return 'active'
}

function ApiKeysPage() {
  const { user, booting } = useSession()
  const t = useT()
  const client = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<ApiKeyScope[]>([...API_KEY_SCOPES])
  const [namespaceSlug, setNamespaceSlug] = useState('')
  const [expiresIn, setExpiresIn] = useState('')
  const [issued, setIssued] = useState<{ id: string; key: string; name: string } | null>(null)
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState('')

  // Only known in the browser; keeps the sample command out of the SSR pass.
  useEffect(() => setOrigin(window.location.origin), [])

  const keys = useQuery({ queryKey: ['admin-api-keys'], queryFn: adminListApiKeys })
  const namespaces = useQuery({ queryKey: ['namespaces'], queryFn: listNamespaces })

  const create = useMutation({
    mutationFn: () => adminCreateApiKey({ name: name.trim(), scopes, namespaceSlug, expiresIn }),
    onSuccess: (result) => {
      setIssued({ id: result.metadata.id, key: result.key, name: result.metadata.name })
      setName('')
      setNamespaceSlug('')
      setExpiresIn('')
      setShowForm(false)
      void client.invalidateQueries({ queryKey: ['admin-api-keys'] })
    },
  })
  const revoke = useMutation({
    mutationFn: (id: string) => adminRevokeApiKey(id),
    onSuccess: () => void client.invalidateQueries({ queryKey: ['admin-api-keys'] }),
  })

  if (booting) return <Loading />
  if (!user || user.role !== 'admin') return <Navigate to="/login" />

  const toggleScope = (scope: ApiKeyScope) =>
    setScopes((current) =>
      current.includes(scope) ? current.filter((s) => s !== scope) : [...current, scope],
    )

  const canSubmit = name.trim() !== '' && scopes.length > 0 && !create.isPending
  const error = create.error ?? revoke.error
  const rows = keys.data?.data ?? []
  const activeCount = rows.filter((key) => statusOf(key) === 'active').length

  /** What stands in for the secret in a sample: the real key while it lasts. */
  const tokenOf = (key: AdminApiKey): string =>
    issued?.id === key.id ? issued.key : `${key.prefix}…`

  const copyUsage = (key: AdminApiKey) => {
    const text = buildUsageText({
      name: key.name,
      token: tokenOf(key),
      scopes: key.scopes,
      origin,
      t,
    })
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(key.id)
        window.setTimeout(() => setCopied((current) => (current === key.id ? '' : current)), 2000)
      },
      () => setCopied(''),
    )
  }

  // The page-level sheet has no key of its own unless one was just minted.
  const pageToken = issued?.key ?? '<YOUR_API_KEY>'

  const copyPageUsage = () => {
    const text = buildUsageText({
      name: issued?.name ?? t('我的密钥', 'My key'),
      token: pageToken,
      scopes: [...API_KEY_SCOPES],
      origin,
      t,
    })
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied('page')
        window.setTimeout(() => setCopied((current) => (current === 'page' ? '' : current)), 2000)
      },
      () => setCopied(''),
    )
  }

  return <div className="container page-container">
    <AdminNav active="apikeys" />
    <PageHeader
      title={t('API Keys', 'API Keys')}
      subtitle={t(
        `签发用于通过接口管理技能的密钥，可按需限制用途与生效范围。当前 ${activeCount} 个可用。`,
        `Issue keys that manage skills over the API, limited to the uses you choose. ${activeCount} active.`,
      )}
      actions={<button className="btn btn-primary" type="button" onClick={() => setShowForm((value) => !value)}>{showForm ? t('收起表单', 'Hide form') : t('创建 API Key', 'Create API key')}</button>}
    />

    {showForm && <form className="admin-form-card" onSubmit={(event) => { event.preventDefault(); if (canSubmit) create.mutate() }}>
      <div className="admin-form-grid">
        <label><span className="form-label">{t('名称', 'Name')} *</span><input className="form-input" required value={name} placeholder={t('例如 CI 发布', 'e.g. CI publishing')} onChange={(event) => setName(event.target.value)} /></label>
        <label><span className="form-label">{t('默认命名空间', 'Default namespace')}</span><select className="form-input" value={namespaceSlug} onChange={(event) => setNamespaceSlug(event.target.value)}><option value="">{t('不绑定', 'Not bound')}</option>{(namespaces.data?.data ?? []).map((ns) => <option key={ns.id} value={ns.slug}>@{ns.slug}</option>)}</select></label>
        <label><span className="form-label">{t('有效期', 'Valid for')}</span><select className="form-input" value={expiresIn} onChange={(event) => setExpiresIn(event.target.value)}>{EXPIRY_OPTIONS.map((option) => <option key={option.value || 'never'} value={option.value}>{t(option.label[0], option.label[1])}</option>)}</select></label>
      </div>
      <p className="form-hint">{t('勾选这个密钥可以做的事：', 'Choose what this key may do:')}</p>
      <div className="admin-scope-list">
        {API_KEY_SCOPES.map((scope) => {
          const copy = SCOPE_COPY[scope]
          return <label className="admin-feature-item admin-scope-item" key={scope}>
            <input type="checkbox" checked={scopes.includes(scope)} onChange={() => toggleScope(scope)} />
            <span><strong>{t(copy.title[0], copy.title[1])}</strong><small>{t(copy.hint[0], copy.hint[1])}</small></span>
          </label>
        })}
      </div>
      <div className="admin-form-actions"><button className="btn btn-primary" disabled={!canSubmit} type="submit">{create.isPending ? t('创建中…', 'Creating…') : t('确认创建', 'Create')}</button></div>
    </form>}

    {issued && <div className="admin-token-card">
      <div className="admin-token-header">
        <div><strong>{t('已创建', 'Created')} · {issued.name}</strong><p className="muted">{t('完整密钥只显示这一次，关闭后无法再次查看，请立即复制保存。', 'The full key is shown only once and cannot be retrieved later — copy it now.')}</p></div>
        <button className="icon-btn" type="button" onClick={() => setIssued(null)}>×</button>
      </div>
      <div className="admin-secret-row"><code>{issued.key}</code><button className="btn btn-secondary btn-small" type="button" onClick={() => void navigator.clipboard?.writeText(issued.key)}>{t('复制', 'Copy')}</button></div>
      {origin !== '' && <div className="admin-secret-hint"><CodeBlock command={`curl -H "Authorization: Bearer ${issued.key}" ${origin}/api/v1/skills?limit=5`} /></div>}
    </div>}

    {error && <ErrorBox message={error instanceof Error ? error.message : t('操作失败，请重试。', 'Action failed. Please try again.')} />}

    {keys.isLoading ? <Loading /> : keys.isError ? <ErrorBox message={t('加载 API Key 列表失败，请稍后重试。', 'Failed to load API keys. Please try again later.')} /> : <div className="admin-table-wrap">
      <table className="admin-table"><thead><tr><th>{t('名称', 'Name')}</th><th>{t('用途', 'Uses')}</th><th>{t('命名空间', 'Namespace')}</th><th>{t('创建时间', 'Created')}</th><th>{t('最近使用', 'Last used')}</th><th>{t('状态', 'Status')}</th><th>{t('操作', 'Actions')}</th></tr></thead><tbody>
        {rows.map((key) => <tr key={key.id}>
          <td><strong>{key.name}</strong><small className="admin-cell-sub">{key.prefix}…</small></td>
          <td><div className="admin-tag-row">{key.scopes.map((scope) => <span className="tag" key={scope}>{t(SCOPE_SHORT[scope][0], SCOPE_SHORT[scope][1])}</span>)}</div></td>
          <td className="muted">{key.namespaceSlug ? `@${key.namespaceSlug}` : '—'}</td>
          <td className="muted">{formatDate(key.createdAt)}{key.expiresAt && <small className="admin-cell-sub">{t('有效期至', 'Expires')} {formatDate(key.expiresAt)}</small>}</td>
          <td className="muted">{key.lastUsedAt ? formatDate(key.lastUsedAt) : t('未使用', 'Never')}</td>
          <td><AdminStatus value={statusOf(key)} />{key.createdByHandle && <small className="admin-cell-sub">@{key.createdByHandle}</small>}</td>
          <td><div className="admin-actions">
            <button className="btn btn-secondary btn-small" type="button" onClick={() => copyUsage(key)}>{copied === key.id ? t('已复制说明', 'Usage copied') : t('复制调用说明', 'Copy usage')}</button>
            <button className="btn btn-danger btn-small" disabled={statusOf(key) !== 'active' || revoke.isPending} type="button" onClick={() => handleRevoke(key, t, () => revoke.mutate(key.id))}>{statusOf(key) === 'active' ? t('撤销', 'Revoke') : t('已失效', 'Disabled')}</button>
          </div></td>
        </tr>)}
        {rows.length === 0 && <tr><td colSpan={7} className="admin-empty">{t('还没有 API Key，创建一个即可通过接口管理技能。', 'No API keys yet — create one to manage skills over the API.')}</td></tr>}
      </tbody></table>
    </div>}

    <UsageGuide
      token={pageToken}
      scopes={[...API_KEY_SCOPES]}
      origin={origin}
      filled={issued !== null}
      onCopy={copyPageUsage}
      copied={copied === 'page'}
    />
  </div>
}

/**
 * The page's own copy of the samples. It shows the full set of calls, and
 * carries the real secret only while the key that was just minted is still on
 * screen — otherwise it falls back to a placeholder.
 */
function UsageGuide({ token, scopes, origin, filled, onCopy, copied }: {
  token: string
  scopes: ApiKeyScope[]
  origin: string
  filled: boolean
  onCopy: () => void
  copied: boolean
}) {
  const t = useT()
  const host = origin === '' ? 'https://<your-host>' : origin
  return <section className="admin-usage">
    <div className="admin-usage-header">
      <div>
        <h2 className="admin-section-title">{t('接口调用说明', 'API usage')}</h2>
        <p className="muted">{filled
          ? t('示例已填入刚创建的密钥，可直接复制使用；关闭页面后密钥不再显示。', 'The samples carry the key you just created; they stop showing it once you leave this page.')
          : t('把示例中的 <YOUR_API_KEY> 换成密钥即可调用；也可以直接从上方列表一键复制带密钥前缀的说明。', 'Swap <YOUR_API_KEY> for a key and run any sample — or copy a ready-made sheet from a row above.')}</p>
      </div>
      <button className="btn btn-secondary" type="button" onClick={onCopy}>{copied ? t('已复制', 'Copied') : t('复制全部说明', 'Copy all')}</button>
    </div>
    <div className="admin-usage-list">
      {API_EXAMPLES.filter((example) => scopes.includes(example.scope)).map((example) => <div className="admin-usage-item" key={example.label[1]}>
        <span className="admin-usage-label">{t(example.label[0], example.label[1])}</span>
        <CodeBlock command={example.command(host, token)} prefix="" />
      </div>)}
    </div>
  </section>
}

function handleRevoke(key: AdminApiKey, t: (zh: string, en: string) => string, action: () => void): void {
  if (window.confirm(`${t('确定撤销', 'Revoke')} “${key.name}” ${t('吗？使用该密钥的接口调用会立即失效。', '? Every integration using it stops working immediately.')}`)) action()
}
