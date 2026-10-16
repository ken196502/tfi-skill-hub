/**
 * Request handlers for the whole HTTP surface.
 *
 * Handlers are deliberately thin: parse the request, call a service, map the
 * outcome onto a status code. Anything resembling a business rule belongs in
 * `src/server/services/*`.
 *
 * Error mapping note: `writeServiceError` in the original only gives a
 * meaningful status to errors carrying a sentinel, and everything else becomes
 * 400. `serviceError()` below reproduces that, so handlers should route
 * service exceptions through it rather than choosing a status themselves.
 */

import type { RequestContext } from '../http'
import { empty, errorJson, json, text } from '../http'
import { errorBody, httpStatusFor, isServiceError, ServiceError } from '../errors'
import { getConfig } from '../config'
import {
  clearSessionCookie,
  generateSessionToken,
  hashPassword,
  hashToken,
  extractSessionPrefix,
  sessionCookie,
  verifyPassword,
  MIN_PASSWORD_LENGTH,
} from '../auth'
import { asNumber, nowIso, query, type Row } from '../db'
import { parseSkillRef, isUuidLike, formatSkillRef } from '../services/shared'
import * as skillSvc from '../services/skills'
import * as nsSvc from '../services/namespaces'
import * as socialSvc from '../services/social'
import * as manageSvc from '../services/manage'
import type { SkillFormInput } from '../services/manage'
import * as apiKeySvc from '../services/apiKeys'
import * as runtimeSvc from '../services/runtime'
import * as agentSvc from '../services/agentSkills'
import { readMultipart, formValue, type FileMap } from '../content'
import { sessions, users, members, type UserRecord } from '../repo/core'
import { VALID_CATEGORIES } from '../../lib/types'
import type { Handler } from '../http'

// ─────────────────────────────────────────────────────────────────────────────
// Small parsing helpers
// ─────────────────────────────────────────────────────────────────────────────

/** `queryInt` — accepts only `0 < n <= max`, else the default. */
function qInt(url: URL, key: string, def: number, max = 100): number {
  const raw = url.searchParams.get(key)
  if (raw === null) return def
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) && n > 0 && n <= max ? n : def
}

function qStr(url: URL, key: string, def = ''): string {
  return url.searchParams.get(key) ?? def
}

async function jsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T
  } catch {
    return null
  }
}

/**
 * A parsed form body. `get` returns the first value for a key (what every
 * single-valued field wants); `all` returns every value, which is how a
 * repeated field such as a checkbox group arrives.
 */
interface FormFields {
  get(key: string): string
  all(key: string): string[]
}

/**
 * Reads a form-style body. Accepts urlencoded, multipart **and** JSON, so a
 * client can use whichever encoding it prefers — upstream only handled the two
 * form encodings, making this a superset of its contract.
 *
 * A JSON array is expanded into repeated entries, so `{"markets":["a","b"]}`
 * and `markets=a&markets=b` mean the same thing to `all`.
 */
async function formFields(request: Request): Promise<FormFields> {
  const first = new Map<string, string>()
  const every = new Map<string, string[]>()
  const push = (k: string, v: string): void => {
    if (!first.has(k)) first.set(k, v)
    const list = every.get(k)
    if (list) list.push(v)
    else every.set(k, [v])
  }
  const ct = request.headers.get('content-type') ?? ''
  const raw = await request.text().catch(() => '')
  try {
    if (ct.includes('application/json')) {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      for (const [k, v] of Object.entries(parsed)) {
        if (v === undefined || v === null) continue
        if (Array.isArray(v)) for (const item of v) push(k, String(item))
        else push(k, String(v))
      }
    } else if (ct.includes('application/x-www-form-urlencoded')) {
      for (const [k, v] of new URLSearchParams(raw).entries()) push(k, v)
    } else if (ct.includes('multipart/')) {
      // Re-parse from the raw body (it has already been consumed above).
      const form = await new Response(raw, { headers: { 'Content-Type': ct } }).formData()
      for (const [k, v] of form.entries()) if (typeof v === 'string') push(k, v)
    }
  } catch {
    /* an empty or malformed body is fine for endpoints like logout */
  }
  return {
    get: (key) => first.get(key) ?? '',
    all: (key) => every.get(key) ?? [],
  }
}

/** Maps a thrown service error onto the original's status/body rules. */
function serviceError(e: unknown): Response {
  if (isServiceError(e)) return json(errorBody(e), httpStatusFor(e))
  if (e instanceof Error) return errorJson(e.message, 400)
  return errorJson('internal error', 500)
}

function internalError(): Response {
  return errorJson('internal error', 500)
}

/** `@namespace/slug` from gin's `@:namespace` + `:slug` params. */
function refFromCtx(ctx: RequestContext): { namespace: string; slug: string } {
  const ns = ctx.params.namespace ?? ''
  return { namespace: ns.startsWith('@') ? ns.slice(1) : ns, slug: ctx.params.slug ?? '' }
}

function viewerOf(ctx: RequestContext) {
  return ctx.user ? { id: ctx.user.id, role: ctx.user.role } : null
}

function identityHashOf(ctx: RequestContext): string {
  return skillSvc.identityHashFor(ctx.clientIp)
}

