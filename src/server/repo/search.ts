/**
 * Full-text search over skills and plugins, backed by SQLite FTS5.
 *
 * Replaces the embedded Bleve index. Design notes:
 *
 * * One virtual table (`search_docs`) holds both document types, keyed by
 *   `doc_id` — the skill UUID for skills, `plugin_<uuid>` for plugins. That
 *   reproduces upstream's Bleve document IDs.
 * * The six leading columns are tokenised; every filter/sort field is
 *   `UNINDEXED`, so `visibility = 'public'` and friends are plain column
 *   comparisons over the matched set rather than index lookups.
 * * `tokenize='trigram'` gives CJK substring matching, which the default
 *   `unicode61` tokenizer cannot do. Trigrams need at least three characters,
 *   so shorter queries fall back to a `LIKE` scan. The fallback also runs when
 *   an FTS query legitimately matches nothing, which keeps short/partial Latin
 *   queries (e.g. `re`) working.
 *
 * Results carry the same field names the Bleve-backed API echoed, so existing
 * consumers do not need to change.
 */

import { asNumber, asString, query, type Row } from '../db'

export interface SearchDoc {
  /** Skill UUID, or `plugin_<uuid>`. */
  docId: string
  docType: 'skill' | 'plugin'
  /** Skill or plugin UUID. */
  targetId: string
  slug: string
  displayName: string
  summary: string
  skillMdContent: string
  tags: string
  ownerHandle: string
  category: string
  namespaceSlug: string
  visibility: string
  moderationStatus: string
  isSuspicious: boolean
  isDeleted: boolean
  downloads: number
  stars: number
  updatedAt: number
  createdAt: number
}

export interface SearchHit {
  id: string
  slug: string
  displayName: string
  summary: string
  /** English variant joined from the source table; `''` when not provided. */
  displayNameEn: string
  summaryEn: string
  skillMdContent: string
  category: string
  tags: string[]
  ownerHandle: string
  ownerHandleExact: string
  namespaceSlug: string
  visibility: string
  moderationStatus: string
  isSuspicious: boolean
  isDeleted: boolean
  downloads: number
  stars: number
  updatedAt: number
  createdAt: number
  /** `plugin` for plugin documents; `skill` otherwise. */
  docType: string
}

export interface SearchResult {
  hits: SearchHit[]
  query: string
  processingTimeMs: number
  estimatedTotalHits: number
}

const FTS_COLUMNS = [
  'slug',
  'display_name',
  'summary',
  'skill_md_content',
  'tags',
  'owner_handle',
] as const

/** Column weights for bm25: name and slug matter most, tags least. */
const BM25_WEIGHTS = [10.0, 8.0, 4.0, 2.0, 3.0, 2.0]

const UNINDEXED_COLUMNS = [
  'doc_id',
  'doc_type',
  'target_id',
  'category',
  'namespace_slug',
  'visibility',
  'moderation_status',
  'is_suspicious',
  'is_deleted',
  'downloads',
  'stars',
  'updated_at',
  'created_at',
] as const

const ALL_COLUMNS = [...FTS_COLUMNS, ...UNINDEXED_COLUMNS]

/**
 * Joins the FTS document to its source table so hits also carry the optional
 * English name/summary. The FTS5 table itself is left untouched (altering an
 * FTS5 table is not supported); English text is read through the join instead.
 */
const HIT_SELECT = /* sql */ `
  SELECT sd.*,
         COALESCE(s.display_name_en, '') AS s_display_name_en,
         COALESCE(s.summary_en, '')      AS s_summary_en,
         COALESCE(p.display_name_en, '') AS p_display_name_en,
         COALESCE(p.summary_en, '')      AS p_summary_en
  FROM search_docs sd
  LEFT JOIN skills  s ON sd.doc_type = 'skill'  AND s.id = sd.target_id
  LEFT JOIN plugins p ON sd.doc_type = 'plugin' AND p.id = sd.target_id
`

