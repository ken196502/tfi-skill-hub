/**
 * Shared presentational components: skill/plugin cards, a copyable code block
 * and a markdown body.
 */

import { useState, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import type { Plugin, SkillWithOwner } from '../lib/types'
import { renderMarkdown } from '../lib/markdown'
import type { PluginJson } from '../lib/api'

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
  return (
    <Link to="/skills/$" params={{ _splat: skillPath(skill) }}>
      <div className="card">
        <div className="card-title">{displayNameOf(skill)}</div>
        {skill.tags.length > 0 && (
          <div className="card-tags">
            {skill.tags.slice(0, 3).map((tag) => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="card-summary">{skill.summary || '暂无描述'}</div>
        <div className="card-meta">
          <span>↓ {formatNumber(skill.downloads)}</span>
          <span>★ {formatNumber(skill.starsCount)}</span>
          <span>@{skill.ownerHandle}</span>
        </div>
      </div>
    </Link>
  )
}

export function PluginCard({ plugin }: { plugin: Plugin | PluginJson }) {
  const namespaceSlug = (plugin as PluginJson).namespaceSlug
  const ref = namespaceSlug ? `@${namespaceSlug}/${plugin.slug}` : plugin.slug
  return (
    <Link to="/plugins/$" params={{ _splat: ref }}>
      <div className="card">
        <div className="card-title">{displayNameOf(plugin)}</div>
        {plugin.tags.length > 0 && (
          <div className="card-tags">
            {plugin.tags.slice(0, 3).map((tag) => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="card-summary">{plugin.summary || '暂无描述'}</div>
        <div className="card-meta">
          <span>↓ {formatNumber(plugin.downloads)}</span>
          {typeof (plugin as PluginJson).version === 'string' && (
            <span>v{(plugin as PluginJson).version}</span>
          )}
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
        {copied ? '已复制！' : '复制'}
      </button>
      <span className="prefix">{prefix} </span>
      <span className="cmd">{command}</span>
    </div>
  )
}

export function Markdown({ source }: { source: string }) {
  if (source.trim() === '') {
    return <p className="detail-summary">暂无 SKILL.md 内容。</p>
  }
  // Safe by construction: `renderMarkdown` escapes before formatting, so no
  // user-supplied HTML can survive into the output.
  return (
    <div className="markdown-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }} />
  )
}

export function Loading({ label = '加载中...' }: { label?: string }) {
  return (
    <div style={{ padding: '48px 0', textAlign: 'center' }}>
      <div className="spinner" />
      <p className="detail-summary" style={{ marginTop: 12 }}>
        {label}
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
