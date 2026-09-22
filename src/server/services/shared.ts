/**
 * Shared service helpers: reference resolution, visibility/authorization
 * checks, audit logging, notification fan-out and search-index maintenance.
 *
 * These are the rules that more than one service needs, kept in one place so a
 * permission change cannot be applied in one code path and forgotten in another.
 */

import { asNumber, nowIso, query, type Row } from '../db'
import { ambiguousSlug, forbidden, notFound, ServiceError } from '../errors'
import type { SkillRef, SkillWithOwner, Skill, Plugin, Visibility } from '../../lib/types'
import { members, namespaces, users, type UserRecord } from '../repo/core'
import { skills as skillRepo, versions as versionRepo } from '../repo/skills'
import { plugins as pluginRepo } from '../repo/plugins'
import { searchIndex, type SearchDoc } from '../repo/search'
import { audit } from '../repo/core'
import { notifications } from '../repo/core'

// ─────────────────────────────────────────────────────────────────────────────
// Reference resolution
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses `@namespace/slug` or a bare `slug`. Mirrors `model.ParseSkillRef`.
 */
export function parseSkillRef(raw: string): SkillRef {
  if (raw.startsWith('@')) {
    const trimmed = raw.slice(1)
    const idx = trimmed.indexOf('/')
    if (idx > 0 && idx < trimmed.length - 1) {
      return { namespace: trimmed.slice(0, idx), slug: trimmed.slice(idx + 1) }
    }
  }
  return { namespace: '', slug: raw }
}

export function formatSkillRef(ref: SkillRef): string {
  return ref.namespace !== '' ? `@${ref.namespace}/${ref.slug}` : ref.slug
}

export interface Viewer {
  id: string
  role: string
}

/**
 * `canViewSkillWith` — public+approved, or moderator/admin, or owner, or a
 * member of the owning namespace.
 */
export function canViewSkill(skill: Skill, viewer: Viewer | null): boolean {
  if (skill.visibility === 'public' && skill.moderationStatus === 'approved') return true
  if (!viewer) return false
  if (viewer.role === 'admin' || viewer.role === 'moderator') return true
  if (skill.ownerId === viewer.id) return true
  if (skill.namespaceId && members.isMember(skill.namespaceId, viewer.id)) return true
  return false
}

/** `canReadPlugin` — note this checks `admin` only, not `moderator`. */
export function canViewPlugin(plugin: Plugin, viewer: Viewer | null): boolean {
  if (plugin.visibility === 'public' && plugin.moderationStatus === 'approved') return true
  if (!viewer) return false
  if (viewer.role === 'admin') return true
  if (plugin.ownerId === viewer.id) return true
  if (plugin.namespaceId && members.isMember(plugin.namespaceId, viewer.id)) return true
  return false
}

/**
 * Resolves a skill reference to a visible skill, or `null` when it should be
 * reported as not-found (invisible == not found).
 *
 * A bare slug matching several namespaces raises `AmbiguousSlugError`, which
 * the handlers render as 409 with the candidate list.
 */
export function resolveSkillRef(
  ref: SkillRef,
  viewer: Viewer | null,
  opts: { includeDeleted?: boolean } = {},
): SkillWithOwner | null {
  const candidates: SkillWithOwner[] = []

  if (ref.namespace !== '') {
    const ns = namespaces.getBySlug(ref.namespace)
    if (!ns) return null
    let hit = skillRepo.getWithOwnerByNsAndSlug(ns.id, ref.slug, opts)
    if (!hit) {
      // Fall back to a renamed slug within the same namespace.
      hit = skillRepo.findByAlias(ns.id, ref.slug)
    }
    if (!hit) return null
    if (!opts.includeDeleted && !canViewSkill(hit, viewer)) return null
    return hit
  }

  for (const candidate of skillRepo.findBySlugAcrossNamespaces(ref.slug)) {
    if (canViewSkill(candidate, viewer)) candidates.push(candidate)
  }

  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]

  ambiguousSlug(
    ref.slug,
    candidates.map((c) => ({
      namespace: c.namespaceSlug,
      slug: c.slug,
      ownerHandle: c.ownerHandle,
      skillId: c.id,
    })),
  )
}

/** Same, but includes soft-deleted skills (restore flow). */
export function resolveSkillRefIncludeDeleted(
  ref: SkillRef,
  viewer: Viewer | null,
): SkillWithOwner | null {
  return resolveSkillRef(ref, viewer, { includeDeleted: true })
}

