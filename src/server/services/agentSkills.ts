/**
 * Agent Skill API (`/api/agent/*`).
 *
 * A simpler, agent-oriented view over the skill catalogue, used by runtimes that
 * want "list my skills / get one / download one" without the registry's
 * cursor-and-namespace vocabulary. Responses use the Agent envelope:
 * `{ data, requestId }`, with errors as `{ error: { code, message } }`.
 */

import crypto from 'node:crypto'
import type { RequestContext } from '../http'
import { json } from '../http'
import { query, type Row } from '../db'
import { versions as versionRepo, versionFiles, skills as skillRepo } from '../repo/skills'
import { namespaces } from '../repo/core'
import { canViewSkill, isUuidLike, type Viewer } from './shared'
import { createZip } from '../zip'

const MAX_ARCHIVE_BYTES = 20 << 20
const SKILL_MD = 'SKILL.md'

function requestIdOf(ctx: RequestContext): string {
  return ctx.requestId.startsWith('req_') ? ctx.requestId : `req_${ctx.requestId}`
}

function agentError(
  ctx: RequestContext,
  code: string,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): Response {
  const error: Record<string, unknown> = { code, message }
  if (details) error.details = details
  return json({ error, requestId: requestIdOf(ctx) }, status)
}

function viewerOf(ctx: RequestContext): Viewer | null {
  return ctx.user ? { id: ctx.user.id, role: ctx.user.role } : null
}

/** `@<namespaceSlug>/<slug>` when the skill has a namespace, else `@<slug>`. */
function skillhubId(namespaceSlug: string, slug: string): string {
  return namespaceSlug !== '' ? `@${namespaceSlug}/${slug}` : `@${slug}`
}

interface AgentSkillItem {
  id: string
  name: string
  description: string
  type: string
  nickname: string
  status: string
  skillhubId: string
}

function toItem(row: Row): AgentSkillItem {
  const ownerHandle = row.owner_handle == null ? '' : String(row.owner_handle)
  const namespaceSlug = row.namespace_slug == null ? '' : String(row.namespace_slug)
  const slug = String(row.slug)
  return {
    id: String(row.id),
    name: slug,
    description: row.summary == null ? '' : String(row.summary),
    // `type` is the lowercased kind, defaulting to `custom`.
    type: (String(row.kind ?? '') || 'custom').toLowerCase(),
    nickname: ownerHandle,
    status: row.soft_deleted_at == null ? 'ACTIVE' : 'DELETED',
    skillhubId: skillhubId(namespaceSlug, slug),
  }
}

const AGENT_SELECT = /* sql */ `
  SELECT s.*, u.handle AS owner_handle, n.slug AS namespace_slug
  FROM skills s
  JOIN users u ON u.id = s.owner_id
  LEFT JOIN namespaces n ON n.id = s.namespace_id
`