function rowToHit(r: Row): SearchHit {
  return {
    id: asString(r.doc_id),
    slug: asString(r.slug),
    displayName: asString(r.display_name),
    summary: asString(r.summary),
    displayNameEn:
      asString(r.doc_type) === 'plugin' ? asString(r.p_display_name_en) : asString(r.s_display_name_en),
    summaryEn:
      asString(r.doc_type) === 'plugin' ? asString(r.p_summary_en) : asString(r.s_summary_en),
    skillMdContent: asString(r.skill_md_content),
    category: asString(r.category),
    tags: asString(r.tags).split(' ').filter(Boolean),
    ownerHandle: asString(r.owner_handle),
    ownerHandleExact: asString(r.owner_handle),
    namespaceSlug: asString(r.namespace_slug),
    visibility: asString(r.visibility),
    moderationStatus: asString(r.moderation_status),
    isSuspicious: asNumber(r.is_suspicious) !== 0,
    isDeleted: asNumber(r.is_deleted) !== 0,
    downloads: asNumber(r.downloads),
    stars: asNumber(r.stars),
    updatedAt: asNumber(r.updated_at),
    createdAt: asNumber(r.created_at),
    docType: asString(r.doc_type) === 'plugin' ? 'plugin' : 'skill',
  }
}

export const searchIndex = {
  /** Upsert by replacing the row — FTS5 tables do not support partial updates. */
  upsert(doc: SearchDoc): void {
    query.run('DELETE FROM search_docs WHERE doc_id = ?', doc.docId)
    query.run(
      `INSERT INTO search_docs (${ALL_COLUMNS.join(', ')})
       VALUES (${ALL_COLUMNS.map(() => '?').join(', ')})`,
      doc.slug,
      doc.displayName,
      doc.summary,
      doc.skillMdContent,
      doc.tags,
      doc.ownerHandle,
      doc.docId,
      doc.docType,
      doc.targetId,
      doc.category,
      doc.namespaceSlug,
      doc.visibility,
      doc.moderationStatus,
      doc.isSuspicious ? 1 : 0,
      doc.isDeleted ? 1 : 0,
      doc.downloads,
      doc.stars,
      doc.updatedAt,
      doc.createdAt,
    )
  },

  deleteByDocId(docId: string): void {
    query.run('DELETE FROM search_docs WHERE doc_id = ?', docId)
  },

  deleteByTarget(targetId: string): void {
    query.run('DELETE FROM search_docs WHERE target_id = ?', targetId)
  },

  count(): number {
    return asNumber(query.get<Row>('SELECT COUNT(*) AS c FROM search_docs')?.c)
  },

  empty(): void {
    query.run('DELETE FROM search_docs')
  },
}

export interface SearchOptions {
  q: string
  limit: number
  offset: number
  /** Single field name with optional `:asc` / `:desc`. Bare field = descending. */
  sort: string
  /** Only `skill` / `plugin` are honoured; anything else is ignored. */
  type: string
  namespace: string
}

/**
 * Escapes a term for use inside an FTS5 string literal. Doubling the quote is
 * the documented escape; no other character is special inside `"..."`.
 */
function ftsPhrase(term: string): string {
  return `"${term.replace(/"/g, '""')}"`
}

/** Builds `"a" AND "b"` for multi-word queries; a single phrase otherwise. */
function buildFtsQuery(q: string): string {
  const terms = q.split(/\s+/).filter((t) => t !== '')
  return terms.map(ftsPhrase).join(' AND ')
}

