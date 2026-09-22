/**
 * SQL for the plugin domain: plugins, versions and version file bytes.
 *
 * Plugins are the "bundle" counterpart to skills — an Agent Plugins package
 * containing Skills and MCP server definitions. Structurally they mirror
 * skills, minus stars/comments/ratings.
 */

import crypto from 'node:crypto'
import { asNumber, asString, nowIso, newId, query, tx, type Row } from '../db'
import type {
  ModerationStatus,
  Plugin,
  PluginVersion,
  VersionFile,
  Visibility,
} from '../../lib/types'

const parseJson = <T>(raw: unknown, fallback: T): T => {
  if (raw == null) return fallback
  try {
    const parsed = JSON.parse(String(raw))
    return (parsed ?? fallback) as T
  } catch {
    return fallback
  }
}

function mapPlugin(r: Row): Plugin {
  return {
    id: asString(r.id),
    slug: asString(r.slug),
    ...(r.display_name != null ? { displayName: asString(r.display_name) } : {}),
    ...(r.summary != null ? { summary: asString(r.summary) } : {}),
    ownerId: asString(r.owner_id),
    ...(r.namespace_id != null ? { namespaceId: asString(r.namespace_id) } : {}),
    ...(r.latest_version_id != null ? { latestVersionId: asString(r.latest_version_id) } : {}),
    visibility: asString(r.visibility) as Visibility,
    moderationStatus: asString(r.moderation_status) as ModerationStatus,
    category: asString(r.category),
    tags: parseJson<string[]>(r.tags, []),
    downloads: asNumber(r.downloads),
    starsCount: asNumber(r.stars_count),
    versionsCount: asNumber(r.versions_count),
    createdAt: asString(r.created_at),
    updatedAt: asString(r.updated_at),
    ...(r.soft_deleted_at != null ? { softDeletedAt: asString(r.soft_deleted_at) } : {}),
  }
}

function mapPluginVersion(r: Row): PluginVersion {
  return {
    id: asString(r.id),
    pluginId: asString(r.plugin_id),
    version: asString(r.version),
    fingerprint: asString(r.fingerprint),
    manifest: parseJson<Record<string, unknown>>(r.manifest, {}),
    files: parseJson<VersionFile[]>(r.files, []),
    ...(r.changelog != null ? { changelog: asString(r.changelog) } : {}),
    createdBy: asString(r.created_by),
    sha256Hash: asString(r.sha256_hash),
    createdAt: asString(r.created_at),
    ...(r.soft_deleted_at != null ? { softDeletedAt: asString(r.soft_deleted_at) } : {}),
    ...(r.yanked_at != null ? { yankedAt: asString(r.yanked_at) } : {}),
    ...(r.yank_reason != null ? { yankReason: asString(r.yank_reason) } : {}),
  }
}

const PLUGIN_SELECT = /* sql */ `
  SELECT p.*, u.handle AS owner_handle, u.avatar_url AS owner_avatar_url, n.slug AS namespace_slug
  FROM plugins p
  JOIN users u      ON u.id = p.owner_id
  LEFT JOIN namespaces n ON n.id = p.namespace_id
`

function pluginSort(sort: string): string {
  switch (sort) {
    case 'downloads':
      return 'p.downloads DESC, p.id'
    case 'stars':
      return 'p.stars_count DESC, p.id'
    case 'name':
      return 'p.slug ASC, p.id'
    case 'created':
    default:
      return 'p.created_at DESC, p.id'
  }
}

