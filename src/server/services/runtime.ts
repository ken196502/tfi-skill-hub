/**
 * Runtime skill API (`/api/runtime/*`).
 *
 * This is the surface an agent runtime hits to load skills at run time. It uses
 * its own error envelope — `{ error: { code, message, requestId?, details? } }`
 * — rather than the registry's `{ error: "..." }`, so a client can branch on a
 * stable `code` instead of matching message text.
 *
 * Two behaviours differ from the rest of the API on purpose:
 *   * A yanked version is refused here (`410 version_yanked`), whereas the
 *     registry download endpoint still serves it by exact version pin.
 *   * Skills whose latest version is missing, yanked, or lacks `SKILL.md` are
 *     silently skipped from listings rather than surfaced as broken entries.
 */

import crypto from 'node:crypto'
import type { RequestContext } from '../http'
import { json } from '../http'
import { query, type Row } from '../db'
import { versions as versionRepo, versionFiles, skills as skillRepo } from '../repo/skills'
import { namespaces } from '../repo/core'
import { search, type SearchOptions } from '../repo/search'
import { isUuidLike, canViewSkill, type Viewer } from './shared'
import { createZip } from '../zip'
import { contentTypeFor } from '../content'

const RUNTIME_API_VERSION = '2026-06-17'
const MAX_REFS = 100
const MAX_BUNDLE_BYTES = 100 << 20
const SKILL_MD = 'SKILL.md'

type RuntimeErrorCode =
  | 'invalid_ref'
  | 'skill_not_found'
  | 'version_not_found'
  | 'version_yanked'
  | 'file_not_found'
  | 'bundle_too_large'
  | 'temporarily_unavailable'

function rtError(
  ctx: RequestContext,
  code: RuntimeErrorCode,
  message: string,
  status: number,
  details?: Record<string, unknown>,
): Response {
  const requestId = ctx.requestId.startsWith('req_') ? ctx.requestId : `req_${ctx.requestId}`
  const error: Record<string, unknown> = { code, message, requestId }
  if (details) error.details = details
  return json({ error }, status)
}

function viewerOf(ctx: RequestContext): Viewer | null {
  return ctx.user ? { id: ctx.user.id, role: ctx.user.role } : null
}

