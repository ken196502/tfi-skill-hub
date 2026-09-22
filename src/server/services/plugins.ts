/**
 * Plugin domain service.
 *
 * Plugins follow the Agent Plugins Specification: a directory containing
 * `plugin.json`, `skills/<name>/SKILL.md` files and an optional root `mcp.json`.
 * Structurally they mirror skills, so the version/yank/visibility machinery is
 * the same shape — the differences are that plugins have no stars/comments, and
 * their list/detail JSON is a hand-built projection rather than the raw row.
 */

import crypto from 'node:crypto'
import { conflict, fail, forbidden, notFound } from '../errors'
import type { Plugin, PluginVersion, VersionFile, Visibility } from '../../lib/types'
import { tx } from '../db'
import {
  computeFingerprint,
  contentTypeFor,
  sanitizeFilePath,
  type FileMap,
} from '../content'
import { createZip } from '../zip'
import { compare as compareSemver, isValid as isValidSemver } from '../semver'
import { members, namespaces, users, type UserRecord } from '../repo/core'
import { plugins as pluginRepo, pluginVersions, pluginFiles } from '../repo/plugins'
import {
  auditLog,
  authorizePluginWrite,
  canViewPlugin,
  ensurePersonalNamespace,
  reindexPlugin,
  resolvePluginRef,
  unindexTarget,
  type Viewer,
} from './shared'
import type { SkillRef } from '../../lib/types'

/** Plugin slugs are stricter than skill slugs — no leading `@` or slash. */
const PLUGIN_SLUG_RE = /^[a-z0-9](?:[a-z0-9._-]{0,126}[a-z0-9])?$/

const MAX_PLUGIN_FILE_SIZE = 64 * 1024 * 1024
const MAX_PLUGIN_TOTAL_SIZE = 512 * 1024 * 1024

// ─────────────────────────────────────────────────────────────────────────────
// JSON projection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The list/detail projection used by every public plugin read endpoint.
 *
 * Note what is **absent** relative to the raw row: `moderationStatus`,
 * `ownerId`, `namespaceId`, `versionsCount`, `ownerAvatarUrl`. The version
 * fields only appear once a latest version resolves.
 */
export function pluginToJSON(plugin: Plugin): Record<string, unknown> {
  const ns = plugin.namespaceId ? namespaces.getById(plugin.namespaceId) : null
  const owner = ownerHandleOf(plugin.ownerId)

  const out: Record<string, unknown> = {
    id: plugin.id,
    slug: plugin.slug,
    visibility: plugin.visibility,
    category: plugin.category,
    tags: plugin.tags,
    downloads: plugin.downloads,
    starsCount: plugin.starsCount,
    ownerHandle: owner,
    namespaceSlug: ns?.slug ?? '',
    createdAt: plugin.createdAt,
    updatedAt: plugin.updatedAt,
  }

  if (plugin.displayName !== undefined) out.displayName = plugin.displayName
  if (plugin.summary !== undefined) out.summary = plugin.summary
  if (plugin.displayNameEn !== undefined) out.displayNameEn = plugin.displayNameEn
  if (plugin.summaryEn !== undefined) out.summaryEn = plugin.summaryEn

  if (plugin.latestVersionId) {
    const version = pluginVersions.getById(plugin.latestVersionId)
    if (version) {
      out.latestVersionId = plugin.latestVersionId
      out.version = version.version
      out.fingerprint = version.fingerprint
      out.sha256Hash = version.sha256Hash
      // Re-projected so `contentType` is dropped, matching upstream.
      out.files = version.files.map((f) => ({ path: f.path, size: f.size, sha256: f.sha256 }))
    }
  }

  return out
}

function ownerHandleOf(ownerId: string): string {
  return users.getById(ownerId)?.handle ?? ''
}

// ─────────────────────────────────────────────────────────────────────────────
// Reads
// ─────────────────────────────────────────────────────────────────────────────

export function listPlugins(opts: {
  category: string
  sort: string
  cursor: string
  limit: number
}): { data: Record<string, unknown>[]; nextCursor: string } {
  const limit = opts.limit <= 0 ? 20 : Math.min(opts.limit, 100)
  const { data, nextCursor } = pluginRepo.list({ ...opts, limit })
  return { data: data.map(pluginToJSON), nextCursor }
}

export function getPlugin(ref: SkillRef, viewer: Viewer | null): Record<string, unknown> {
  const plugin = resolvePluginRef(ref, viewer)
  if (!plugin) notFound(`plugin ${formatRef(ref)}`)
  return pluginToJSON(plugin)
}