/** Resolves a plugin reference; returns `null` when not visible. */
export function resolvePluginRef(ref: SkillRef, viewer: Viewer | null): Plugin | null {
  const candidates: Plugin[] = []

  if (ref.namespace !== '') {
    const ns = namespaces.getBySlug(ref.namespace)
    if (!ns) return null
    const hit = pluginRepo.getByNsAndSlug(ns.id, ref.slug)
    if (!hit) return null
    return canViewPlugin(hit, viewer) ? hit : null
  }

  for (const candidate of pluginRepo.findBySlugAcrossNamespaces(ref.slug)) {
    if (canViewPlugin(candidate, viewer)) candidates.push(candidate)
  }
  if (candidates.length === 0) return null
  if (candidates.length === 1) return candidates[0]
  ambiguousSlug(
    ref.slug,
    candidates.map((c) => ({
      namespace: pluginRepo.getJoined(c.id)?.namespaceSlug ?? '',
      slug: c.slug,
      ownerHandle: '',
      skillId: c.id,
    })),
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Authorization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Write permission on an existing skill: team-token namespace match, else
 * owner / namespace member / system admin.
 *
 * A team token deliberately skips the ownership test — ownership was verified
 * when the token was minted, so the token's namespace is the whole story.
 */
export function authorizeSkillWrite(
  skill: Skill,
  user: UserRecord,
  tokenNamespaceId: string | null,
): void {
  if (tokenNamespaceId !== null) {
    if (skill.namespaceId !== tokenNamespaceId) {
      forbidden('team token cannot operate on skills outside its namespace')
    }
    return
  }
  if (user.role === 'admin') return
  if (skill.ownerId === user.id) return
  if (skill.namespaceId && members.isMember(skill.namespaceId, user.id)) return
  forbidden('only the skill owner, namespace member, or system admin can perform this action')
}

/** Same rule set for plugins. */
export function authorizePluginWrite(
  plugin: Plugin,
  user: UserRecord,
  tokenNamespaceId: string | null,
): void {
  if (tokenNamespaceId !== null) {
    if (plugin.namespaceId !== tokenNamespaceId) {
      forbidden('team token cannot operate on skills outside its namespace')
    }
    return
  }
  if (user.role === 'admin') return
  if (plugin.ownerId === user.id) return
  if (plugin.namespaceId && members.isMember(plugin.namespaceId, user.id)) return
  forbidden('not the plugin owner')
}

/**
 * Personal namespace bootstrap. Every user gets exactly one `personal`
 * namespace (slug = handle) created on first use, and owns it.
 */
export function ensurePersonalNamespace(user: UserRecord) {
  const existing = namespaces.getPersonalByOwner(user.id)
  if (existing) return existing

  // A handle may already be taken as a namespace slug by a team namespace;
  // in that case fall back to a suffixed slug rather than failing the publish.
  let slug = user.handle
  let attempt = 0
  while (namespaces.getBySlug(slug) !== null) {
    attempt += 1
    slug = `${user.handle}-${attempt}`
  }

  const ns = namespaces.create({
    slug,
    displayName: user.displayName ?? user.handle,
    ownerId: user.id,
    type: 'personal',
    defaultVisibility: 'private',
  })
  members.add(ns.id, user.id, 'owner')
  return ns
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit & notifications
// ─────────────────────────────────────────────────────────────────────────────

export function auditLog(input: {
  actorId?: string | null
  action: string
  resourceType: string
  resourceId?: string | null
  details?: string | null
  ipAddress?: string | null
}): void {
  try {
    audit.insert(input)
  } catch {
    // Auditing must never break the operation it is recording.
  }
}

/**
 * Notifies every namespace member except the actor about a publish.
 * Category `publish`, with a link to the namespace-qualified skill page.
 */
export function notifyNamespacePublish(input: {
  namespaceId: string
  actorId: string
  namespaceSlug: string
  slug: string
  version: string
}): void {
  try {
    const recipients = members.memberUserIds(input.namespaceId).filter((id) => id !== input.actorId)
    notifications.createMany(
      recipients.map((userId) => ({
        userId,
        category: 'publish',
        title: `New version: @${input.namespaceSlug}/${input.slug} v${input.version}`,
        link: `/skills/@${input.namespaceSlug}/${input.slug}`,
      })),
    )
  } catch {
    // Fan-out is best-effort.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Search index maintenance
// ─────────────────────────────────────────────────────────────────────────────

/** Reads the SKILL.md body for indexing, if the version has one. */
function skillMdText(versionId: string | null): string {
  if (!versionId) return ''
  const row = query.get<Row>(
    "SELECT content FROM skill_version_files WHERE version_id = ? AND path = 'SKILL.md'",
    versionId,
  )
  if (!row || row.content == null) return ''
  const v = row.content
  return v instanceof Uint8Array ? new TextDecoder().decode(v) : String(v)
}

/** (Re)indexes a skill document. Called on every mutation that affects search. */
export function reindexSkill(skill: SkillWithOwner | Skill): void {
  try {
    const owner = users.getById(skill.ownerId)
    const ns = skill.namespaceId ? namespaces.getById(skill.namespaceId) : null
    const doc: SearchDoc = {
      docId: skill.id,
      docType: 'skill',
      targetId: skill.id,
      slug: skill.slug,
      displayName: skill.displayName ?? skill.slug,
      summary: skill.summary ?? '',
      skillMdContent: skillMdText(skill.latestVersionId ?? null),
      tags: skill.tags.join(' '),
      ownerHandle: owner?.handle ?? '',
      category: skill.category,
      namespaceSlug: ns?.slug ?? '',
      visibility: skill.visibility,
      moderationStatus: skill.moderationStatus,
      isSuspicious: skill.isSuspicious,
      isDeleted: skill.softDeletedAt !== undefined,
      downloads: skill.downloads,
      stars: skill.starsCount,
      updatedAt: Date.parse(skill.updatedAt) || 0,
      createdAt: Date.parse(skill.createdAt) || 0,
    }
    searchIndex.upsert(doc)
  } catch {
    // Search is best-effort; a failure must not break the write path.
  }
}

export function unindexTarget(targetId: string): void {
  try {
    searchIndex.deleteByTarget(targetId)
  } catch {
    /* best-effort */
  }
}

export function reindexPlugin(plugin: Plugin): void {
  try {
    const owner = users.getById(plugin.ownerId)
    const ns = plugin.namespaceId ? namespaces.getById(plugin.namespaceId) : null
    const doc: SearchDoc = {
      docId: `plugin_${plugin.id}`,
      docType: 'plugin',
      targetId: plugin.id,
      slug: plugin.slug,
      displayName: plugin.displayName ?? plugin.slug,
      summary: plugin.summary ?? '',
      skillMdContent: '',
      tags: plugin.tags.join(' '),
      ownerHandle: owner?.handle ?? '',
      category: plugin.category,
      namespaceSlug: ns?.slug ?? '',
      visibility: plugin.visibility,
      moderationStatus: plugin.moderationStatus,
      isSuspicious: false,
      isDeleted: plugin.softDeletedAt !== undefined,
      downloads: plugin.downloads,
      stars: plugin.starsCount,
      updatedAt: Date.parse(plugin.updatedAt) || 0,
      createdAt: Date.parse(plugin.createdAt) || 0,
    }
    searchIndex.upsert(doc)
  } catch {
    /* best-effort */
  }
}

/** Rebuilds the whole index from source tables. Used on first boot / repair. */
export function reindexAll(): number {
  searchIndex.empty()
  let n = 0
  const skillRows = query.all<Row>('SELECT id FROM skills WHERE soft_deleted_at IS NULL')
  for (const row of skillRows) {
    const s = skillRepo.getWithOwnerById(String(row.id))
    if (s) {
      reindexSkill(s)
      n += 1
    }
  }
  const pluginRows = query.all<Row>('SELECT id FROM plugins WHERE soft_deleted_at IS NULL')
  for (const row of pluginRows) {
    const p = pluginRepo.getById(String(row.id))
    if (p) {
      reindexPlugin(p)
      n += 1
    }
  }
  return n
}

// ─────────────────────────────────────────────────────────────────────────────
// Misc
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Visibility parsing for publish. `''` means "inherit the namespace default".
 */
export function parseVisibility(raw: string, fallback: Visibility): Visibility {
  if (raw === 'public') return 'public'
  if (raw === 'private') return 'private'
  return fallback
}

export function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())
}

/** Resolves a skill by exact id, honouring visibility. */
export function getVisibleSkillById(id: string, viewer: Viewer | null): SkillWithOwner | null {
  const skill = skillRepo.getWithOwnerById(id)
  if (!skill) return null
  if (skill.softDeletedAt !== undefined) return null
  return canViewSkill(skill, viewer) ? skill : null
}

/** Current latest version, or `null`. Convenience used by several services. */
export function latestVersionOf(skillId: string) {
  const skill = skillRepo.getById(skillId)
  if (!skill?.latestVersionId) return null
  return versionRepo.getById(skill.latestVersionId)
}

export function countRows(sql: string, ...params: unknown[]): number {
  return asNumber(query.get<Row>(sql, ...params)?.c)
}

export { notFound, forbidden, ServiceError, nowIso }