/** Search passthrough. Kept here so the search repo stays free of HTTP types. */
export function searchDocuments(opts: SearchOptions) {
  return search(opts)
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill projection
// ─────────────────────────────────────────────────────────────────────────────

interface RuntimeSkill {
  id: string
  slug: string
  name: string
  displayName: string
  description: string
  kind: string
  version: string
  digest: string
  status: string
  resolvedAt: string
  manifest?: Record<string, unknown>
  skillMd?: string
}

/**
 * Manifest digest: `sha256:` + hex of the JSON of
 * `{entrypoint, files (sorted by path), dependencies (sorted by slug, version)}`.
 * Deterministic so clients can pin it.
 */
function manifestDigest(
  entrypoint: string,
  files: Array<{ path: string; sha256: string }>,
  dependencies: Array<{ slug: string; namespace?: string; version: string }>,
): string {
  const payload = {
    entrypoint,
    files: [...files].sort((a, b) => (a.path < b.path ? -1 : 1)).map((f) => ({ path: f.path, sha256: f.sha256 })),
    dependencies: [...dependencies]
      .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : a.version < b.version ? -1 : 1))
      .map((d) => ({ slug: d.slug, namespace: d.namespace ?? '', version: d.version })),
  }
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`
}

interface ResolvedRuntime {
  skill?: RuntimeSkill
  error?: { code: RuntimeErrorCode; message: string; status: number }
}

/**
 * Resolves a skill id/slug pair to the runtime projection.
 * `include` is a comma-joined set; only `manifest` and `skillMd` are recognised.
 */
function resolveRuntimeSkill(
  ctx: RequestContext,
  ref: { id?: string; slug?: string; version?: string; digest?: string; include?: string },
): ResolvedRuntime {
  const include = new Set((ref.include ?? '').split(',').map((s) => s.trim()))

  let skillRow: Row | undefined
  if (ref.id) {
    if (!isUuidLike(ref.id)) {
      return { error: { code: 'invalid_ref', message: 'invalid skill id', status: 400 } }
    }
    skillRow = query.get<Row>('SELECT * FROM skills WHERE id = ? AND soft_deleted_at IS NULL', ref.id)
  } else if (ref.slug) {
    const parsed = parseRuntimeRef(ref.slug)
    if (parsed.namespace) {
      const ns = namespaces.getBySlug(parsed.namespace)
      if (ns) {
        skillRow = query.get<Row>(
          'SELECT * FROM skills WHERE namespace_id = ? AND slug = ? AND soft_deleted_at IS NULL',
          ns.id,
          parsed.slug,
        )
      }
    } else {
      const rows = query.all<Row>(
        'SELECT * FROM skills WHERE slug = ? AND soft_deleted_at IS NULL',
        parsed.slug,
      )
      // Prefer a listed match when a bare slug is ambiguous.
      skillRow = rows.find((r) => r.listing === 'listed') ?? rows[0]
    }
  } else {
    return { error: { code: 'invalid_ref', message: 'id or slug is required', status: 400 } }
  }

  if (!skillRow) {
    return { error: { code: 'skill_not_found', message: 'skill not found', status: 404 } }
  }

  const skill = skillRepo.getWithOwnerById(String(skillRow.id))
  if (!skill || !canViewSkill(skill, viewerOf(ctx))) {
    return { error: { code: 'skill_not_found', message: 'skill not found', status: 404 } }
  }

  // Version resolution: explicit version, else the latest pointer.
  const wanted = (ref.version ?? '').trim()
  let version = null as ReturnType<typeof versionRepo.getById>
  if (wanted === '' || wanted === 'latest') {
    if (!skill.latestVersionId) {
      return { error: { code: 'version_not_found', message: 'version not found', status: 404 } }
    }
    version = versionRepo.getById(skill.latestVersionId)
  } else {
    version = versionRepo.getBySkillAndVersion(skill.id, wanted)
  }
  if (!version) {
    return { error: { code: 'version_not_found', message: 'version not found', status: 404 } }
  }
  if (version.yankedAt) {
    // Unlike the registry download path, runtime loading refuses yanked versions.
    return { error: { code: 'version_yanked', message: 'version yanked', status: 410 } }
  }

  const skillMdBytes = versionFiles.get(version.id, SKILL_MD)
  if (!skillMdBytes) {
    return { error: { code: 'file_not_found', message: 'SKILL.md not found', status: 404 } }
  }

  const digest = manifestDigest(SKILL_MD, version.files, version.dependencies)

  const runtimeSkill: RuntimeSkill = {
    id: skill.id,
    slug: skill.slug,
    name: skill.slug,
    displayName: skill.displayName ?? skill.slug,
    description: skill.summary ?? '',
    kind: skill.kind,
    version: version.version,
    digest,
    status: 'active',
    resolvedAt: new Date().toISOString(),
  }

  if (ref.digest && ref.digest !== digest) {
    return {
      error: {
        code: 'invalid_ref',
        message: 'digest does not match resolved version',
        status: 400,
      },
    }
  }

  if (include.has('skillMd')) {
    runtimeSkill.skillMd = new TextDecoder().decode(skillMdBytes)
  }
  if (include.has('manifest')) {
    runtimeSkill.manifest = {
      entrypoint: SKILL_MD,
      files: version.files.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256 })),
      dependencies: version.dependencies,
      apiVersion: RUNTIME_API_VERSION,
    }
  }

  return { skill: runtimeSkill }
}

function parseRuntimeRef(raw: string): { namespace: string; slug: string } {
  const trimmed = raw.trim().replace(/^@/, '')
  const idx = trimmed.indexOf('/')
  if (idx > 0) return { namespace: trimmed.slice(0, idx), slug: trimmed.slice(idx + 1) }
  return { namespace: '', slug: trimmed }
}

/** Rejects absolute paths, `..`, backslashes and NUL — mirrors `cleanRuntimeFilePath`. */
function cleanRuntimeFilePath(raw: string): string | null {
  if (raw === '' || raw.includes('\\') || raw.includes('\0') || raw.startsWith('/')) return null
  const parts = raw.split('/')
  if (parts.some((p) => p === '' || p === '.' || p === '..')) return null
  return parts.join('/')
}

// ─────────────────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────────────────

export async function resolve(ctx: RequestContext): Promise<Response> {
  let body: {
    refs?: Array<{ id?: string; slug?: string; version?: string; digest?: string }>
    include?: string[]
  }
  try {
    body = (await ctx.request.json()) as typeof body
  } catch (e) {
    return rtError(ctx, 'invalid_ref', 'invalid resolve request', 400, {
      cause: (e as Error).message,
    })
  }

  const refs = body.refs ?? []
  if (!Array.isArray(refs) || refs.length === 0) {
    return rtError(ctx, 'invalid_ref', 'refs is required', 400)
  }
  if (refs.length > MAX_REFS) {
    return rtError(ctx, 'invalid_ref', 'too many refs', 400, { max: MAX_REFS })
  }

  const include = (body.include ?? []).join(',')
  const results = refs.map((ref, index) => {
    if (ref.id && ref.slug) {
      const byId = resolveRuntimeSkill(ctx, { id: ref.id, include })
      const bySlug = resolveRuntimeSkill(ctx, { slug: ref.slug, include })
      if (byId.skill && bySlug.skill && byId.skill.id !== bySlug.skill.id) {
        return {
          index,
          ref,
          error: { code: 'invalid_ref' as const, message: 'id and slug refer to different skills' },
        }
      }
    }
    const resolved = resolveRuntimeSkill(ctx, { ...ref, include })
    if (resolved.error) {
      return { index, ref, error: { code: resolved.error.code, message: resolved.error.message } }
    }
    return { index, ref, skill: resolved.skill }
  })

  return json({ results })
}

export async function list(ctx: RequestContext): Promise<Response> {
  try {
    const rawLimit = Number.parseInt(ctx.url.searchParams.get('limit') ?? '', 10)
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 && rawLimit <= 100 ? rawLimit : 100
    const orderRaw = ctx.url.searchParams.get('order') ?? ''
    const order = orderRaw === 'name' ? 'slug ASC' : 'updated_at DESC'
    const owner = ctx.url.searchParams.get('owner') ?? ''
    const cursor = ctx.url.searchParams.get('cursor') ?? ''

    const where: string[] = ['soft_deleted_at IS NULL', "listing = 'listed'"]
    const params: unknown[] = []
    if (owner) {
      const ns = namespaces.getBySlug(owner)
      if (ns) {
        where.push('namespace_id = ?')
        params.push(ns.id)
      }
    }
    if (cursor) {
      where.push('id > ?')
      params.push(cursor)
    }

    const rows = query.all<Row>(
      `SELECT * FROM skills WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ?`,
      ...params,
      limit + 1,
    )

    const items: Array<Record<string, unknown>> = []
    for (const row of rows.slice(0, limit)) {
      const resolved = resolveRuntimeSkill(ctx, { id: String(row.id) })
      // Broken or yanked entries are skipped rather than reported.
      if (!resolved.skill) continue
      const s = resolved.skill
      items.push({
        id: s.id,
        slug: s.slug,
        name: s.name,
        displayName: s.displayName,
        description: s.description,
        kind: s.kind,
        version: s.version,
        digest: s.digest,
        status: 'active',
        updatedAt: String(row.updated_at),
      })
    }

    const nextCursor = rows.length > limit ? String(rows[limit].id) : ''
    return json({ data: items, nextCursor })
  } catch {
    return rtError(ctx, 'temporarily_unavailable', 'list skills failed', 500)
  }
}

export function byId(ctx: RequestContext, id: string): Response {
  const include = ctx.url.searchParams.get('include') ?? ''
  const resolved = resolveRuntimeSkill(ctx, {
    id,
    version: ctx.url.searchParams.get('version') ?? '',
    digest: ctx.url.searchParams.get('digest') ?? '',
    include,
  })
  if (resolved.error) {
    return rtError(ctx, resolved.error.code, resolved.error.message, resolved.error.status)
  }
  return json(resolved.skill)
}

export function bySlug(ctx: RequestContext): Response {
  const rawSlug = ctx.url.searchParams.get('slug') ?? ''
  if (rawSlug === '') return rtError(ctx, 'invalid_ref', 'slug is required', 400)
  const resolved = resolveRuntimeSkill(ctx, {
    slug: rawSlug,
    version: ctx.url.searchParams.get('version') ?? '',
    digest: ctx.url.searchParams.get('digest') ?? '',
    include: ctx.url.searchParams.get('include') ?? '',
  })
  if (resolved.error) {
    return rtError(ctx, resolved.error.code, resolved.error.message, resolved.error.status)
  }
  return json(resolved.skill)
}

export function file(ctx: RequestContext): Response {
  const id = ctx.url.searchParams.get('id') ?? ''
  const slug = ctx.url.searchParams.get('slug') ?? ''
  const pathParam = ctx.url.searchParams.get('path') ?? ''

  if (id === '' && slug === '') return rtError(ctx, 'invalid_ref', 'id or slug is required', 400)
  const clean = cleanRuntimeFilePath(pathParam)
  if (clean === null) return rtError(ctx, 'invalid_ref', 'invalid file path', 400)

  // Resolve metadata only (no skillMd) to find the version, then read the file.
  const resolved = resolveRuntimeSkill(ctx, {
    id: id || undefined,
    slug: slug || undefined,
    version: ctx.url.searchParams.get('version') ?? '',
    digest: ctx.url.searchParams.get('digest') ?? '',
    include: '',
  })
  if (resolved.error) {
    return rtError(ctx, resolved.error.code, resolved.error.message, resolved.error.status)
  }

  const version = versionRepo.getBySkillAndVersion(resolved.skill!.id, resolved.skill!.version)
  if (!version) return rtError(ctx, 'version_not_found', 'version not found', 404)

  const bytes = versionFiles.get(version.id, clean)
  if (!bytes) return rtError(ctx, 'file_not_found', 'file not found', 404)

  const sha = crypto.createHash('sha256').update(bytes).digest('hex')
  const etag = `"sha256:${sha}"`
  if (matchesIfNoneMatch(ctx.request.headers.get('if-none-match'), etag)) {
    return new Response(null, { status: 304, headers: { ETag: etag } })
  }

  const digestSupplied = (ctx.url.searchParams.get('digest') ?? '') !== ''
  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      ETag: etag,
      // Without a Content-Type, `X-Content-Type-Options: nosniff` makes strict
      // browsers refuse to render images served from skill packages.
      'Content-Type': contentTypeFor(clean),
      'X-Saker-File-SHA256': sha,
      'Cache-Control': digestSupplied
        ? 'public, max-age=31536000, immutable'
        : 'private, max-age=300',
    },
  })
}

export function bundle(ctx: RequestContext): Response {
  const format = ctx.url.searchParams.get('format') ?? 'zip'
  if (format !== 'zip' && format !== '') {
    return rtError(ctx, 'invalid_ref', 'unsupported bundle format', 400, { format })
  }

  const resolved = resolveRuntimeSkill(ctx, {
    id: ctx.url.searchParams.get('id') || undefined,
    slug: ctx.url.searchParams.get('slug') || undefined,
    version: ctx.url.searchParams.get('version') ?? '',
    digest: ctx.url.searchParams.get('digest') ?? '',
    include: '',
  })
  if (resolved.error) {
    return rtError(ctx, resolved.error.code, resolved.error.message, resolved.error.status)
  }

  const version = versionRepo.getBySkillAndVersion(resolved.skill!.id, resolved.skill!.version)
  if (!version) return rtError(ctx, 'version_not_found', 'version not found', 404)

  const files = versionFiles.listAll(version.id)
  let zip: Uint8Array
  try {
    zip = createZip(
      files.map((f) => ({ path: f.path, content: f.content })),
      new Date(version.createdAt),
    )
  } catch {
    return rtError(ctx, 'temporarily_unavailable', 'read bundle failed', 500)
  }
  if (zip.byteLength > MAX_BUNDLE_BYTES) {
    return rtError(ctx, 'bundle_too_large', 'bundle too large', 413, { maxBytes: MAX_BUNDLE_BYTES })
  }

  return new Response(zip as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${resolved.skill!.slug}-${version.version}.zip"`,
      'X-Saker-Bundle-SHA256': crypto.createHash('sha256').update(zip).digest('hex'),
      'X-Saker-Skill-Digest': resolved.skill!.digest,
    },
  })
}

function matchesIfNoneMatch(header: string | null, etag: string): boolean {
  if (!header) return false
  return header
    .split(',')
    .map((p) => p.trim().replace(/^W\//, ''))
    .some((c) => c === '*' || c === etag)
}