export function getPluginById(id: string, viewer: Viewer | null): Record<string, unknown> {
  const plugin = pluginRepo.getById(id)
  if (!plugin || plugin.softDeletedAt !== undefined) notFound(`plugin ${id}`)
  if (!canViewPlugin(plugin, viewer)) notFound(`plugin ${id}`)
  return pluginToJSON(plugin)
}

export function getPluginVersions(
  ref: SkillRef,
  viewer: Viewer | null,
): PluginVersion[] {
  const plugin = resolvePluginRef(ref, viewer)
  if (!plugin) notFound(`plugin ${formatRef(ref)}`)
  return pluginVersions.listByPlugin(plugin.id)
}

export function getPluginFile(
  ref: SkillRef,
  version: string,
  filePath: string,
  viewer: Viewer | null,
): Uint8Array {
  const plugin = resolvePluginRef(ref, viewer)
  if (!plugin) notFound(`plugin ${formatRef(ref)}`)
  const resolved = resolvePluginVersion(plugin, version)
  const content = pluginFiles.get(resolved.id, filePath)
  if (!content) notFound('file not found')
  return content
}

function resolvePluginVersion(plugin: Plugin, version: string): PluginVersion {
  if (version === '' || version === 'latest') {
    if (!plugin.latestVersionId) notFound('no versions found')
    const latest = pluginVersions.getById(plugin.latestVersionId)
    if (!latest) notFound('no versions found')
    return latest
  }
  const exact = pluginVersions.getByPluginAndVersion(plugin.id, version)
  if (!exact) notFound(`version ${version} not found`)
  if (exact.yankedAt) fail(`version ${version} is yanked`)
  return exact
}

export interface PluginDownload {
  zip: Uint8Array
  fingerprint: string
  version: string
}

export function downloadPlugin(ref: SkillRef, version: string, viewer: Viewer | null): PluginDownload {
  const plugin = resolvePluginRef(ref, viewer)
  if (!plugin) notFound(`plugin ${formatRef(ref)}`)
  const resolved = resolvePluginVersion(plugin, version)
  const files = pluginFiles.listAll(resolved.id)
  if (files.length === 0) notFound('file not found')
  const zip = createZip(
    files.map((f) => ({ path: f.path, content: f.content })),
    new Date(resolved.createdAt),
  )
  // Plugin downloads are counted unconditionally (no identity de-duplication).
  pluginRepo.bumpDownloads(plugin.id)
  return { zip, fingerprint: resolved.fingerprint, version: resolved.version }
}

// ─────────────────────────────────────────────────────────────────────────────
// Publish
// ─────────────────────────────────────────────────────────────────────────────

export interface PluginPublishRequest {
  slug: string
  version: string
  category?: string
  displayName?: string
  summary?: string
  displayNameEn?: string
  summaryEn?: string
  changelog?: string
  tags?: string
  namespaceSlug?: string
  /**
   * Optional. When omitted, the namespace's `defaultVisibility` applies — which
   * is what upstream always did. Supplying it lets an owner publish a plugin
   * publicly without an admin round-trip.
   */
  visibility?: string
  files: FileMap
  tokenNamespaceId: string | null
}

/**
 * Validates the `plugin.json` manifest and returns it parsed.
 * The manifest's declared version must match the release version, otherwise a
 * package could be published under a version it does not claim.
 */
function parseManifest(files: FileMap, releaseVersion: string): Record<string, unknown> {
  const manifestRaw = files.get('plugin.json')
  if (!manifestRaw) fail('validation: plugin.json is required')

  let manifest: unknown
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestRaw))
  } catch (e) {
    fail(`validation: plugin.json is not valid JSON: ${(e as Error).message}`)
  }
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) {
    fail('validation: plugin.json must be a JSON object')
  }
  const obj = manifest as Record<string, unknown>

  if (typeof obj.name !== 'string' || obj.name.trim() === '') {
    fail('validation: plugin.json must declare a non-empty "name"')
  }
  if (obj.version !== undefined) {
    if (typeof obj.version !== 'string') fail('validation: plugin.json "version" must be a string')
    if (obj.version !== releaseVersion) {
      fail(
        `validation: manifest version ${obj.version} does not match release version ${releaseVersion}`,
      )
    }
  }
  return obj
}

