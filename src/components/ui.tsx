/**
 * Shared presentational components: skill cards, a copyable code block
 * and a markdown body.
 */

import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import type { SkillWithOwner } from '../lib/types'
import { renderMarkdown } from '../lib/markdown'
import { sanitizeHtml } from '../lib/sanitizeHtml'
import { useFavoriteToggle } from '../lib/favorites'
import { useLang, useT, localizedName, localizedSummary } from '../lib/i18n'

// Re-exported so page components can pull everything from one module.
export { localizedName, localizedSummary }

/** Human label for a skill: display name when set, otherwise the slug. */
export function displayNameOf(entity: { displayName?: string; slug: string }): string {
  return entity.displayName && entity.displayName.trim() !== '' ? entity.displayName : entity.slug
}

/** `@namespace/slug` when namespaced, else the bare slug. */
export function skillPath(skill: { slug: string; namespaceSlug?: string }): string {
  return skill.namespaceSlug ? `@${skill.namespaceSlug}/${skill.slug}` : skill.slug
}

export function formatDate(iso: string | number | undefined): string {
  if (iso === undefined) return '—'
  const ms = typeof iso === 'number' ? (iso < 1e12 ? iso * 1000 : iso) : Date.parse(iso)
  if (Number.isNaN(ms)) return '—'
  return new Date(ms).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

export function formatNumber(n: number | undefined): string {
  return (n ?? 0).toLocaleString('zh-CN')
}

export function SkillCard({ skill }: { skill: SkillWithOwner }) {
  const { lang } = useLang()
  const t = useT()
  const name = localizedName(skill, lang)
  const summary = localizedSummary(skill, lang)
  const favorite = useFavoriteToggle(skill)
  return (
    <Link to="/skills/$" params={{ _splat: skillPath(skill) }}>
      <div className="card">
        <div className="card-head">
          <div className="card-title">{name}</div>
          {skill.tags.length > 0 && (
            <div className="card-tags">
              {skill.tags.slice(0, 3).map((tag) => (
                <span className="tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="card-summary">{summary || t('暂无描述', 'No description yet')}</div>
        <div className="card-meta">
          <span className="stat-downloads" title={t('下载量', 'Downloads')}>
            <i className="stat-icon" aria-hidden="true">↓</i>
            <b>{formatNumber(skill.downloads)}</b>
          </span>
          <button
            type="button"
            className={`stat-stars star-toggle${favorite.starred ? ' is-starred' : ''}`}
            onClick={favorite.toggle}
            disabled={favorite.pending}
            aria-pressed={favorite.starred}
            aria-label={favorite.starred ? t('取消收藏', 'Remove from favorites') : t('收藏', 'Add to favorites')}
            title={favorite.starred ? t('已收藏，点击取消', 'Favorited — click to remove') : t('点击收藏', 'Click to favorite')}
          >
            <i className="stat-icon" aria-hidden="true">{favorite.starred ? '★' : '☆'}</i>
            <b>{formatNumber(skill.starsCount)}</b>
          </button>
          <span className="stat-owner">
            <i className="stat-icon" aria-hidden="true">@</i>
            {skill.ownerHandle}
          </span>
        </div>
      </div>
    </Link>
  )
}

export function CodeBlock({
  command,
  prefix = '$',
}: {
  command: string
  prefix?: string
}) {
  const [copied, setCopied] = useState(false)
  const t = useT()
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable (insecure context) — leave the button as-is */
    }
  }
  return (
    <div className="code-block">
      <button className="copy-btn" onClick={copy} type="button">
        {copied ? t('已复制！', 'Copied!') : t('复制', 'Copy')}
      </button>
      <span className="prefix">{prefix} </span>
      <span className="cmd">{command}</span>
    </div>
  )
}

export function Markdown({ source }: { source: string }) {
  const t = useT()
  if (source.trim() === '') {
    return <p className="detail-summary">{t('暂无 SKILL.md 内容。', 'No SKILL.md content yet.')}</p>
  }
  // Safe by construction: `renderMarkdown` escapes before formatting, so no
  // user-supplied HTML can survive into the output.
  return (
    <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }} />
  )
}

/**
 * Publisher-supplied detail markup.
 *
 * The server sanitises on the way in, and this runs the same filter again
 * before the string reaches `dangerouslySetInnerHTML` — so content that was
 * written to the database by any other route is still cleaned at render time.
 */
export function HtmlContent({ html }: { html: string }) {
  return (
    <div className="markdown-body" dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }} />
  )
}

export function Loading({ label }: { label?: string }) {
  const t = useT()
  return (
    <div style={{ padding: '48px 0', textAlign: 'center' }}>
      <div className="spinner" />
      <p className="detail-summary" style={{ marginTop: 12 }}>
        {label ?? t('加载中...', 'Loading...')}
      </p>
    </div>
  )
}

export function ErrorBox({ message }: { message: string }) {
  return <div className="error-box">{message}</div>
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 16,
        flexWrap: 'wrap',
        marginBottom: 24,
      }}
    >
      <div>
        <h1 className="detail-title" style={{ marginBottom: subtitle ? 6 : 0 }}>
          {title}
        </h1>
        {subtitle && <p className="detail-summary" style={{ marginBottom: 0 }}>{subtitle}</p>}
      </div>
      {actions}
    </div>
  )
}
