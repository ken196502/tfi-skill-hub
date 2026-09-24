/**
 * HTTP plumbing: route table compilation, request context, identity
 * resolution, rate limiting and the shared response envelope.
 *
 * The Go service used Gin's router. Rather than lean on TanStack's file-based
 * server routes for ~90 endpoints — several of which share a path across
 * methods and use an `@namespace` segment that fights file naming — the API is
 * exposed through a single catch-all server route that dispatches through the
 * explicit table built here.
 *
 * Route patterns use the same syntax as the original registration code
 * (`/api/v1/skills/@:namespace/:slug`), so the table can be diffed against
 * `pkg/server/routes.go` by eye.
 */

import { getConfig } from './config'
import {
  clearSessionCookie,
  extractPrefix,
  extractApiKeyPrefix,
  isApiKey,
  normalizeScope,
  readSessionCookie,
  tokenMatches,
} from './auth'
import { tokens, users, type UserRecord } from './repo/core'
import { apiKeys } from './repo/apiKeys'
import type { ApiKeyScope, TokenScope } from '../lib/types'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD'
export type RateBucket = 'read' | 'write' | 'download' | 'none'
export type AuthLevel = 'public' | 'optional' | 'required' | 'admin'

/** Set only when the caller authenticated with an admin API key. */
export interface ApiKeyIdentity {
  id: string
  scopes: ApiKeyScope[]
  namespaceId: string | null
}

export interface RequestContext {
  request: Request
  url: URL
  /** `:param` and `@:param` captures from the matched pattern. */
  params: Record<string, string>
  /** The matched pattern, e.g. `/api/v1/skills/:slug`. */
  pattern: string
  /** Authenticated user, or `null` for anonymous access. */
  user: UserRecord | null
  /** `null` when authenticated by session cookie (always full access). */
  tokenScope: TokenScope | null
  /** Set only for team (namespace-bound) tokens. */
  tokenNamespaceId: string | null
  /**
   * Admin API key the request was made with, if any. A key acts as its creator
   * but is additionally narrowed to the endpoints its scopes cover.
   */
  apiKey: ApiKeyIdentity | null
  clientIp: string
  requestId: string
}

export type Handler = (ctx: RequestContext) => Promise<Response> | Response

export interface RouteDef {
  method: HttpMethod
  path: string
  handler: Handler
  bucket?: RateBucket
  auth?: AuthLevel
  /**
   * Capability an admin API key must hold to call this route. Routes without
   * one reject every API key, which keeps a key scoped to the job it was
   * minted for rather than to its creator's whole role.
   */
  apiKeyScope?: ApiKeyScope
  /** Adds `Deprecation: true` + `Sunset: <date>` headers. */
  deprecate?: string
}

