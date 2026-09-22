/**
 * Skill domain service: publish, version management, reading, download and
 * lifecycle transitions (yank / deprecate / soft-delete / transfer).
 *
 * Replaces `pkg/service/skill_service.go`. Validation order in `publishVersion`
 * is deliberate and matches upstream, because callers see the *first* failure —
 * reordering it changes observable error messages.
 */

import crypto from 'node:crypto'
import { conflict, fail, forbidden, notFound } from '../errors'
import type {
  Skill,
  SkillDependency,
  SkillKind,
  SkillVersion,
  SkillWithOwner,
  VersionFile,
  Visibility,
} from '../../lib/types'
import { VALID_CATEGORIES, VALID_KINDS, RESERVED_NAMESPACE_PREFIXES } from '../../lib/types'
import { asNumber, nowIso, query, tx, type Row } from '../db'
import {
  computeContentFingerprint,
  contentTypeFor,
  parseSkillMdFrontmatter,
  MAX_UPLOAD_FILES,
  MAX_SKILL_FILE_READ,
  type FileMap,
} from '../content'
import { createZip } from '../zip'
import { isValid as isValidSemver, compare as compareSemver, nextPatch } from '../semver'
import { members, namespaces, type UserRecord } from '../repo/core'
import {
  skills as skillRepo,
  versions as versionRepo,
  versionFiles,
  stars as starRepo,
  downloadDedupes,
} from '../repo/skills'
import {
  auditLog,
  authorizeSkillWrite,
  ensurePersonalNamespace,
  notifyNamespacePublish,
  reindexSkill,
  resolveSkillRef,
  unindexTarget,
  type Viewer,
} from './shared'
import type { SkillRef } from '../../lib/types'

// ─────────────────────────────────────────────────────────────────────────────
// Reading
// ─────────────────────────────────────────────────────────────────────────────

export interface ListOptions {
  limit: number
  cursor: string
  sort: string
  category: string
  namespaceSlug: string
  viewer: Viewer | null
}

export function listSkills(opts: ListOptions) {
  return skillRepo.list({
    limit: opts.limit <= 0 || opts.limit > 100 ? 20 : opts.limit,
    cursor: opts.cursor,
    sort: opts.sort,
    category: opts.category,
    namespaceSlug: opts.namespaceSlug,
    viewer: opts.viewer,
  })
}

export function getSkill(ref: SkillRef, viewer: Viewer | null): SkillWithOwner | null {
  return resolveSkillRef(ref, viewer)
}

/** Version history, newest first. Invisible skills yield an empty list. */
export function getVersions(ref: SkillRef, viewer: Viewer | null): SkillVersion[] | null {
  const skill = resolveSkillRef(ref, viewer)
  if (!skill) return null
  return versionRepo.listBySkill(skill.id)
}

export function getVersion(
  ref: SkillRef,
  version: string,
  viewer: Viewer | null,
): SkillVersion | null {
  const skill = resolveSkillRef(ref, viewer)
  if (!skill) return null
  return versionRepo.getBySkillAndVersion(skill.id, version)
}

/**
 * Raw file text for a skill version. Returns `null` with a message when the
 * skill, version or path cannot be resolved — the handler surfaces these as 404
 * with the message, matching upstream.
 */
export function getFile(
  ref: SkillRef,
  version: string,
  filePath: string,
  viewer: Viewer | null,
): { content: Uint8Array } | { error: string } {
  const skill = resolveSkillRef(ref, viewer)
  if (!skill) return { error: `skill not found: ${ref.namespace ? `@${ref.namespace}/${ref.slug}` : ref.slug}` }

  const resolved = resolveVersion(skill, version)
  if (!resolved.ok) return { error: resolved.error }

  const content = versionFiles.get(resolved.version.id, filePath)
  if (!content) return { error: 'file not found' }
  if (content.byteLength > MAX_SKILL_FILE_READ) {
    return { error: 'file too large (max 512KB)' }
  }
  return { content }
}

/**
 * `latest` resolves through the stored `latest_version_id` pointer rather than
 * a query, so a yank takes effect because `YankVersion` repoints the pointer.
 */
