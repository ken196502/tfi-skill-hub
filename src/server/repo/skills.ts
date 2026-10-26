/**
 * SQL for the skill domain: skills, versions, version file bytes, stars,
 * ratings, comments and download de-duplication.
 *
 * Listing filtering, cursor pagination and the download-counter de-dup rule all
 * live here because they are SQL concerns that the service layer should not
 * have to reconstruct.
 */

import crypto from 'node:crypto'
import { asBool, asNumber, asString, nowIso, newId, query, tx, type Row } from '../db'
import type {
  CommentWithUser,
  ListingStatus,
  RatingWithUser,
  Skill,
  SkillDependency,
  SkillKind,
  SkillType,
  SkillVersion,
  SkillWithOwner,
  VersionFile,
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

// ─────────────────────────────────────────────────────────────────────────────
// Mappers
// ─────────────────────────────────────────────────────────────────────────────

function mapSkill(r: Row): Skill {
  return {
    id: asString(r.id),
    slug: asString(r.slug),
    ...(r.display_name != null ? { displayName: asString(r.display_name) } : {}),
    ...(r.summary != null ? { summary: asString(r.summary) } : {}),
    ...(r.display_name_en != null ? { displayNameEn: asString(r.display_name_en) } : {}),
    ...(r.summary_en != null ? { summaryEn: asString(r.summary_en) } : {}),
    ownerId: asString(r.owner_id),
    ...(r.namespace_id != null ? { namespaceId: asString(r.namespace_id) } : {}),
    ...(r.latest_version_id != null ? { latestVersionId: asString(r.latest_version_id) } : {}),
    listing: asString(r.listing) as ListingStatus,
    isSuspicious: asBool(r.is_suspicious),
    kind: asString(r.kind) as SkillKind,
    // NOT NULL with a default, so it is always present; the fallback only
    // guards a row that predates the column.
    type: (asString(r.type) || 'skill') as SkillType,
    category: asString(r.category),
    tags: parseJson<string[]>(r.tags, []),
    downloads: asNumber(r.downloads),
    installs: asNumber(r.installs),
    starsCount: asNumber(r.stars_count),
    versionsCount: asNumber(r.versions_count),
    commentsCount: asNumber(r.comments_count),
    averageRating: asNumber(r.average_rating),
    ratingsCount: asNumber(r.ratings_count),
    createdAt: asString(r.created_at),
    updatedAt: asString(r.updated_at),
    ...(r.soft_deleted_at != null ? { softDeletedAt: asString(r.soft_deleted_at) } : {}),
  }
}

function mapSkillWithOwner(r: Row): SkillWithOwner {
  return {
    ...mapSkill(r),
    ownerHandle: asString(r.owner_handle),
    ...(r.owner_display_name != null ? { ownerDisplayName: asString(r.owner_display_name) } : {}),
    ...(r.owner_avatar_url != null ? { ownerAvatarUrl: asString(r.owner_avatar_url) } : {}),
    // Always present (no omitempty upstream); '' when the LEFT JOIN misses.
    namespaceSlug: r.namespace_slug == null ? '' : asString(r.namespace_slug),
  }
}

function mapVersion(r: Row): SkillVersion {
  return {
    id: asString(r.id),
    skillId: asString(r.skill_id),
    version: asString(r.version),
    fingerprint: asString(r.fingerprint),
    ...(r.git_commit_hash != null ? { gitCommitHash: asString(r.git_commit_hash) } : {}),
    ...(r.changelog != null ? { changelog: asString(r.changelog) } : {}),
    ...(r.changelog_source != null ? { changelogSource: asString(r.changelog_source) } : {}),
    files: parseJson<VersionFile[]>(r.files, []),
    parsed: parseJson<Record<string, unknown>>(r.parsed, {}),
    createdBy: asString(r.created_by),
    sha256Hash: asString(r.sha256_hash),
    createdAt: asString(r.created_at),
    ...(r.soft_deleted_at != null ? { softDeletedAt: asString(r.soft_deleted_at) } : {}),
    ...(r.yanked_at != null ? { yankedAt: asString(r.yanked_at) } : {}),
    ...(r.yank_reason != null ? { yankReason: asString(r.yank_reason) } : {}),
    ...(r.deprecated_at != null ? { deprecatedAt: asString(r.deprecated_at) } : {}),
    ...(r.deprecation_message != null ? { deprecationMessage: asString(r.deprecation_message) } : {}),
    dependencies: parseJson<SkillDependency[]>(r.dependencies, []),
    ...(r.signature_bundle != null ? { signatureBundle: asString(r.signature_bundle) } : {}),
    signatureStatus: (asString(r.signature_status) || 'unsigned') as SkillVersion['signatureStatus'],
    ...(r.signature_subject != null ? { signatureSubject: asString(r.signature_subject) } : {}),
    ...(r.signature_issuer != null ? { signatureIssuer: asString(r.signature_issuer) } : {}),
  }
}

const SKILL_SELECT = /* sql */ `
  SELECT s.*,
         u.handle       AS owner_handle,
         u.display_name AS owner_display_name,
         u.avatar_url   AS owner_avatar_url,
         n.slug         AS namespace_slug
  FROM skills s
  JOIN users u      ON u.id = s.owner_id
  LEFT JOIN namespaces n ON n.id = s.namespace_id
`

export interface Viewer {
  id: string
  role: string
}

/**
 * Listing predicate. Returns `{ sql, params }` to be ANDed into a query.
 *
 * Membership in a namespace does **not** widen the *list*: only ownership does.
 * (Single-skill reads are more permissive — see `services/skills.ts`.)
 */
function listingClause(viewer: Viewer | null): { sql: string; params: unknown[] } {
  if (viewer && viewer.role === 'admin') {
    return { sql: '', params: [] }
  }
  if (viewer) {
    return {
      sql: ` AND (s.listing = 'listed' OR s.owner_id = ?)`,
      params: [viewer.id],
    }
  }
  return { sql: ` AND s.listing = 'listed'`, params: [] }
}

export type SortKey = 'created' | 'downloads' | 'stars' | 'updated' | 'name'

/**
 * Column + direction + cursor comparator for each supported sort.
 *
 * The tiebreaker is always `s.id` **ascending**, so "the cursor row and
 * everything after it" means a strictly smaller primary value for the DESC
 * sorts (a strictly larger one for the ASC sort) and — when the primary value
 * is equal — an id at or above the cursor's. A plain row-value comparison
 * would apply the primary direction to the tiebreaker as well, which hands
 * back the very same page whenever many rows share one sort value — exactly
 * what a bulk seed produces, since every row is then stamped with the same
 * `created_at`.
 */
function sortSpec(sort: string): {
  orderBy: string
  column: string
  /** Comparator for the primary sort column: '<' for DESC, '>' for ASC. */
  primaryOp: string
} {
  switch (sort) {
    case 'downloads':
      return { orderBy: 's.downloads DESC, s.id', column: 'downloads', primaryOp: '<' }
    case 'stars':
      return { orderBy: 's.stars_count DESC, s.id', column: 'stars_count', primaryOp: '<' }
    case 'updated':
      return { orderBy: 's.updated_at DESC, s.id', column: 'updated_at', primaryOp: '<' }
    case 'name':
      return { orderBy: 's.slug ASC, s.id', column: 'slug', primaryOp: '>' }
    case 'created':
    default:
      return { orderBy: 's.created_at DESC, s.id', column: 'created_at', primaryOp: '<' }
  }
}

export interface ListOptions {
  limit: number
  cursor: string
  sort: string
  category: string
  /** Free-text filter matched against slug, display name and summary (both languages). */
  q: string
  /** Namespace **slug**; an unknown slug applies no filter (upstream quirk). */
  namespaceSlug: string
  /**
   * Restricts the result to one kind of entry — `skill` or `knowledge_base`.
   * Empty means both.
   */
  type: string
  viewer: Viewer | null
  includeDeleted?: boolean
}

/**
 * Filter shared by the admin listing's count and page queries. Kept in one
 * place so `total` and `data` can never disagree about what the filter means.
 */
function adminSkillFilter(listing: string, type: string): { where: string[]; params: unknown[] } {
  const where: string[] = ['s.soft_deleted_at IS NULL']
  const params: unknown[] = []

  if (listing === 'listed' || listing === 'unlisted') {
    where.push('s.listing = ?')
    params.push(listing)
  }

  if (type === 'skill' || type === 'knowledge_base') {
    where.push('s.type = ?')
    params.push(type)
  }

  return { where, params }
}

export const skills = {
  getById(id: string): Skill | null {
    const row = query.get<Row>('SELECT * FROM skills WHERE id = ?', id)
    return row ? mapSkill(row) : null
  },

  /** Full row with owner + namespace join, by primary key. */
  getWithOwnerById(id: string): SkillWithOwner | null {
    const row = query.get<Row>(`${SKILL_SELECT} WHERE s.id = ?`, id)
    return row ? mapSkillWithOwner(row) : null
  },

  getWithOwnerByNsAndSlug(
    namespaceId: string,
    slug: string,
    opts: { includeDeleted?: boolean } = {},
  ): SkillWithOwner | null {
    const deleted = opts.includeDeleted ? '' : ' AND s.soft_deleted_at IS NULL'
    const row = query.get<Row>(
      `${SKILL_SELECT} WHERE s.namespace_id = ? AND s.slug = ?${deleted}`,
      namespaceId,
      slug,
    )
    return row ? mapSkillWithOwner(row) : null
  },

  /** All live skills with a given slug across namespaces — disambiguation input. */
  findBySlugAcrossNamespaces(slug: string): SkillWithOwner[] {
    return query
      .all<Row>(`${SKILL_SELECT} WHERE s.slug = ? AND s.soft_deleted_at IS NULL`, slug)
      .map(mapSkillWithOwner)
  },

  /** Slug alias lookup for renamed skills. */
  findByAlias(namespaceId: string, oldSlug: string): SkillWithOwner | null {
    const alias = query.get<Row>(
      'SELECT skill_id FROM skill_slug_aliases WHERE namespace_id = ? AND old_slug = ?',
      namespaceId,
      oldSlug,
    )
    if (!alias) return null
    return skills.getWithOwnerById(asString(alias.skill_id))
  },

  list(opts: ListOptions): { data: SkillWithOwner[]; nextCursor: string } {
    const where: string[] = []
    const params: unknown[] = []

    if (!opts.includeDeleted) where.push('s.soft_deleted_at IS NULL')

    const vis = listingClause(opts.viewer)
    if (vis.sql) {
      where.push(vis.sql.replace(/^ AND /, ''))
      params.push(...vis.params)
    }

    if (opts.category) {
      where.push('s.category = ?')
      params.push(opts.category)
    }

    if (opts.type === 'skill' || opts.type === 'knowledge_base') {
      where.push('s.type = ?')
      params.push(opts.type)
    }

    if (opts.q) {
      // Same escaping contract as the search LIKE fallback in repo/search.ts.
      const like = `%${opts.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
      where.push(
        `(s.slug LIKE ? ESCAPE '\\' OR s.display_name LIKE ? ESCAPE '\\'` +
          ` OR s.display_name_en LIKE ? ESCAPE '\\' OR s.summary LIKE ? ESCAPE '\\'` +
          ` OR s.summary_en LIKE ? ESCAPE '\\')`,
      )
      params.push(like, like, like, like, like)
    }

    if (opts.namespaceSlug) {
      const ns = query.get<Row>('SELECT id FROM namespaces WHERE slug = ?', opts.namespaceSlug)
      // Unknown namespace → filter stays nil and no filtering happens. This
      // reproduces the upstream behaviour (there is deliberately no 404).
      if (ns) {
        where.push('s.namespace_id = ?')
        params.push(asString(ns.id))
      }
    }

    const { orderBy, column, primaryOp } = sortSpec(opts.sort)

    if (opts.cursor) {
      // "The cursor row and everything after it": the primary column in the
      // sort's own direction, and the id tiebreaker ascending. The comparison
      // is inclusive on the id, because the cursor parks on the first row the
      // previous page did *not* return — that row still belongs to this page.
      // See `sortSpec`.
      where.push(
        `(s.${column} ${primaryOp} (SELECT ${column} FROM skills WHERE id = ?)` +
          ` OR (s.${column} = (SELECT ${column} FROM skills WHERE id = ?)` +
          ` AND s.id >= (SELECT id FROM skills WHERE id = ?)))`,
      )
      params.push(opts.cursor, opts.cursor, opts.cursor)
    }

    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
    const rows = query.all<Row>(
      `${SKILL_SELECT} ${clause} ORDER BY ${orderBy} LIMIT ?`,
      ...params,
      opts.limit + 1,
    )
    const items = rows.map(mapSkillWithOwner)
    const nextCursor = items.length > opts.limit ? items[opts.limit].id : ''
    return { data: items.slice(0, opts.limit), nextCursor }
  },

  /**
   * Admin listing — no listing filter, ordered by `updated_at DESC`.
   *
   * Two paging modes share one filter expression:
   *   - `page >= 1` selects a numbered page (`LIMIT/OFFSET`) — the console's
   *     mode, and the only way to render "第 N / M 页".
   *   - `page === 0` keeps the historical cursor walk, so clients written
   *     against `nextCursor` are unaffected.
   *
   * `total` is always the size of the filtered set (paging ignored), so the
   * caller can render a page count without a second round trip.
   */
  listForAdmin(opts: {
    listing: string
    type: string
    cursor: string
    limit: number
    page: number
  }): { data: SkillWithOwner[]; nextCursor: string; total: number } {
    const { where, params } = adminSkillFilter(opts.listing, opts.type)
    const total = asNumber(
      query.get<Row>(
        `SELECT COUNT(*) AS c FROM skills s WHERE ${where.join(' AND ')}`,
        ...params,
      )?.c,
    )

    if (opts.page >= 1) {
      const rows = query.all<Row>(
        `${SKILL_SELECT} WHERE ${where.join(' AND ')} ORDER BY s.updated_at DESC, s.id LIMIT ? OFFSET ?`,
        ...params,
        opts.limit,
        (opts.page - 1) * opts.limit,
      )
      return { data: rows.map(mapSkillWithOwner), nextCursor: '', total }
    }

    const cursorWhere = [...where]
    const cursorParams = [...params]
    if (opts.cursor) {
      cursorWhere.push(
        `s.updated_at <= (SELECT updated_at FROM skills WHERE id = ?) AND s.id != ?`,
      )
      cursorParams.push(opts.cursor, opts.cursor)
    }

    const rows = query.all<Row>(
      `${SKILL_SELECT} WHERE ${cursorWhere.join(' AND ')} ORDER BY s.updated_at DESC, s.id LIMIT ?`,
      ...cursorParams,
      opts.limit + 1,
    )
    const items = rows.map(mapSkillWithOwner)
    const nextCursor = items.length > opts.limit ? items[opts.limit].id : ''
    return { data: items.slice(0, opts.limit), nextCursor, total }
  },

  /**
   * Every category a live skill is actually filed under, filtered exactly the
   * way `list` filters.
   *
   * The answer has to come from the records rather than from the advertised
   * taxonomy — the catalogue is not restricted to the four values
   * `/api/v1/categories` names. Passing the viewer matters for the public
   * catalogue: a category whose only skills are offline would otherwise be
   * offered as a filter that can only ever return nothing.
   *
   * Ordered case-insensitively here; callers re-sort for display.
   */
  listCategoriesInUse(viewer: Viewer | null = null, type = ''): string[] {
    const vis = listingClause(viewer)
    const typeClause = type === 'skill' || type === 'knowledge_base' ? ' AND s.type = ?' : ''
    const typeParams = typeClause ? [type] : []
    return query
      .all<Row>(
        `SELECT DISTINCT s.category AS category FROM skills s
          WHERE s.soft_deleted_at IS NULL
            AND s.category IS NOT NULL AND TRIM(s.category) != ''${vis.sql}${typeClause}
          ORDER BY s.category COLLATE NOCASE`,
        ...vis.params,
        ...typeParams,
      )
      .map((row) => asString(row.category))
  },

  create(input: {
    slug: string
    displayName?: string | null
    summary?: string | null
    displayNameEn?: string | null
    summaryEn?: string | null
    ownerId: string
    namespaceId: string
    listing: ListingStatus
    kind: SkillKind
    type: SkillType
    category: string
    tags: string[]
  }): Skill {
    const id = newId()
    const now = nowIso()
    query.run(
      `INSERT INTO skills
        (id, slug, display_name, summary, display_name_en, summary_en, owner_id, namespace_id,
         listing, is_suspicious, kind, type, category, tags, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
      id,
      input.slug,
      input.displayName ?? null,
      input.summary ?? null,
      input.displayNameEn ?? null,
      input.summaryEn ?? null,
      input.ownerId,
      input.namespaceId,
      input.listing,
      input.kind,
      input.type,
      input.category,
      JSON.stringify(input.tags),
      now,
      now,
    )
    return skills.getById(id)!
  },

  /** Refreshes only the fields the publish request actually supplied. */
  updateMetadata(
    id: string,
    fields: {
      displayName?: string
      summary?: string
      displayNameEn?: string
      summaryEn?: string
      category?: string
      tags?: string[]
      listing?: ListingStatus
      type?: SkillType
    },
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
    if (fields.displayNameEn) {
      sets.push('display_name_en = ?')
      params.push(fields.displayNameEn)
    }
    if (fields.summaryEn) {
      sets.push('summary_en = ?')
      params.push(fields.summaryEn)
    }
    if (fields.category) {
      sets.push('category = ?')
      params.push(fields.category)
    }
    if (fields.tags && fields.tags.length > 0) {
      sets.push('tags = ?')
      params.push(JSON.stringify(fields.tags))
    }
    if (fields.listing) {
      sets.push('listing = ?')
      params.push(fields.listing)
    }
    if (fields.type) {
      sets.push('type = ?')
      params.push(fields.type)
    }
    if (sets.length === 0) return
    params.push(id)
    query.run(`UPDATE skills SET ${sets.join(', ')} WHERE id = ?`, ...params)
  },

  /**
   * Full replacement of the editable metadata, for the admin console's edit
   * form.
   *
   * Deliberately **not** `updateMetadata`: that one skips any falsy field, so an
   * emptied input would be silently ignored and the author could never clear a
   * summary or drop the English name. Here an empty value clears the column,
   * which is what a form that submits every field means by it.
   */
  updateForAdmin(
    id: string,
    fields: {
      displayName: string | null
      summary: string | null
      displayNameEn: string | null
      summaryEn: string | null
      category: string
      tags: string[]
      listing: ListingStatus
      type: SkillType
    },
  ): void {
    query.run(
      `UPDATE skills
          SET display_name = ?, summary = ?, display_name_en = ?, summary_en = ?,
              category = ?, tags = ?, listing = ?, type = ?, updated_at = ?
        WHERE id = ?`,
      fields.displayName,
      fields.summary,
      fields.displayNameEn,
      fields.summaryEn,
      fields.category,
      JSON.stringify(fields.tags),
      fields.listing,
      fields.type,
      nowIso(),
      id,
    )
  },

  /**
   * Detail markup, fetched separately from the row itself.
   *
   * The shared `SELECT s.*` join feeds every listing, and a page of skills
   * should not carry every body in full — so `detailHtml` is not part of the
   * row mapper and only the detail endpoint asks for it.
   */
  getDetailHtml(id: string): {
    html: string | null
    updatedAt: string | null
    htmlEn: string | null
    updatedAtEn: string | null
  } {
    const row = query.get<Row>(
      'SELECT detail_html, detail_html_updated_at, detail_html_en, detail_html_en_updated_at FROM skills WHERE id = ?',
      id,
    )
    if (!row) return { html: null, updatedAt: null, htmlEn: null, updatedAtEn: null }
    return {
      html: row.detail_html == null ? null : asString(row.detail_html),
      updatedAt:
        row.detail_html_updated_at == null ? null : asString(row.detail_html_updated_at),
      htmlEn: row.detail_html_en == null ? null : asString(row.detail_html_en),
      updatedAtEn:
        row.detail_html_en_updated_at == null ? null : asString(row.detail_html_en_updated_at),
    }
  },

  /**
   * Writes the detail markup. `null` clears a language, which sends that
   * language back to its fallback (English → Chinese body → SKILL.md). Either
   * language may be written independently; passing `undefined` leaves it
   * untouched. The caller is expected to have sanitised the values.
   */
  setDetailHtml(
    id: string,
    html: string | null | undefined,
    htmlEn: string | null | undefined,
  ): void {
    const now = nowIso()
    const sets: string[] = ['updated_at = ?']
    const params: (string | null)[] = [now]
    if (html !== undefined) {
      sets.push('detail_html = ?', 'detail_html_updated_at = ?')
      params.push(html, html === null ? null : now)
    }
    if (htmlEn !== undefined) {
      sets.push('detail_html_en = ?', 'detail_html_en_updated_at = ?')
      params.push(htmlEn, htmlEn === null ? null : now)
    }
    params.push(id)
    query.run(`UPDATE skills SET ${sets.join(', ')} WHERE id = ?`, ...params)
  },

  setLatestVersion(id: string, versionId: string, at: string): void {
    query.run(
      'UPDATE skills SET latest_version_id = ?, versions_count = versions_count + 1, updated_at = ? WHERE id = ?',
      versionId,
      at,
      id,
    )
  },

  /** Repoints `latest_version_id` without touching the version counter. */
  repointLatest(id: string, versionId: string | null): void {
    query.run('UPDATE skills SET latest_version_id = ? WHERE id = ?', versionId, id)
  },

  /** Takes a skill on or off the shelf — the only visibility-shaped write. */
  setListing(id: string, listing: ListingStatus): void {
    query.run(
      'UPDATE skills SET listing = ?, updated_at = ? WHERE id = ?',
      listing,
      nowIso(),
      id,
    )
  },

  setNamespace(id: string, namespaceId: string): void {
    query.run('UPDATE skills SET namespace_id = ?, updated_at = ? WHERE id = ?', namespaceId, nowIso(), id)
  },

  setOwner(id: string, ownerId: string): void {
    query.run('UPDATE skills SET owner_id = ?, updated_at = ? WHERE id = ?', ownerId, nowIso(), id)
  },

  softDelete(id: string): void {
    query.run('UPDATE skills SET soft_deleted_at = ?, updated_at = ? WHERE id = ?', nowIso(), nowIso(), id)
  },

  undelete(id: string): void {
    query.run('UPDATE skills SET soft_deleted_at = NULL, updated_at = ? WHERE id = ?', nowIso(), id)
  },

  purge(id: string): void {
    query.run('DELETE FROM skills WHERE id = ?', id)
  },

  addAlias(skillId: string, namespaceId: string, oldSlug: string): void {
    query.run(
      `INSERT OR REPLACE INTO skill_slug_aliases (id, skill_id, namespace_id, old_slug, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      newId(),
      skillId,
      namespaceId,
      oldSlug,
      nowIso(),
    )
  },

  bumpDownloads(id: string): void {
    query.run('UPDATE skills SET downloads = downloads + 1 WHERE id = ?', id)
  },

  recomputeStars(id: string): void {
    query.run(
      'UPDATE skills SET stars_count = (SELECT COUNT(*) FROM stars WHERE skill_id = skills.id) WHERE id = ?',
      id,
    )
  },

  recomputeRatings(id: string): void {
    query.run(
      `UPDATE skills
       SET ratings_count = (SELECT COUNT(*) FROM ratings WHERE skill_id = skills.id),
           average_rating = COALESCE((SELECT AVG(score) FROM ratings WHERE skill_id = skills.id), 0)
       WHERE id = ?`,
      id,
    )
  },

  recomputeComments(id: string): void {
    query.run(
      `UPDATE skills SET comments_count =
         (SELECT COUNT(*) FROM comments WHERE skill_id = skills.id AND soft_deleted_at IS NULL)
       WHERE id = ?`,
      id,
    )
  },

  incrementComments(id: string, delta: number): void {
    query.run(
      'UPDATE skills SET comments_count = MAX(0, comments_count + ?) WHERE id = ?',
      delta,
      id,
    )
  },

  /** Skill counts per namespace — used by the personal-namespace bootstrap. */
  countByNamespace(namespaceId: string): number {
    return asNumber(
      query.get<Row>(
        'SELECT COUNT(*) AS c FROM skills WHERE namespace_id = ? AND soft_deleted_at IS NULL',
        namespaceId,
      )?.c,
    )
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill versions
// ─────────────────────────────────────────────────────────────────────────────

export const versions = {
  create(input: {
    skillId: string
    version: string
    fingerprint: string
    changelog?: string | null
    files: VersionFile[]
    parsed: Record<string, unknown>
    createdBy: string
    dependencies: SkillDependency[]
    signatureBundle?: string | null
    signatureStatus: SkillVersion['signatureStatus']
    createdAt?: string
  }): SkillVersion {
    const id = newId()
    const now = input.createdAt ?? nowIso()
    query.run(
      `INSERT INTO skill_versions
        (id, skill_id, version, fingerprint, changelog, files, parsed, created_by, sha256_hash,
         created_at, dependencies, signature_bundle, signature_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.skillId,
      input.version,
      input.fingerprint,
      input.changelog ?? null,
      JSON.stringify(input.files),
      JSON.stringify(input.parsed),
      input.createdBy,
      input.fingerprint,
      now,
      JSON.stringify(input.dependencies),
      input.signatureBundle ?? null,
      input.signatureStatus,
    )
    return versions.getById(id)!
  },

  getById(id: string): SkillVersion | null {
    const row = query.get<Row>('SELECT * FROM skill_versions WHERE id = ?', id)
    return row ? mapVersion(row) : null
  },

  /** Requires `soft_deleted_at IS NULL`. */
  getBySkillAndVersion(skillId: string, version: string): SkillVersion | null {
    const row = query.get<Row>(
      'SELECT * FROM skill_versions WHERE skill_id = ? AND version = ? AND soft_deleted_at IS NULL',
      skillId,
      version,
    )
    return row ? mapVersion(row) : null
  },

  getByFingerprint(fingerprint: string): SkillVersion | null {
    const row = query.get<Row>('SELECT * FROM skill_versions WHERE fingerprint = ? LIMIT 1', fingerprint)
    return row ? mapVersion(row) : null
  },

  /** Version history, newest first. */
  listBySkill(skillId: string): SkillVersion[] {
    return query
      .all<Row>(
        'SELECT * FROM skill_versions WHERE skill_id = ? AND soft_deleted_at IS NULL ORDER BY created_at DESC',
        skillId,
      )
      .map(mapVersion)
  },

  /** Newest version by `created_at` — **no** yank filter. Used for pub ordering. */
  getLatest(skillId: string): SkillVersion | null {
    const row = query.get<Row>(
      `SELECT * FROM skill_versions
       WHERE skill_id = ? AND soft_deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      skillId,
    )
    return row ? mapVersion(row) : null
  },

  /** Newest non-yanked version — the repoint target after a yank. */
  getLatestNonYanked(skillId: string): SkillVersion | null {
    const row = query.get<Row>(
      `SELECT * FROM skill_versions
       WHERE skill_id = ? AND soft_deleted_at IS NULL AND yanked_at IS NULL
       ORDER BY created_at DESC LIMIT 1`,
      skillId,
    )
    return row ? mapVersion(row) : null
  },

  exists(skillId: string, version: string): boolean {
    return (
      query.get<Row>(
        'SELECT 1 AS x FROM skill_versions WHERE skill_id = ? AND version = ?',
        skillId,
        version,
      ) !== undefined
    )
  },

  setYanked(id: string, yanked: boolean, reason?: string | null): void {
    if (yanked) {
      query.run('UPDATE skill_versions SET yanked_at = ?, yank_reason = ? WHERE id = ?', nowIso(), reason ?? null, id)
    } else {
      query.run('UPDATE skill_versions SET yanked_at = NULL, yank_reason = NULL WHERE id = ?', id)
    }
  },

  setDeprecated(id: string, deprecated: boolean, message?: string | null): void {
    if (deprecated) {
      query.run(
        'UPDATE skill_versions SET deprecated_at = ?, deprecation_message = ? WHERE id = ?',
        nowIso(),
        message ?? null,
        id,
      )
    } else {
      query.run(
        'UPDATE skill_versions SET deprecated_at = NULL, deprecation_message = NULL WHERE id = ?',
        id,
      )
    }
  },
}

// ── version file bytes (SQLite replacement for the git store) ────────────────

export interface StoredFile {
  path: string
  content: Uint8Array
}

export const versionFiles = {
  insertMany(versionId: string, files: Array<{ path: string; content: Uint8Array; contentType: string }>): void {
    const stmt = query.stmt(
      `INSERT OR REPLACE INTO skill_version_files
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
          // Recomputes the digest so the stored value always matches the bytes.
          crypto.createHash('sha256').update(f.content).digest('hex'),
          f.contentType,
          f.content,
        )
      })
    })
  },

  /** Files of a version, ordered by insertion sequence. */
  listPaths(versionId: string): Array<{ path: string; size: number; contentType: string }> {
    return query
      .all<Row>(
        'SELECT path, size, content_type FROM skill_version_files WHERE version_id = ? ORDER BY seq',
        versionId,
      )
      .map((r) => ({
        path: asString(r.path),
        size: asNumber(r.size),
        contentType: asString(r.content_type),
      }))
  },

  /** Raw bytes of one file, or `null` when the path is not in this version. */
  get(versionId: string, path: string): Uint8Array | null {
    const row = query.get<Row>(
      'SELECT content FROM skill_version_files WHERE version_id = ? AND path = ?',
      versionId,
      path,
    )
    if (!row || row.content == null) return null
    return toBytes(row.content)
  },

  listAll(versionId: string): StoredFile[] {
    return query
      .all<Row>(
        'SELECT path, content FROM skill_version_files WHERE version_id = ? ORDER BY seq',
        versionId,
      )
      .map((r) => ({ path: asString(r.path), content: toBytes(r.content) }))
  },

  has(versionId: string, path: string): boolean {
    return (
      query.get<Row>(
        'SELECT 1 AS x FROM skill_version_files WHERE version_id = ? AND path = ?',
        versionId,
        path,
      ) !== undefined
    )
  },
}