interface CompiledRoute extends RouteDef {
  regex: RegExp
  paramNames: string[]
  specificity: number
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern compilation & matching
// ─────────────────────────────────────────────────────────────────────────────

const escapeRegex = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function compile(route: RouteDef): CompiledRoute {
  const segments = route.path.split('/').filter((s) => s !== '')
  const parts: string[] = []
  const paramNames: string[] = []
  let specificity = 0

  for (const seg of segments) {
    if (seg.startsWith('@:')) {
      // Literal `@` followed by a capture — gin's `@:namespace` syntax.
      paramNames.push(seg.slice(2))
      parts.push('@([^/]+)')
      specificity += 1
    } else if (seg.startsWith(':')) {
      paramNames.push(seg.slice(1))
      parts.push('([^/]+)')
    } else {
      parts.push(escapeRegex(seg))
      specificity += 10 + seg.length
    }
  }

  return {
    ...route,
    regex: new RegExp(`^/${parts.join('/')}/?$`),
    paramNames,
    specificity,
  }
}

/**
 * Routes are tried most-specific first so that, for example,
 * `/api/v1/plugins/by-id/:id` wins over `/api/v1/plugins/:slug`.
 * This mirrors httprouter's static-before-param priority.
 */
export function compileRoutes(defs: RouteDef[]): CompiledRoute[] {
  return defs
    .map(compile)
    .sort((a, b) => {
      if (a.specificity !== b.specificity) return b.specificity - a.specificity
      return a.paramNames.length - b.paramNames.length
    })
}

function matchRoute(routes: CompiledRoute[], method: string, pathname: string): {
  route: CompiledRoute
  params: Record<string, string>
} | null {
  for (const route of routes) {
    if (route.method !== method) continue
    const m = route.regex.exec(pathname)
    if (!m) continue
    const params: Record<string, string> = {}
    route.paramNames.forEach((name, i) => {
      params[name] = decodeURIComponent(m[i + 1] ?? '')
    })
    return { route, params }
  }
  return null
}

// ─────────────────────────────────────────────────────────────────────────────
// Request metadata
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Best-effort client IP. A Web `Request` carries no socket, so this reads the
 * usual proxy headers. Deployments that terminate TLS elsewhere should make
 * sure those headers are set; otherwise every client shares one bucket.
 */
export function clientIpOf(request: Request): string {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const real = request.headers.get('x-real-ip')
  if (real) return real.trim()
  return 'unknown'
}

export function requestIdOf(request: Request): string {
  const inbound = request.headers.get('x-request-id')
  if (inbound && inbound.trim() !== '') return inbound.trim()
  return crypto.randomUUID()
}

// ─────────────────────────────────────────────────────────────────────────────
// Rate limiting
// ─────────────────────────────────────────────────────────────────────────────

interface BucketState {
  count: number
  resetAt: number
}

const buckets = new Map<string, BucketState>()

const BUCKET_LIMITS: Record<Exclude<RateBucket, 'none'>, () => { limit: number; window: number }> = {
  read: () => {
    const r = getConfig().rateLimit
    return { limit: r.readLimit, window: r.readWindow }
  },
  write: () => {
    const r = getConfig().rateLimit
    return { limit: r.writeLimit, window: r.writeWindow }
  },
  download: () => {
    const r = getConfig().rateLimit
    return { limit: r.downloadLimit, window: r.downloadWindow }
  },
}

interface RateVerdict {
  allowed: boolean
  limit: number
  remaining: number
  resetAt: number
  retryAfter: number
}

function checkRate(bucket: Exclude<RateBucket, 'none'>, key: string): RateVerdict {
  const { limit, window } = BUCKET_LIMITS[bucket]()
  const nowMs = Date.now()
  const composite = `${key}:${bucket}:${limit}`
  let state = buckets.get(composite)

  if (!state || nowMs >= state.resetAt) {
    state = { count: 0, resetAt: nowMs + window * 1000 }
    buckets.set(composite, state)
  }
  state.count += 1

  const resetAt = Math.floor(state.resetAt / 1000)
  if (state.count > limit) {
    return {
      allowed: false,
      limit,
      remaining: 0,
      resetAt,
      retryAfter: Math.max(1, Math.ceil((state.resetAt - nowMs) / 1000)),
    }
  }
  return { allowed: true, limit, remaining: limit - state.count, resetAt, retryAfter: 0 }
}

/** Housekeeping so a long-lived process does not accumulate dead buckets. */
function sweepBuckets(): void {
  const nowMs = Date.now()
  for (const [key, state] of buckets) {
    if (nowMs >= state.resetAt) buckets.delete(key)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Identity resolution
// ─────────────────────────────────────────────────────────────────────────────

export interface Identity {
  user: UserRecord | null
  scope: TokenScope | null
  namespaceId: string | null
  apiKey: ApiKeyIdentity | null
}

const ANONYMOUS: Identity = { user: null, scope: null, namespaceId: null, apiKey: null }

/**
 * Resolution order: `Authorization: Bearer` first, then the `session_token`
 * cookie. The first source yielding a usable user wins. Banned users and
 * missing users are treated as anonymous, and DB problems never surface as
 * 500s on read paths.
 */
export function resolveIdentity(request: Request): Identity {
  const header = request.headers.get('authorization') ?? ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : header && !header.includes(' ') ? '' : ''
  const candidates: string[] = []
  if (bearer.trim() !== '') candidates.push(bearer.trim())
  const cookie = readSessionCookie(request)
  if (cookie !== '') candidates.push(cookie)

  for (const raw of candidates) {
    const identity = authenticate(raw)
    if (identity.user) return identity
  }
  return ANONYMOUS
}

function authenticate(raw: string): Identity {
  try {
    return isApiKey(raw) ? authenticateApiKey(raw) : authenticateToken(raw)
  } catch {
    // Any lookup failure is simply "unauthenticated".
  }
  return ANONYMOUS
}

function authenticateToken(raw: string): Identity {
  const prefix = extractPrefix(raw)
  const rows = tokens.getByPrefix(prefix)
  for (const row of rows) {
    if (!tokenMatches(row.tokenHash, raw)) continue
    if (row.expiresAt && Date.parse(row.expiresAt) <= Date.now()) continue

    const user = users.getById(row.userId)
    if (!user || user.isBanned) return ANONYMOUS

    tokens.touchLastUsed(row.id)
    return {
      user,
      scope: normalizeScope(row.scope),
      namespaceId: row.namespaceId ?? null,
      apiKey: null,
    }
  }
  return ANONYMOUS
}

/**
 * An API key acts as the admin who minted it — but only while that admin still
 * is one: demoting or banning the creator invalidates every key it issued, so
 * a key can never outlive the authority it was granted under.
 */
function authenticateApiKey(raw: string): Identity {
  const rows = apiKeys.getByPrefix(extractApiKeyPrefix(raw))
  for (const row of rows) {
    if (!tokenMatches(row.keyHash, raw)) continue
    if (row.revokedAt) return ANONYMOUS
    if (row.expiresAt && Date.parse(row.expiresAt) <= Date.now()) return ANONYMOUS

    const user = users.getById(row.createdBy)
    if (!user || user.isBanned || user.role !== 'admin') return ANONYMOUS

    const namespaceId = row.namespaceId ?? null
    apiKeys.touchLastUsed(row.id)
    return {
      user,
      scope: null,
      namespaceId,
      apiKey: { id: row.id, scopes: row.scopes, namespaceId },
    }
  }
  return ANONYMOUS
}

// ─────────────────────────────────────────────────────────────────────────────
// Responses
// ─────────────────────────────────────────────────────────────────────────────

const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '0',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
}

/**
 * Applies the security header set to a response. Called for every response the
 * dispatcher produces, so a short-circuiting 401/403/429 is covered too.
 */
export function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) headers.set(k, v)
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

export function json(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    ...extraHeaders,
  }
  return new Response(JSON.stringify(data), { status, headers })
}

