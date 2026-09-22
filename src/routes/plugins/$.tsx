import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import * as api from '../../lib/api'
import {
  Loading,
  formatDate,
  formatNumber,
  displayNameOf,
} from '../../components/ui'

export const Route = createFileRoute('/plugins/$')({
  component: PluginDetailPage,
})

function PluginDetailPage() {
  const { _splat: ref = '' } = useParams({ from: '/plugins/$' })

  const plugin = useQuery({
    queryKey: ['plugin', ref],
    queryFn: () => api.getPlugin(ref),
    retry: false,
  })
  const versions = useQuery({
    queryKey: ['plugin', ref, 'versions'],
    queryFn: () => api.getPluginVersions(ref),
    enabled: plugin.isSuccess,
  })
  // The manifest is the most informative single file in a plugin package.
  const target = parseRef(ref)
  const manifest = useQuery({
    queryKey: ['plugin', ref, 'file', 'plugin.json'],
    queryFn: () => api.pluginFile(target.slug, 'plugin.json', '', target.namespace),
    enabled: plugin.isSuccess,
    retry: false,
  })

  if (plugin.isLoading) return <Loading />
  if (plugin.isError || !plugin.data) {
    return (
      <div className="container" style={{ paddingTop: 60 }}>
        <h1 className="detail-title">插件未找到</h1>
        <Link to="/plugins" className="btn btn-secondary">
          返回插件列表
        </Link>
      </div>
    )
  }

  const p = plugin.data
  const { slug, namespace } = parseRef(ref)

  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <div className="detail-header">
        <h1 className="detail-title">{displayNameOf(p)}</h1>
        <p className="detail-summary">{p.summary || '暂无描述'}</p>
        <div className="detail-stats">
          <Stat label="下载" value={formatNumber(p.downloads)} />
          <Stat label="收藏" value={formatNumber(p.starsCount)} />
          <Stat label="版本" value={p.version ?? '—'} />
        </div>
      </div>

      <div className="detail-layout">
        <div>
          <div className="tab-bar">
            <span className="tab-btn active">清单文件</span>
          </div>
          {manifest.isLoading ? (
            <Loading />
          ) : manifest.isError ? (
            <p className="detail-summary">没有插件清单文件。</p>
          ) : (
            <pre className="code-block" style={{ whiteSpace: 'pre-wrap' }}>
              {formatJson(manifest.data ?? '')}
            </pre>
          )}

          {Array.isArray(p.files) && p.files.length > 0 && (
            <section style={{ marginTop: 32 }}>
              <h2 className="card-title">包含的文件</h2>
              <ul className="version-list">
                {p.files.map((f) => (
                  <li className="version-item" key={f.path}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem' }}>
                      {f.path}
                    </span>
                    <span className="version-date">{f.size} B</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <aside className="detail-sidebar">
          <div className="sidebar-section">
            <div className="sidebar-label">安装</div>
            <a
              className="btn btn-primary"
              href={api.pluginDownloadUrl(slug, p.version ?? '', namespace)}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              下载 ZIP
            </a>
          </div>
          <div className="sidebar-section">
            <div className="sidebar-label">发布者</div>
            <div className="owner-info">
              <span className="owner-avatar">{(p.ownerHandle ?? '?').slice(0, 1).toUpperCase()}</span>
              <span className="sidebar-value">{p.ownerHandle ?? '—'}</span>
            </div>
          </div>
          <div className="sidebar-section">
            <div className="sidebar-label">创建时间</div>
            <div className="sidebar-value">{formatDate(p.createdAt)}</div>
          </div>
          <div className="sidebar-section">
            <div className="sidebar-label">更新时间</div>
            <div className="sidebar-value">{formatDate(p.updatedAt)}</div>
          </div>
          {p.tags.length > 0 && (
            <div className="sidebar-section">
              <div className="sidebar-label">标签</div>
              <div className="card-tags" style={{ marginBottom: 0 }}>
                {p.tags.map((tag) => (
                  <span className="tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
          <div className="sidebar-section">
            <div className="sidebar-label">版本历史</div>
            {(versions.data?.versions ?? []).length === 0 ? (
              <div className="sidebar-value">—</div>
            ) : (
              <ul className="version-list">
                {versions.data!.versions.slice(0, 8).map((v) => (
                  <li className="version-item" key={v.id}>
                    <span className="version-tag">{v.version}</span>
                    {v.yankedAt && <span className="version-date">已撤回</span>}
                    <span className="version-date">{formatDate(v.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

/** Splits `@namespace/slug` (or a bare `slug`) into its parts. */
function parseRef(raw: string): { namespace: string; slug: string } {
  const trimmed = raw.replace(/^@/, '')
  const idx = trimmed.indexOf('/')
  if (idx > 0) return { namespace: trimmed.slice(0, idx), slug: trimmed.slice(idx + 1) }
  return { namespace: '', slug: trimmed }
}

/** Pretty-print the manifest JSON, falling back to the raw text if unparseable. */
function formatJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2)
  } catch {
    return raw
  }
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}