/** SQLite BLOBs arrive as `Uint8Array`; guard against drivers handing back Buffers/strings. */
function toBytes(v: unknown): Uint8Array {
  if (v instanceof Uint8Array) return v
  if (typeof v === 'string') return new TextEncoder().encode(v)
  return new Uint8Array(0)
}

// ─────────────────────────────────────────────────────────────────────────────
// Stars
// ─────────────────────────────────────────────────────────────────────────────

export const stars = {
  add(userId: string, skillId: string): boolean {
    const result = query.run(
      'INSERT OR IGNORE INTO stars (id, user_id, skill_id, created_at) VALUES (?, ?, ?, ?)',
      newId(),
      userId,
      skillId,
      nowIso(),
    )
    return Number(result.changes ?? 0) > 0
  },

  remove(userId: string, skillId: string): boolean {
    const result = query.run('DELETE FROM stars WHERE user_id = ? AND skill_id = ?', userId, skillId)
    return Number(result.changes ?? 0) > 0
  },

  has(userId: string, skillId: string): boolean {
    return (
      query.get<Row>('SELECT 1 AS x FROM stars WHERE user_id = ? AND skill_id = ?', userId, skillId) !==
      undefined
    )
  },

  count(skillId: string): number {
    return asNumber(query.get<Row>('SELECT COUNT(*) AS c FROM stars WHERE skill_id = ?', skillId)?.c)
  },

  /**
   * Which of `skillIds` the user has starred — one query for a whole page, so
   * list responses can carry a `starred` flag without an N+1.
   */
  starredIdSet(userId: string, skillIds: string[]): Set<string> {
    if (skillIds.length === 0) return new Set()
    const placeholders = skillIds.map(() => '?').join(', ')
    const rows = query.all<Row>(
      `SELECT skill_id FROM stars WHERE user_id = ? AND skill_id IN (${placeholders})`,
      userId,
      ...skillIds,
    )
    return new Set(rows.map((r) => asString(r.skill_id)))
  },

  /**
   * A user's starred skills, most recently starred first.
   *
   * The cursor is a `stars` row id, not a skill id, because the ordering column
   * lives on the join table. Soft-deleted skills are skipped, and the same
   * listing rule as the catalogue listing applies — a skill that has since
   * gone off the shelf drops out of the collection rather than leaking to the viewer.
   *
   * Both ordering keys are DESC so the row-value `<` comparator used for the
   * cursor means exactly "comes later in this order" — mixing directions would
   * silently drop rows whose timestamps tie.
   */
  listByUser(
    userId: string,
    opts: { limit: number; cursor: string; viewer: Viewer | null },
  ): { data: SkillWithOwner[]; nextCursor: string } {
    const where: string[] = ['st.user_id = ?', 's.soft_deleted_at IS NULL']
    const params: unknown[] = [userId]

    const vis = listingClause(opts.viewer)
    if (vis.sql) {
      where.push(vis.sql.replace(/^ AND /, ''))
      params.push(...vis.params)
    }

    if (opts.cursor) {
      where.push(
        '(st.created_at, st.id) < (SELECT created_at, id FROM stars WHERE id = ?)',
      )
      params.push(opts.cursor)
    }

    const rows = query.all<Row>(
      `SELECT s.*, st.id AS star_id,
              u.handle       AS owner_handle,
              u.display_name AS owner_display_name,
              u.avatar_url   AS owner_avatar_url,
              n.slug         AS namespace_slug
       FROM stars st
       JOIN skills s     ON s.id = st.skill_id
       JOIN users u      ON u.id = s.owner_id
       LEFT JOIN namespaces n ON n.id = s.namespace_id
       WHERE ${where.join(' AND ')}
       ORDER BY st.created_at DESC, st.id DESC
       LIMIT ?`,
      ...params,
      opts.limit + 1,
    )

    const items = rows.slice(0, opts.limit).map(mapSkillWithOwner)
    // The cursor is the *last* row actually returned, so the next page resumes
    // strictly after it. (The catalogue listing parks the cursor on the first
    // unreturned row instead — harmless there, since the web client paginates
    // by growing `limit` and never replays a cursor.)
    const nextCursor = rows.length > opts.limit ? asString(rows[opts.limit - 1].star_id) : ''
    return { data: items, nextCursor }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Ratings
// ─────────────────────────────────────────────────────────────────────────────

function mapRating(r: Row): RatingWithUser {
  return {
    id: asString(r.id),
    skillId: asString(r.skill_id),
    userId: asString(r.user_id),
    score: asNumber(r.score),
    ...(r.comment != null ? { comment: asString(r.comment) } : {}),
    createdAt: asString(r.created_at),
    updatedAt: asString(r.updated_at),
    handle: asString(r.handle),
    ...(r.display_name != null ? { displayName: asString(r.display_name) } : {}),
  }
}

export const ratings = {
  /** Upsert on `(skill_id, user_id)`. */
  upsert(skillId: string, userId: string, score: number, comment?: string | null): void {
    const existing = query.get<Row>(
      'SELECT id FROM ratings WHERE skill_id = ? AND user_id = ?',
      skillId,
      userId,
    )
    if (existing) {
      query.run(
        'UPDATE ratings SET score = ?, comment = ?, updated_at = ? WHERE id = ?',
        score,
        comment ?? null,
        nowIso(),
        asString(existing.id),
      )
      return
    }
    query.run(
      `INSERT INTO ratings (id, skill_id, user_id, score, comment, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      newId(),
      skillId,
      userId,
      score,
      comment ?? null,
      nowIso(),
      nowIso(),
    )
  },

  delete(skillId: string, userId: string): boolean {
    const result = query.run('DELETE FROM ratings WHERE skill_id = ? AND user_id = ?', skillId, userId)
    return Number(result.changes ?? 0) > 0
  },

  list(
    skillId: string,
    limit: number,
    cursor: string,
  ): { data: RatingWithUser[]; nextCursor: string } {
    const effective = limit <= 0 || limit > 100 ? 20 : limit
    const rows = cursor
      ? query.all<Row>(
          `SELECT r.*, u.handle AS handle, u.display_name AS display_name
           FROM ratings r JOIN users u ON u.id = r.user_id
           WHERE r.skill_id = ? AND r.id < ?
           ORDER BY r.created_at DESC, r.id DESC LIMIT ?`,
          skillId,
          cursor,
          effective + 1,
        )
      : query.all<Row>(
          `SELECT r.*, u.handle AS handle, u.display_name AS display_name
           FROM ratings r JOIN users u ON u.id = r.user_id
           WHERE r.skill_id = ?
           ORDER BY r.created_at DESC, r.id DESC LIMIT ?`,
          skillId,
          effective + 1,
        )
    const items = rows.map(mapRating)
    const nextCursor = items.length > effective ? items[effective].id : ''
    return { data: items.slice(0, effective), nextCursor }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Comments
// ─────────────────────────────────────────────────────────────────────────────

function mapComment(r: Row): CommentWithUser {
  return {
    id: asString(r.id),
    skillId: asString(r.skill_id),
    userId: asString(r.user_id),
    body: asString(r.body),
    createdAt: asString(r.created_at),
    updatedAt: asString(r.updated_at),
    ...(r.soft_deleted_at != null ? { softDeletedAt: asString(r.soft_deleted_at) } : {}),
    handle: asString(r.handle),
    ...(r.display_name != null ? { displayName: asString(r.display_name) } : {}),
    ...(r.avatar_url != null ? { avatarUrl: asString(r.avatar_url) } : {}),
  }
}

export const comments = {
  create(skillId: string, userId: string, body: string): CommentWithUser {
    const id = newId()
    const now = nowIso()
    query.run(
      `INSERT INTO comments (id, skill_id, user_id, body, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      id,
      skillId,
      userId,
      body,
      now,
      now,
    )
    query.run('UPDATE skills SET comments_count = comments_count + 1 WHERE id = ?', skillId)
    return comments.getById(id)!
  },

  getById(id: string): CommentWithUser | null {
    const row = query.get<Row>(
      `SELECT c.*, u.handle AS handle, u.display_name AS display_name, u.avatar_url AS avatar_url
       FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.id = ?`,
      id,
    )
    return row ? mapComment(row) : null
  },

  list(
    skillId: string,
    limit: number,
    cursor: string,
  ): { data: CommentWithUser[]; nextCursor: string } {
    const effective = limit <= 0 || limit > 100 ? 20 : limit
    const rows = cursor
      ? query.all<Row>(
          `SELECT c.*, u.handle AS handle, u.display_name AS display_name, u.avatar_url AS avatar_url
           FROM comments c JOIN users u ON u.id = c.user_id
           WHERE c.skill_id = ? AND c.soft_deleted_at IS NULL
             AND (c.created_at, c.id) < (SELECT created_at, id FROM comments WHERE id = ?)
           ORDER BY c.created_at DESC, c.id DESC LIMIT ?`,
          skillId,
          cursor,
          effective + 1,
        )
      : query.all<Row>(
          `SELECT c.*, u.handle AS handle, u.display_name AS display_name, u.avatar_url AS avatar_url
           FROM comments c JOIN users u ON u.id = c.user_id
           WHERE c.skill_id = ? AND c.soft_deleted_at IS NULL
           ORDER BY c.created_at DESC, c.id DESC LIMIT ?`,
          skillId,
          effective + 1,
        )
    const items = rows.map(mapComment)
    const nextCursor = items.length > effective ? items[effective].id : ''
    return { data: items.slice(0, effective), nextCursor }
  },

  softDelete(id: string): void {
    query.run('UPDATE comments SET soft_deleted_at = ? WHERE id = ?', nowIso(), id)
  },

  /** Current comment count for a skill, used to keep the counter honest. */
  recount(skillId: string): number {
    return asNumber(
      query.get<Row>(
        'SELECT COUNT(*) AS c FROM comments WHERE skill_id = ? AND soft_deleted_at IS NULL',
        skillId,
      )?.c,
    )
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Download de-duplication
// ─────────────────────────────────────────────────────────────────────────────

export const downloadDedupes = {
  /**
   * Records a download by identity. Returns `true` when this identity has not
   * downloaded this version before — only then should the counter be bumped.
   */
  record(skillId: string, versionId: string, identityHash: string): boolean {
    if (identityHash === '') return false
    const result = query.run(
      `INSERT OR IGNORE INTO download_dedupes (id, skill_id, version_id, identity_hash, downloaded_at)
       VALUES (?, ?, ?, ?, ?)`,
      newId(),
      skillId,
      versionId,
      identityHash,
      nowIso(),
    )
    return Number(result.changes ?? 0) > 0
  },
}