function resolveVersion(
  skill: Skill,
  version: string,
): { ok: true; version: SkillVersion } | { ok: false; error: string } {
  if (version === '' || version === 'latest') {
    if (!skill.latestVersionId) return { ok: false, error: 'no versions published' }
    const latest = versionRepo.getById(skill.latestVersionId)
    if (!latest) return { ok: false, error: 'latest version not found' }
    return { ok: true, version: latest }
  }
  const exact = versionRepo.getBySkillAndVersion(skill.id, version)
  if (!exact) return { ok: false, error: `version ${version} not found` }
  return { ok: true, version: exact }
}

// ─────────────────────────────────────────────────────────────────────────────
// Publish
// ─────────────────────────────────────────────────────────────────────────────

export interface PublishRequest {
  slug: string
  version: string
  changelog?: string
  displayName?: string
  summary?: string
  displayNameEn?: string
  summaryEn?: string
  category?: string
  kind?: string
  visibility?: string
  namespaceSlug?: string
  tags?: string[]
  dependencies?: SkillDependency[]
  signatureBundle?: string
  files: FileMap
  tokenNamespaceId: string | null
  /** Agent API sets this to reject overwrites of an existing slug. */
  overwrite?: boolean | null
}

/**
 * Reserved prefixes may only be published to by admins.
 * `IsReservedNamespace` in the Go code required `len(slug) > len(prefix)`,
 * i.e. a bare `animus-builtin/` does **not** count as reserved.
 */
function isReservedNamespace(slug: string): boolean {
  return RESERVED_NAMESPACE_PREFIXES.some(
    (prefix) => slug.length > prefix.length && slug.startsWith(prefix),
  )
}

function isReservedSlug(slug: string): boolean {
  return (
    query.get<Row>('SELECT 1 AS x FROM reserved_slugs WHERE slug = ?', slug) !== undefined
  )
}

function validateDependencies(deps: SkillDependency[], slug: string): void {
  for (const dep of deps) {
    if (!dep.slug || dep.slug.trim() === '') fail('dependency slug is required')
    if (dep.slug === slug) fail(`dependency '${dep.slug}' cannot depend on itself`)
    if (!dep.version || dep.version.trim() === '') {
      fail(`dependency '${dep.slug}' requires a version range`)
    }
    const ref = dep.namespace
      ? { namespace: dep.namespace, slug: dep.slug }
      : { namespace: '', slug: dep.slug }
    const target = resolveSkillRef(ref, null)
    if (!target) fail(`dependency '${dep.slug}' not found`)
  }
}