function safeFiles(files: FileMap): FileMap {
  const out: FileMap = new Map()
  let total = 0
  for (const [rawPath, content] of files.entries()) {
    if (content.byteLength > MAX_PLUGIN_FILE_SIZE) {
      fail(`validation: file ${rawPath} exceeds max size (${MAX_PLUGIN_FILE_SIZE} bytes)`)
    }
    const clean = sanitizeFilePath(rawPath)
    if (clean === '') fail(`validation: invalid file path ${JSON.stringify(rawPath)}`)
    if (out.has(clean)) fail(`validation: duplicate file path ${JSON.stringify(clean)}`)
    total += content.byteLength
    out.set(clean, content)
  }
  if (total > MAX_PLUGIN_TOTAL_SIZE) {
    fail(`validation: plugin package exceeds max size (${MAX_PLUGIN_TOTAL_SIZE} bytes)`)
  }
  return out
}

export function publishPlugin(
  user: UserRecord,
  req: PluginPublishRequest,
): { plugin: Plugin; version: PluginVersion } {
  if (!req.slug || req.slug.trim() === '') fail('validation: slug is required')
  if (!PLUGIN_SLUG_RE.test(req.slug)) fail(`validation: invalid plugin slug "${req.slug}"`)
  if (!req.version || req.version.trim() === '') fail('validation: version is required')
  if (!isValidSemver(req.version)) fail(`validation: invalid semver "${req.version}"`)

  const files = safeFiles(req.files)
  const manifest = parseManifest(files, req.version)

  // Namespace resolution mirrors skill publishing.
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

  if (req.tokenNamespaceId && namespace.id !== req.tokenNamespaceId) {
    forbidden('team token can only publish to its bound namespace')
  }

  const rawVisibility = req.visibility ?? ''
  if (rawVisibility !== '' && rawVisibility !== 'private' && rawVisibility !== 'public') {
    fail("validation: visibility must be 'private' or 'public'")
  }
  const visibility: Visibility =
    rawVisibility === '' ? namespace.defaultVisibility : (rawVisibility as Visibility)

  const existing = pluginRepo.getByNsAndSlug(namespace.id, req.slug, { includeDeleted: true })
  let plugin: Plugin
  if (!existing) {
    plugin = pluginRepo.create({
      slug: req.slug,
      displayName: req.displayName || null,
      summary: req.summary || null,
      displayNameEn: req.displayNameEn || null,
      summaryEn: req.summaryEn || null,
      ownerId: user.id,
      namespaceId: namespace.id,
      visibility,
      category: req.category || 'general',
      // `strings.Split(tags, ",")` — entries are **not** trimmed upstream.
      tags: req.tags === undefined || req.tags === '' ? [] : req.tags.split(','),
    })
  } else {
    if (existing.softDeletedAt !== undefined) pluginRepo.undelete(existing.id)
    authorizePluginWrite(existing, user, req.tokenNamespaceId)
    plugin = pluginRepo.getById(existing.id)!
  }

  if (pluginVersions.getByPluginAndVersion(plugin.id, req.version)) {
    conflict(`version ${req.version} already exists`)
  }
  const latest = pluginVersions.getLatest(plugin.id)
  if (latest && compareSemver(req.version, latest.version) <= 0) {
    fail(`version ${req.version} must be greater than ${latest.version}`)
  }

  const fingerprint = computeFingerprint(files)
  const fileList: VersionFile[] = [...files.entries()]
    .map(([path, content]) => ({
      path,
      size: content.byteLength,
      sha256: crypto.createHash('sha256').update(content).digest('hex'),
      contentType: contentTypeFor(path),
    }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

  const stored = [...files.entries()]
    .map(([path, content]) => ({ path, content, contentType: contentTypeFor(path) }))
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

  const version = tx(() => {
    const created = pluginVersions.create({
      pluginId: plugin.id,
      version: req.version,
      fingerprint,
      manifest,
      files: fileList,
      changelog: req.changelog || null,
      createdBy: user.id,
    })
    pluginFiles.insertMany(created.id, stored)
    pluginRepo.updateMetadata(plugin.id, {
      displayName: req.displayName,
      summary: req.summary,
      displayNameEn: req.displayNameEn,
      summaryEn: req.summaryEn,
      category: req.category,
      tags: req.tags ? req.tags.split(',') : undefined,
    })
    pluginRepo.setLatestVersion(plugin.id, created.id, created.createdAt)
    return created
  })

  const fresh = pluginRepo.getById(plugin.id)!
  reindexPlugin(fresh)
  auditLog({
    actorId: user.id,
    action: 'plugin_publish',
    resourceType: 'plugin_version',
    resourceId: version.id,
    details: `@${namespace.slug}/${req.slug} v${req.version}`,
  })

  return { plugin: fresh, version }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

export function deletePlugin(user: UserRecord, ref: SkillRef, tokenNamespaceId: string | null): void {
  const plugin = resolvePluginRef(ref, { id: user.id, role: user.role })
  if (!plugin) notFound(`plugin ${formatRef(ref)}`)
  authorizePluginWrite(plugin, user, tokenNamespaceId)
  pluginRepo.softDelete(plugin.id)
  reindexPlugin(pluginRepo.getById(plugin.id)!)
}

export function undeletePlugin(user: UserRecord, ref: SkillRef, tokenNamespaceId: string | null): void {
  const plugin = resolvePluginRefIncludeDeleted(ref, user)
  if (!plugin) notFound(`plugin ${formatRef(ref)}`)
  if (plugin.softDeletedAt === undefined) fail('validation: plugin is not deleted')
  authorizePluginWrite(plugin, user, tokenNamespaceId)
  pluginRepo.undelete(plugin.id)
  reindexPlugin(pluginRepo.getById(plugin.id)!)
}

function resolvePluginRefIncludeDeleted(ref: SkillRef, user: UserRecord): Plugin | null {
  if (ref.namespace !== '') {
    const ns = namespaces.getBySlug(ref.namespace)
    if (!ns) return null
    return pluginRepo.getByNsAndSlug(ns.id, ref.slug, { includeDeleted: true })
  }
  const pool = pluginRepo.findBySlugAcrossNamespaces(ref.slug, { includeDeleted: true })
  return pool.find((p) => p.ownerId === user.id || user.role === 'admin') ?? pool[0] ?? null
}

export function yankPluginVersion(
  user: UserRecord,
  ref: SkillRef,
  version: string,
  reason: string,
  tokenNamespaceId: string | null,
): void {
  const plugin = resolvePluginRef(ref, { id: user.id, role: user.role })
  if (!plugin) notFound(`plugin ${formatRef(ref)}`)
  authorizePluginWrite(plugin, user, tokenNamespaceId)

  const target = pluginVersions.getByPluginAndVersion(plugin.id, version)
  if (!target) notFound(`version ${version}`)
  if (target.yankedAt) conflict(`version ${version} is already yanked`)

  tx(() => {
    pluginVersions.setYanked(target.id, true, reason || null)
    const next = pluginVersions.getLatestNonYanked(plugin.id)
    pluginRepo.repointLatest(plugin.id, next?.id ?? null)
  })
}

export function unyankPluginVersion(
  user: UserRecord,
  ref: SkillRef,
  version: string,
  tokenNamespaceId: string | null,
): void {
  const plugin = resolvePluginRef(ref, { id: user.id, role: user.role })
  if (!plugin) notFound(`plugin ${formatRef(ref)}`)
  authorizePluginWrite(plugin, user, tokenNamespaceId)

  const target = pluginVersions.getByPluginAndVersion(plugin.id, version)
  if (!target) notFound(`version ${version}`)
  if (!target.yankedAt) fail(`validation: version ${version} is not yanked`)

  tx(() => {
    pluginVersions.setYanked(target.id, false)
    const next = pluginVersions.getLatestNonYanked(plugin.id)
    pluginRepo.repointLatest(plugin.id, next?.id ?? null)
  })
}

/** Admin visibility override. */
export function setPluginVisibility(
  ref: SkillRef,
  visibility: string,
): void {
  if (visibility !== 'public' && visibility !== 'private') {
    fail("visibility must be 'public' or 'private'")
  }
  const plugin = resolvePluginRef(ref, { id: '', role: 'admin' })
  if (!plugin) notFound(`plugin ${formatRef(ref)}`)
  pluginRepo.setVisibility(plugin.id, visibility as Visibility, 'approved')
  reindexPlugin(pluginRepo.getById(plugin.id)!)
}

export function reviewPlugin(ref: SkillRef, action: string): 'approved' | 'rejected' {
  if (action !== 'approve' && action !== 'reject') {
    fail("action must be 'approve' or 'reject'")
  }
  const plugin = resolvePluginRef(ref, { id: '', role: 'admin' })
  if (!plugin) notFound(`plugin ${formatRef(ref)}`)
  const approved = action === 'approve'
  pluginRepo.setVisibility(
    plugin.id,
    approved ? 'public' : 'private',
    approved ? 'approved' : 'rejected',
  )
  reindexPlugin(pluginRepo.getById(plugin.id)!)
  return approved ? 'approved' : 'rejected'
}

export function unindexPlugin(id: string): void {
  unindexTarget(id)
}

function formatRef(ref: SkillRef): string {
  return ref.namespace !== '' ? `@${ref.namespace}/${ref.slug}` : ref.slug
}
