/**
 * SQL for admin-issued API keys.
 *
 * Mirrors the shape of `tokens` in `core.ts`: the only accessor that exposes
 * the stored hash is the prefix lookup used to verify an inbound credential,
 * and every other read returns the public projection. Row → model mapping
 * lives here so the "optional key is absent, not null" rule stays in one place.
 */

import { asString, nowIso, newId, query, type Row } from '../db'
import { API_KEY_SCOPES } from '../../lib/types'
import type { AdminApiKey, ApiKeyScope } from '../../lib/types'

function parseScopes(raw: unknown): ApiKeyScope[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(asString(raw) || '[]')
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  return parsed.filter((s): s is ApiKeyScope => API_KEY_SCOPES.includes(s as ApiKeyScope))
}

function mapKey(r: Row): AdminApiKey {
  return {
    id: asString(r.id),
    name: asString(r.name),
    createdBy: asString(r.created_by),
    ...(r.creator_handle != null ? { createdByHandle: asString(r.creator_handle) } : {}),
    ...(r.namespace_id != null ? { namespaceId: asString(r.namespace_id) } : {}),
    ...(r.namespace_slug != null ? { namespaceSlug: asString(r.namespace_slug) } : {}),
    prefix: asString(r.prefix),
    scopes: parseScopes(r.scopes),
    ...(r.last_used_at != null ? { lastUsedAt: asString(r.last_used_at) } : {}),
    ...(r.expires_at != null ? { expiresAt: asString(r.expires_at) } : {}),
    createdAt: asString(r.created_at),
    ...(r.revoked_at != null ? { revokedAt: asString(r.revoked_at) } : {}),
  }
}

/** Internal shape carrying the hash used for constant-time comparison. */
export interface ApiKeyRecord extends AdminApiKey {
  keyHash: string
}

const SELECT_LIST = `
  SELECT k.*, u.handle AS creator_handle, n.slug AS namespace_slug
  FROM api_keys k
  LEFT JOIN users u ON u.id = k.created_by
  LEFT JOIN namespaces n ON n.id = k.namespace_id
`

export const apiKeys = {
  create(input: {
    name: string
    createdBy: string
    namespaceId?: string | null
    prefix: string
    keyHash: string
    scopes: ApiKeyScope[]
    expiresAt?: string | null
  }): AdminApiKey {
    const id = newId()
    query.run(
      `INSERT INTO api_keys (id, name, created_by, namespace_id, prefix, key_hash, scopes, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.name,
      input.createdBy,
      input.namespaceId ?? null,
      input.prefix,
      input.keyHash,
      JSON.stringify(input.scopes),
      input.expiresAt ?? null,
      nowIso(),
    )
    return apiKeys.getById(id)!
  },

  /** Public projection — never carries `keyHash`. */
  getById(id: string): AdminApiKey | null {
    const row = query.get<Row>(`${SELECT_LIST} WHERE k.id = ?`, id)
    return row ? mapKey(row) : null
  },

  /**
   * The only accessor that exposes `keyHash`, used exclusively to verify an
   * inbound credential. May return several candidates sharing a prefix.
   */
  getByPrefix(prefix: string): ApiKeyRecord[] {
    return query
      .all<Row>(`SELECT k.*, n.slug AS namespace_slug FROM api_keys k LEFT JOIN namespaces n ON n.id = k.namespace_id WHERE k.prefix = ?`, prefix)
      .map((row) => ({ ...mapKey(row), keyHash: asString(row.key_hash) }))
  },

  /** Admin listing, newest first. Revoked keys are kept for the audit trail. */
  list(): AdminApiKey[] {
    return query.all<Row>(`${SELECT_LIST} ORDER BY k.created_at DESC, k.id DESC`).map(mapKey)
  },

  listByCreator(userId: string): AdminApiKey[] {
    return query
      .all<Row>(`${SELECT_LIST} WHERE k.created_by = ? ORDER BY k.created_at DESC`, userId)
      .map(mapKey)
  },

  revoke(id: string): void {
    query.run('UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL', nowIso(), id)
  },

  touchLastUsed(id: string): void {
    query.run('UPDATE api_keys SET last_used_at = ? WHERE id = ?', nowIso(), id)
  },
}
