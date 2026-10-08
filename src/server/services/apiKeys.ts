/**
 * Admin API keys.
 *
 * A key is a credential for one job — driving the skill catalogue over HTTP —
 * so it carries an explicit capability set instead of inheriting its creator's
 * whole role. Creating, listing and revoking requires `role === 'admin'`
 * (enforced by the route table); using one is narrowed per endpoint in
 * `http.ts`.
 *
 * The raw key is returned at creation and kept alongside its hash, so the admin
 * console can copy a usage sheet for any key in the list rather than only the
 * one that was just minted. Verification still goes through the hash.
 */

import { fail, notFound } from '../errors'
import { nowIso } from '../db'
import { API_KEY_SCOPES } from '../../lib/types'
import type { AdminApiKey, ApiKeyScope } from '../../lib/types'
import { namespaces } from '../repo/core'
import { apiKeys } from '../repo/apiKeys'
import { generateApiKey, hashToken, extractApiKeyPrefix, parseDuration } from '../auth'
import { auditLog } from './shared'

/** Cap on live keys, so a compromised admin session cannot mint without limit. */
export const API_KEY_LIMIT = 100

export function listApiKeys(): AdminApiKey[] {
  return apiKeys.list()
}

export function createApiKey(
  actorId: string,
  input: { name?: string; scopes?: string[]; namespaceSlug?: string; expiresIn?: string },
): { key: string; metadata: AdminApiKey } {
  const name = (input.name ?? '').trim()
  if (name === '') fail('name is required')
  if (name.length > 64) fail('name must be 64 characters or fewer')

  const requested = input.scopes ?? []
  if (!Array.isArray(requested) || requested.length === 0) {
    fail(`scopes must include at least one of: ${API_KEY_SCOPES.join(', ')}`)
  }
  const scopes = requested.filter((s): s is ApiKeyScope => API_KEY_SCOPES.includes(s as ApiKeyScope))
  if (scopes.length !== requested.length) {
    fail(`invalid scope, must be one of: ${API_KEY_SCOPES.join(', ')}`)
  }

  let namespaceId: string | null = null
  const namespaceSlug = (input.namespaceSlug ?? '').trim()
  if (namespaceSlug !== '') {
    const namespace = namespaces.getBySlug(namespaceSlug)
    if (!namespace) notFound(`namespace '${namespaceSlug}' not found`)
    namespaceId = namespace.id
  }

  let expiresAt: string | null = null
  if (input.expiresIn !== undefined && input.expiresIn !== '') {
    const seconds = parseDuration(input.expiresIn)
    if (seconds === null || seconds <= 0) fail('invalid expiresIn duration')
    expiresAt = new Date(Date.now() + seconds * 1000).toISOString()
  }

  const live = apiKeys.list().filter((k) => !k.revokedAt).length
  if (live >= API_KEY_LIMIT) fail(`at most ${API_KEY_LIMIT} active API keys`)

  const raw = generateApiKey()
  const metadata = apiKeys.create({
    name,
    createdBy: actorId,
    namespaceId,
    prefix: extractApiKeyPrefix(raw),
    keyHash: hashToken(raw),
    secret: raw,
    scopes,
    expiresAt,
  })

  auditLog({
    actorId,
    action: 'admin_create_api_key',
    resourceType: 'api_key',
    resourceId: metadata.id,
    details: `name=${name},scopes=${scopes.join('|')}${namespaceSlug ? `,namespace=${namespaceSlug}` : ''}${expiresAt ? `,expiresAt=${expiresAt}` : ''}`,
  })
  return { key: raw, metadata }
}

export function revokeApiKey(actorId: string, id: string): void {
  const existing = apiKeys.getById(id)
  if (!existing) notFound('API key not found')
  if (existing.revokedAt) fail('API key is already revoked')
  apiKeys.revoke(id)
  auditLog({
    actorId,
    action: 'admin_revoke_api_key',
    resourceType: 'api_key',
    resourceId: id,
    details: `name=${existing.name}`,
  })
}

/** Kept so callers can render "expires never" without duplicating the rule. */
export function isExpired(key: AdminApiKey, at = nowIso()): boolean {
  return key.expiresAt !== undefined && Date.parse(key.expiresAt) <= Date.parse(at)
}
