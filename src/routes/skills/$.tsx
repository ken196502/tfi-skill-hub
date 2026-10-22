import { createFileRoute, Link, useParams } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import * as api from '../../lib/api'
import { useSession } from '../../lib/auth'
import { useFavoriteToggle } from '../../lib/favorites'
import { useLang, useT } from '../../lib/i18n'
import {
  HtmlContent,
  Markdown,
  Loading,
  ErrorBox,
  formatDate,
  formatNumber,
  localizedName,
  localizedSummary,
} from '../../components/ui'

/**
 * Skill detail.
 *
 * The path is a splat so a single route serves both `slug` and
 * `@namespace/slug` — the same grammar the API uses for a skill reference.
 */
export const Route = createFileRoute('/skills/$')({
  component: SkillDetailPage,
})

function SkillDetailPage() {
  const { _splat: ref = '' } = useParams({ from: '/skills/$' })
  const { lang } = useLang()
  const { user } = useSession()
  const t = useT()

  const skill = useQuery({
    queryKey: ['skill', ref],
    queryFn: () => api.getSkill(ref),
    retry: false,
  })
  const versions = useQuery({
    queryKey: ['skill', ref, 'versions'],
    queryFn: () => api.getSkillVersions(ref),
    enabled: skill.isSuccess,
  })
  // Detail markup replaces SKILL.md on the page; only fetch the file when there
  // is none for the current language, so a skill with a detail body costs one
  // less request. English falls back to the Chinese body, then to SKILL.md.
  const activeDetailHtml =
    lang === 'en' ? (skill.data?.detailHtmlEn ?? skill.data?.detailHtml) : skill.data?.detailHtml
  const readme = useQuery({
    queryKey: ['skill', ref, 'file', 'SKILL.md'],
    queryFn: () => api.getSkillFile(ref, 'latest', 'SKILL.md'),
    enabled: skill.isSuccess && !activeDetailHtml,
    retry: false,
  })

  // Declared before the early returns so hook order stays stable; the fallback
  // is only ever used while the skill is still loading.
  const favorite = useFavoriteToggle(skill.data ?? { slug: '', namespaceSlug: '' })

  if (skill.isLoading) return <Loading />
  if (skill.isError || !skill.data) {
    return (
      <div className="container" style={{ paddingTop: 60 }}>
        <PageTitle title={t('未找到内容', 'Content not found')} />
        <Link to="/" className="btn btn-secondary">
          {t('返回首页', 'Back to home')}
        </Link>
      </div>
    )
  }

  const s = skill.data
  const latest = versions.data?.versions?.[0]
  const downloadHref = api.downloadUrl({ slug: s.slug, namespace: s.namespaceSlug })

  return (
    <div className="container" style={{ paddingTop: 40 }}>
      <div className="detail-header">
        <div className="detail-kind-row">
          <h1 className="detail-title">{localizedName(s, lang)}</h1>
          {s.type === 'knowledge_base' && (
            <span className="card-kind">{t('知识库', 'Knowledge base')}</span>
          )}
        </div>
        <p className="detail-summary">
          {localizedSummary(s, lang) || t('暂无描述', 'No description yet')}
        </p>
        <div className="detail-stats">
          <Stat label={t('下载', 'Downloads')} value={formatNumber(s.downloads)} />
          <Stat label={t('版本', 'Versions')} value={formatNumber(s.versionsCount)} />
        </div>
      </div>
      <div className="detail-layout">
        <div>
          <div className="tab-bar">
            <span className="tab-btn active">{t('说明', 'Readme')}</span>
          </div>
          {activeDetailHtml ? (
            <HtmlContent html={activeDetailHtml} />
          ) : readme.isLoading ? (
            <Loading />
          ) : readme.isError ? (
            // A knowledge base package need not carry a SKILL.md, and a missing
            // one is not a failure: the summary is what the page has to show.
            // Anything other than a 404 is a genuine read error.
            readme.error instanceof api.ApiError && readme.error.status === 404 ? (
              <p className="detail-summary">
                {localizedSummary(s, lang) || t('暂无描述', 'No description yet')}
              </p>
            ) : (
              <ErrorBox message={t('无法读取该内容的说明文档。', 'Unable to read this entry\'s documentation.')} />
            )
          ) : (
            <Markdown source={readme.data ?? ''} />
          )}
        </div>

        <aside className="detail-sidebar">
          <div className="sidebar-section">
            <div className="sidebar-label">{t('收藏', 'Favorites')}</div>
            <button
              type="button"
              className={`btn favorite-btn${favorite.starred ? ' is-starred' : ' btn-primary'}`}
              onClick={favorite.toggle}
              disabled={favorite.pending}
              aria-pressed={favorite.starred}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              <span aria-hidden="true">{favorite.starred ? '★' : '☆'}</span>
              {favorite.starred ? t('已收藏', 'Favorited') : t('收藏', 'Favorite')}
            </button>
            <p className="muted sidebar-hint">
              {formatNumber(s.starsCount)} {t('人已收藏', 'favorited')}
            </p>
          </div>

          <div className="sidebar-section">
            {/* A skill is installed by an agent; a knowledge base is read. */}
            <div className="sidebar-label">
              {s.type === 'knowledge_base' ? t('下载', 'Download') : t('安装', 'Install')}
            </div>
            {user ? (
              <a className="btn btn-primary" href={downloadHref} style={{ width: '100%', justifyContent: 'center' }}>
                {t('下载 ZIP', 'Download ZIP')}
              </a>
            ) : (
              <>
                <a
                  className="btn btn-secondary"
                  href={`/login?redirect=${encodeURIComponent(`/skills/${ref}`)}`}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  {t('登录后下载', 'Log in to download')}
                </a>
                <p className="muted sidebar-hint">{t('下载需要登录。', 'Sign in to download.')}</p>
              </>
            )}
          </div>

          <div className="sidebar-section">
            <div className="sidebar-label">{t('最新版本', 'Latest version')}</div>
            <div className="sidebar-value">{latest?.version ?? '—'}</div>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-label">{t('发布者', 'Publisher')}</div>
            <div className="owner-info">
              <span className="owner-avatar">{s.ownerHandle.slice(0, 1).toUpperCase()}</span>
              <span className="sidebar-value">{s.ownerHandle}</span>
            </div>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-label">{t('创建时间', 'Created')}</div>
            <div className="sidebar-value">{formatDate(s.createdAt)}</div>
          </div>
          <div className="sidebar-section">
            <div className="sidebar-label">{t('更新时间', 'Updated')}</div>
            <div className="sidebar-value">{formatDate(s.updatedAt)}</div>
          </div>

          {s.tags.length > 0 && (
            <div className="sidebar-section">
              <div className="sidebar-label">{t('标签', 'Tags')}</div>
              <div className="card-tags" style={{ marginBottom: 0 }}>
                {s.tags.map((tag) => (
                  <span className="tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="sidebar-section">
            <div className="sidebar-label">{t('版本历史', 'Version history')}</div>
            {(versions.data?.versions ?? []).length === 0 ? (
              <div className="sidebar-value">—</div>
            ) : (
              <ul className="version-list">
                {versions.data!.versions!.slice(0, 8).map((v) => (
                  <li className="version-item" key={v.id}>
                    <span className="version-tag">{v.version}</span>
                    {v.yankedAt && (
                      <span className="version-date">{t('已撤回', 'yanked')}</span>
                    )}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

function PageTitle({ title }: { title: string }) {
  return <h1 className="detail-title">{title}</h1>
}