export function publishVersion(
  user: UserRecord,
  req: PublishRequest,
): { skill: SkillWithOwner; version: SkillVersion } {
  // 1. slug
  if (!req.slug || req.slug.trim() === '') fail('slug is required')

  // 2. reserved slug table
  if (isReservedSlug(req.slug)) fail(`slug '${req.slug}' is reserved`)

  // 3. reserved namespace prefix (admin only)
  if (isReservedNamespace(req.slug) && user.role !== 'admin') {
    fail(`slug '${req.slug}' falls in a reserved namespace (admin only)`)
  }

  // 4. kind
  const kindRaw = (req.kind ?? '') === '' ? 'custom' : req.kind!
  if (!VALID_KINDS.includes(kindRaw as SkillKind)) fail(`invalid kind '${kindRaw}'`)
  if ((kindRaw === 'builtin' || kindRaw === 'domain') && user.role !== 'admin') {
    fail(`kind '${kindRaw}' can only be set by an admin`)
  }
  const kind = kindRaw as SkillKind

  // 5. version
  if (!isValidSemver(req.version)) {
    fail(`invalid version '${req.version}': must be valid semver (e.g. 1.0.0)`)
  }

  // 6. dependencies
  const dependencies = req.dependencies ?? []
  validateDependencies(dependencies, req.slug)

  // 7. namespace resolution
  let namespace = null as ReturnType<typeof namespaces.getBySlug>
  if (req.namespaceSlug && req.namespaceSlug !== '') {
    namespace = namespaces.getBySlug(req.namespaceSlug)
    if (!namespace) notFound(`namespace '${req.namespaceSlug}' not found`)
    if (user.role !== 'admin' && !members.canPublish(namespace.id, user.id)) {
      forbidden(`not a member of namespace '${req.namespaceSlug}'`)
    }
  } else if (req.tokenNamespaceId) {
    namespace = namespaces.getById(req.tokenNamespaceId)
    if (!namespace) fail('team token namespace no longer exists')
  } else {
    namespace = ensurePersonalNamespace(user)
  }

  // 8. team-token / namespace agreement
  if (req.tokenNamespaceId && namespace.id !== req.tokenNamespaceId) {
    forbidden('team token can only publish to its bound namespace')
  }

  const existing = skillRepo.getWithOwnerByNsAndSlug(namespace.id, req.slug, {
    includeDeleted: true,
  })

  // 9. namespace skill quota (new skills only)
  if (!existing && namespace.maxSkills > 0) {
    const count = skillRepo.countByNamespace(namespace.id)
    if (count >= namespace.maxSkills) {
      conflict(`namespace '${namespace.slug}' has reached its skill quota (${namespace.maxSkills})`)
    }
  }

  // 10. visibility
  const rawVisibility = req.visibility ?? ''
  if (rawVisibility !== '' && rawVisibility !== 'private' && rawVisibility !== 'public') {
    fail("visibility must be 'private' or 'public'")
  }
  const visibility: Visibility = rawVisibility === '' ? namespace.defaultVisibility : (rawVisibility as Visibility)

  // 11. create or authorize
  let skill: Skill
  if (!existing) {
    if (req.overwrite === false) {
      conflict(`skill '${req.slug}' already exists`)
    }
    skill = skillRepo.create({
      slug: req.slug,
      displayName: req.displayName || null,
      summary: req.summary || null,
      displayNameEn: req.displayNameEn || null,
      summaryEn: req.summaryEn || null,
      ownerId: user.id,
      namespaceId: namespace.id,
      visibility,
      kind,
      category: req.category && VALID_CATEGORIES.includes(req.category as never)
        ? req.category
        : 'general',
      tags: req.tags ?? [],
    })
  } else {
    if (existing.softDeletedAt !== undefined) {
      // Publishing to a soft-deleted skill restores it, matching upstream's
      // create-or-reuse behaviour.
      skillRepo.undelete(existing.id)
    }
    if (req.overwrite === false) {
      conflict(`skill '${req.slug}' already exists`)
    }
    authorizeSkillWrite(existing, user, req.tokenNamespaceId)
    skill = skillRepo.getById(existing.id)!
  }

  // 12. duplicate version
  if (versionRepo.exists(skill.id, req.version)) {
    conflict(`version ${req.version} already exists`)
  }

  // 13. version must exceed the current latest
  const latest = versionRepo.getLatest(skill.id)
  if (latest && compareSemver(req.version, latest.version) <= 0) {
    fail(`version ${req.version} must be greater than current latest ${latest.version}`)
  }

  // ── commit ────────────────────────────────────────────────────────────────
  const fingerprint = computeContentFingerprint(req.files)
  const fileList: VersionFile[] = []
  const stored: Array<{ path: string; content: Uint8Array; contentType: string }> = []
  for (const [path, content] of req.files.entries()) {
    fileList.push({
      path,
      size: content.byteLength,
      sha256: crypto.createHash('sha256').update(content).digest('hex'),
      contentType: contentTypeFor(path),
    })
    stored.push({ path, content, contentType: contentTypeFor(path) })
  }
  fileList.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  stored.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

  const skillMd = req.files.get('SKILL.md')
  const parsed = skillMd ? parseSkillMdFrontmatter(skillMd) : {}

  const version = tx(() => {
    const created = versionRepo.create({
      skillId: skill.id,
      version: req.version,
      fingerprint,
      changelog: req.changelog || null,
      files: fileList,
      parsed,
      createdBy: user.id,
      dependencies,
      signatureBundle: req.signatureBundle ?? null,
      // Signature verification (sigstore/cosign) is not implemented; a
      // submitted bundle is stored and recorded as unverified.
      signatureStatus: req.signatureBundle ? 'unverified' : 'unsigned',
    })
    versionFiles.insertMany(created.id, stored)

    // Metadata is only overwritten by non-empty request fields.
    if (existing) {
      skillRepo.updateMetadata(skill.id, {
        displayName: req.displayName,
        summary: req.summary,
        displayNameEn: req.displayNameEn,
        summaryEn: req.summaryEn,
        category: req.category && VALID_CATEGORIES.includes(req.category as never) ? req.category : undefined,
        tags: req.tags && req.tags.length > 0 ? req.tags : undefined,
        visibility: rawVisibility === '' ? undefined : (rawVisibility as Visibility),
      })
    }

    skillRepo.setLatestVersion(skill.id, created.id, created.createdAt)
    return created
  })

  const fresh = skillRepo.getWithOwnerById(skill.id)!
  reindexSkill(fresh)

  auditLog({
    actorId: user.id,
    action: 'publish',
    resourceType: 'skill_version',
    resourceId: version.id,
    details: `@${namespace.slug}/${req.slug} v${req.version}`,
  })
  notifyNamespacePublish({
    namespaceId: namespace.id,
    actorId: user.id,
    namespaceSlug: namespace.slug,
    slug: req.slug,
    version: req.version,
  })

  return { skill: fresh, version }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

export function softDelete(user: UserRecord, ref: SkillRef, tokenNamespaceId: string | null): void {
  const skill = resolveSkillRef(ref, { id: user.id, role: user.role })
  if (!skill) fail('skill not found')
  authorizeSkillWrite(skill, user, tokenNamespaceId)
  skillRepo.softDelete(skill.id)
  auditLog({ actorId: user.id, action: 'delete', resourceType: 'skill', resourceId: skill.id })
  reindexSkill(skillRepo.getWithOwnerById(skill.id)!)
}

export function undelete(user: UserRecord, ref: SkillRef, tokenNamespaceId: string | null): void {
  const skill = resolveSkillRef(ref, { id: user.id, role: user.role })
  if (!skill) fail('skill not found')
  authorizeSkillWrite(skill, user, tokenNamespaceId)
  skillRepo.undelete(skill.id)
  auditLog({ actorId: user.id, action: 'undelete', resourceType: 'skill', resourceId: skill.id })
  reindexSkill(skillRepo.getWithOwnerById(skill.id)!)
}

/** Hard delete. Admin-only; deliberately not namespace-restricted by team tokens. */
export function purge(user: UserRecord, ref: SkillRef): void {
  const skill = resolveSkillRef(ref, { id: user.id, role: user.role }, { includeDeleted: true })
  if (!skill) fail('skill not found')
  if (user.role !== 'admin') fail('admin required')
  unindexTarget(skill.id)
  skillRepo.purge(skill.id)
  auditLog({ actorId: user.id, action: 'purge', resourceType: 'skill', resourceId: skill.id })
}

/** Owner-initiated request for public listing; moves the skill into review. */
export function requestPublic(user: UserRecord, ref: SkillRef): void {
  const skill = resolveSkillRef(ref, { id: user.id, role: user.role })
  if (!skill) fail('skill not found')
  if (skill.ownerId !== user.id && user.role !== 'admin') fail('forbidden')
  if (skill.visibility === 'public') fail('skill is already public')
  skillRepo.setVisibility(skill.id, 'private', 'pending_review')
  reindexSkill(skillRepo.getWithOwnerById(skill.id)!)
}

export function yankVersion(
  user: UserRecord,
  ref: SkillRef,
  version: string,
  reason: string,
  tokenNamespaceId: string | null,
): void {
  const skill = resolveSkillRef(ref, { id: user.id, role: user.role })
  if (!skill) fail('skill not found')
  authorizeSkillWrite(skill, user, tokenNamespaceId)

  const target = versionRepo.getBySkillAndVersion(skill.id, version)
  if (!target) fail('version not found')
  if (target.yankedAt) fail('version is already yanked')

  tx(() => {
    versionRepo.setYanked(target.id, true, reason || null)
    // Yanking takes effect by repointing `latest` at the newest non-yanked
    // version — resolution itself never filters on `yanked_at`.
    const next = versionRepo.getLatestNonYanked(skill.id)
    skillRepo.repointLatest(skill.id, next?.id ?? null)
  })
  auditLog({
    actorId: user.id,
    action: 'yank',
    resourceType: 'skill_version',
    resourceId: target.id,
    details: reason || null,
  })
}

export function unyankVersion(
  user: UserRecord,
  ref: SkillRef,
  version: string,
  tokenNamespaceId: string | null,
): void {
  const skill = resolveSkillRef(ref, { id: user.id, role: user.role })
  if (!skill) fail('skill not found')
  authorizeSkillWrite(skill, user, tokenNamespaceId)

  const target = versionRepo.getBySkillAndVersion(skill.id, version)
  if (!target) fail('version not found')
  if (!target.yankedAt) fail('version is not yanked')

  tx(() => {
    versionRepo.setYanked(target.id, false)
    // Recompute unconditionally.
    const next = versionRepo.getLatestNonYanked(skill.id)
    skillRepo.repointLatest(skill.id, next?.id ?? null)
  })
  auditLog({ actorId: user.id, action: 'unyank', resourceType: 'skill_version', resourceId: target.id })
}

export function deprecateVersion(
  user: UserRecord,
  ref: SkillRef,
  version: string,
  message: string,
  tokenNamespaceId: string | null,
): void {
  const skill = resolveSkillRef(ref, { id: user.id, role: user.role })
  if (!skill) fail('skill not found')
  authorizeSkillWrite(skill, user, tokenNamespaceId)
  const target = versionRepo.getBySkillAndVersion(skill.id, version)
  if (!target) fail('version not found')
  versionRepo.setDeprecated(target.id, true, message || null)
}

export function undeprecateVersion(
  user: UserRecord,
  ref: SkillRef,
  version: string,
  tokenNamespaceId: string | null,
): void {
  const skill = resolveSkillRef(ref, { id: user.id, role: user.role })
  if (!skill) fail('skill not found')
  authorizeSkillWrite(skill, user, tokenNamespaceId)
  const target = versionRepo.getBySkillAndVersion(skill.id, version)
  if (!target) fail('version not found')
  if (!target.deprecatedAt) fail('version is not deprecated')
  versionRepo.setDeprecated(target.id, false)
}

export function transferSkill(
  user: UserRecord,
  ref: SkillRef,
  targetNamespaceSlug: string,
  tokenNamespaceId: string | null,
): void {
  const skill = resolveSkillRef(ref, { id: user.id, role: user.role })
  if (!skill) fail('skill not found')
  if (tokenNamespaceId && skill.namespaceId !== tokenNamespaceId) {
    forbidden('team token cannot operate on skills outside its namespace')
  }
  if (skill.ownerId !== user.id && user.role !== 'admin') fail('forbidden')

  const target = namespaces.getBySlug(targetNamespaceSlug)
  if (!target) notFound(`target namespace '${targetNamespaceSlug}' not found`)
  if (user.role !== 'admin' && !members.canPublish(target.id, user.id)) {
    forbidden(`not a member of target namespace '${targetNamespaceSlug}'`)
  }
  if (target.id === skill.namespaceId) fail('skill is already in that namespace')

  const clash = skillRepo.getWithOwnerByNsAndSlug(target.id, skill.slug)
  if (clash) conflict(`slug '${skill.slug}' already exists in namespace '${targetNamespaceSlug}'`)

  // Remember the old slug so the previous URL keeps resolving.
  if (skill.namespaceId) {
    skillRepo.addAlias(skill.id, skill.namespaceId, skill.slug)
  }
  skillRepo.setNamespace(skill.id, target.id)
  reindexSkill(skillRepo.getWithOwnerById(skill.id)!)
  auditLog({ actorId: user.id, action: 'transfer', resourceType: 'skill', resourceId: skill.id })
}

/**
 * Replaces (or adds) a single file and publishes the next patch version.
 * Reads every file of the current latest version first, so the new version is a
 * full snapshot rather than a patch.
 */
export function updateFile(
  user: UserRecord,
  ref: SkillRef,
  filePath: string,
  content: Uint8Array,
  changelog: string,
  tokenNamespaceId: string | null,
): { skill: SkillWithOwner; version: SkillVersion } {
  const skill = resolveSkillRef(ref, { id: user.id, role: user.role })
  if (!skill) fail('skill not found')
  authorizeSkillWrite(skill, user, tokenNamespaceId)

  const target = filePath === '' ? 'SKILL.md' : filePath
  const files: FileMap = new Map()

  const latestId = skill.latestVersionId
  if (latestId) {
    for (const f of versionFiles.listAll(latestId)) {
      files.set(f.path, f.content)
    }
  }
  files.set(target, content)

  const currentVersion = latestId ? versionRepo.getById(latestId)?.version ?? '0.0.0' : '0.0.0'
  return publishVersion(user, {
    slug: skill.slug,
    version: nextPatch(currentVersion),
    changelog,
    namespaceSlug: skill.namespaceSlug,
    files,
    tokenNamespaceId,
    overwrite: true,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Download & resolve
// ─────────────────────────────────────────────────────────────────────────────

export interface DownloadResult {
  zip: Uint8Array
  fingerprint: string
  version: string
  slug: string
}

/**
 * Builds the version archive. The `ETag` fast path is handled by the caller
 * (it needs to answer 304 before any archive work happens).
 */
export function download(
  ref: SkillRef,
  version: string,
  viewer: Viewer | null,
  identityHash: string,
): DownloadResult | { error: string } {
  const skill = resolveSkillRef(ref, viewer)
  if (!skill) {
    return { error: `skill not found: ${ref.namespace ? `@${ref.namespace}/${ref.slug}` : ref.slug}` }
  }
  const resolved = resolveVersion(skill, version)
  if (!resolved.ok) return { error: resolved.error }

  const files = versionFiles.listAll(resolved.version.id)
  if (files.length === 0) return { error: 'create archive: no files in version' }

  let zip: Uint8Array
  try {
    zip = createZip(
      files.map((f) => ({ path: f.path, content: f.content })),
      new Date(resolved.version.createdAt),
    )
  } catch (e) {
    return { error: `create archive: ${(e as Error).message}` }
  }

  // Dedup: a first-time identity bumps the counter, a repeat does not.
  try {
    if (downloadDedupes.record(skill.id, resolved.version.id, identityHash)) {
      skillRepo.bumpDownloads(skill.id)
    }
  } catch {
    /* counting must not fail the download */
  }

  return {
    zip,
    fingerprint: resolved.version.fingerprint,
    version: resolved.version.version,
    slug: skill.slug,
  }
}

/**
 * Resolves a version without building the archive, so the download handler can
 * answer a conditional request with 304 before doing any work.
 */
export function probeVersion(
  ref: SkillRef,
  version: string,
  viewer: Viewer | null,
): { fingerprint: string; version: string } | null {
  const skill = resolveSkillRef(ref, viewer)
  if (!skill) return null
  const resolved = resolveVersion(skill, version)
  if (!resolved.ok) return null
  return { fingerprint: resolved.version.fingerprint, version: resolved.version.version }
}

/** Fingerprint reverse-lookup. No auth and no visibility check, per upstream. */
export function resolveFingerprint(
  fingerprint: string,
): { version: SkillVersion; skill: SkillWithOwner } | null {
  const version = versionRepo.getByFingerprint(fingerprint)
  if (!version) return null
  const skill = skillRepo.getWithOwnerById(version.skillId)
  if (!skill || skill.softDeletedAt !== undefined) return null
  return {
    version,
    skill: {
      ...skill,
      ownerDisplayName: undefined,
      ownerAvatarUrl: undefined,
      namespaceSlug: '',
    },
  }
}

/** `hex(sha256(clientIp))` — the download identity used for de-duplication. */
export function identityHashFor(clientIp: string): string {
  return crypto.createHash('sha256').update(clientIp).digest('hex')
}

/** Star/unstar. Returns the new starred state. */
export function toggleStar(userId: string, ref: SkillRef, on: boolean): void {
  const skill = resolveSkillRef(ref, { id: userId, role: 'user' })
  if (!skill) fail('skill not found')
  if (on) {
    if (starRepo.add(userId, skill.id)) skillRepo.recomputeStars(skill.id)
  } else if (starRepo.remove(userId, skill.id)) {
    skillRepo.recomputeStars(skill.id)
  }
  reindexSkill(skillRepo.getWithOwnerById(skill.id)!)
}

export function isStarred(userId: string, skillId: string): boolean {
  return starRepo.has(userId, skillId)
}

/** Total live skill count — used by the home page summary. */
export function totalSkills(): number {
  return asNumber(
    query.get<Row>('SELECT COUNT(*) AS c FROM skills WHERE soft_deleted_at IS NULL')?.c,
  )
}

export { MAX_UPLOAD_FILES, nowIso }