/** `If-None-Match` matching: comma lists, optional `W/`, quotes, and `*`. */
function etagMatches(header: string | null, etag: string): boolean {
  if (!header) return false
  return header
    .split(',')
    .map((part) => part.trim().replace(/^W\//, '').replace(/^"|"$/g, ''))
    .some((candidate) => candidate === '*' || candidate === etag)
}

function requireUser(ctx: RequestContext): UserRecord {
  if (!ctx.user) throw new ServiceError('authentication required', 'forbidden')
  return ctx.user
}

/**
 * Body of the console's skill form.
 *
 * Every field is optional and read as `unknown` first: the form is built in the
 * browser, so a malformed value has to become a 400 rather than reach the
 * service layer as something it did not expect.
 */
interface SkillFormBody {
  slug?: unknown
  displayName?: unknown
  summary?: unknown
  displayNameEn?: unknown
  summaryEn?: unknown
  category?: unknown
  tags?: unknown
  listing?: unknown
  html?: unknown
  htmlEn?: unknown
}

/**
 * Narrows the console form body, or returns `null` when a field has the wrong
 * type. Absent text fields read as empty, which the service treats as "cleared"
 * — the form always submits the full set, so the two mean the same thing.
 */
function readSkillForm(body: SkillFormBody): SkillFormInput | null {
  const textFields = [
    'slug',
    'displayName',
    'summary',
    'displayNameEn',
    'summaryEn',
    'category',
    'listing',
    'html',
    'htmlEn',
  ] as const

  for (const key of textFields) {
    if (body[key] !== undefined && typeof body[key] !== 'string') return null
  }
  if (body.tags !== undefined && !Array.isArray(body.tags)) return null

  const text = (key: (typeof textFields)[number]): string =>
    typeof body[key] === 'string' ? (body[key] as string) : ''

  const tags = Array.isArray(body.tags)
    ? body.tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter((tag) => tag !== '')
    : []

  return {
    slug: text('slug'),
    displayName: text('displayName'),
    summary: text('summary'),
    displayNameEn: text('displayNameEn'),
    summaryEn: text('summaryEn'),
    category: text('category'),
    tags,
    // The console's create form defaults to off the shelf when it sends nothing.
    listing: text('listing') === '' ? 'unlisted' : text('listing'),
    html: text('html'),
    htmlEn: text('htmlEn'),
  }
}

/**
 * The console's create/edit body, in whichever encoding the client chose.
 *
 * JSON is the plain metadata form; `multipart/form-data` is the same form plus
 * the skill's files, so a package can be uploaded and described in one request
 * instead of two. Returns `null` when the body itself is unusable — a malformed
 * multipart surfaces as `{ error }` from the caller instead.
 */
async function readSkillFormRequest(
  request: Request,
): Promise<{ input: SkillFormInput; files: FileMap } | { error: Response }> {
  const contentType = request.headers.get('content-type') ?? ''

  if (contentType.startsWith('multipart/')) {
    let multipart
    try {
      // Same per-file cap the publish endpoint uses.
      multipart = await readMultipart(request, 5 * 1024 * 1024)
    } catch (e) {
      return { error: errorJson((e as Error).message, 400) }
    }
    const { files, fields } = multipart
    const input = readSkillForm({
      slug: formValue(fields, 'slug'),
      displayName: formValue(fields, 'displayName'),
      summary: formValue(fields, 'summary'),
      displayNameEn: formValue(fields, 'displayNameEn'),
      summaryEn: formValue(fields, 'summaryEn'),
      category: formValue(fields, 'category'),
      tags: splitTags(formValue(fields, 'tags')),
      listing: formValue(fields, 'listing'),
      html: formValue(fields, 'html'),
      htmlEn: formValue(fields, 'htmlEn'),
    })
    // Every value above came from a string field, so narrowing cannot fail.
    return { input: input as SkillFormInput, files }
  }

  const body = await jsonBody<SkillFormBody>(request)
  if (body === null) return { error: errorJson('invalid request body', 400) }
  const input = readSkillForm(body)
  if (input === null) return { error: errorJson('invalid request body', 400) }
  return { input, files: new Map() }
}

// ─────────────────────────────────────────────────────────────────────────────
// Discovery
// ─────────────────────────────────────────────────────────────────────────────

export const discovery: Record<string, Handler> = {
  healthz: () => json({ status: 'ok' }),

  readyz: () => {
    try {
      query.get('SELECT 1 AS x')
      return json({ status: 'ready' })
    } catch {
      return json({ status: 'not ready' }, 503)
    }
  },

  clawhubJson: () => {
    const cfg = getConfig()
    const base = cfg.baseUrl.replace(/\/+$/, '')
    return json({
      registryUrl: base,
      apiVersion: 'v1',
      endpoints: {
        search: '/api/v1/search',
        skills: '/api/v1/skills',
        download: '/api/v1/download',
        resolve: '/api/v1/resolve',
        whoami: '/api/v1/whoami',
        publish: '/api/v1/skills',
        installGuide: '/skills.md',
        openapi: '/openapi.json',
        apiDocs: '/docs',
      },
    })
  },

  skillsMd: (ctx) => {
    const cfg = getConfig()
    const base =
      cfg.baseUrl.replace(/\/+$/, '') ||
      `${new URL(ctx.request.url).protocol}//${ctx.request.headers.get('host') ?? 'localhost'}`
    return text(renderSkillsMd(base), 200, 'text/markdown; charset=utf-8')
  },

  /**
   * Minimal Prometheus exposition. The original used the prometheus client
   * library with a rich collector set; this reports the counters that have a
   * cheap SQL source, in the same text format so scrapes keep working.
   */
  metrics: () => {
    const rows: string[] = []
    const gauge = (name: string, help: string, value: number) => {
      rows.push(`# HELP ${name} ${help}`)
      rows.push(`# TYPE ${name} gauge`)
      rows.push(`${name} ${value}`)
    }
    gauge('skillhub_skills_total', 'Live skills', skillSvc.totalSkills())
    gauge('skillhub_users_total', 'Users', asNumber(query.get<Row>('SELECT COUNT(*) AS c FROM users')?.c))
    gauge(
      'skillhub_downloads_total',
      'Skill downloads',
      asNumber(query.get<Row>('SELECT COALESCE(SUM(downloads),0) AS c FROM skills')?.c),
    )
    gauge(
      'skillhub_search_documents',
      'Documents in the search index',
      asNumber(query.get<Row>('SELECT COUNT(*) AS c FROM search_docs')?.c),
    )
    return text(`${rows.join('\n')}\n`, 200, 'text/plain; version=0.0.4; charset=utf-8')
  },
}

function renderSkillsMd(base: string): string {
  return `# SkillHub — install guide

Base URL: ${base}

## Discover

\`\`\`bash
curl '${base}/api/v1/skills?limit=20&sort=downloads'
curl '${base}/api/v1/search?q=agent'
curl '${base}/api/v1/skills/@<namespace>/<slug>'
\`\`\`

## Download

\`\`\`bash
curl -L -o skill.zip '${base}/api/v1/download?slug=<slug>&version=latest'
\`\`\`

## Publish

\`\`\`bash
curl -X POST '${base}/api/v1/skills' \\
  -H 'Authorization: Bearer <token>' \\
  -F 'slug=my-skill' -F 'version=1.0.0' -F 'summary=A useful skill' \\
  -F 'files=@SKILL.md'
\`\`\`

Your package must contain \`SKILL.md\`. Versions are immutable once published.

## Authenticate

Publish and other writes need an API key from the admin console:

\`\`\`bash
curl -X POST '${base}/api/v1/skills' \\
  -H 'Authorization: Bearer <api-key>' \\
  -F 'slug=my-skill' -F 'version=1.0.0' -F 'files=@SKILL.md'
\`\`\`
`
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill browsing
// ─────────────────────────────────────────────────────────────────────────────

export const skillRead: Record<string, Handler> = {
  listFeatures: (ctx) => {
    try { return json({ data: manageSvc.listFeaturedSkills(viewerOf(ctx)) }) }
    catch { return internalError() }
  },
  search: (ctx) => {
    const q = qStr(ctx.url, 'q')
    if (q.trim() === '') return errorJson("query parameter 'q' is required", 400)
    try {
      return json(
        runtimeSvc.searchDocuments({
          q,
          limit: qInt(ctx.url, 'limit', 20, 100),
          offset: Math.max(0, Number.parseInt(qStr(ctx.url, 'offset', '0'), 10) || 0),
          sort: qStr(ctx.url, 'sort'),
          type: qStr(ctx.url, 'type'),
          namespace: qStr(ctx.url, 'namespace'),
        }),
      )
    } catch {
      return internalError()
    }
  },

  categories: () => json({ categories: [...VALID_CATEGORIES] }),

  /**
   * The categories the catalogue actually holds, for the browse filter.
   *
   * A separate route from `/categories` on purpose: that one advertises the
   * fixed taxonomy and is part of the published contract, while this one
   * answers "what can I filter by right now".
   */
  categoriesInUse: (ctx) => {
    try {
      return json({ categories: skillSvc.listCategoriesInUse(viewerOf(ctx)) })
    } catch {
      return internalError()
    }
  },

  listSkills: (ctx) => {
    try {
      return json(
        skillSvc.listSkills({
          limit: qInt(ctx.url, 'limit', 20, 100),
          cursor: qStr(ctx.url, 'cursor'),
          sort: qStr(ctx.url, 'sort', 'created'),
          category: qStr(ctx.url, 'category'),
          q: qStr(ctx.url, 'q'),
          namespaceSlug: qStr(ctx.url, 'namespace'),
          viewer: viewerOf(ctx),
        }),
      )
    } catch {
      return internalError()
    }
  },

  listByNamespace: (ctx) => {
    try {
      return json(
        skillSvc.listSkills({
          limit: qInt(ctx.url, 'limit', 20, 100),
          cursor: qStr(ctx.url, 'cursor'),
          sort: qStr(ctx.url, 'sort', 'created'),
          category: qStr(ctx.url, 'category'),
          q: qStr(ctx.url, 'q'),
          namespaceSlug: ctx.params.slug ?? '',
          viewer: viewerOf(ctx),
        }),
      )
    } catch {
      return internalError()
    }
  },

  getSkill: (ctx) => {
    try {
      const skill = skillSvc.getSkill(refFromCtx(ctx), viewerOf(ctx))
      if (!skill) return errorJson('skill not found', 404)
      return json(skill)
    } catch (e) {
      return serviceError(e)
    }
  },

  getVersions: (ctx) => {
    try {
      const versions = skillSvc.getVersions(refFromCtx(ctx), viewerOf(ctx))
      // A missing/invisible skill yields `{"versions":null}` with status 200 —
      // this endpoint never returns 404.
      return json({ versions })
    } catch {
      return internalError()
    }
  },

  getVersion: (ctx) => {
    try {
      const version = skillSvc.getVersion(
        refFromCtx(ctx),
        ctx.params.version ?? '',
        viewerOf(ctx),
      )
      if (!version) return errorJson('version not found', 404)
      return json(version)
    } catch {
      return internalError()
    }
  },

  getFile: (ctx) => {
    const result = skillSvc.getFile(
      refFromCtx(ctx),
      qStr(ctx.url, 'version', 'latest'),
      qStr(ctx.url, 'path', 'SKILL.md'),
      viewerOf(ctx),
    )
    if ('error' in result) return errorJson(result.error, 404)
    // Content type is always text/plain here, matching upstream.
    return text(new TextDecoder().decode(result.content), 200, 'text/plain; charset=utf-8')
  },

  resolve: (ctx) => {
    const fingerprint = qStr(ctx.url, 'fingerprint')
    if (fingerprint === '') return errorJson('fingerprint is required', 400)
    try {
      const found = skillSvc.resolveFingerprint(fingerprint)
      if (!found) return errorJson('not found', 404)
      return json(found)
    } catch {
      return internalError()
    }
  },

  download: (ctx) => {
    const direct = qStr(ctx.url, 'direct')
    if (direct === '1' || direct === 'true') {
      // Direct download requires an object-storage backend; this build stores
      // version content in SQLite, so there are no presigned URLs to hand out.
      if (qStr(ctx.url, 'path') === '') {
        return errorJson('path is required for direct download', 400)
      }
      if (qStr(ctx.url, 'slug') === '') return errorJson('slug is required', 400)
      return errorJson(
        'validation: direct download is only available for object storage backends',
        400,
      )
    }

    const slug = qStr(ctx.url, 'slug')
    if (slug === '') return errorJson('slug is required', 400)

    const ref = { namespace: qStr(ctx.url, 'namespace'), slug }
    const version = qStr(ctx.url, 'version', 'latest')

    try {
      // Cheap 304 path: resolve the version, compare the fingerprint, and skip
      // the archive entirely on a match. No download is recorded.
      const probe = skillSvc.probeVersion(ref, version, viewerOf(ctx))
      if (probe && etagMatches(ctx.request.headers.get('if-none-match'), probe.fingerprint)) {
        return empty(304, { ETag: `"${probe.fingerprint}"` })
      }

      const result = skillSvc.download(ref, version, viewerOf(ctx), identityHashOf(ctx))
      if ('error' in result) return errorJson(result.error, 404)

      return new Response(result.zip as unknown as BodyInit, {
        status: 200,
        headers: {
          ETag: `"${result.fingerprint}"`,
          'Content-Disposition': `attachment; filename="${result.slug}-${result.version}.zip"`,
          'Content-Type': 'application/zip',
          'X-Skill-Version': result.version,
          'X-Skill-Fingerprint': result.fingerprint,
        },
      })
    } catch (e) {
      return errorJson(e instanceof Error ? e.message : 'download failed', 404)
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Authentication & session
// ─────────────────────────────────────────────────────────────────────────────

export const auth: Record<string, Handler> = {
  login: async (ctx) => {
    const fields = await formFields(ctx.request)
    const handle = (fields.get('handle') ?? '').trim()
    const password = fields.get('password') ?? ''
    if (handle === '' || password === '') {
      return errorJson('username and password are required', 400)
    }

    const user = users.getByHandle(handle)
    // All failure reasons collapse into one message on purpose.
    if (!user || user.isBanned) return errorJson('invalid username or password', 401)
    if (!user.passwordHash) return errorJson('invalid username or password', 401)
    if (!verifyPassword(password, user.passwordHash)) {
      return errorJson('invalid username or password', 401)
    }
    // Only reachable once the password checks out, so telling the caller the
    // account is still awaiting review leaks nothing to a stranger. The extra
    // `code` is additive — like `candidates` on the ambiguous-slug error — so
    // the UI can say the right thing without matching on prose.
    if (user.status === 'pending') {
      return json({ error: 'this account is waiting for approval', code: 'account_pending' }, 403)
    }
    if (user.status === 'rejected') {
      return json({ error: 'this registration was not approved', code: 'account_rejected' }, 403)
    }

    const raw = generateSessionToken()
    sessions.create({
      userId: user.id,
      prefix: extractSessionPrefix(raw),
      tokenHash: hashToken(raw),
      expiresAt: new Date(Date.now() + getConfig().sessionTtlSeconds * 1000).toISOString(),
    })
    // Counted on the account, not derived from `sessions`, so the console's
    // figure survives a session being pruned or rotated.
    users.incrementLogin(user.id)

    return json({ ok: true }, 200, { 'Set-Cookie': sessionCookie(ctx.request, raw) })
  },

  logout: (ctx) =>
    json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie(ctx.request) }),

  /**
   * Public self-service registration. Creates an account that must be approved
   * by an admin before it can sign in; the response never issues a session.
   *
   * Besides the credentials it records who the applicant is and what they
   * intend to research, so the review decision is made on context rather than on
   * an email address. Only the handle and password are checked for presence
   * here; the profile rules live in `registerUser` alongside the rest of the
   * validation.
   */
  register: async (ctx) => {
    if (!getConfig().allowRegistration) return errorJson('registration is closed', 403)
    const fields = await formFields(ctx.request)
    const handle = fields.get('handle').trim()
    const password = fields.get('password')
    if (handle === '' || password === '') {
      return errorJson('username and password are required', 400)
    }
    try {
      const created = manageSvc.registerUser({
        handle,
        password,
        emailCode: fields.get('emailCode'),
        displayName: fields.get('displayName'),
        email: fields.get('email'),
        country: fields.get('country'),
        organization: fields.get('organization'),
        jobTitle: fields.get('jobTitle'),
        officeLocation: fields.get('officeLocation'),
        researchNeeds: fields.get('researchNeeds'),
        markets: fields.all('markets'),
      })
      return json({ ok: true, status: created.status }, 201)
    } catch (e) {
      return serviceError(e)
    }
  },

  /** Whether the registration form is open, so the UI can hide the entry point. */
  registrationStatus: () => json({ enabled: getConfig().allowRegistration }),

  /**
   * The sign-up form's "send code" action. Answers with how many seconds remain
   * before another can be requested for the same address, so the client's
   * countdown follows the server rather than a timer it owns.
   */
  requestEmailCode: async (ctx) => {
    if (!getConfig().allowRegistration) return errorJson('registration is closed', 403)
    const fields = await formFields(ctx.request)
    try {
      return json(manageSvc.requestEmailCode(fields.get('email')), 200)
    } catch (e) {
      return serviceError(e)
    }
  },

  /**
   * The same wait, read without sending anything. The form calls this on load
   * and while the address changes; POST above is only for the button.
   */
  emailCodeStatus: async (ctx) => {
    if (!getConfig().allowRegistration) return errorJson('registration is closed', 403)
    const address = new URL(ctx.request.url).searchParams.get('email') ?? ''
    try {
      return json(manageSvc.emailCodeStatus(address), 200)
    } catch (e) {
      return serviceError(e)
    }
  },

  whoami: (ctx) => {
    if (!ctx.user) return errorJson('not authenticated', 401)
    const { passwordHash: _drop, ...safe } = ctx.user
    void _drop
    return json(safe)
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill mutations
// ─────────────────────────────────────────────────────────────────────────────

export const skillWrite: Record<string, Handler> = {
  publish: async (ctx) => {
    const user = requireUser(ctx)
    let multipart
    try {
      multipart = await readMultipart(ctx.request, 5 * 1024 * 1024)
    } catch (e) {
      return errorJson((e as Error).message, 400)
    }
    const { files, fields } = multipart

    // Skill publish uses raw form values (no trimming), unlike the agent path.
    let dependencies
    const depsRaw = fields.get('dependencies') ?? ''
    if (depsRaw !== '') {
      try {
        dependencies = JSON.parse(depsRaw)
      } catch (e) {
        return errorJson(`invalid dependencies JSON: ${(e as Error).message}`, 400)
      }
    }

    const signature = fields.get('signature') ?? ''
    if (signature.length > 64 * 1024) {
      return errorJson('signature bundle exceeds 64 KB', 400)
    }

    try {
      const result = skillSvc.publishVersion(user, {
        slug: fields.get('slug') ?? '',
        version: fields.get('version') ?? '',
        changelog: fields.get('changelog') ?? '',
        displayName: fields.get('displayName') ?? '',
        summary: fields.get('summary') ?? '',
        displayNameEn: fields.get('displayNameEn') ?? '',
        summaryEn: fields.get('summaryEn') ?? '',
        category: fields.get('category') ?? '',
        kind: fields.get('kind') ?? '',
        listing: fields.get('listing') ?? '',
        namespaceSlug: fields.get('namespace') ?? '',
        tags: fields.get('tags') ? splitTags(fields.get('tags')!) : undefined,
        dependencies,
        signatureBundle: signature || undefined,
        files,
        tokenNamespaceId: ctx.tokenNamespaceId,
      })
      return json(result)
    } catch (e) {
      return serviceError(e)
    }
  },

  /** Object-storage-only flow; this build keeps content in SQLite. */
  directUploadPlan: async (ctx) => {
    requireUser(ctx)
    const body = await jsonBody(ctx.request)
    if (body === null) return errorJson('invalid request body', 400)
    return errorJson('direct upload is only available for object storage backends', 400)
  },

  directUploadComplete: async (ctx) => {
    requireUser(ctx)
    const body = await jsonBody<{ signature?: string }>(ctx.request)
    if (body === null) return errorJson('invalid request body', 400)
    if ((body.signature ?? '').length > 64 * 1024) {
      return errorJson('signature bundle exceeds 64 KB', 400)
    }
    return errorJson('multipart direct upload is not available for this backend', 400)
  },

  remove: (ctx) => {
    const user = requireUser(ctx)
    try {
      skillSvc.softDelete(user, refFromCtx(ctx), ctx.tokenNamespaceId)
      return json({ message: 'skill deleted' })
    } catch (e) {
      return serviceError(e)
    }
  },

  purge: (ctx) => {
    const user = requireUser(ctx)
    try {
      skillSvc.purge(user, refFromCtx(ctx))
      return json({ message: 'skill purged' })
    } catch (e) {
      return serviceError(e)
    }
  },

  undelete: (ctx) => {
    const user = requireUser(ctx)
    try {
      skillSvc.undelete(user, refFromCtx(ctx), ctx.tokenNamespaceId)
      return json({ message: 'skill restored' })
    } catch (e) {
      return serviceError(e)
    }
  },

  transfer: async (ctx) => {
    const user = requireUser(ctx)
    const body = await jsonBody<{ namespace?: string }>(ctx.request)
    if (!body?.namespace) return errorJson('namespace is required', 400)
    try {
      skillSvc.transferSkill(user, refFromCtx(ctx), body.namespace, ctx.tokenNamespaceId)
      return json({ message: 'skill transferred' })
    } catch (e) {
      return serviceError(e)
    }
  },

  updateFile: async (ctx) => {
    const user = requireUser(ctx)
    const ct = ctx.request.headers.get('content-type') ?? ''
    let path = 'SKILL.md'
    let changelog = ''
    let content: Uint8Array

    if (ct.startsWith('multipart/')) {
      try {
        const form = await ctx.request.formData()
        path = (form.get('path') as string | null) || 'SKILL.md'
        changelog = (form.get('changelog') as string | null) ?? ''
        const file = form.get('file')
        if (!(file instanceof File)) return errorJson('file is required', 400)
        content = new Uint8Array(await file.arrayBuffer())
        if (content.byteLength > 200 * 1024) return errorJson('file exceeds 200KB', 400)
      } catch {
        return errorJson('cannot read file', 400)
      }
    } else {
      const body = await jsonBody<{ path?: string; content?: string; changelog?: string }>(
        ctx.request,
      )
      if (body === null) return errorJson('invalid request body', 400)
      path = body.path || 'SKILL.md'
      changelog = body.changelog ?? ''
      content = new TextEncoder().encode(body.content ?? '')
    }

    try {
      return json(
        skillSvc.updateFile(user, refFromCtx(ctx), path, content, changelog, ctx.tokenNamespaceId),
      )
    } catch (e) {
      return serviceError(e)
    }
  },

  /**
   * Replaces the detail markup shown on the skill's page.
   *
   * `html` may be absent or empty, which clears the column and returns the page
   * to rendering SKILL.md. The service sanitises before storing; the stored
   * value is what comes back, so the caller sees exactly what will be rendered.
   */
  updateDetailHtml: async (ctx) => {
    const user = requireUser(ctx)
    const body = await jsonBody<{ html?: string; htmlEn?: string }>(ctx.request)
    if (body === null) return errorJson('invalid request body', 400)
    if (body.html !== undefined && typeof body.html !== 'string') {
      return errorJson('html must be a string', 400)
    }
    if (body.htmlEn !== undefined && typeof body.htmlEn !== 'string') {
      return errorJson('htmlEn must be a string', 400)
    }
    try {
      return json(
        skillSvc.setDetailHtml(
          user,
          refFromCtx(ctx),
          body.html,
          body.htmlEn,
          ctx.tokenNamespaceId,
        ),
      )
    } catch (e) {
      return serviceError(e)
    }
  },

  yank: async (ctx) => {
    const user = requireUser(ctx)
    // An empty body is acceptable; malformed JSON is not.
    const raw = await ctx.request.text()
    let reason = ''
    if (raw.trim() !== '') {
      try {
        reason = (JSON.parse(raw) as { reason?: string }).reason ?? ''
      } catch {
        return errorJson('invalid JSON body', 400)
      }
    }
    try {
      skillSvc.yankVersion(
        user,
        refFromCtx(ctx),
        ctx.params.version ?? '',
        reason,
        ctx.tokenNamespaceId,
      )
      return json({ message: 'version yanked' })
    } catch (e) {
      return serviceError(e)
    }
  },

  unyank: (ctx) => {
    const user = requireUser(ctx)
    try {
      skillSvc.unyankVersion(user, refFromCtx(ctx), ctx.params.version ?? '', ctx.tokenNamespaceId)
      return json({ message: 'version unyanked' })
    } catch (e) {
      return serviceError(e)
    }
  },

  deprecate: async (ctx) => {
    const user = requireUser(ctx)
    const raw = await ctx.request.text()
    let message = ''
    if (raw.trim() !== '') {
      try {
        message = (JSON.parse(raw) as { message?: string }).message ?? ''
      } catch {
        return errorJson('invalid JSON body', 400)
      }
    }
    try {
      skillSvc.deprecateVersion(
        user,
        refFromCtx(ctx),
        ctx.params.version ?? '',
        message,
        ctx.tokenNamespaceId,
      )
      return json({ message: 'version deprecated' })
    } catch (e) {
      return serviceError(e)
    }
  },

  undeprecate: (ctx) => {
    const user = requireUser(ctx)
    try {
      skillSvc.undeprecateVersion(
        user,
        refFromCtx(ctx),
        ctx.params.version ?? '',
        ctx.tokenNamespaceId,
      )
      return json({ message: 'version undeprecated' })
    } catch (e) {
      return serviceError(e)
    }
  },
}

function splitTags(raw: string): string[] {
  return raw
    .split(/[,; ]+/)
    .map((t) => t.trim())
    .filter((t) => t !== '')
}

// ─────────────────────────────────────────────────────────────────────────────
// Stars, ratings, comments, notifications
// ─────────────────────────────────────────────────────────────────────────────

export const social: Record<string, Handler> = {
  /** The signed-in user's collection, newest star first. */
  listStars: (ctx) => {
    const user = requireUser(ctx)
    try {
      return json(
        skillSvc.listStarredSkills(
          user.id,
          viewerOf(ctx),
          qInt(ctx.url, 'limit', 20, 100),
          qStr(ctx.url, 'cursor'),
        ),
      )
    } catch (e) {
      return serviceError(e)
    }
  },

  star: (ctx) => {
    const user = requireUser(ctx)
    try {
      skillSvc.toggleStar(user.id, refFromCtx(ctx), true)
      return json({ message: 'starred' })
    } catch (e) {
      return serviceError(e)
    }
  },

  unstar: (ctx) => {
    const user = requireUser(ctx)
    try {
      skillSvc.toggleStar(user.id, refFromCtx(ctx), false)
      return json({ message: 'unstarred' })
    } catch (e) {
      return serviceError(e)
    }
  },

  rate: async (ctx) => {
    const user = requireUser(ctx)
    const body = await jsonBody<{ score?: number; comment?: string }>(ctx.request)
    if (body?.score === undefined || body.score === null) {
      return errorJson('score is required (1-5)', 400)
    }
    try {
      socialSvc.rate(user, refFromCtx(ctx), body.score, body.comment)
      return json({ message: 'rating saved' })
    } catch (e) {
      return serviceError(e)
    }
  },

  deleteRating: (ctx) => {
    const user = requireUser(ctx)
    try {
      socialSvc.deleteRating(user, refFromCtx(ctx))
      return json({ message: 'rating deleted' })
    } catch (e) {
      return serviceError(e)
    }
  },

  listRatings: (ctx) => {
    try {
      return json(
        socialSvc.listRatings(
          refFromCtx(ctx),
          viewerOf(ctx),
          qInt(ctx.url, 'limit', 20),
          qStr(ctx.url, 'cursor'),
        ),
      )
    } catch (e) {
      return serviceError(e)
    }
  },

  createComment: async (ctx) => {
    const user = requireUser(ctx)
    const body = await jsonBody<{ body?: string }>(ctx.request)
    if (body === null) return errorJson('invalid request body', 400)
    try {
      return json(socialSvc.createComment(user, refFromCtx(ctx), body.body ?? ''))
    } catch (e) {
      return serviceError(e)
    }
  },

  listComments: (ctx) => {
    try {
      return json(
        socialSvc.listComments(
          refFromCtx(ctx),
          viewerOf(ctx),
          qInt(ctx.url, 'limit', 20),
          qStr(ctx.url, 'cursor'),
        ),
      )
    } catch (e) {
      return serviceError(e)
    }
  },

  deleteComment: (ctx) => {
    const user = requireUser(ctx)
    const id = ctx.params.id ?? ''
    if (!isUuidLike(id)) return errorJson('invalid id', 400)
    try {
      socialSvc.deleteComment(user, id)
      return json({ message: 'comment deleted' })
    } catch (e) {
      return serviceError(e)
    }
  },

  listNotifications: (ctx) => {
    const user = requireUser(ctx)
    try {
      return json(
        socialSvc.listNotifications(user.id, qInt(ctx.url, 'limit', 20), qStr(ctx.url, 'cursor')),
      )
    } catch {
      return internalError()
    }
  },

  unread: (ctx) => {
    const user = requireUser(ctx)
    try {
      return json({ unread: socialSvc.unreadCount(user.id) })
    } catch {
      return internalError()
    }
  },

  markRead: (ctx) => {
    const user = requireUser(ctx)
    const id = ctx.params.id ?? ''
    if (!isUuidLike(id)) return errorJson('invalid notification ID', 400)
    socialSvc.markRead(user.id, id)
    return json({ message: 'marked as read' })
  },

  markAllRead: (ctx) => {
    const user = requireUser(ctx)
    socialSvc.markAllRead(user.id)
    return json({ message: 'all marked as read' })
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Namespaces
// ─────────────────────────────────────────────────────────────────────────────

export const namespaceHandlers: Record<string, Handler> = {
  create: async (ctx) => {
    const user = requireUser(ctx)
    const body = await jsonBody<{
      slug?: string
      displayName?: string
      description?: string
      type?: string
      defaultListing?: string
      maxSkills?: number
    }>(ctx.request)
    if (!body?.slug) return errorJson('slug is required', 400)
    try {
      return json(
        nsSvc.createNamespace(user, {
          slug: body.slug,
          displayName: body.displayName,
          description: body.description,
          type: body.type,
          defaultListing: body.defaultListing,
          maxSkills: body.maxSkills,
        }),
        201,
      )
    } catch (e) {
      return serviceError(e)
    }
  },

  list: (ctx) => {
    const user = requireUser(ctx)
    return json({ data: nsSvc.listNamespaces(user) })
  },

  get: (ctx) => {
    const user = requireUser(ctx)
    try {
      return json(nsSvc.getNamespaceForUser(ctx.params.slug ?? '', { id: user.id, role: user.role }))
    } catch (e) {
      return serviceError(e)
    }
  },

  update: async (ctx) => {
    const user = requireUser(ctx)
    const body = await jsonBody<{
      displayName?: string
      description?: string
      defaultListing?: string
      maxSkills?: number
    }>(ctx.request)
    if (body === null) return errorJson('invalid request', 400)
    try {
      return json(nsSvc.updateNamespace(ctx.params.slug ?? '', { id: user.id, role: user.role }, body))
    } catch (e) {
      return serviceError(e)
    }
  },

  remove: (ctx) => {
    const user = requireUser(ctx)
    try {
      nsSvc.deleteNamespace(ctx.params.slug ?? '', { id: user.id, role: user.role })
      return json({ message: 'namespace deleted' })
    } catch (e) {
      return serviceError(e)
    }
  },

  listMembers: (ctx) => {
    const user = requireUser(ctx)
    try {
      return json({
        data: nsSvc.listMembers(ctx.params.slug ?? '', { id: user.id, role: user.role }),
      })
    } catch (e) {
      return serviceError(e)
    }
  },

  addMember: async (ctx) => {
    const user = requireUser(ctx)
    const body = await jsonBody<{ handle?: string; role?: string }>(ctx.request)
    if (!body?.handle) return errorJson('handle is required', 400)
    try {
      nsSvc.addMember(ctx.params.slug ?? '', { id: user.id, role: user.role }, body.handle, body.role ?? 'member')
      return json({ message: 'member added' })
    } catch (e) {
      return serviceError(e)
    }
  },

  removeMember: (ctx) => {
    const user = requireUser(ctx)
    try {
      nsSvc.removeMember(ctx.params.slug ?? '', { id: user.id, role: user.role }, ctx.params.handle ?? '')
      return json({ message: 'member removed' })
    } catch (e) {
      return serviceError(e)
    }
  },

  leave: (ctx) => {
    const user = requireUser(ctx)
    try {
      nsSvc.leaveNamespace(ctx.params.slug ?? '', { id: user.id, role: user.role })
      return json({ message: 'left namespace' })
    } catch (e) {
      return serviceError(e)
    }
  },

  transfer: async (ctx) => {
    const user = requireUser(ctx)
    const body = await jsonBody<{ newOwner?: string }>(ctx.request)
    if (!body?.newOwner) return errorJson('newOwner is required', 400)
    try {
      nsSvc.transferOwnership(ctx.params.slug ?? '', { id: user.id, role: user.role }, body.newOwner)
      return json({ message: 'ownership transferred' })
    } catch (e) {
      return serviceError(e)
    }
  },

  invite: async (ctx) => {
    const user = requireUser(ctx)
    const body = await jsonBody<{ handle?: string; role?: string; message?: string }>(ctx.request)
    if (!body?.handle) return errorJson('handle is required', 400)
    try {
      return json(
        nsSvc.inviteMember(
          ctx.params.slug ?? '',
          { id: user.id, role: user.role },
          body.handle,
          body.role ?? 'member',
          body.message,
        ),
        201,
      )
    } catch (e) {
      return serviceError(e)
    }
  },

  listInvitations: (ctx) => {
    const user = requireUser(ctx)
    try {
      return json({
        data: nsSvc.listNamespaceInvitations(
          ctx.params.slug ?? '',
          { id: user.id, role: user.role },
          qStr(ctx.url, 'status'),
        ),
      })
    } catch (e) {
      return serviceError(e)
    }
  },

  revokeInvitation: (ctx) => {
    const user = requireUser(ctx)
    const id = ctx.params.id ?? ''
    if (!isUuidLike(id)) return errorJson('invalid invitation id', 400)
    try {
      nsSvc.revokeInvitation(ctx.params.slug ?? '', { id: user.id, role: user.role }, id)
      return json({ message: 'invitation revoked' })
    } catch (e) {
      return serviceError(e)
    }
  },

  myInvitations: (ctx) => {
    const user = requireUser(ctx)
    return json({ data: nsSvc.myInvitations({ id: user.id, role: user.role }) })
  },

  acceptInvitation: (ctx) => {
    const user = requireUser(ctx)
    const id = ctx.params.id ?? ''
    if (!isUuidLike(id)) return errorJson('invalid invitation id', 400)
    try {
      nsSvc.respondInvitation({ id: user.id, role: user.role }, id, 'accept')
      return json({ message: 'invitation accepted' })
    } catch (e) {
      return serviceError(e)
    }
  },

  declineInvitation: (ctx) => {
    const user = requireUser(ctx)
    const id = ctx.params.id ?? ''
    if (!isUuidLike(id)) return errorJson('invalid invitation id', 400)
    try {
      nsSvc.respondInvitation({ id: user.id, role: user.role }, id, 'decline')
      return json({ message: 'invitation declined' })
    } catch (e) {
      return serviceError(e)
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin
// ─────────────────────────────────────────────────────────────────────────────

export const admin: Record<string, Handler> = {
  listFeaturedSkills: () => {
    try { return json({ data: manageSvc.listFeaturedSkills() }) }
    catch { return internalError() }
  },

  replaceFeaturedSkills: async (ctx) => {
    const body = await jsonBody<{ skillIds?: string[] }>(ctx.request)
    if (!Array.isArray(body?.skillIds) || body.skillIds.some((id) => typeof id !== 'string')) return errorJson('skillIds must be an array', 400)
    try {
      manageSvc.replaceFeaturedSkills(ctx.user!.id, body.skillIds)
      return json({ message: 'featured skills updated' })
    } catch (e) { return serviceError(e) }
  },

  banUser: async (ctx) => {
    const body = await jsonBody<{ userId?: string; reason?: string }>(ctx.request)
    if (!body?.userId) return errorJson('invalid request', 400)
    if (!isUuidLike(body.userId)) return errorJson('invalid user ID', 400)
    try {
      manageSvc.banUser(ctx.user!.id, body.userId, body.reason ?? '')
      return json({ message: 'user banned' })
    } catch (e) {
      if (isServiceError(e)) return serviceError(e)
      return errorJson('failed to ban user', 500)
    }
  },

  /** Sets a new password on an account; the value is chosen by the administrator. */
  resetUserPassword: async (ctx) => {
    const body = await jsonBody<{ userId?: string; password?: string }>(ctx.request)
    if (!body?.userId || typeof body.password !== 'string') return errorJson('invalid request', 400)
    if (!isUuidLike(body.userId)) return errorJson('invalid user ID', 400)
    try {
      manageSvc.resetUserPassword(ctx.user!.id, body.userId, body.password)
      return json({ message: 'password updated' })
    } catch (e) {
      if (isServiceError(e)) return serviceError(e)
      return errorJson('failed to reset password', 500)
    }
  },

  setRole: async (ctx) => {
    const body = await jsonBody<{ userId?: string; role?: string }>(ctx.request)
    if (!body?.userId || !body.role) return errorJson('invalid request', 400)
    if (!isUuidLike(body.userId)) return errorJson('invalid user ID', 400)
    try {
      manageSvc.setRole(ctx.user!.id, body.userId, body.role)
      return json({ message: 'role updated' })
    } catch (e) {
      if (isServiceError(e)) return serviceError(e)
      return errorJson('failed to update role', 500)
    }
  },

  listUsers: (ctx) => {
    try {
      return json(manageSvc.listUsers(qStr(ctx.url, 'cursor'), qStr(ctx.url, 'status')))
    } catch {
      return errorJson('failed to list users', 500)
    }
  },

  /** Approve or reject a self-registered account. */
  reviewUser: async (ctx) => {
    const body = await jsonBody<{ userId?: string; action?: string; note?: string }>(ctx.request)
    if (!body?.userId || !body.action) return errorJson('invalid request', 400)
    if (!isUuidLike(body.userId)) return errorJson('invalid user ID', 400)
    try {
      manageSvc.reviewUser(ctx.user!.id, body.userId, body.action, body.note ?? '')
      return json({ message: body.action === 'approve' ? 'user approved' : 'user rejected' })
    } catch (e) {
      return serviceError(e)
    }
  },

  createUser: async (ctx) => {
    const body = await jsonBody<{
      handle?: string
      displayName?: string
      email?: string
      role?: string
    }>(ctx.request)
    if (!body?.handle) return errorJson('invalid request', 400)
    try {
      return json(
        manageSvc.createUser({
          handle: body.handle,
          displayName: body.displayName,
          email: body.email,
          role: body.role,
        }),
        201,
      )
    } catch (e) {
      if (isServiceError(e)) return serviceError(e)
      return errorJson('failed to create user', 500)
    }
  },

  listSkills: (ctx) => {
    try {
      return json(
        manageSvc.listAllSkills({
          listing: qStr(ctx.url, 'listing'),
          cursor: qStr(ctx.url, 'cursor'),
          limit: qInt(ctx.url, 'limit', 20, 100),
          // `page` selects numbered paging; omitted (0) keeps the cursor walk
          // that API-key clients were written against.
          page: qInt(ctx.url, 'page', 0, 1_000_000),
        }),
      )
    } catch {
      return errorJson('failed to list skills', 500)
    }
  },

  /**
   * Categories the catalogue actually uses, so the console's category field can
   * suggest them. Distinct from the public `/categories`, which advertises the
   * fixed taxonomy rather than what is on disk.
   */
  listCategories: () => {
    try {
      return json({ categories: manageSvc.listCategoriesInUse() })
    } catch {
      return errorJson('failed to list categories', 500)
    }
  },

  /** Takes a skill on or off the shelf. */
  setSkillListing: async (ctx) => {
    const body = await jsonBody<{ listing?: string }>(ctx.request)
    if (!body?.listing) return errorJson('invalid request, listing is required', 400)
    try {
      manageSvc.setSkillListing(refFromCtx(ctx), body.listing, ctx.user!.id)
      return json({ message: `skill ${body.listing === 'listed' ? 'listed' : 'unlisted'}` })
    } catch (e) {
      return serviceError(e)
    }
  },

  /**
   * Creates a catalogue entry from the console form.
   *
   * Distinct from `POST /api/v1/skills`: that one ingests uploaded files, this
   * one synthesises the `SKILL.md` and takes the body as rich text, so the
   * console can add a skill without a file round trip.
   */
  createSkill: async (ctx) => {
    const user = requireUser(ctx)
    const parsed = await readSkillFormRequest(ctx.request)
    if ('error' in parsed) return parsed.error
    try {
      return json({ skill: manageSvc.createSkillFromForm(user, parsed.input, parsed.files) }, 201)
    } catch (e) {
      return serviceError(e)
    }
  },

  /** Replaces a skill's editable content. The body is a full form submission. */
  updateSkill: async (ctx) => {
    const user = requireUser(ctx)
    const parsed = await readSkillFormRequest(ctx.request)
    if ('error' in parsed) return parsed.error
    try {
      return json({ skill: manageSvc.updateSkillFromForm(user, refFromCtx(ctx), parsed.input, parsed.files) })
    } catch (e) {
      return serviceError(e)
    }
  },

  auditLogs: (ctx) => {
    try {
      const actorIdRaw = qStr(ctx.url, 'actor_id')
      return json(
        manageSvc.auditLogs({
          limit: qInt(ctx.url, 'limit', 50, 200),
          cursor: qStr(ctx.url, 'cursor'),
          action: qStr(ctx.url, 'action'),
          resourceType: qStr(ctx.url, 'resource_type'),
          // A non-UUID actor_id is silently ignored.
          actorId: isUuidLike(actorIdRaw) ? actorIdRaw : '',
        }),
      )
    } catch {
      return internalError()
    }
  },

  // ── Admin API keys ────────────────────────────────────────────────────────
  // Admin-only surface. `create` returns the key it just minted; `list` returns
  // each row with its full value so the console can copy a usage sheet for any
  // key, not only the newest one.

  listApiKeys: () => {
    try {
      return json({ data: apiKeySvc.listApiKeys() })
    } catch {
      return errorJson('failed to list API keys', 500)
    }
  },

  createApiKey: async (ctx) => {
    const body = await jsonBody<{
      name?: string
      scopes?: string[]
      namespaceSlug?: string
      expiresIn?: string
    }>(ctx.request)
    if (!body) return errorJson('invalid request', 400)
    try {
      return json(
        apiKeySvc.createApiKey(ctx.user!.id, {
          name: body.name,
          scopes: body.scopes,
          namespaceSlug: body.namespaceSlug,
          expiresIn: body.expiresIn,
        }),
        201,
      )
    } catch (e) {
      return serviceError(e)
    }
  },

  revokeApiKey: (ctx) => {
    const id = ctx.params.id ?? ''
    if (!isUuidLike(id)) return errorJson('invalid API key ID', 400)
    try {
      apiKeySvc.revokeApiKey(ctx.user!.id, id)
      return json({ message: 'API key revoked' })
    } catch (e) {
      return serviceError(e)
    }
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent Skill API (/api/agent/*)
// ─────────────────────────────────────────────────────────────────────────────

export const agent: Record<string, Handler> = {
  publish: async (ctx) => {
    const user = ctx.user
    if (!user) return agentErr('UNAUTHORIZED', 'authentication required', 401, ctx)

    let multipart
    try {
      multipart = await readMultipart(ctx.request, 5 * 1024 * 1024)
    } catch (e) {
      const message = (e as Error).message
      if (message.includes('exceeds max size')) {
        return agentErr('ARCHIVE_TOO_LARGE', message, 413, ctx)
      }
      return agentErr('INVALID_REQUEST', message, 400, ctx)
    }
    const { files, fields } = multipart

    if (files.size === 0) return agentErr('MISSING_FILES', 'missing files', 400, ctx)
    if (!files.has('SKILL.md')) {
      return agentErr('INVALID_SKILL_MD', 'SKILL.md is required', 400, ctx)
    }

    try {
      const result = skillSvc.publishVersion(user, {
        slug: formValue(fields, 'slug'),
        version: formValue(fields, 'version'),
        displayName: formValue(fields, 'displayName'),
        listing: formValue(fields, 'listing'),
        files,
        tokenNamespaceId: ctx.tokenNamespaceId,
        overwrite: parseAgentOverwrite(formValue(fields, 'overwrite')),
      })
      // 201 for a brand-new skill, 200 when extending an existing one.
      const isNew = result.skill.versionsCount === 1 && result.version.version !== ''
      const status = isNew ? 201 : 200
      return json(
        {
          data: {
            skill: { slug: result.skill.slug },
            version: {
              version: result.version.version,
              fingerprint: result.version.fingerprint,
            },
          },
          requestId: ctx.requestId.startsWith('req_') ? ctx.requestId : `req_${ctx.requestId}`,
        },
        status,
      )
    } catch (e) {
      return writeAgentServiceError(e, ctx)
    }
  },

  list: (ctx) => agentSvc.listAgentSkills(ctx, qInt(ctx.url, 'page', 1, 10000), qInt(ctx.url, 'pageSize', 20, 100)),

  detail: (ctx) => agentSvc.skillDetail(ctx, ctx.params.id ?? ''),

  download: (ctx) => agentSvc.downloadInfo(ctx, ctx.params.id ?? ''),

  archive: (ctx) => agentSvc.archive(ctx, ctx.params.id ?? ''),
}

/** `parseAgentOverwrite` — unrecognised values mean "unset" (= allowed). */
function parseAgentOverwrite(raw: string): boolean | null {
  const v = raw.trim().toLowerCase()
  if (v === '') return null
  if (['true', '1', 'yes', 'y'].includes(v)) return true
  if (['false', '0', 'no', 'n'].includes(v)) return false
  return null
}

function agentErr(
  code: string,
  message: string,
  status: number,
  ctx: RequestContext,
): Response {
  return json(
    {
      error: { code, message },
      requestId: ctx.requestId.startsWith('req_') ? ctx.requestId : `req_${ctx.requestId}`,
    },
    status,
  )
}

function writeAgentServiceError(e: unknown, ctx: RequestContext): Response {
  if (isServiceError(e)) {
    switch (e.kind) {
      case 'forbidden':
        return agentErr('FORBIDDEN', e.message, 403, ctx)
      case 'notfound':
        return json(
          { error: { code: 'SKILL_NOT_FOUND', message: 'skill not found', details: {} }, requestId: ctx.requestId },
          404,
        )
      case 'conflict':
        return json(
          { error: { code: 'SKILL_NAME_CONFLICT', message: e.message, details: {} }, requestId: ctx.requestId },
          409,
        )
      default:
        break
    }
  }
  const message = e instanceof Error ? e.message : String(e)
  const code = message.toLowerCase().includes('skill.md') ? 'INVALID_SKILL_MD' : 'INVALID_REQUEST'
  return agentErr(code, message, 400, ctx)
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime skill API (/api/runtime/*)
// ─────────────────────────────────────────────────────────────────────────────

export const runtime: Record<string, Handler> = {
  capabilities: () =>
    json({
      runtimeSkills: { version: '2026-06-17', resolve: true, files: true, bundle: true },
    }),

  resolve: (ctx) => runtimeSvc.resolve(ctx),
  list: (ctx) => runtimeSvc.list(ctx),
  byId: (ctx) => runtimeSvc.byId(ctx, ctx.params.id ?? ''),
  bySlug: (ctx) => runtimeSvc.bySlug(ctx),
  file: (ctx) => runtimeSvc.file(ctx),
  bundle: (ctx) => runtimeSvc.bundle(ctx),
}

export { hashPassword, MIN_PASSWORD_LENGTH, nowIso, formatSkillRef, parseSkillRef, members }