export const plugins = {
  getById(id: string): Plugin | null {
    const row = query.get<Row>('SELECT * FROM plugins WHERE id = ?', id)
    return row ? mapPlugin(row) : null
  },

  /** Raw row plus owner/namespace join — subject to the caller's visibility check. */
  getJoined(id: string): (Plugin & { ownerHandle: string; ownerAvatarUrl?: string; namespaceSlug: string }) | null {
    const row = query.get<Row>(`${PLUGIN_SELECT} WHERE p.id = ?`, id)
    if (!row) return null
    return {
      ...mapPlugin(row),
      ownerHandle: asString(row.owner_handle),
      ...(row.owner_avatar_url != null ? { ownerAvatarUrl: asString(row.owner_avatar_url) } : {}),
      namespaceSlug: row.namespace_slug == null ? '' : asString(row.namespace_slug),
    }
  },

  getByNsAndSlug(
    namespaceId: string,
    slug: string,
    opts: { includeDeleted?: boolean } = {},
  ): Plugin | null {
    const deleted = opts.includeDeleted ? '' : ' AND soft_deleted_at IS NULL'
    const row = query.get<Row>(
      `SELECT * FROM plugins WHERE namespace_id = ? AND slug = ?${deleted}`,
      namespaceId,
      slug,
    )
    return row ? mapPlugin(row) : null
  },

  findBySlugAcrossNamespaces(slug: string, opts: { includeDeleted?: boolean } = {}): Plugin[] {
    const deleted = opts.includeDeleted ? '' : ' AND soft_deleted_at IS NULL'
    return query
      .all<Row>(`SELECT * FROM plugins WHERE slug = ?${deleted}`, slug)
      .map(mapPlugin)
  },

  /** Public catalogue: always filtered to public + approved. */
  list(opts: {
    category: string
    sort: string
    cursor: string
    limit: number
  }): { data: Plugin[]; nextCursor: string } {
    const where: string[] = [
      'p.soft_deleted_at IS NULL',
      "p.visibility = 'public'",
      "p.moderation_status = 'approved'",
    ]
    const params: unknown[] = []

    if (opts.category) {
      where.push('p.category = ?')
      params.push(opts.category)
    }
    if (opts.cursor) {
      where.push('p.id > ?')
      params.push(opts.cursor)
    }

    const rows = query.all<Row>(
      `SELECT * FROM plugins p WHERE ${where.join(' AND ')} ORDER BY ${pluginSort(opts.sort)} LIMIT ?`,
      ...params,
      opts.limit + 1,
    )
    const items = rows.map(mapPlugin)
    const nextCursor = items.length > opts.limit ? items[opts.limit].id : ''
    return { data: items.slice(0, opts.limit), nextCursor }
  },

  /** Admin listing includes owner and namespace labels for moderation actions. */
  listForAdmin(opts: {
    limit: number
    cursor: string
    visibility: string
  }): { data: Array<Plugin & { ownerHandle: string; namespaceSlug: string }>; nextCursor: string } {
    const where: string[] = ['p.soft_deleted_at IS NULL']
    const params: unknown[] = []
    switch (opts.visibility) {
      case 'private':
        where.push("p.visibility = 'private'")
        break
      case 'public':
        where.push("p.visibility = 'public'")
        break
      case 'pending':
        where.push("p.moderation_status = 'pending_review'")
        break
      default:
        break
    }
    if (opts.cursor) {
      where.push('p.id > ?')
      params.push(opts.cursor)
    }
    const rows = query.all<Row>(
      `${PLUGIN_SELECT} WHERE ${where.join(' AND ')} ORDER BY p.updated_at DESC, p.id LIMIT ?`,
      ...params,
      opts.limit + 1,
    )
    const items = rows.map((row) => ({
      ...mapPlugin(row),
      ownerHandle: asString(row.owner_handle),
      namespaceSlug: row.namespace_slug == null ? '' : asString(row.namespace_slug),
    }))
    const nextCursor = items.length > opts.limit ? items[opts.limit].id : ''
    return { data: items.slice(0, opts.limit), nextCursor }
  },

  create(input: {
    slug: string
    displayName?: string | null
    summary?: string | null
    ownerId: string
    namespaceId: string
    visibility: Visibility
    category: string
    tags: string[]
    moderationStatus?: ModerationStatus
  }): Plugin {
    const id = newId()
    const now = nowIso()
    query.run(
      `INSERT INTO plugins
        (id, slug, display_name, summary, owner_id, namespace_id, visibility, moderation_status,
         category, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.slug,
      input.displayName ?? null,
      input.summary ?? null,
      input.ownerId,
      input.namespaceId,
      input.visibility,
      input.moderationStatus ?? 'approved',
      input.category,
      JSON.stringify(input.tags),
      now,
      now,
    )
    return plugins.getById(id)!
  },

  updateMetadata(
    id: string,
    fields: { displayName?: string; summary?: string; category?: string; tags?: string[]; visibility?: Visibility },
  ): void {
    const sets: string[] = []
    const params: unknown[] = []
    if (fields.displayName) {
      sets.push('display_name = ?')
      params.push(fields.displayName)
    }
    if (fields.summary) {
      sets.push('summary = ?')
      params.push(fields.summary)
    }
    if (fields.category) {
      sets.push('category = ?')
      params.push(fields.category)
    }
    if (fields.tags && fields.tags.length > 0) {
      sets.push('tags = ?')
      params.push(JSON.stringify(fields.tags))
    }
    if (fields.visibility) {
      sets.push('visibility = ?')
      params.push(fields.visibility)
    }
    if (sets.length === 0) return
    params.push(id)
    query.run(`UPDATE plugins SET ${sets.join(', ')} WHERE id = ?`, ...params)
  },

  setLatestVersion(id: string, versionId: string, at: string): void {
    query.run(
      'UPDATE plugins SET latest_version_id = ?, versions_count = versions_count + 1, updated_at = ? WHERE id = ?',
      versionId,
      at,
      id,
    )
  },

  repointLatest(id: string, versionId: string | null): void {
    query.run('UPDATE plugins SET latest_version_id = ? WHERE id = ?', versionId, id)
  },

  setVisibility(id: string, visibility: Visibility, moderationStatus: ModerationStatus): void {
    query.run(
      'UPDATE plugins SET visibility = ?, moderation_status = ?, updated_at = ? WHERE id = ?',
      visibility,
      moderationStatus,
      nowIso(),
      id,
    )
  },

  softDelete(id: string): void {
    query.run('UPDATE plugins SET soft_deleted_at = ?, updated_at = ? WHERE id = ?', nowIso(), nowIso(), id)
  },

  undelete(id: string): void {
    query.run('UPDATE plugins SET soft_deleted_at = NULL, updated_at = ? WHERE id = ?', nowIso(), id)
  },

  purge(id: string): void {
    query.run('DELETE FROM plugins WHERE id = ?', id)
  },

  bumpDownloads(id: string): void {
    query.run('UPDATE plugins SET downloads = downloads + 1 WHERE id = ?', id)
  },
}

export const pluginVersions = {
  create(input: {
    pluginId: string
    version: string
    fingerprint: string
    manifest: Record<string, unknown>
    files: VersionFile[]
    changelog?: string | null
    createdBy: string
  }): PluginVersion {
    const id = newId()
    const now = nowIso()
    query.run(
      `INSERT INTO plugin_versions
        (id, plugin_id, version, fingerprint, manifest, files, changelog, created_by, sha256_hash, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?)`,
      id,
      input.pluginId,
      input.version,
      input.fingerprint,
      JSON.stringify(input.manifest),
      JSON.stringify(input.files),
      input.changelog ?? null,
      input.createdBy,
      input.fingerprint,
      now,
    )
    return pluginVersions.getById(id)!
  },

  getById(id: string): PluginVersion | null {
    const row = query.get<Row>('SELECT * FROM plugin_versions WHERE id = ?', id)
    return row ? mapPluginVersion(row) : null
  },

  getByPluginAndVersion(pluginId: string, version: string): PluginVersion | null {
    const row = query.get<Row>(
      'SELECT * FROM plugin_versions WHERE plugin_id = ? AND version = ? AND soft_deleted_at IS NULL',
      pluginId,
      version,
    )
    return row ? mapPluginVersion(row) : null
  },

  listByPlugin(pluginId: string): PluginVersion[] {
    return query
      .all<Row>(
        'SELECT * FROM plugin_versions WHERE plugin_id = ? AND soft_deleted_at IS NULL ORDER BY created_at DESC',
        pluginId,
      )
      .map(mapPluginVersion)
  },

  /** Newest version by `created_at` — no yank filter. */
  getLatest(pluginId: string): PluginVersion | null {
    const row = query.get<Row>(
      `SELECT * FROM plugin_versions WHERE plugin_id = ? AND soft_deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      pluginId,
    )
    return row ? mapPluginVersion(row) : null
  },

  getLatestNonYanked(pluginId: string): PluginVersion | null {
    const row = query.get<Row>(
      `SELECT * FROM plugin_versions WHERE plugin_id = ? AND soft_deleted_at IS NULL AND yanked_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      pluginId,
    )
    return row ? mapPluginVersion(row) : null
  },

  setYanked(id: string, yanked: boolean, reason?: string | null): void {
    if (yanked) {
      query.run(
        'UPDATE plugin_versions SET yanked_at = ?, yank_reason = ? WHERE id = ?',
        nowIso(),
        reason ?? null,
        id,
      )
    } else {
      query.run('UPDATE plugin_versions SET yanked_at = NULL, yank_reason = NULL WHERE id = ?', id)
    }
  },
}

export const pluginFiles = {
  insertMany(
    versionId: string,
    files: Array<{ path: string; content: Uint8Array; contentType: string }>,
  ): void {
    const stmt = query.stmt(
      `INSERT OR REPLACE INTO plugin_version_files
        (version_id, path, seq, size, sha256, content_type, content)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    tx(() => {
      files.forEach((f, seq) => {
        stmt.run(
          versionId,
          f.path,
          seq,
          f.content.byteLength,
          crypto.createHash('sha256').update(f.content).digest('hex'),
          f.contentType,
          f.content,
        )
      })
    })
  },

  get(versionId: string, path: string): Uint8Array | null {
    const row = query.get<Row>(
      'SELECT content FROM plugin_version_files WHERE version_id = ? AND path = ?',
      versionId,
      path,
    )
    if (!row) return null
    const v = row.content
    if (v instanceof Uint8Array) return v
    if (typeof v === 'string') return new TextEncoder().encode(v)
    return null
  },

  listAll(versionId: string): Array<{ path: string; content: Uint8Array }> {
    return query
      .all<Row>(
        'SELECT path, content FROM plugin_version_files WHERE version_id = ? ORDER BY seq',
        versionId,
      )
      .map((r) => {
        const v = r.content
        return {
          path: asString(r.path),
          content:
            v instanceof Uint8Array
              ? v
              : typeof v === 'string'
                ? new TextEncoder().encode(v)
                : new Uint8Array(0),
        }
      })
  },
}