/** Visibility predicate shared by the list and detail paths. */
function visibilitySql(viewer: Viewer | null): { sql: string; params: unknown[] } {
  if (viewer && (viewer.role === 'admin' || viewer.role === 'moderator')) {
    return { sql: '', params: [] }
  }
  if (viewer) {
    return {
      sql: ` AND ((s.visibility = 'public' AND s.moderation_status = 'approved') OR s.owner_id = ?)`,
      params: [viewer.id],
    }
  }
  return { sql: ` AND s.visibility = 'public' AND s.moderation_status = 'approved'`, params: [] }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Paged listing. Upstream implemented paging by repeatedly calling the keyset
 * list, i.e. O(page × pageSize); we reproduce the observable output with a
 * straight OFFSET, which is equivalent for the caller.
 */
export function listAgentSkills(ctx: RequestContext, page: number, pageSize: number): Response {
  try {
    const effectivePage = page <= 0 ? 1 : page
    const effectiveSize = pageSize <= 0 || pageSize > 100 ? 20 : pageSize
    const viewer = viewerOf(ctx)
    const vis = visibilitySql(viewer)

    const where = `WHERE s.soft_deleted_at IS NULL${vis.sql}`
    const rows = query.all<Row>(
      `${AGENT_SELECT} ${where} ORDER BY s.updated_at DESC, s.id LIMIT ? OFFSET ?`,
      ...vis.params,
      effectiveSize + 1,
      (effectivePage - 1) * effectiveSize,
    )

    const hasMore = rows.length > effectiveSize
    const items = rows.slice(0, effectiveSize).map(toItem)

    // `total` is a lower bound on a full page, matching upstream.
    const total = hasMore
      ? effectivePage * effectiveSize + 1
      : (effectivePage - 1) * effectiveSize + items.length

    return json({
      data: items,
      pagination: { pageSize: effectiveSize, total, hasMore },
      requestId: requestIdOf(ctx),
    })
  } catch {
    return agentError(ctx, 'INTERNAL_ERROR', 'internal error', 500)
  }
}

export function skillDetail(ctx: RequestContext, rawId: string): Response {
  const id = rawId.trim()
  if (!isUuidLike(id)) return agentError(ctx, 'INVALID_REQUEST', 'invalid skill id', 400)

  const row = query.get<Row>(`${AGENT_SELECT} WHERE s.id = ?`, id)
  if (!row) return agentError(ctx, 'SKILL_NOT_FOUND', 'skill not found', 404, { id })

  const skill = skillRepo.getWithOwnerById(id)
  if (!skill || !canViewSkill(skill, viewerOf(ctx))) {
    return agentError(ctx, 'SKILL_NOT_FOUND', 'skill not found', 404, { id })
  }

  // `skillMd` is the raw SKILL.md of the latest version; `""` when unreadable.
  const skillMdBytes = skill.latestVersionId
    ? versionFiles.get(skill.latestVersionId, SKILL_MD)
    : null
  const skillMdText = skillMdBytes ? new TextDecoder().decode(skillMdBytes) : ''

  return json({
    data: {
      ...toItem(row),
      detail: skill.summary ?? '',
      skillMd: skillMdText,
    },
    requestId: requestIdOf(ctx),
  })
}

export function downloadInfo(ctx: RequestContext, rawId: string): Response {
  const id = rawId.trim()
  if (!isUuidLike(id)) return agentError(ctx, 'INVALID_REQUEST', 'invalid skill id', 400)

  const skill = skillRepo.getWithOwnerById(id)
  if (!skill || !canViewSkill(skill, viewerOf(ctx))) {
    return agentError(ctx, 'SKILL_NOT_FOUND', 'skill not found', 404, { id })
  }

  const host = ctx.request.headers.get('host') ?? 'localhost'
  const forwardedProto = ctx.request.headers.get('x-forwarded-proto')
  // `localhost` / `127.0.0.1` default to http so local runtimes can reach the
  // archive URL directly; an explicit X-Forwarded-Proto always wins.
  const isLocal =
    new URL(ctx.request.url).protocol === 'http:' &&
    (host.startsWith('localhost') || host.startsWith('127.0.0.1'))
  const scheme = forwardedProto && forwardedProto !== '' ? forwardedProto : isLocal ? 'http' : 'https'

  return json(
    {
      data: { downloadUrl: `${scheme}://${host}/api/agent/skills/${id}/archive` },
      requestId: requestIdOf(ctx),
    },
    200,
  )
}

export function archive(ctx: RequestContext, rawId: string): Response {
  const id = rawId.trim()
  if (!isUuidLike(id)) return agentError(ctx, 'INVALID_REQUEST', 'invalid skill id', 400)

  const skill = skillRepo.getWithOwnerById(id)
  if (!skill || !canViewSkill(skill, viewerOf(ctx))) {
    return agentError(ctx, 'SKILL_NOT_FOUND', 'skill not found', 404, { id })
  }
  if (!skill.latestVersionId) {
    return agentError(ctx, 'SKILL_NOT_FOUND', 'skill not found', 404, { id })
  }

  const version = versionRepo.getById(skill.latestVersionId)
  if (!version) return agentError(ctx, 'BACKEND_ERROR', 'download failed', 502)

  const files = versionFiles.listAll(version.id)
  if (files.length === 0) return agentError(ctx, 'BACKEND_ERROR', 'read archive failed', 502)

  let zip: Uint8Array
  try {
    zip = createZip(
      files.map((f) => ({ path: f.path, content: f.content })),
      new Date(version.createdAt),
    )
  } catch {
    return agentError(ctx, 'BACKEND_ERROR', 'read archive failed', 502)
  }

  if (zip.byteLength > MAX_ARCHIVE_BYTES) {
    return agentError(ctx, 'ARCHIVE_TOO_LARGE', 'archive too large', 413)
  }

  return new Response(zip as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${skill.slug}-${version.version}.zip"`,
      'X-Content-SHA256': crypto.createHash('sha256').update(zip).digest('hex'),
    },
  })
}

export { namespaces }
