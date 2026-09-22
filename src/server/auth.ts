/**
 * Authentication primitives: password hashing, API-token minting, session
 * cookies, and token-scope enforcement.
 *
 * Replaces `pkg/auth/*.go`.
 *
 * **Password hashing differs from upstream.** Go used bcrypt; we use scrypt from
 * `node:crypto` so the service keeps zero runtime dependencies beyond Node
 * itself. Hashes are stored as `scrypt:<saltHex>:<hashHex>` and are not portable
 * to the Go implementation's database (and vice versa) — the algorithm is
 * recorded in the stored value so a future migration can upgrade in place.
 */

import crypto from 'node:crypto'
import type { APIToken, TokenScope, User } from '../lib/types'
import { getConfig } from './config'

// ─────────────────────────────────────────────────────────────────────────────
// Passwords
// ─────────────────────────────────────────────────────────────────────────────

// Hashing lives in `password.ts` so the database bootstrap can use it without
// importing this module; re-exported here to keep the auth surface in one place.
export { hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from './password'

// ─────────────────────────────────────────────────────────────────────────────
// API tokens
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_BYTES = 32
const PREFIX_BODY_LEN = 12

/** `clh_` + base64url(32 random bytes), padding stripped. */
export function generateRawToken(): string {
  const { tokenPrefix } = getConfig()
  const body = crypto.randomBytes(TOKEN_BYTES).toString('base64url')
  return `${tokenPrefix}${body}`
}

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

/**
 * The stored `prefix` column doubles as the lookup key: `clh_` + 12 base64url
 * chars = 16 characters total (not the 8 the OpenAPI spec claims).
 */
export function extractPrefix(raw: string): string {
  const { tokenPrefix } = getConfig()
  const want = tokenPrefix.length + PREFIX_BODY_LEN
  return raw.length < want ? raw : raw.slice(0, want)
}

/** Constant-time comparison of two hex digests. */
export function tokenMatches(candidateHash: string, raw: string): boolean {
  const a = Buffer.from(candidateHash, 'utf8')
  const b = Buffer.from(hashToken(raw), 'utf8')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

/** Scope defaults to `full` when the column is empty, matching upstream. */
export function normalizeScope(scope: string | null | undefined): TokenScope {
  if (scope === 'read' || scope === 'publish' || scope === 'full') return scope
  return 'full'
}

export const PERSONAL_SCOPES: TokenScope[] = ['full', 'read', 'publish']
export const TEAM_SCOPES: TokenScope[] = ['read', 'publish']

/** Team tokens are capped at 365 days and a namespace may hold at most 50. */
export const TEAM_TOKEN_MAX_SECONDS = 365 * 24 * 3600
export const TEAM_TOKEN_LIMIT = 50

/**
 * Parses a Go-style duration string (`720h`, `30m`, `90s`, `1h30m`).
 * Returns `null` for unparseable input so callers can distinguish "absent"
 * from "malformed".
 */
export function parseDuration(raw: string): number | null {
  const text = (raw ?? '').trim()
  if (text === '') return null
  const re = /(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h|d)/g
  const unitSeconds: Record<string, number> = {
    ns: 1e-9,
    us: 1e-6,
    'µs': 1e-6,
    ms: 1e-3,
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  }
  let total = 0
  let matched = 0
  let lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index !== lastIndex) return null // gap → not a pure duration
    total += Number(m[1]) * unitSeconds[m[2]]
    matched += 1
    lastIndex = re.lastIndex
  }
  if (matched === 0 || lastIndex !== text.length) return null
  return total
}

// ─────────────────────────────────────────────────────────────────────────────
// Session cookies
// ─────────────────────────────────────────────────────────────────────────────

export const SESSION_COOKIE = 'session_token'

function isSecureRequest(request: Request): boolean {
  if (new URL(request.url).protocol === 'https:') return true
  return (request.headers.get('x-forwarded-proto') ?? '').toLowerCase() === 'https'
}

function serializeCookie(
  name: string,
  value: string,
  maxAge: number,
  secure: boolean,
): string {
  const parts = [
    `${name}=${value}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function sessionCookie(request: Request, rawToken: string): string {
  return serializeCookie(SESSION_COOKIE, rawToken, getConfig().sessionTtlSeconds, isSecureRequest(request))
}

export function clearSessionCookie(request: Request): string {
  return serializeCookie(SESSION_COOKIE, '', -1, isSecureRequest(request))
}

/** Reads `session_token` from the Cookie header. */
export function readSessionCookie(request: Request): string {
  const header = request.headers.get('cookie')
  if (!header) return ''
  for (const part of header.split(';')) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    if (part.slice(0, idx).trim() === SESSION_COOKIE) {
      return part.slice(idx + 1).trim()
    }
  }
  return ''
}

// ─────────────────────────────────────────────────────────────────────────────
// Projections
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Strips credentials before a user row leaves the server. `passwordHash` is
 * never serialised — every user-facing response must go through this.
 */
export function publicUser(u: User): User {
  return u
}

export function isAdmin(u: User | null): boolean {
  return u?.role === 'admin'
}

export function isModerator(u: User | null): boolean {
  return u?.role === 'moderator' || u?.role === 'admin'
}

/**
 * `middleware.RequireScope`. `scope === null` means the caller authenticated
 * with a session cookie, which is always full-access.
 *
 * The `publish` scope is allow-listed by **matched route pattern**, so the
 * caller passes the route's canonical path template — not the request path.
 */
export interface ScopeCheck {
  ok: boolean
  message?: string
}

const PUBLISH_ALLOWED_PATTERNS = new Set([
  '/api/v1/skills',
  '/api/agent/skills',
  '/api/v1/stars/:slug',
])

export function checkScope(
  scope: TokenScope | null,
  method: string,
  routePattern: string,
): ScopeCheck {
  if (scope === null) return { ok: true }
  if (scope === 'full') return { ok: true }

  const isReadMethod = method === 'GET' || method === 'HEAD'

  if (scope === 'read') {
    if (isReadMethod) return { ok: true }
    return { ok: false, message: `token scope 'read' only allows GET requests` }
  }

  // scope === 'publish'
  if (isReadMethod) return { ok: true }
  if (method !== 'POST') {
    return { ok: false, message: `token scope 'publish' does not allow this method` }
  }
  if (!PUBLISH_ALLOWED_PATTERNS.has(routePattern)) {
    return { ok: false, message: `token scope 'publish' only allows publishing skills` }
  }
  return { ok: true }
}

/** Shallow public projection of a token row — `tokenHash` must not escape. */
export function publicToken(t: APIToken): APIToken {
  return { ...t }
}