function sortClause(sort: string, fallback = 'rank'): string {
  const raw = (sort ?? '').trim()
  if (raw === '') return `${fallback} ASC`
  const [fieldRaw, dirRaw] = raw.split(':')
  const field = fieldRaw.trim()
  const allowed: Record<string, string> = {
    downloads: 'downloads',
    stars: 'stars',
    updatedAt: 'updated_at',
    createdAt: 'created_at',
    updated_at: 'updated_at',
    created_at: 'created_at',
    slug: 'slug',
  }
  const column = allowed[field]
  if (!column) return `${fallback} ASC`
  // A bare field means descending, matching upstream.
  const dir = dirRaw !== undefined ? (dirRaw.trim() === 'asc' ? 'ASC' : 'DESC') : 'DESC'
  return `${column} ${dir}`
}

export function search(opts: SearchOptions): SearchResult {
  const started = Date.now()
  const limit = opts.limit > 0 && opts.limit <= 100 ? opts.limit : 20
  const offset = opts.offset >= 0 ? opts.offset : 0

  // Always-applied filters. Columns are qualified because the hit query joins
  // the source tables, which carry same-named columns (`visibility`, …).
  const filters: string[] = [
    "sd.visibility = 'public'",
    "sd.moderation_status = 'approved'",
    'sd.is_deleted = 0',
  ]
  const filterParams: unknown[] = []

  if (opts.type === 'skill' || opts.type === 'plugin') {
    filters.push('sd.doc_type = ?')
    filterParams.push(opts.type)
  }
  if (opts.namespace) {
    filters.push('sd.namespace_slug = ?')
    filterParams.push(opts.namespace)
  }
  const filterSql = filters.join(' AND ')

  const normalized = opts.q.trim()

  // FTS path — only for queries long enough for the trigram tokenizer.
  if (normalized.length >= 3) {
    const ftsQuery = buildFtsQuery(normalized)
    try {
      const rows = query.all<Row>(
        `SELECT sd.*,
           COALESCE(s.display_name_en, '') AS s_display_name_en,
           COALESCE(s.summary_en, '')      AS s_summary_en,
           COALESCE(p.display_name_en, '') AS p_display_name_en,
           COALESCE(p.summary_en, '')      AS p_summary_en,
           bm25(search_docs, ${BM25_WEIGHTS.join(', ')}) AS rank
         FROM search_docs sd
         LEFT JOIN skills  s ON sd.doc_type = 'skill'  AND s.id = sd.target_id
         LEFT JOIN plugins p ON sd.doc_type = 'plugin' AND p.id = sd.target_id
         WHERE sd MATCH ? AND ${filterSql}
         ORDER BY ${sortClause(opts.sort)}
         LIMIT ? OFFSET ?`,
        ftsQuery,
        ...filterParams,
        limit,
        offset,
      )
      if (rows.length > 0) {
        return {
          hits: rows.map(rowToHit),
          query: opts.q,
          processingTimeMs: Date.now() - started,
          estimatedTotalHits: rows.length,
        }
      }
    } catch {
      // A malformed FTS expression must not fail the request — fall through to
      // the LIKE scan, which is always safe.
    }
  }

  // LIKE fallback: short queries (trigram needs >= 3 chars) and FTS misses.
  const like = `%${normalized.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
  const likeSql = `(
    sd.slug LIKE ? ESCAPE '\\' OR sd.display_name LIKE ? ESCAPE '\\' OR sd.summary LIKE ? ESCAPE '\\'
    OR sd.tags LIKE ? ESCAPE '\\' OR sd.owner_handle LIKE ? ESCAPE '\\' OR sd.skill_md_content LIKE ? ESCAPE '\\'
  )`
  const likeParams = [like, like, like, like, like, like]

  const rows = query.all<Row>(
    `${HIT_SELECT}
     WHERE ${filterSql} AND ${likeSql}
     ORDER BY ${sortClause(opts.sort, 'downloads')}
     LIMIT ? OFFSET ?`,
    ...filterParams,
    ...likeParams,
    limit,
    offset,
  )

  return {
    hits: rows.map(rowToHit),
    query: opts.q,
    processingTimeMs: Date.now() - started,
    estimatedTotalHits: rows.length,
  }
}