export function text(body: string, status = 200, contentType = 'text/plain; charset=utf-8'): Response {
  return new Response(body, { status, headers: { 'Content-Type': contentType } })
}

export function empty(status = 204, extraHeaders?: Record<string, string>): Response {
  return new Response(null, { status, headers: extraHeaders })
}

/** Registry v1 error shape. */
export function errorJson(message: string, status: number): Response {
  return json({ error: message }, status)
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatch
// ─────────────────────────────────────────────────────────────────────────────

export interface DispatchResult {
  response: Response
  matched: boolean
}

/**
 * Matches and executes a request against the route table.
 *
 * Ordering of checks mirrors the original middleware stack: identity is
 * resolved for every request (equivalent to `OptionalAuth`), then the rate
 * limit, then scope, then role — so a rate-limited anonymous request reports
 * 429 rather than 403.
 */
export async function dispatch(
  routes: CompiledRoute[],
  request: Request,
  options: { unknownPathBody?: string } = {},
): Promise<DispatchResult> {
  const url = new URL(request.url)
  const match = matchRoute(routes, request.method, url.pathname)

  if (!match) {
    return {
      matched: false,
      response: withSecurityHeaders(errorJson(options.unknownPathBody ?? 'not found', 404)),
    }
  }

  const { route, params } = match
  const identity = route.auth === 'public' ? ANONYMOUS : resolveIdentity(request)
  const requestId = requestIdOf(request)
  const clientIp = clientIpOf(request)

  const baseHeaders: Record<string, string> = { 'X-Request-Id': requestId }
  if (getConfig().runId) baseHeaders['X-Run-Id'] = getConfig().runId
  if (route.deprecate) {
    baseHeaders['Deprecation'] = 'true'
    baseHeaders['Sunset'] = route.deprecate
  }

  // Rate limiting.
  const bucket = route.bucket ?? 'none'
  if (bucket !== 'none') {
    if (buckets.size > 5000) sweepBuckets()
    const verdict = checkRate(bucket, clientIp)
    baseHeaders['RateLimit-Limit'] = String(verdict.limit)
    baseHeaders['RateLimit-Remaining'] = String(verdict.remaining)
    baseHeaders['RateLimit-Reset'] = String(verdict.resetAt)
    if (!verdict.allowed) {
      return {
        matched: true,
        response: withSecurityHeaders(
          json({ error: 'rate limit exceeded' }, 429, {
            ...baseHeaders,
            'Retry-After': String(verdict.retryAfter),
          }),
        ),
      }
    }
  }

  // Authentication.
  if ((route.auth === 'required' || route.auth === 'admin') && !identity.user) {
    return {
      matched: true,
      response: withSecurityHeaders(json({ error: 'authentication required' }, 401, baseHeaders)),
    }
  }
  if (route.auth === 'admin') {
    if (identity.user?.role !== 'admin') {
      return {
        matched: true,
        response: withSecurityHeaders(json({ error: 'insufficient permissions' }, 403, baseHeaders)),
      }
    }
  }

  // API-key callers are narrowed to the endpoints their scopes cover. The check
  // sits after authentication so a revoked or expired key still reports 401.
  if (identity.apiKey) {
    const required = route.apiKeyScope
    if (!required || !identity.apiKey.scopes.includes(required)) {
      return {
        matched: true,
        response: withSecurityHeaders(
          json({ error: 'this API key is not allowed for this endpoint' }, 403, baseHeaders),
        ),
      }
    }
  }

  const ctx: RequestContext = {
    request,
    url,
    params,
    pattern: route.path,
    user: identity.user,
    tokenScope: identity.scope,
    tokenNamespaceId: identity.namespaceId,
    apiKey: identity.apiKey,
    clientIp,
    requestId,
  }

  let response: Response
  try {
    response = await route.handler(ctx)
  } catch (e) {
    // Unhandled errors must not leak internals; details stay in the log.
    console.error(`[skillhub] unhandled error in ${request.method} ${route.path}:`, e)
    response = json({ error: 'internal error' }, 500, baseHeaders)
  }

  // Route-specific headers (ETag, Content-Disposition, cookies) win over the
  // dispatcher's defaults; security headers are applied last, unconditionally.
  const merged = new Headers(response.headers)
  for (const [k, v] of Object.entries(baseHeaders)) {
    if (!merged.has(k)) merged.set(k, v)
  }
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) merged.set(k, v)
  return {
    matched: true,
    response: new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: merged,
    }),
  }
}

/** Convenience for the session-cookie endpoints. */
export { clearSessionCookie }
