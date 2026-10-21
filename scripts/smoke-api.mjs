/**
 * End-to-end API smoke test.
 *
 * Starts a real server against a throwaway SQLite database and exercises the
 * registry over real HTTP. Prints one ✓/✗ line per assertion and exits non-zero
 * on the first failure summary.
 *
 * Two details make the result trustworthy rather than accidentally green:
 *
 *   * Readiness is confirmed by matching the server's own `x-run-id` response
 *     header, not by "the port answers". A stale process left over from a
 *     previous run would otherwise absorb every request and produce a false pass.
 *   * Each start uses a fresh port, and a port collision (`EADDRINUSE`) is
 *     retried on the next one instead of failing the run.
 */

import { spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, '..')
const ENTRY = path.join(projectRoot, 'scripts', 'serve.mjs')

const RUN_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'skillhub-smoke-'))
const DB_FILE = path.join(RUN_DIR, 'skillhub.db')
const ADMIN_USER = 'admin'
const ADMIN_PASSWORD = 'admin12345'
/** The sign-up verification code (see `EMAIL_VERIFICATION_CODE` in the app). */
const EMAIL_CODE = '123456'
/** How long the send action stays unavailable (see `EMAIL_CODE_COOLDOWN_SECONDS`). */
const COOLDOWN = 60

let portCursor = 21000 + Math.floor(Math.random() * 5000)
let passed = 0
let failed = 0
const failures = []

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    failures.push(name)
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`)
}

/** Asks the OS for a free port; retried on collision below. */
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer()
    srv.once('error', reject)
    srv.listen(0, () => {
      const { port } = srv.address()
      srv.close(() => resolve(port))
    })
  })
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * `rateLimit` selects the limiter configuration: the functional suite needs
 * headroom (it fires well over a hundred write requests from one IP), while a
 * dedicated phase runs with deliberately tiny limits to prove the limiter.
 */
async function startServer({ rateLimit = 'generous' } = {}) {
  const limits =
    rateLimit === 'generous'
      ? {
          SKILLHUB_RATE_READ_LIMIT: '100000',
          SKILLHUB_RATE_WRITE_LIMIT: '100000',
          SKILLHUB_RATE_DOWNLOAD_LIMIT: '100000',
        }
      : {
          SKILLHUB_RATE_READ_LIMIT: '4',
          SKILLHUB_RATE_WRITE_LIMIT: '3',
          SKILLHUB_RATE_DOWNLOAD_LIMIT: '2',
          SKILLHUB_RATE_READ_WINDOW: '60',
          SKILLHUB_RATE_WRITE_WINDOW: '60',
          SKILLHUB_RATE_DOWNLOAD_WINDOW: '60',
        }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const port = await freePort()
    const runId = crypto.randomUUID()
    const logs = []
    const proc = spawn(process.execPath, ['--disable-warning=ExperimentalWarning', ENTRY], {
      cwd: projectRoot,
      env: {
        ...process.env,
        SKILLHUB_DATABASE_URL: DB_FILE,
        SKILLHUB_PORT: String(port),
        SKILLHUB_RUN_ID: runId,
        SKILLHUB_ADMIN_USER: ADMIN_USER,
        SKILLHUB_ADMIN_PASSWORD: ADMIN_PASSWORD,
        ...limits,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    proc.stdout.on('data', (d) => logs.push(String(d)))
    proc.stderr.on('data', (d) => logs.push(String(d)))

    const base = `http://127.0.0.1:${port}`
    let ready = false
    for (let i = 0; i < 120; i += 1) {
      await sleep(250)
      if (proc.exitCode !== null) break
      try {
        const res = await fetch(`${base}/healthz`)
        // Only *this* process answers with this run id.
        if (res.ok && res.headers.get('x-run-id') === runId) {
          ready = true
          break
        }
      } catch {
        /* not listening yet */
      }
    }

    if (ready) {
      return {
        base,
        proc,
        logs,
        async stop() {
          if (proc.exitCode !== null) return
          const exited = new Promise((r) => proc.once('exit', r))
          proc.kill('SIGTERM')
          await Promise.race([exited, sleep(4000)])
          if (proc.exitCode === null) proc.kill('SIGKILL')
        },
      }
    }

    const text = logs.join('')
    await new Promise((r) => {
      if (proc.exitCode !== null) return r()
      proc.once('exit', r)
      proc.kill('SIGKILL')
    })
    if (!/EADDRINUSE/.test(text) && attempt > 2) {
      throw new Error(`server failed to become ready:\n${text}`)
    }
  }
  throw new Error('could not start server on any candidate port')
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────────────────────

let base = ''
let cookie = ''

async function req(method, urlPath, { body, headers = {}, raw = false, token } = {}) {
  const h = { ...headers }
  if (cookie) h.Cookie = cookie
  if (token) h.Authorization = `Bearer ${token}`
  let payload = body
  if (body !== undefined && !(body instanceof FormData) && typeof body !== 'string') {
    h['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  const res = await fetch(base + urlPath, { method, headers: h, body: payload })
  if (raw) return res
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, body: json, text, headers: res.headers }
}

function multipart(fields, files) {
  const form = new FormData()
  for (const [k, v] of Object.entries(fields)) form.set(k, v)
  for (const [name, content] of Object.entries(files)) {
    form.append('files', new Blob([content], { type: 'text/markdown' }), name)
  }
  return form
}

function skillMd(name, extra = '') {
  return `---\nname: ${name}\ndescription: smoke test skill\n---\n\n# ${name}\n\nA skill used by the smoke test.\n${extra}\n`
}

/** Signs an account in and returns its bare `session_token` cookie. */
async function loginCookie(handle, password = ADMIN_PASSWORD) {
  const res = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle, password }),
  })
  const raw = res.headers.get('set-cookie') ?? ''
  return res.status === 200 && raw.startsWith('session_token=') ? raw.split(';')[0] : ''
}

/**
 * A complete, valid registration payload. Every required field is filled so a
 * test only has to override the one thing it is actually probing; `overrides`
 * replaces a field outright, so passing `{ email: '' }` really does submit an
 * empty email rather than falling back to the good value.
 */
function applicant(overrides = {}) {
  return {
    handle: 'smoke-newbie',
    password: 'newbie-password',
    displayName: 'Smoke Newbie',
    email: 'newbie@example.com',
    emailCode: EMAIL_CODE,
    country: 'CN',
    organization: 'Example Research',
    jobTitle: 'Senior Analyst',
    officeLocation: 'Shanghai',
    researchNeeds: 'Extracting structured data from listed-company filings.',
    markets: ['a-share', 'hk'],
    ...overrides,
  }
}

/**
 * Registers a handle through the public form and approves it as the signed-in
 * admin, returning the new account's id. Personal tokens no longer exist, so a
 * second account can only be brought up this way.
 */
async function signUpAndApprove(handle) {
  const reg = await req('POST', '/register', {
    body: applicant({
      handle,
      password: ADMIN_PASSWORD,
      email: `${handle}@example.com`,
      displayName: `Smoke ${handle}`,
    }),
  })
  if (reg.status !== 201 && reg.status !== 200) return ''

  const queue = await req('GET', '/api/v1/admin/users?status=pending')
  const account = (queue.body?.data ?? []).find((u) => u.handle === handle)
  if (!account) return ''

  const decision = await req('POST', '/api/v1/admin/users/review', {
    body: { userId: account.id, action: 'approve' },
  })
  return decision.status === 200 ? account.id : ''
}

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────

let server = await startServer()
base = server.base
console.log(`server ready at ${base} (db: ${DB_FILE})`)

try {
  // ── 1. discovery ──────────────────────────────────────────────────────────
  section('Discovery')

  let r = await req('GET', '/healthz')
  check('GET /healthz → 200 {"status":"ok"}', r.status === 200 && r.body?.status === 'ok', r.text)

  r = await req('GET', '/readyz')
  check('GET /readyz → 200 {"status":"ready"}', r.status === 200 && r.body?.status === 'ready', r.text)

  const health = await fetch(`${base}/healthz`)
  check(
    'security headers are set',
    health.headers.get('x-content-type-options') === 'nosniff' &&
      health.headers.get('x-frame-options') === 'DENY',
  )
  check('X-Request-Id is echoed', (health.headers.get('x-request-id') ?? '').length > 0)

  r = await req('GET', '/.well-known/clawhub.json')
  check(
    'GET /.well-known/clawhub.json advertises endpoints',
    r.status === 200 && r.body?.apiVersion === 'v1' && r.body?.endpoints?.publish === '/api/v1/skills',
    r.text,
  )

  r = await req('GET', '/skills.md', { raw: true })
  const skillsMdText = await r.text()
  check(
    'GET /skills.md returns markdown',
    r.status === 200 && (r.headers.get('content-type') ?? '').includes('text/markdown') && skillsMdText.includes('SKILL.md'),
  )

  r = await req('GET', '/api/v1/categories')
  check(
    'GET /api/v1/categories lists the 4 valid categories',
    r.status === 200
      && Array.isArray(r.body?.categories)
      && ['finance', 'personal', 'workspace', 'general'].every((c) => r.body.categories.includes(c)),
    r.text,
  )

  // The browse filter is built from the records, not the advertised taxonomy —
  // the seeded catalogue is filed under design / research / documentation /
  // writing, so a hard-coded list would send every visitor to an empty page.
  r = await req('GET', '/api/v1/categories/in-use')
  check(
    'GET /api/v1/categories/in-use lists what the catalogue actually holds',
    r.status === 200
      && Array.isArray(r.body?.categories)
      && ['design', 'research', 'documentation', 'writing'].every((c) => r.body.categories.includes(c)),
    r.text,
  )
  check(
    'it does not claim the advertised-but-unused taxonomy',
    !r.body.categories.includes('finance'),
    JSON.stringify(r.body?.categories),
  )

  r = await req('GET', '/api/v1/definitely-not-a-route')
  check('unknown API path → 404 JSON', r.status === 404 && r.body?.error === 'not found', r.text)

  // ── 2. authentication ─────────────────────────────────────────────────────
  section('Authentication')

  r = await req('GET', '/api/v1/whoami')
  check('whoami without credentials → 401', r.status === 401, `${r.status} ${r.text}`)

  r = await req('POST', '/login', { body: { handle: ADMIN_USER, password: 'wrong-password' } })
  check('login with a bad password → 401', r.status === 401, `${r.status} ${r.text}`)

  const loginRes = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle: ADMIN_USER, password: ADMIN_PASSWORD }),
  })
  const setCookie = loginRes.headers.get('set-cookie') ?? ''
  cookie = setCookie.split(';')[0]
  check('login with valid credentials sets session_token', loginRes.status === 200 && cookie.startsWith('session_token='), setCookie)

  r = await req('GET', '/api/v1/whoami')
  check(
    'whoami with a session → the admin user',
    r.status === 200 && r.body?.handle === ADMIN_USER && r.body?.role === 'admin',
    r.text,
  )
  check('whoami never leaks passwordHash', r.body?.passwordHash === undefined)

  // The API key is the only programmatic credential; it is minted through the
  // same admin route the console uses, with the session cookie.
  const adminCookie = cookie
  r = await req('POST', '/api/v1/admin/api-keys', {
    body: { name: 'smoke-admin', scopes: ['skills:read', 'skills:publish', 'skills:delete', 'skills:moderate', 'users:moderate'] },
  })
  const adminKey = r.body?.key
  check('POST /admin/api-keys → 201 with an shk_ key', r.status === 201 && typeof adminKey === 'string' && adminKey.startsWith('shk_'), r.text)
  check('the key metadata hides keyHash', r.body?.metadata?.keyHash === undefined)
  check('the key prefix is 16 chars', (r.body?.metadata?.prefix ?? '').length === 16, r.body?.metadata?.prefix)

  r = await req('GET', '/api/v1/whoami', { token: adminKey })
  check('an API key authenticates as its creator', r.status === 200 && r.body?.handle === ADMIN_USER, r.text)

  // Drop the session cookie first: otherwise it would silently authenticate the
  // credential-rejection checks below (the resolver falls back to the cookie).
  cookie = ''

  r = await req('GET', '/api/v1/whoami', { token: 'shk_totally-invalid-key' })
  check('a bogus bearer key → 401', r.status === 401, `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/whoami')
  check('no credential at all → 401', r.status === 401, `${r.status}`)

  // Everything below runs as the signed-in admin — the way the console does it.
  // The routes that only administrators may touch do not carry an API-key scope,
  // so a bearer key is refused on them by design.
  cookie = adminCookie

  // ── 3. publishing ─────────────────────────────────────────────────────────
  section('Skill publishing')

  r = await req('POST', '/api/v1/skills', {
    body: multipart(
      {
        slug: 'smoke-skill',
        version: '1.0.0',
        summary: '冒烟测试技能',
        tags: 'testing,smoke',
        category: 'testing',
        listing: 'listed',
      },
      { 'SKILL.md': skillMd('smoke-skill') },
    ),
  })
  check('publish v1.0.0 → 200 {skill, version}', r.status === 200 && r.body?.skill?.slug === 'smoke-skill' && r.body?.version?.version === '1.0.0', `${r.status} ${r.text.slice(0, 300)}`)
  check('version carries a sha256 fingerprint', /^[0-9a-f]{64}$/.test(r.body?.version?.fingerprint ?? ''), r.body?.version?.fingerprint)
  check('version files list includes SKILL.md', r.body?.version?.files?.[0]?.path === 'SKILL.md', JSON.stringify(r.body?.version?.files))
  check('SKILL.md frontmatter is parsed into `parsed`', r.body?.version?.parsed?.raw === 'name: smoke-skill\ndescription: smoke test skill', JSON.stringify(r.body?.version?.parsed))
  check('skill is published into a personal namespace', r.body?.skill?.namespaceSlug === ADMIN_USER, r.body?.skill?.namespaceSlug)

  const fingerprint = r.body?.version?.fingerprint
  const skillRef = `@${ADMIN_USER}/smoke-skill`

  r = await req('POST', '/api/v1/skills', {
    body: multipart({ slug: 'smoke-skill', version: '1.0.0' }, { 'SKILL.md': skillMd('smoke-skill') }),
  })
  check('publishing a duplicate version → 409', r.status === 409, `${r.status} ${r.text}`)

  r = await req('POST', '/api/v1/skills', {
    body: multipart({ slug: 'smoke-skill', version: '0.9.0' }, { 'SKILL.md': skillMd('smoke-skill') }),
  })
  check(
    'publishing a lower version → 400 with "must be greater"',
    r.status === 400 && /must be greater than current latest/.test(r.body?.error ?? ''),
    `${r.status} ${r.text}`,
  )

  r = await req('POST', '/api/v1/skills', {
    body: multipart({ slug: 'admin', version: '1.0.0' }, { 'SKILL.md': skillMd('x') }),
  })
  check(
    'a reserved slug is rejected → 400',
    r.status === 400 && /is reserved/.test(r.body?.error ?? ''),
    `${r.status} ${r.text}`,
  )

  r = await req('POST', '/api/v1/skills', {
    body: multipart({ slug: 'bad-semver', version: '1.0' }, { 'SKILL.md': skillMd('x') }),
  })
  check('a non-semver version is rejected → 400', r.status === 400 && /must be valid semver/.test(r.body?.error ?? ''), `${r.status} ${r.text}`)

  // ── 4. reading ────────────────────────────────────────────────────────────
  section('Browsing and reading')

  r = await req('GET', '/api/v1/skills?limit=10')
  check(
    'GET /api/v1/skills lists the published skill',
    r.status === 200 && r.body?.data?.some((s) => s.slug === 'smoke-skill'),
    r.text.slice(0, 200),
  )
  check('the list response always includes nextCursor', typeof r.body?.nextCursor === 'string')

  r = await req('GET', '/api/v1/skills?limit=10&q=smoke-skill')
  check(
    'the list q filter matches by slug',
    r.status === 200 && r.body?.data?.some((s) => s.slug === 'smoke-skill'),
    `${r.status} count=${r.body?.data?.length}`,
  )

  r = await req('GET', `/api/v1/skills?limit=10&q=${encodeURIComponent('冒烟测试')}`)
  check(
    'the list q filter matches by summary',
    r.status === 200 && r.body?.data?.some((s) => s.slug === 'smoke-skill'),
    `${r.status} count=${r.body?.data?.length}`,
  )

  r = await req('GET', '/api/v1/skills?limit=10&q=no-such-keyword-xyz')
  check(
    'the list q filter drops non-matching skills',
    r.status === 200 && r.body?.data?.length === 0,
    `${r.status} count=${r.body?.data?.length}`,
  )

  r = await req('GET', `/api/v1/skills/${skillRef}`)
  check('GET namespaced skill detail → 200', r.status === 200 && r.body?.slug === 'smoke-skill', `${r.status} ${r.text.slice(0, 200)}`)
  check('ownerHandle is populated', r.body?.ownerHandle === ADMIN_USER, r.body?.ownerHandle)

  r = await req('GET', '/api/v1/skills/smoke-skill')
  check(
    'the legacy slug route sends deprecation headers',
    r.headers.get('deprecation') === 'true' && r.headers.get('sunset') === '2026-12-31',
    `deprecation=${r.headers.get('deprecation')} sunset=${r.headers.get('sunset')}`,
  )

  r = await req('GET', `/api/v1/skills/${skillRef}`)
  check(
    'the namespaced route is not deprecated',
    r.headers.get('deprecation') === null,
    `deprecation=${r.headers.get('deprecation')}`,
  )

  r = await req('GET', `/api/v1/skills/smoke-skill`)
  check('a bare slug resolves when unambiguous', r.status === 200 && r.body?.slug === 'smoke-skill', `${r.status}`)

  r = await req('GET', `/api/v1/skills/${skillRef}/versions`)
  check('version history has one entry', r.status === 200 && r.body?.versions?.length === 1, r.text.slice(0, 200))

  r = await req('GET', `/api/v1/skills/${skillRef}/file?version=latest&path=SKILL.md`, { raw: true })
  const fileText = await r.text()
  check(
    'GET .../file returns the raw SKILL.md as text/plain',
    r.status === 200 &&
      (r.headers.get('content-type') ?? '').includes('text/plain') &&
      fileText.includes('# smoke-skill'),
    `${r.status} ${fileText.slice(0, 80)}`,
  )

  r = await req('GET', `/api/v1/resolve?fingerprint=${fingerprint}`)
  check(
    'GET /api/v1/resolve finds the version by fingerprint',
    r.status === 200 && r.body?.version?.version === '1.0.0' && r.body?.skill?.slug === 'smoke-skill',
    r.text.slice(0, 200),
  )

  r = await req('GET', '/api/v1/resolve')
  check('resolve without a fingerprint → 400', r.status === 400 && r.body?.error === 'fingerprint is required', r.text)

  // ── 5. download ───────────────────────────────────────────────────────────
  section('Download')

  // Archives need an account now; single-file reads below stay open, which is
  // what lets a signed-out visitor read a skill's page.
  const anonDl = await fetch(`${base}/api/v1/download?slug=smoke-skill&version=latest`)
  check('download without credentials → 401', anonDl.status === 401, `${anonDl.status}`)

  const anonFile = await fetch(`${base}/api/v1/skills/smoke-skill/file?version=latest&path=SKILL.md`)
  check('reading a single skill file still works signed out → 200', anonFile.status === 200, `${anonFile.status}`)

  const authHeader = { Cookie: adminCookie }
  const dl = await fetch(`${base}/api/v1/download?slug=smoke-skill&version=latest`, { headers: authHeader })
  const zipBytes = new Uint8Array(await dl.arrayBuffer())
  check('download with credentials → 200 application/zip', dl.status === 200 && dl.headers.get('content-type') === 'application/zip', `${dl.status}`)
  check('zip has a PK header', zipBytes[0] === 0x50 && zipBytes[1] === 0x4b, `first bytes: ${zipBytes[0]},${zipBytes[1]}`)
  check('ETag is the version fingerprint', dl.headers.get('etag') === `"${fingerprint}"`, dl.headers.get('etag'))
  check('X-Skill-Version is set', dl.headers.get('x-skill-version') === '1.0.0', dl.headers.get('x-skill-version'))
  check(
    'Content-Disposition names the bundle',
    (dl.headers.get('content-disposition') ?? '').includes('smoke-skill-1.0.0.zip'),
    dl.headers.get('content-disposition'),
  )

  const cached = await fetch(`${base}/api/v1/download?slug=smoke-skill&version=latest`, {
    headers: { ...authHeader, 'If-None-Match': `"${fingerprint}"` },
  })
  check('If-None-Match on the fingerprint → 304', cached.status === 304, `${cached.status}`)

  r = await req('GET', '/api/v1/download')
  check('download without slug → 400', r.status === 400 && r.body?.error === 'slug is required', r.text)

  r = await req('GET', '/api/v1/skills/smoke-skill')
  check(
    'a download increments the counter (deduped by identity)',
    (r.body?.downloads ?? 0) >= 1,
    `downloads=${r.body?.downloads}`,
  )

  // ── 6. search ─────────────────────────────────────────────────────────────
  section('Search')

  r = await req('GET', '/api/v1/search?q=smoke')
  check(
    'search matches the slug',
    r.status === 200 && r.body?.hits?.some((h) => h.slug === 'smoke-skill'),
    r.text.slice(0, 250),
  )
  check('search response uses estimatedTotalHits', typeof r.body?.estimatedTotalHits === 'number')
  check('search hits expose ownerHandleExact', r.body?.hits?.[0]?.ownerHandleExact !== undefined)

  r = await req('GET', '/api/v1/search?q=冒烟')
  check(
    'search matches CJK in the summary (trigram tokenizer)',
    r.status === 200 && r.body?.hits?.some((h) => h.slug === 'smoke-skill'),
    r.text.slice(0, 250),
  )

  r = await req('GET', '/api/v1/search')
  check('search without q → 400', r.status === 400 && /'q' is required/.test(r.body?.error ?? ''), r.text)

  // ── 7. social ─────────────────────────────────────────────────────────────
  section('Stars, ratings, comments')

  r = await req('POST', '/api/v1/skills/smoke-skill/comments', { body: { body: '  第一条评论  ' } })
  check(
    'POST a comment → 200 with the bare comment',
    r.status === 200 && r.body?.body === '第一条评论' && r.body?.handle === undefined,
    `${r.status} ${r.text.slice(0, 200)}`,
  )
  check('comment body is trimmed', r.body?.body === '第一条评论')

  r = await req('GET', '/api/v1/skills/smoke-skill/comments')
  check(
    'GET comments returns the author join fields',
    r.status === 200 && r.body?.data?.[0]?.handle === ADMIN_USER,
    r.text.slice(0, 200),
  )

  r = await req('POST', '/api/v1/skills/smoke-skill/ratings', { body: { score: 5, comment: '很好' } })
  check(
    'rating your own skill → 400 "cannot rate your own skill"',
    r.status === 400 && /cannot rate your own skill/.test(r.body?.error ?? ''),
    `${r.status} ${r.text}`,
  )

  r = await req('GET', '/api/v1/skills/smoke-skill/ratings')
  check('GET ratings → 200 with an empty list', r.status === 200 && Array.isArray(r.body?.data), r.text.slice(0, 150))

  r = await req('POST', '/api/v1/stars/smoke-skill')
  check('star a skill → 200 {"message":"starred"}', r.status === 200 && r.body?.message === 'starred', `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/skills/smoke-skill')
  check('starring updates starsCount', r.body?.starsCount === 1, `starsCount=${r.body?.starsCount}`)

  r = await req('DELETE', '/api/v1/stars/smoke-skill')
  check('unstar → 200', r.status === 200 && r.body?.message === 'unstarred', r.text)

  // ── 8. version lifecycle ──────────────────────────────────────────────────
  section('Version lifecycle')

  r = await req('POST', '/api/v1/skills', {
    body: multipart(
      { slug: 'smoke-skill', version: '1.1.0', changelog: 'second release', listing: 'listed' },
      { 'SKILL.md': skillMd('smoke-skill', 'extra line') },
    ),
  })
  check('publish v1.1.0 → 200', r.status === 200 && r.body?.version?.version === '1.1.0', `${r.status} ${r.text.slice(0, 200)}`)

  r = await req('GET', '/api/v1/skills/smoke-skill/file?version=latest&path=SKILL.md', { raw: true })
  const latestText = await r.text()
  check('latest now resolves to v1.1.0', latestText.includes('extra line'), latestText.slice(0, 80))

  r = await req('POST', '/api/v1/skills/smoke-skill/versions/1.1.0/yank', { body: { reason: 'broken' } })
  check('yank v1.1.0 → 200', r.status === 200 && r.body?.message === 'version yanked', `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/skills/smoke-skill/file?version=latest&path=SKILL.md', { raw: true })
  const afterYank = await r.text()
  check('latest falls back to the newest non-yanked version after a yank', !afterYank.includes('extra line') && afterYank.includes('# smoke-skill'), afterYank.slice(0, 80))

  const pinned = await req('GET', '/api/v1/skills/smoke-skill/file?version=1.1.0&path=SKILL.md', { raw: true })
  check('a yanked version is still fetchable by exact pin', pinned.status === 200, `${pinned.status}`)

  r = await req('POST', '/api/v1/skills/smoke-skill/versions/1.1.0/yank', { body: { reason: 'again' } })
  check('yanking twice → 400 "already yanked"', r.status === 400 && /already yanked/.test(r.body?.error ?? ''), `${r.status} ${r.text}`)

  r = await req('DELETE', '/api/v1/skills/smoke-skill/versions/1.1.0/yank')
  check('unyank → 200', r.status === 200, `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/skills/smoke-skill/file?version=latest&path=SKILL.md', { raw: true })
  check('latest returns to v1.1.0 after unyank', (await r.text()).includes('extra line'))

  r = await req('POST', '/api/v1/skills/smoke-skill/versions/1.1.0/yank', {
    headers: { 'Content-Type': 'application/json' },
    body: '{not valid json',
  })
  check('malformed JSON on skill yank → 400', r.status === 400 && r.body?.error === 'invalid JSON body', `${r.status} ${r.text}`)

  // ── 9. listing ──────────────────────────────────────────────────────────
  section('Listing and permissions')

  r = await req('POST', '/api/v1/skills', {
    body: multipart(
      { slug: 'unlisted-skill', version: '1.0.0', listing: 'unlisted' },
      { 'SKILL.md': skillMd('unlisted-skill') },
    ),
  })
  check('publish an unlisted skill → 200', r.status === 200, `${r.status} ${r.text.slice(0, 200)}`)

  r = await req('POST', '/api/v1/skills', {
    body: multipart({ slug: 'default-listing-skill', version: '1.0.0' }, { 'SKILL.md': skillMd('default') }),
  })
  check(
    'omitting listing inherits the personal namespace default (unlisted)',
    r.status === 200 && r.body?.skill?.listing === 'unlisted',
    r.body?.skill?.listing,
  )

  // Anonymous readers must not see it; the owner (the signed-in admin) can.
  cookie = ''
  r = await req('GET', '/api/v1/skills/unlisted-skill')
  check('an unlisted skill is invisible to anonymous callers → 404', r.status === 404 && r.body?.error === 'skill not found', `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/skills?limit=50')
  check(
    'the catalogue omits the unlisted skill',
    !(r.body?.data ?? []).some((s) => s.slug === 'unlisted-skill'),
  )

  cookie = adminCookie
  r = await req('GET', '/api/v1/skills/unlisted-skill')
  check('the owner can read their own unlisted skill', r.status === 200, `${r.status}`)

  cookie = ''
  r = await req('POST', '/api/v1/skills', {
    body: multipart({ slug: 'anon-skill', version: '1.0.0' }, { 'SKILL.md': skillMd('x') }),
  })
  check('publishing without credentials → 401', r.status === 401, `${r.status}`)
  cookie = adminCookie

  // A non-admin user must be refused on admin routes. Personal tokens are gone,
  // so the plain account goes through the real sign-up path and is identified by
  // its session cookie from then on.
  const smokeUserId = await signUpAndApprove('smokeuser')
  check('a self-service sign-up is approved by an admin', smokeUserId !== '', `${smokeUserId}`)

  const plainUserCookie = await loginCookie('smokeuser')
  check('the plain user can sign in', plainUserCookie !== '', `${plainUserCookie}`)

  cookie = plainUserCookie
  r = await req('GET', '/api/v1/admin/users')
  check('a non-admin hitting an admin route → 403', r.status === 403, `${r.status} ${r.text}`)
  cookie = adminCookie

  cookie = ''
  r = await req('GET', '/api/v1/admin/users', { token: 'sess_bogus' })
  check('admin route without valid auth → 401', r.status === 401, `${r.status}`)
  cookie = adminCookie

  // ── 10. namespaces ────────────────────────────────────────────────────────
  section('Namespaces')

  r = await req('POST', '/api/v1/namespaces', { body: { slug: 'smoke-team', displayName: 'Smoke Team' } })
  check('create a namespace → 201', r.status === 201 && r.body?.slug === 'smoke-team', `${r.status} ${r.text.slice(0, 200)}`)

  r = await req('POST', '/api/v1/namespaces', { body: { slug: 'smoke-team' } })
  check('a duplicate namespace slug → 400', r.status === 400 && /already taken/.test(r.body?.error ?? ''), `${r.status} ${r.text}`)

  r = await req('POST', '/api/v1/namespaces', { body: { slug: 'AB' } })
  check('an invalid namespace slug → 400', r.status === 400, `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/namespaces')
  check('list namespaces includes the new one', r.body?.data?.some((n) => n.slug === 'smoke-team'), r.text.slice(0, 200))

  r = await req('POST', '/api/v1/namespaces/smoke-team/members', { body: { handle: 'smokeuser', role: 'member' } })
  check('add a member → 200', r.status === 200 && r.body?.message === 'member added', `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/namespaces/smoke-team/members')
  check(
    'member list includes both users with handles',
    r.body?.data?.length === 2 &&
      r.body.data.some((m) => m.handle === 'smokeuser' && m.displayName === 'Smoke smokeuser'),
    r.text.slice(0, 250),
  )

  // The team-token surface is gone; namespace binding is covered by the
  // namespace-scoped API keys in the "Admin API keys" section below.

  // ── 12. agent skill API ───────────────────────────────────────────────────
  section('Agent skill API')

  r = await req('POST', '/api/agent/skills', {
    body: multipart(
      { slug: 'agent-skill', version: '1.0.0', listing: 'listed' },
      { 'SKILL.md': skillMd('agent-skill') },
    ),
  })
  check(
    'POST /api/agent/skills → 201 with the agent envelope',
    r.status === 201 && r.body?.data?.skill?.slug === 'agent-skill' && typeof r.body?.requestId === 'string',
    `${r.status} ${r.text.slice(0, 250)}`,
  )

  r = await req('POST', '/api/agent/skills', {
    body: multipart({ slug: 'agent-no-md', version: '1.0.0' }, { 'notes.txt': 'no skill md here' }),
  })
  check(
    'agent publish without SKILL.md → 400 INVALID_SKILL_MD',
    r.status === 400 && r.body?.error?.code === 'INVALID_SKILL_MD',
    `${r.status} ${r.text.slice(0, 250)}`,
  )

  r = await req('GET', '/api/agent/skills?page=1&pageSize=50')
  check(
    'agent skill list returns items and pagination',
    r.status === 200 && Array.isArray(r.body?.data) && r.body?.pagination?.pageSize === 50,
    r.text.slice(0, 250),
  )
  check(
    'agent list items use skillhubId + status',
    r.body?.data?.every((it) => it.skillhubId.startsWith('@') && it.status === 'ACTIVE'),
    r.text.slice(0, 250),
  )

  const agentItem = r.body?.data?.find((it) => it.name === 'agent-skill')
  r = await req('GET', `/api/agent/skills/${agentItem?.id}` )
  check(
    'agent skill detail includes skillMd and detail',
    r.status === 200 && typeof r.body?.data?.skillMd === 'string' && r.body.data.skillMd.includes('# agent-skill'),
    `${r.status} ${r.text.slice(0, 200)}`,
  )

  r = await req('GET', `/api/agent/skills/${agentItem?.id}/download` )
  check(
    'agent download returns an archive URL',
    r.status === 200 && /\/api\/agent\/skills\/.+\/archive$/.test(r.body?.data?.downloadUrl ?? ''),
    r.text.slice(0, 250),
  )

  const archive = await fetch(`${base}/api/agent/skills/${agentItem?.id}/archive`, {
    headers: { Cookie: adminCookie },
  })
  const archiveBytes = new Uint8Array(await archive.arrayBuffer())
  check(
    'agent archive streams a zip with a sha256 header',
    archive.status === 200 && archiveBytes[0] === 0x50 && /^[0-9a-f]{64}$/.test(archive.headers.get('x-content-sha256') ?? ''),
    `${archive.status}`,
  )

  r = await req('GET', '/api/agent/skills/not-a-uuid')
  check('agent detail with a bad id → 400 INVALID_REQUEST', r.status === 400 && r.body?.error?.code === 'INVALID_REQUEST', `${r.status} ${r.text}`)

  // ── 13. runtime API ───────────────────────────────────────────────────────
  section('Runtime API')

  r = await req('GET', '/api/runtime/capabilities')
  check(
    'runtime capabilities describe the API version',
    r.status === 200 && r.body?.runtimeSkills?.resolve === true && r.body.runtimeSkills.version === '2026-06-17',
    r.text,
  )

  r = await req('GET', `/api/runtime/skills/by-slug?slug=${skillRef}`)
  check(
    'runtime by-slug returns a digest + version',
    r.status === 200 && r.body?.version === '1.1.0' && /^sha256:[0-9a-f]{64}$/.test(r.body?.digest ?? ''),
    `${r.status} ${r.text.slice(0, 250)}`,
  )

  r = await req('GET', '/api/runtime/skills/by-slug')
  check('runtime by-slug without a slug → 400 invalid_ref', r.status === 400 && r.body?.error?.code === 'invalid_ref', `${r.status} ${r.text}`)

  r = await req(
    'POST',
    '/api/runtime/skills/resolve',
    { body: { refs: [{ slug: skillRef }], include: ['manifest', 'skillMd'] } },
  )
  check(
    'runtime resolve returns per-ref results with an inlined manifest',
    r.status === 200 && r.body?.results?.[0]?.skill?.manifest?.entrypoint === 'SKILL.md',
    `${r.status} ${r.text.slice(0, 300)}`,
  )
  check(
    'runtime resolve inlines skillMd when requested',
    typeof r.body?.results?.[0]?.skill?.skillMd === 'string',
    r.text.slice(0, 250),
  )

  r = await req('POST', '/api/runtime/skills/resolve', { body: { refs: [] } })
  check('runtime resolve with no refs → 400 "refs is required"', r.status === 400 && r.body?.error?.code === 'invalid_ref', `${r.status} ${r.text}`)

  r = await req('GET', '/api/runtime/skills?limit=100')
  check(
    'runtime list yields active entries',
    r.status === 200 && (r.body?.data ?? []).length > 0 && r.body.data.every((it) => it.status === 'active'),
    r.text.slice(0, 250),
  )

  const anonBundle = await fetch(`${base}/api/runtime/skills/bundle?slug=${skillRef}`)
  check('runtime bundle without credentials → 401', anonBundle.status === 401, `${anonBundle.status}`)

  const bundleRes = await fetch(`${base}/api/runtime/skills/bundle?slug=${skillRef}`, { headers: authHeader })
  const bundleBytes = new Uint8Array(await bundleRes.arrayBuffer())
  check(
    'runtime bundle streams a zip with digest headers',
    bundleRes.status === 200 && bundleBytes[0] === 0x50 && (bundleRes.headers.get('x-saker-skill-digest') ?? '').startsWith('sha256:'),
    `${bundleRes.status}`,
  )

  // Package files must carry a real Content-Type: the site sends
  // `X-Content-Type-Options: nosniff`, so a typeless image is not rendered.
  const ICON_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  r = await req(
    'POST',
    '/api/v1/skills',
    { body: multipart({ slug: 'smoke-skill', version: '1.2.0' }, { 'SKILL.md': skillMd('smoke-skill'), 'assets/icon.png': Buffer.from(ICON_PNG, 'base64') }) },
  )
  check('publish with a package image → 200', r.status === 200 && r.body?.version?.version === '1.2.0', `${r.status} ${r.text.slice(0, 200)}`)
  const iconRes = await fetch(`${base}/api/runtime/skills/files?slug=${encodeURIComponent(skillRef)}&path=assets%2Ficon.png`)
  check(
    'runtime file serves images with a proper Content-Type',
    iconRes.status === 200 && iconRes.headers.get('content-type') === 'image/png',
    `${iconRes.status} ${iconRes.headers.get('content-type')}`,
  )

  // ── 14. registration & account review ─────────────────────────────────────
  section('Registration & account review')

  r = await req('GET', '/api/v1/registration')
  check('GET /api/v1/registration reports sign-up is open', r.status === 200 && r.body?.enabled === true, r.text)

  const NEWBIE = 'smoke-newbie'
  const NEWBIE_PASSWORD = 'newbie-password'

  r = await req('POST', '/register', { body: applicant() })
  check('POST /register → 201 awaiting review', r.status === 201 && r.body?.status === 'pending', `${r.status} ${r.text}`)

  // The profile travels with the account, because that is what the reviewer
  // reads before deciding.
  const submitted = await req('GET', '/api/v1/admin/users?status=pending')
  const submittedUser = (submitted.body?.data ?? []).find((u) => u.handle === NEWBIE)
  check(
    'registration stores the applicant profile',
    submittedUser?.displayName === 'Smoke Newbie' &&
      submittedUser?.country === 'CN' &&
      submittedUser?.organization === 'Example Research' &&
      submittedUser?.jobTitle === 'Senior Analyst' &&
      submittedUser?.officeLocation === 'Shanghai' &&
      submittedUser?.researchNeeds === 'Extracting structured data from listed-company filings.' &&
      Array.isArray(submittedUser?.markets) &&
      submittedUser.markets.join(',') === 'a-share,hk',
    JSON.stringify(submittedUser ?? {}).slice(0, 300),
  )

  r = await req('POST', '/register', {
    body: applicant({ handle: 'smoke-no-office', email: 'smoke-no-office@example.com', officeLocation: undefined }),
  })
  check(
    'an omitted office location is allowed',
    r.status === 201, `${r.status} ${r.text}`,
  )
  const noOffice = await req('GET', '/api/v1/admin/users?status=pending')
  const noOfficeUser = (noOffice.body?.data ?? []).find((u) => u.handle === 'smoke-no-office')
  check(
    'a blank office location is absent rather than an empty string',
    noOfficeUser?.officeLocation === undefined,
    JSON.stringify(noOfficeUser?.officeLocation),
  )

  r = await req('POST', '/register', { body: applicant({ handle: NEWBIE, email: 'other-taken@example.com' }) })
  check('registering a taken handle → 400', r.status === 400 && /already exists/.test(r.body?.error ?? ''), `${r.status} ${r.text}`)

  r = await req('POST', '/register', { body: applicant({ handle: 'smoke-no-email', email: '' }) })
  check('registering without an email → 400 email required', r.status === 400 && /email is required/.test(r.body?.error ?? ''), `${r.status} ${r.text}`)

  r = await req('POST', '/register', { body: applicant({ handle: 'smoke-bad-email', email: 'not-an-email' }) })
  check('registering with an invalid email → 400', r.status === 400 && /email is not a valid address/.test(r.body?.error ?? ''), `${r.status} ${r.text}`)

  // ── email verification code ────────────────────────────────────────────────
  r = await req('POST', '/register', { body: applicant({ handle: 'smoke-no-code', emailCode: '' }) })
  check(
    'registering without a verification code → 400',
    r.status === 400 && /verification code is incorrect/.test(r.body?.error ?? ''),
    `${r.status} ${r.text}`,
  )

  r = await req('POST', '/register', { body: applicant({ handle: 'smoke-wrong-code', emailCode: '654321' }) })
  check(
    'registering with a wrong verification code → 400',
    r.status === 400 && /verification code is incorrect/.test(r.body?.error ?? ''),
    `${r.status} ${r.text}`,
  )

  // The address is checked before the code, so a typo'd address reports the
  // address problem rather than a confusing code error.
  r = await req('POST', '/register', { body: applicant({ handle: 'smoke-code-and-bad-email', email: 'not-an-email', emailCode: '000000' }) })
  check(
    'a malformed email is reported before the code is checked',
    r.status === 400 && /email is not a valid address/.test(r.body?.error ?? ''),
    `${r.status} ${r.text}`,
  )

  r = await req('POST', '/register', { body: applicant({ handle: 'smoke-code-ok', email: 'smoke-code-ok@example.com', emailCode: EMAIL_CODE }) })
  check(
    `registering with the correct code (${EMAIL_CODE}) → 201`,
    r.status === 201 && r.body?.status === 'pending',
    `${r.status} ${r.text}`,
  )

  const codeQueue = await req('GET', '/api/v1/admin/users?status=pending')
  const codeUser = (codeQueue.body?.data ?? []).find((u) => u.handle === 'smoke-code-ok')
  check(
    'the verified account lands with its address intact',
    codeUser?.email === 'smoke-code-ok@example.com' && codeUser?.status === 'pending',
    JSON.stringify(codeUser?.email ?? null),
  )

  // ── requesting a code ─────────────────────────────────────────────────────
  r = await req('POST', '/register/email-code', { body: { email: '' } })
  check('requesting a code without an address → 400', r.status === 400 && /email is required/.test(r.body?.error ?? ''), `${r.status} ${r.text}`)

  r = await req('POST', '/register/email-code', { body: { email: 'not-an-email' } })
  check(
    'requesting a code for a malformed address → 400',
    r.status === 400 && /not a valid address/.test(r.body?.error ?? ''),
    `${r.status} ${r.text}`,
  )

  const SEND_ADDRESS = 'smoke-send@example.com'
  r = await req('POST', '/register/email-code', { body: { email: SEND_ADDRESS } })
  check(
    `the first send reports the full ${COOLDOWN}s window it opened`,
    r.status === 200 && r.body?.sent === true && r.body?.cooldownSeconds === COOLDOWN,
    `${r.status} ${r.text}`,
  )

  // The cooldown is the whole point: the wait is decided by the server, so a
  // page reload cannot hand back a usable button. Asking again inside the
  // window reports the time still to wait and says nothing was sent.
  r = await req('POST', '/register/email-code', { body: { email: SEND_ADDRESS } })
  check(
    `an immediate second send is suppressed and reports the ${COOLDOWN}s wait`,
    r.status === 200 &&
      r.body?.sent === false &&
      r.body?.cooldownSeconds > 0 &&
      r.body.cooldownSeconds <= COOLDOWN,
    `${r.status} ${r.text}`,
  )

  r = await req('POST', '/register/email-code', { body: { email: 'smoke-send-other@example.com' } })
  check(
    'a different address is unaffected by the first one’s wait',
    r.status === 200 && r.body?.sent === true && r.body?.cooldownSeconds === COOLDOWN,
    `${r.status} ${r.text}`,
  )

  // Case-insensitive, matching how the address itself is stored.
  r = await req('POST', '/register/email-code', { body: { email: SEND_ADDRESS.toUpperCase() } })
  check(
    'the same address in a different case is still cooling down',
    r.status === 200 && r.body?.cooldownSeconds > 0,
    `${r.status} ${r.text}`,
  )

  cookie = ''
  r = await req('POST', '/register/email-code', { body: { email: 'smoke-anon@example.com' } })
  check('requesting a code works signed out (the form is public) → 200', r.status === 200, `${r.status} ${r.text}`)
  cookie = adminCookie

  // Looking must not send: if a lookup started the wait, simply typing an
  // address would use up the one send the user had available.
  r = await req('GET', `/register/email-code?email=${encodeURIComponent('smoke-lookup@example.com')}`)
  check(
    'looking up an unknown address reports no wait',
    r.status === 200 && r.body?.cooldownSeconds === 0,
    `${r.status} ${r.text}`,
  )

  r = await req('GET', `/register/email-code?email=${encodeURIComponent(SEND_ADDRESS)}`)
  check(
    'looking up an address mid-wait reports the time left',
    r.status === 200 && r.body?.cooldownSeconds > 0 && r.body.cooldownSeconds <= COOLDOWN,
    `${r.status} ${r.text}`,
  )

  r = await req('GET', `/register/email-code?email=${encodeURIComponent('not-an-email')}`)
  check('looking up a malformed address → 400', r.status === 400 && /not a valid address/.test(r.body?.error ?? ''), `${r.status} ${r.text}`)

  cookie = ''
  r = await req('GET', '/register/email-code?email=smoke-lookup@example.com')
  check('looking up a wait works signed out → 200', r.status === 200, `${r.status} ${r.text}`)
  cookie = adminCookie

  r = await req('POST', '/register', { body: applicant({ handle: 'smoke-dup-email', email: 'newbie@example.com' }) })
  check('registering with a duplicate email → 400', r.status === 400 && /already registered/.test(r.body?.error ?? ''), `${r.status} ${r.text}`)

  r = await req('POST', '/register', { body: applicant({ handle: 'smoke-short', password: 'short' }) })
  check('registering with a too-short password → 400', r.status === 400 && /at least/.test(r.body?.error ?? ''), `${r.status} ${r.text}`)

  r = await req('POST', '/register', { body: applicant({ handle: 'x' }) })
  check('registering a one-character handle → 400', r.status === 400 && /invalid username/.test(r.body?.error ?? ''), `${r.status} ${r.text}`)

  // ── every profile field is required ───────────────────────────────────────
  const requiredProfile = [
    ['displayName', /name is required/],
    ['country', /country or region is required/],
    ['organization', /organization is required/],
    ['jobTitle', /job title is required/],
    ['researchNeeds', /research needs is required/],
    ['markets', /at least one market/],
  ]
  for (const [field, pattern] of requiredProfile) {
    r = await req('POST', '/register', {
      body: applicant({
        handle: `smoke-missing-${field}`,
        email: `smoke-missing-${field}@example.com`,
        [field]: Array.isArray(applicant()[field]) ? [] : '   ',
      }),
    })
    check(
      `registering without ${field} → 400`,
      r.status === 400 && pattern.test(r.body?.error ?? ''),
      `${r.status} ${r.text}`,
    )
  }

  r = await req('POST', '/register', { body: applicant({ handle: 'smoke-bad-country', country: 'ZZ' }) })
  check('registering with an unknown country code → 400', r.status === 400 && /not a supported option/.test(r.body?.error ?? ''), `${r.status} ${r.text}`)

  r = await req('POST', '/register', { body: applicant({ handle: 'smoke-bad-market', markets: ['not-a-market'] }) })
  check('registering with only unknown markets → 400', r.status === 400 && /at least one market/.test(r.body?.error ?? ''), `${r.status} ${r.text}`)

  const signIn = async (password) => {
    const res = await fetch(`${base}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: NEWBIE, password }),
    })
    return { res, body: await res.json().catch(() => ({})) }
  }

  // A registration holds no session until an admin approves it.
  let pending = await signIn(NEWBIE_PASSWORD)
  check(
    'a pending account cannot sign in → 403 account_pending',
    pending.res.status === 403 && pending.body?.code === 'account_pending',
    `${pending.res.status} ${JSON.stringify(pending.body)}`,
  )

  r = await req('GET', '/api/v1/admin/users?status=pending')
  const pendingUser = (r.body?.data ?? []).find((u) => u.handle === NEWBIE)
  check(
    'the review queue lists the new account',
    r.status === 200 && !!pendingUser?.id && r.body?.pendingCount >= 1,
    r.text.slice(0, 250),
  )
  check('the review queue never leaks passwordHash', pendingUser?.passwordHash === undefined)

  const approvedView = await req('GET', '/api/v1/admin/users?status=approved')
  check('a pending account is filtered out of the approved view', !(approvedView.body?.data ?? []).some((u) => u.handle === NEWBIE), approvedView.text.slice(0, 200))

  r = await req('GET', '/api/v1/admin/users?status=bogus')
  check('an unknown status filter is ignored rather than rejected', r.status === 200, `${r.status} ${r.text.slice(0, 120)}`)

  r = await req('POST', '/api/v1/admin/users/review', { body: { userId: pendingUser.id, action: 'reject', note: 'smoke rejection' } })
  check('rejecting a sign-up → 200 "user rejected"', r.status === 200 && r.body?.message === 'user rejected', `${r.status} ${r.text}`)

  const rejected = await signIn(NEWBIE_PASSWORD)
  check(
    'a rejected account still cannot sign in → 403 account_rejected',
    rejected.res.status === 403 && rejected.body?.code === 'account_rejected',
    `${rejected.res.status} ${JSON.stringify(rejected.body)}`,
  )

  r = await req('POST', '/api/v1/admin/users/review', { body: { userId: pendingUser.id, action: 'approve' } })
  check('approving the same sign-up → 200 "user approved"', r.status === 200 && r.body?.message === 'user approved', `${r.status} ${r.text}`)

  const approved = await signIn(NEWBIE_PASSWORD)
  check(
    'an approved account can sign in and gets a session',
    approved.res.status === 200 && (approved.res.headers.get('set-cookie') ?? '').startsWith('session_token='),
    `${approved.res.status}`,
  )

  // ── approval is final ─────────────────────────────────────────────────────
  // Once an account is let in it must not be revocable through the review
  // endpoint: the user is already active, and the rejection copy they would be
  // shown ("your registration was not approved") would be untrue. Withdrawing
  // access is what the ban endpoint is for.
  r = await req('POST', '/api/v1/admin/users/review', { body: { userId: pendingUser.id, action: 'reject', note: 'should not apply' } })
  check(
    'rejecting an already-approved account → 400 pointing at ban',
    r.status === 400 && /already been approved/.test(r.body?.error ?? '') && /ban/.test(r.body?.error ?? ''),
    `${r.status} ${r.text}`,
  )

  const stillApproved = await signIn(NEWBIE_PASSWORD)
  check(
    'the refused rejection leaves the account able to sign in',
    stillApproved.res.status === 200,
    `${stillApproved.res.status} ${JSON.stringify(stillApproved.body)}`,
  )

  const afterRefusal = await req('GET', '/api/v1/admin/users?status=approved')
  check(
    'the account is still listed as approved',
    (afterRefusal.body?.data ?? []).some((u) => u.handle === NEWBIE && u.status === 'approved'),
    afterRefusal.text.slice(0, 200),
  )

  // Repeating a decision that is already on record changes nothing and writes
  // no second audit row — a double-clicked button must not fail or re-audit.
  r = await req('POST', '/api/v1/admin/users/review', { body: { userId: pendingUser.id, action: 'approve' } })
  check('re-approving an approved account → 200 (no-op)', r.status === 200 && r.body?.message === 'user approved', `${r.status} ${r.text}`)

  const auditsBefore = (await req('GET', '/api/v1/admin/audit-logs?limit=200')).body?.data ?? []
  const approveCountBefore = auditsBefore.filter((l) => l.action === 'review_user_approve' && l.resourceId === pendingUser.id).length
  await req('POST', '/api/v1/admin/users/review', { body: { userId: pendingUser.id, action: 'approve' } })
  const auditsAfter = (await req('GET', '/api/v1/admin/audit-logs?limit=200')).body?.data ?? []
  const approveCountAfter = auditsAfter.filter((l) => l.action === 'review_user_approve' && l.resourceId === pendingUser.id).length
  check(
    'a repeated approval writes no extra audit row',
    approveCountAfter === approveCountBefore,
    `${approveCountBefore} → ${approveCountAfter}`,
  )

  r = await req('POST', '/api/v1/admin/users/review', { body: { userId: pendingUser.id, action: 'explode' } })
  check('an unknown review action → 400', r.status === 400 && /approve, reject/.test(r.body?.error ?? ''), `${r.status} ${r.text}`)

  r = await req('POST', '/api/v1/admin/users/review', { body: { userId: 'not-a-uuid', action: 'approve' } })
  check('a malformed user id → 400', r.status === 400 && r.body?.error === 'invalid user ID', `${r.status} ${r.text}`)

  r = await req('POST', '/api/v1/admin/users/review', { body: { userId: crypto.randomUUID(), action: 'approve' } })
  check('reviewing an unknown account → 404', r.status === 404, `${r.status} ${r.text}`)

  cookie = ''
  r = await req('POST', '/api/v1/admin/users/review', { body: { userId: pendingUser.id, action: 'approve' } })
  check('reviewing without credentials → 401', r.status === 401, `${r.status} ${r.text}`)
  cookie = adminCookie

  r = await req('GET', '/api/v1/admin/audit-logs?limit=100')
  check(
    'the review decisions are audited',
    r.status === 200
      && (r.body?.data ?? []).some((l) => l.action === 'review_user_approve')
      && (r.body?.data ?? []).some((l) => l.action === 'review_user_reject'),
    r.text.slice(0, 250),
  )

  // Withdrawing access from an approved account goes through ban, which is why
  // the review endpoint refuses to do it. Banning keeps the approval on record
  // and takes effect at sign-in.
  r = await req('POST', '/api/v1/admin/users/ban', { body: { userId: pendingUser.id, reason: 'smoke ban' } })
  check('banning an approved account → 200', r.status === 200, `${r.status} ${r.text}`)

  const banned = await signIn(NEWBIE_PASSWORD)
  check(
    'a banned account cannot sign in even though it is approved',
    banned.res.status === 401,
    `${banned.res.status} ${JSON.stringify(banned.body)}`,
  )

  const approvedBanned = await req('GET', '/api/v1/admin/users?status=approved')
  check(
    'banning does not rewrite the approval decision',
    (approvedBanned.body?.data ?? []).some((u) => u.handle === NEWBIE && u.status === 'approved' && u.isBanned === true),
    approvedBanned.text.slice(0, 250),
  )

  // ── 15. admin ─────────────────────────────────────────────────────────────
  section('Admin')

  r = await req('GET', '/api/v1/admin/skills?limit=100')
  check(
    'admin skill list sees unlisted skills too',
    r.status === 200 && (r.body?.data ?? []).some((s) => s.slug === 'unlisted-skill'),
    r.text.slice(0, 200),
  )

  // The listing filter takes the same two values, and nothing else.
  r = await req('GET', '/api/v1/admin/skills?listing=unlisted&limit=50')
  check(
    'admin can filter the list by listing state',
    r.status === 200 &&
      (r.body?.data ?? []).some((s) => s.slug === 'unlisted-skill') &&
      (r.body?.data ?? []).every((s) => s.listing === 'unlisted'),
    r.text.slice(0, 200),
  )

  r = await req('GET', '/api/v1/admin/skills?listing=pending&limit=50')
  check(
    'the review queue filter is gone — listing=pending matches everything',
    r.status === 200 && (r.body?.total ?? 0) > 1,
    `total=${r.body?.total}`,
  )

  r = await req('POST', '/api/v1/admin/skills/unlisted-skill/listing', { body: { listing: 'listed' } })
  check('admin lists a skill → 200', r.status === 200 && r.body?.message === 'skill listed', `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/skills/unlisted-skill')
  check('the skill is now in the catalogue', r.status === 200, `${r.status}`)

  r = await req('POST', '/api/v1/admin/skills/unlisted-skill/listing', { body: { listing: 'bogus' } })
  check(
    "an invalid listing → 400 \"must be 'listed' or 'unlisted'\"",
    r.status === 400 && /must be 'listed' or 'unlisted'/.test(r.body?.error ?? ''),
    `${r.status} ${r.text}`,
  )

  // Neither the old visibility endpoint nor the review endpoint may come back.
  r = await req('POST', '/api/v1/admin/skills/smoke-skill/visibility', { body: { visibility: 'public' } })
  check('the removed /visibility endpoint → 404', r.status === 404, `${r.status} ${r.text}`)

  r = await req('POST', '/api/v1/admin/skills/smoke-skill/review', { body: { action: 'approve' } })
  check('the removed /review endpoint → 404', r.status === 404, `${r.status} ${r.text}`)

  r = await req('POST', '/api/v1/skills/smoke-skill/request-public', {})
  check('the removed /request-public endpoint → 404', r.status === 404, `${r.status} ${r.text}`)

  // The plugin surface is gone entirely, reads included.
  r = await req('GET', '/api/v1/plugins')
  check('the removed plugin list → 404', r.status === 404, `${r.status} ${r.text}`)

  r = await req('POST', '/api/v1/plugins', { body: multipart({ slug: 'x', version: '1.0.0' }, { 'plugin.json': '{}' }) })
  check('the removed plugin publish → 404', r.status === 404, `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/admin/audit-logs?limit=100')
  check(
    'audit log recorded the publish',
    r.status === 200 && (r.body?.data ?? []).some((l) => l.action === 'publish'),
    r.text.slice(0, 250),
  )

  r = await req('POST', '/api/v1/admin/users/role', { body: { userId: 'not-a-uuid', role: 'admin' } })
  check('an invalid user id → 400 "invalid user ID"', r.status === 400 && r.body?.error === 'invalid user ID', `${r.status} ${r.text}`)

  // People hold one of two roles: admin or user. The inherited moderator role
  // is gone, so it must be refused even though the column's CHECK still lists it.
  r = await req('POST', '/api/v1/admin/users/role', { body: { userId: crypto.randomUUID(), role: 'moderator' } })
  check("the moderator role is refused → 400", r.status === 400 && /must be one of: user, admin/.test(r.body?.error ?? ''), `${r.status} ${r.text}`)

  r = await req('POST', '/api/v1/admin/users', { body: { handle: 'smoke-mod-attempt', role: 'moderator' } })
  check('creating a moderator → 400', r.status === 400 && /must be one of: user, admin/.test(r.body?.error ?? ''), `${r.status} ${r.text}`)

  // ── 16. content management (admin console) ───────────────────────────────
  section('Content management')

  // Numbered paging for the console. `total` is what lets it render a page
  // count, and `page` is additive — omitting it keeps the cursor walk.
  r = await req('GET', '/api/v1/admin/skills?page=1&limit=2')
  const pageOneIds = (r.body?.data ?? []).map((s) => s.id)
  check(
    'page 1 honours `limit` and reports a total',
    r.status === 200 && pageOneIds.length === 2 && (r.body?.total ?? 0) > 2,
    r.text.slice(0, 200),
  )
  check('page 1 clears nextCursor', r.body?.nextCursor === '', JSON.stringify(r.body?.nextCursor))

  r = await req('GET', '/api/v1/admin/skills?page=2&limit=2')
  const pageTwoIds = (r.body?.data ?? []).map((s) => s.id)
  check(
    'page 2 returns the next slice without repeating page 1',
    r.status === 200 && pageTwoIds.length === 2 && pageTwoIds.every((id) => !pageOneIds.includes(id)),
    r.text.slice(0, 200),
  )

  r = await req('GET', '/api/v1/admin/skills?page=999&limit=2')
  check(
    'a page past the end is empty rather than an error',
    r.status === 200 && (r.body?.data ?? []).length === 0,
    `${r.status} ${r.text.slice(0, 160)}`,
  )

  r = await req('GET', '/api/v1/admin/skills?limit=2')
  check(
    'the legacy cursor mode still answers with nextCursor',
    r.status === 200 && typeof r.body?.nextCursor === 'string' && r.body.nextCursor !== '',
    r.text.slice(0, 200),
  )

  // Create from the console form — the server synthesises the SKILL.md.
  r = await req('POST', '/api/v1/admin/skills', {
    body: {
      slug: 'smoke-managed',
      displayName: '受管技能',
      summary: '自检创建',
      displayNameEn: '',
      summaryEn: '',
      category: 'workspace',
      tags: ['smoke', 'managed'],
      listing: 'unlisted',
      html: '<p>正文</p><ul><li>一</li></ul>',
      htmlEn: '',
    },
  })
  check(
    'creating from the console form → 201',
    r.status === 201 && r.body?.skill?.slug === 'smoke-managed',
    `${r.status} ${r.text.slice(0, 200)}`,
  )

  r = await req('GET', '/api/v1/skills/smoke-managed')
  check(
    'the new skill carries one version, its metadata and the rich body',
    r.status === 200 &&
      r.body?.versionsCount === 1 &&
      r.body?.displayName === '受管技能' &&
      r.body?.detailHtml === '<p>正文</p><ul><li>一</li></ul>' &&
      JSON.stringify(r.body?.tags) === JSON.stringify(['smoke', 'managed']),
    r.text.slice(0, 250),
  )

  // The console's category field takes free text, so a category outside the
  // fixed taxonomy must survive creation rather than being filed as `general`
  // by the publishing path's allow-list.
  r = await req('POST', '/api/v1/admin/skills', {
    body: {
      slug: 'smoke-freeform-category',
      displayName: '自由分类',
      category: 'Compliance',
      listing: 'unlisted',
      tags: [],
    },
  })
  check(
    'a free-text category survives creation from the console form',
    r.status === 201 && r.body?.skill?.category === 'Compliance',
    `${r.status} ${r.text.slice(0, 200)}`,
  )
  await req('DELETE', '/api/v1/skills/smoke-freeform-category/purge')

  r = await req('GET', '/api/v1/skills/smoke-managed/versions')
  check('the synthesised version is 1.0.0', r.body?.versions?.[0]?.version === '1.0.0', r.text.slice(0, 200))

  r = await req('GET', '/api/v1/skills/smoke-managed/file?path=SKILL.md')
  check(
    'the SKILL.md stub exists and carries the display name',
    r.status === 200 && r.text.includes('name: "受管技能"'),
    `${r.status} ${r.text.slice(0, 160)}`,
  )

  r = await req('POST', '/api/v1/admin/skills', { body: { slug: 'smoke-managed' } })
  check('a duplicate slug → 409', r.status === 409 && /already exists/.test(r.body?.error ?? ''), `${r.status} ${r.text}`)

  r = await req('POST', '/api/v1/admin/skills', { body: { displayName: 'no slug' } })
  check('a missing slug → 400 "slug is required"', r.status === 400 && r.body?.error === 'slug is required', `${r.status} ${r.text}`)

  r = await req('POST', '/api/v1/admin/skills', { body: { slug: 'x', displayName: 42 } })
  check('a mistyped field → 400 "invalid request body"', r.status === 400 && r.body?.error === 'invalid request body', `${r.status} ${r.text}`)

  // Update is a full replace: an emptied input clears its column, which is the
  // whole reason this path does not reuse `updateMetadata`.
  r = await req('PUT', '/api/v1/admin/skills/smoke-managed', {
    body: {
      displayName: '改过的名字',
      summary: '',
      displayNameEn: 'Renamed',
      summaryEn: '',
      category: 'workspace',
      tags: ['renamed'],
      listing: 'listed',
      html: '',
      htmlEn: '',
    },
  })
  check(
    'replacing a skill from the console form → 200',
    r.status === 200 && r.body?.skill?.displayName === '改过的名字',
    `${r.status} ${r.text.slice(0, 200)}`,
  )

  r = await req('GET', '/api/v1/skills/smoke-managed')
  check(
    'an emptied summary is cleared (key absent, not null)',
    r.body?.summary === undefined && r.body?.displayNameEn === 'Renamed' && r.body?.listing === 'listed',
    r.text.slice(0, 250),
  )
  check('an emptied rich body is cleared', r.body?.detailHtml === undefined, JSON.stringify(r.body?.detailHtml))

  // Regression guard. The seeded catalogue is filed under categories the
  // `/categories` allow-list does not know (design, research, documentation,
  // writing). An edit must echo them back rather than refiling the row as
  // "general" — that bug would silently reclassify every seeded skill the first
  // time an admin pressed Save. The PUT echoes the row's own values, so it also
  // proves a save with no changes loses nothing.
  r = await req('GET', '/api/v1/skills/@builtin/accessibility-ecc')
  const seeded = r.body
  check('the seeded skill uses a category outside VALID_CATEGORIES', seeded?.category === 'design', JSON.stringify(seeded?.category))

  r = await req('PUT', '/api/v1/admin/skills/@builtin/accessibility-ecc', {
    body: {
      displayName: seeded?.displayName ?? '',
      summary: seeded?.summary ?? '',
      displayNameEn: seeded?.displayNameEn ?? '',
      summaryEn: seeded?.summaryEn ?? '',
      category: seeded?.category ?? '',
      tags: seeded?.tags ?? [],
      listing: seeded?.listing ?? 'public',
      html: seeded?.detailHtml ?? '',
      htmlEn: seeded?.detailHtmlEn ?? '',
    },
  })
  check(
    'a category outside the allow-list survives an edit',
    r.status === 200 && r.body?.skill?.category === 'design',
    `${r.status} ${r.text.slice(0, 200)}`,
  )
  check(
    'the namespaced update path preserves the record',
    r.body?.skill?.displayNameEn === seeded?.displayNameEn,
    JSON.stringify(r.body?.skill?.displayNameEn),
  )

  // The console's category field takes free text and offers what the catalogue
  // already uses. That list comes from the records, not from the fixed
  // `/categories` taxonomy, so it must carry the seeded values the allow-list
  // does not know about — and the one just saved through the console form.
  r = await req('GET', '/api/v1/admin/categories')
  check(
    'GET /admin/categories → 200 with the categories on disk',
    r.status === 200 && Array.isArray(r.body?.categories),
    `${r.status} ${r.text.slice(0, 200)}`,
  )
  check(
    'the on-disk categories include the seeded ones outside the allow-list',
    ['design', 'research', 'documentation', 'writing'].every((c) => r.body.categories.includes(c)),
    JSON.stringify(r.body?.categories),
  )
  check(
    'and include the one just saved through the console form',
    r.body.categories.includes('workspace'),
    JSON.stringify(r.body?.categories),
  )

  r = await req('DELETE', '/api/v1/skills/smoke-managed/purge')
  check('purging a skill → 200', r.status === 200, `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/skills/smoke-managed')
  check('the purged skill is gone → 404', r.status === 404, `${r.status}`)

  // The browse filter must not offer a category whose only skills are offline —
  // clicking it would return nothing. `smoke-managed` was public until the
  // purge above, so its `workspace` category is now in use by nobody visible.
  r = await req('GET', '/api/v1/categories/in-use')
  check(
    'the public filter drops a category once its last visible skill is gone',
    r.status === 200 && !r.body.categories.includes('workspace'),
    JSON.stringify(r.body?.categories),
  )

  // ── 16b. content management, with files ─────────────────────────────────
  section('Content management — uploads')

  // Requests here go out on the admin's session cookie, the way the rest of
  // this file authenticates.
  cookie = adminCookie

  // The console's create/edit pair takes the same request either way: JSON for
  // metadata alone, multipart when a package comes along. Uploaded files win
  // over the synthesised stub — that is the point of uploading.
  r = await req('POST', '/api/v1/admin/skills', {
    body: multipart(
      { slug: 'smoke-uploaded', displayName: '上传的技能', summary: '带文件', category: 'general', tags: 'a,b', listing: 'listed', html: '<p>正文</p>', htmlEn: '' },
      { 'SKILL.md': skillMd('smoke-uploaded', '\nuploaded body'), 'run.py': 'print("v1")', 'docs/guide.md': '# guide' },
    ),
  })
  check('creating with files → 201', r.status === 201, `${r.status} ${r.text.slice(0, 200)}`)

  r = await req('GET', '/api/v1/skills/smoke-uploaded/versions')
  check(
    'one version, carrying all three uploaded files',
    (r.body?.versions ?? []).length === 1 &&
      r.body.versions[0].version === '1.0.0' &&
      r.body.versions[0].files.length === 3,
    JSON.stringify(r.body?.versions?.[0]?.files?.map((f) => f.path)),
  )

  r = await req('GET', '/api/v1/skills/smoke-uploaded/file?path=SKILL.md')
  check('the uploaded SKILL.md replaces the stub', r.text.includes('uploaded body'), r.text.slice(0, 160))

  r = await req('GET', '/api/v1/skills/smoke-uploaded/file?path=docs/guide.md')
  check('a nested path is stored as given', r.status === 200 && r.text === '# guide', `${r.status} ${r.text.slice(0, 80)}`)

  r = await req('POST', '/api/v1/admin/skills', {
    body: multipart({ slug: 'smoke-no-skillmd', displayName: '缺文件' }, { 'run.py': 'print("x")' }),
  })
  check('an upload without SKILL.md → 400', r.status === 400 && /SKILL\.md is required/.test(r.body?.error ?? ''), `${r.status} ${r.text}`)

  // Editing with files publishes a new patch version — the same rule the
  // single-file endpoint follows, so the history never lies about what shipped.
  r = await req('PUT', '/api/v1/admin/skills/smoke-uploaded', {
    body: multipart(
      { slug: '', displayName: '上传的技能', summary: '带文件', displayNameEn: '', summaryEn: '', category: 'general', tags: 'a,b', listing: 'listed', html: '<p>正文</p>', htmlEn: '' },
      { 'run.py': 'print("v2")', 'scripts/helper.sh': '#!/bin/sh' },
    ),
  })
  check('editing with files → 200', r.status === 200, `${r.status} ${r.text.slice(0, 200)}`)

  r = await req('GET', '/api/v1/skills/smoke-uploaded/versions')
  check(
    'the edit published 1.0.1',
    (r.body?.versions ?? [])[0]?.version === '1.0.1' && r.body.versions.length === 2,
    JSON.stringify(r.body?.versions?.map((v) => v.version)),
  )

  r = await req('GET', '/api/v1/skills/smoke-uploaded/file?path=run.py')
  check('the re-uploaded file replaced the old one', r.text === 'print("v2")', r.text.slice(0, 80))

  r = await req('GET', '/api/v1/skills/smoke-uploaded/file?path=docs/guide.md')
  check('files not re-uploaded survive into the new version', r.status === 200 && r.text === '# guide', `${r.status} ${r.text.slice(0, 80)}`)

  // Metadata-only save must not mint a version.
  r = await req('PUT', '/api/v1/admin/skills/smoke-uploaded', {
    body: { displayName: '改名后', summary: '', displayNameEn: '', summaryEn: '', category: 'general', tags: ['a'], listing: 'unlisted', html: '', htmlEn: '' },
  })
  check('a metadata-only save → 200', r.status === 200, `${r.status} ${r.text.slice(0, 160)}`)

  r = await req('GET', '/api/v1/skills/smoke-uploaded/versions')
  check('a metadata-only save publishes no version', r.body?.versions?.length === 2, JSON.stringify(r.body?.versions?.length))

  r = await req('GET', '/api/v1/skills/smoke-uploaded')
  check('and still clears the emptied fields', r.body?.summary === undefined && r.body?.displayName === '改名后', `${r.status} ${r.text.slice(0, 160)}`)

  r = await req('DELETE', '/api/v1/skills/smoke-uploaded/purge')
  check('cleaning up the uploaded skill → 200', r.status === 200, `${r.status} ${r.text}`)

  // ── 16c. knowledge bases ─────────────────────────────────────────────────
  section('Knowledge bases')

  // A catalogue entry is either a skill or a knowledge base. The distinction
  // is a column the catalogue reads — the listing pages, the homepage's
  // sections and the console's table all key off it — so the type has to
  // survive every write path and answer every list endpoint.
  r = await req('POST', '/api/v1/admin/skills', {
    body: {
      slug: 'smoke-kb',
      displayName: '知识库',
      summary: '自检知识库',
      category: 'research',
      listing: 'listed',
      type: 'knowledge_base',
      tags: ['kb'],
    },
  })
  check(
    'creating a knowledge base from the console form → 201',
    r.status === 201 && r.body?.skill?.type === 'knowledge_base',
    `${r.status} ${r.text.slice(0, 200)}`,
  )
  const knowledgeBaseId = r.body?.skill?.id

  // A form that has not heard of knowledge bases still files a skill — the
  // column is NOT NULL with a default, so nothing has to send it.
  r = await req('POST', '/api/v1/admin/skills', {
    body: { slug: 'smoke-plain', displayName: '普通技能', listing: 'listed' },
  })
  check(
    "a form that sends no type files a skill",
    r.status === 201 && r.body?.skill?.type === 'skill',
    `${r.status} ${r.text.slice(0, 200)}`,
  )
  const plainSkillId = r.body?.skill?.id

  r = await req('POST', '/api/v1/admin/skills', {
    body: { slug: 'smoke-bad-type', displayName: 'x', type: 'plugin' },
  })
  check(
    "an unknown type → 400",
    r.status === 400 && /type must be/.test(r.body?.error ?? ''),
    `${r.status} ${r.text.slice(0, 200)}`,
  )

  // A knowledge base is reference material: its package needs no manifest,
  // because the introduction lives in the rich body instead.
  r = await req('POST', '/api/v1/admin/skills', {
    body: multipart(
      { slug: 'smoke-kb-files', displayName: '带资料的知识库', type: 'knowledge_base', listing: 'listed', category: 'research' },
      { 'papers/overview.pdf': 'binary-ish', 'notes.md': '# notes' },
    ),
  })
  check(
    'a knowledge base uploads without a SKILL.md → 201',
    r.status === 201 && r.body?.skill?.type === 'knowledge_base',
    `${r.status} ${r.text.slice(0, 200)}`,
  )

  r = await req('GET', '/api/v1/skills/smoke-kb-files/versions')
  check(
    'the knowledge base still has a manifest, written from the form',
    r.status === 200 && (r.body?.versions?.[0]?.files ?? []).some((f) => f.path === 'SKILL.md'),
    JSON.stringify(r.body?.versions?.[0]?.files?.map((f) => f.path)),
  )

  // The list endpoints answer with one kind or the other.
  r = await req('GET', '/api/v1/skills?type=knowledge_base&limit=100')
  check(
    'the catalogue can be listed by knowledge base',
    r.status === 200 && (r.body?.data ?? []).every((s) => s.type === 'knowledge_base'),
    `${r.status} ${r.text.slice(0, 200)}`,
  )
  check(
    'and the knowledge bases it lists include the one just created',
    (r.body?.data ?? []).some((s) => s.id === knowledgeBaseId),
    JSON.stringify((r.body?.data ?? []).map((s) => s.slug)),
  )

  r = await req('GET', '/api/v1/skills?type=skill&limit=100')
  check(
    'the catalogue can be listed by skill',
    r.status === 200 && (r.body?.data ?? []).every((s) => s.type === 'skill'),
    `${r.status} ${r.text.slice(0, 200)}`,
  )
  check(
    'and the skill listing leaves the knowledge base out',
    !(r.body?.data ?? []).some((s) => s.id === knowledgeBaseId),
    JSON.stringify((r.body?.data ?? []).map((s) => s.slug)),
  )

  r = await req('GET', '/api/v1/skills?limit=100')
  check(
    'an unfiltered listing answers with both kinds',
    r.status === 200 && (r.body?.data ?? []).some((s) => s.type === 'knowledge_base') &&
      (r.body?.data ?? []).some((s) => s.type === 'skill'),
    JSON.stringify((r.body?.data ?? []).map((s) => s.type)),
  )

  // The console's own listing filters the same way.
  r = await req('GET', '/api/v1/admin/skills?type=knowledge_base&page=1&limit=100')
  check(
    'the console listing filters by type',
    r.status === 200 && (r.body?.data ?? []).every((s) => s.type === 'knowledge_base'),
    `${r.status} ${r.text.slice(0, 200)}`,
  )

  // The category filter is scoped too, so the knowledge-base page does not
  // offer a category that only skills are filed under.
  r = await req('GET', '/api/v1/categories/in-use?type=knowledge_base')
  check(
    'the category filter is scoped to the kind asked for',
    r.status === 200 && Array.isArray(r.body?.categories) && r.body.categories.includes('research'),
    JSON.stringify(r.body?.categories),
  )

  // The publishing API takes the same `type` the console form does. This is a
  // separate write path from the console, and the two must agree: the console
  // used to be the only one that wrote a manifest for a knowledge base
  // uploaded without one, so publishing one over the API produced a version
  // with no files at all — undownloadable, and nothing for the page to render.
  r = await req('POST', '/api/v1/skills', {
    body: multipart(
      { slug: 'smoke-kb-api', version: '1.0.0', listing: 'listed', type: 'knowledge_base', category: 'research' },
      { 'notes/overview.md': '# overview' },
    ),
  })
  check(
    'publishing a knowledge base over the API → 200',
    r.status === 200 && r.body?.skill?.type === 'knowledge_base',
    `${r.status} ${r.text.slice(0, 200)}`,
  )

  r = await req('GET', '/api/v1/skills/smoke-kb-api/versions')
  check(
    'the API-published knowledge base carries a manifest alongside its files',
    r.status === 200 &&
      (r.body?.versions?.[0]?.files ?? []).some((f) => f.path === 'SKILL.md') &&
      (r.body?.versions?.[0]?.files ?? []).some((f) => f.path === 'notes/overview.md'),
    JSON.stringify(r.body?.versions?.[0]?.files?.map((f) => f.path)),
  )

  // A knowledge base with no files at all is still publishable — the manifest
  // is synthesised from the request rather than demanded of the caller.
  r = await req('POST', '/api/v1/skills', {
    body: multipart(
      { slug: 'smoke-kb-api-bare', version: '1.0.0', listing: 'listed', type: 'knowledge_base', displayName: '空知识库' },
      {},
    ),
  })
  check(
    'a knowledge base published with no files → 200',
    r.status === 200 && r.body?.skill?.type === 'knowledge_base',
    `${r.status} ${r.text.slice(0, 200)}`,
  )
  r = await req('GET', '/api/v1/skills/smoke-kb-api-bare/versions')
  check(
    'and it still has a manifest to fall back on',
    (r.body?.versions?.[0]?.files ?? []).length === 1 &&
      r.body.versions[0].files[0].path === 'SKILL.md',
    JSON.stringify(r.body?.versions?.[0]?.files?.map((f) => f.path)),
  )

  // A skill published over the API keeps the old behaviour: whatever it brings
  // is what ships, and nothing is invented for it.
  r = await req('POST', '/api/v1/skills', {
    body: multipart(
      { slug: 'smoke-skill-api', version: '1.0.0', listing: 'listed', category: 'general' },
      { 'SKILL.md': skillMd('smoke-skill-api'), 'run.py': 'print(1)' },
    ),
  })
  check(
    'a skill published over the API → 200',
    r.status === 200 && r.body?.skill?.type === 'skill',
    `${r.status} ${r.text.slice(0, 200)}`,
  )
  r = await req('GET', '/api/v1/skills/smoke-skill-api/versions')
  check(
    'and its file set is exactly what was uploaded',
    JSON.stringify((r.body?.versions?.[0]?.files ?? []).map((f) => f.path).sort()) ===
      JSON.stringify(['SKILL.md', 'run.py']),
    JSON.stringify(r.body?.versions?.[0]?.files?.map((f) => f.path)),
  )

  // The featured pool is one list the console curates; the homepage splits it
  // by type, so the endpoint has to be able to answer one kind at a time. The
  // pool is set to a known pair here — one of each kind — so each filter has
  // something to answer with.
  r = await req('PUT', '/api/v1/admin/features', {
    body: { skillIds: [plainSkillId, knowledgeBaseId].filter(Boolean) },
  })
  check('the featured pool can hold a knowledge base → 200', r.status === 200, `${r.status} ${r.text.slice(0, 160)}`)

  r = await req('GET', '/api/v1/features?type=knowledge_base')
  check(
    'the featured rail answers with knowledge bases alone',
    r.status === 200 && (r.body?.data ?? []).length === 1 &&
      (r.body?.data ?? []).every((s) => s.type === 'knowledge_base'),
    `${r.status} ${r.text.slice(0, 200)}`,
  )
  check(
    'and it includes the knowledge base just curated',
    (r.body?.data ?? []).some((s) => s.id === knowledgeBaseId),
    JSON.stringify((r.body?.data ?? []).map((s) => s.slug)),
  )

  r = await req('GET', '/api/v1/features?type=skill')
  check(
    'and with skills alone when asked for those',
    r.status === 200 && (r.body?.data ?? []).length === 1 &&
      (r.body?.data ?? []).every((s) => s.type === 'skill'),
    `${r.status} ${r.text.slice(0, 200)}`,
  )

  // Search answers with both kinds, so the hit says which one it is.
  r = await req('GET', '/api/v1/search?q=' + encodeURIComponent('知识库') + '&limit=40')
  const kbHit = (r.body?.hits ?? []).find((h) => h.id === knowledgeBaseId)
  check(
    'a search hit carries the kind of the entry it found',
    r.status === 200 && kbHit !== undefined && kbHit?.type === 'knowledge_base',
    JSON.stringify((r.body?.hits ?? []).map((h) => [h.slug, h.type])),
  )

  // A knowledge base is reference material, not something an agent runs, so
  // the runtime surface leaves it out.
  r = await req('GET', '/api/runtime/skills?limit=100')
  check(
    'the runtime listing leaves knowledge bases out',
    r.status === 200 && !(r.body?.data ?? []).some((s) => s.id === knowledgeBaseId),
    JSON.stringify((r.body?.data ?? []).map((s) => s.slug)),
  )

  // Retyping an existing entry is a console edit, and it sticks.
  r = await req('PUT', '/api/v1/admin/skills/smoke-kb', {
    body: {
      displayName: '知识库',
      summary: '自检知识库',
      displayNameEn: '',
      summaryEn: '',
      category: 'research',
      tags: ['kb'],
      listing: 'listed',
      type: 'skill',
      html: '',
      htmlEn: '',
    },
  })
  check(
    'an entry can be retyped from the console → 200',
    r.status === 200 && r.body?.skill?.type === 'skill',
    `${r.status} ${r.text.slice(0, 200)}`,
  )

  for (const slug of [
    'smoke-kb',
    'smoke-plain',
    'smoke-kb-files',
    'smoke-kb-api',
    'smoke-kb-api-bare',
    'smoke-skill-api',
  ]) {
    r = await req('DELETE', `/api/v1/skills/${slug}/purge`)
    check(`purging ${slug} → 200`, r.status === 200, `${r.status} ${r.text.slice(0, 120)}`)
  }

  // ── 17. admin API keys ───────────────────────────────────────────────────
  section('Admin API keys')

  r = await req('POST', '/api/v1/admin/api-keys', {
    body: { name: 'smoke-full', scopes: ['skills:read', 'skills:publish', 'skills:delete', 'skills:moderate'] },
  })
  const fullKey = r.body?.key
  const fullKeyId = r.body?.metadata?.id
  check('POST /admin/api-keys → 201 with an shk_ key', r.status === 201 && typeof fullKey === 'string' && fullKey.startsWith('shk_'), r.text)
  check('the key metadata hides keyHash', r.body?.metadata?.keyHash === undefined, JSON.stringify(r.body?.metadata))
  check('the stored prefix is 16 chars', (r.body?.metadata?.prefix ?? '').length === 16, r.body?.metadata?.prefix)
  check('the granted scopes are echoed back', r.body?.metadata?.scopes?.length === 4, JSON.stringify(r.body?.metadata?.scopes))

  r = await req('GET', '/api/v1/admin/api-keys')
  check(
    'GET /admin/api-keys lists the new key',
    r.status === 200 && (r.body?.data ?? []).some((k) => k.id === fullKeyId && !k.revokedAt),
    r.text.slice(0, 250),
  )
  check(
    'GET /admin/api-keys returns the full key so a usage sheet can be copied',
    (r.body?.data ?? []).some((k) => k.id === fullKeyId && k.secret === fullKey),
    r.text.slice(0, 300),
  )

  r = await req('GET', '/api/v1/whoami', { token: fullKey })
  check('a key authenticates as the admin who minted it', r.status === 200 && r.body?.role === 'admin', `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/skills?limit=5', { token: fullKey })
  check('a key with skills:read can list skills', r.status === 200, `${r.status} ${r.text.slice(0, 150)}`)

  r = await req('POST', '/api/v1/skills', {
    token: fullKey,
    body: multipart(
      { slug: 'apikey-skill', version: '1.0.0', listing: 'listed', category: 'testing' },
      { 'SKILL.md': skillMd('apikey-skill') },
    ),
  })
  check('a key with skills:publish can publish', r.status === 200 && r.body?.skill?.slug === 'apikey-skill', `${r.status} ${r.text.slice(0, 250)}`)

  r = await req('POST', '/api/v1/admin/skills/@admin/apikey-skill/listing', { token: fullKey, body: { listing: 'unlisted' } })
  check('a key with skills:moderate can change the listing state', r.status === 200, `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/admin/features', { token: fullKey })
  check('a key with skills:read can list admin features', r.status === 200 && Array.isArray(r.body?.data), `${r.status} ${r.text.slice(0, 150)}`)
  const featuredSkillId = (r.body?.data ?? []).find((s) => typeof s?.id === 'string')?.id
  r = await req('PUT', '/api/v1/admin/features', { token: fullKey, body: { skillIds: featuredSkillId ? [featuredSkillId] : [] } })
  check('a key with skills:moderate can replace featured skills', r.status === 200 && r.body?.message === 'featured skills updated', `${r.status} ${r.text}`)
  r = await req('GET', '/api/v1/features')
  check('the homepage featured rail reflects the key-made change', r.status === 200 && (r.body?.data ?? []).every((s) => s.id === featuredSkillId), `${r.status} ${r.text.slice(0, 250)}`)

  // A read-only key proves the per-endpoint narrowing: same creator, fewer powers.
  r = await req('POST', '/api/v1/admin/api-keys', { body: { name: 'smoke-readonly', scopes: ['skills:read'] } })
  const readOnlyKey = r.body?.key
  check('a read-only key is minted', r.status === 201 && typeof readOnlyKey === 'string', r.text)

  r = await req('POST', '/api/v1/skills', {
    token: readOnlyKey,
    body: multipart({ slug: 'apikey-denied', version: '1.0.0' }, { 'SKILL.md': skillMd('apikey-denied') }),
  })
  check('a read-only key cannot publish → 403', r.status === 403 && r.body?.error === 'this API key is not allowed for this endpoint', `${r.status} ${r.text}`)

  r = await req('DELETE', '/api/v1/skills/apikey-skill', { token: readOnlyKey })
  check('a read-only key cannot delete → 403', r.status === 403, `${r.status} ${r.text}`)

  r = await req('PUT', '/api/v1/admin/features', { token: readOnlyKey, body: { skillIds: [] } })
  check('a read-only key cannot curate featured skills → 403', r.status === 403 && r.body?.error === 'this API key is not allowed for this endpoint', `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/namespaces', { token: fullKey })
  check('no key reaches endpoints outside the skill catalogue → 403', r.status === 403, `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/admin/api-keys', { token: fullKey })
  check('a key cannot administer other keys → 403', r.status === 403, `${r.status} ${r.text}`)

  // `users:moderate` is its own capability: it opens the review queue and
  // nothing else, and conversely the skill scopes do not reach the queue.
  r = await req('POST', '/api/v1/admin/api-keys', { body: { name: 'smoke-user-reviewer', scopes: ['users:moderate'] } })
  const reviewKey = r.body?.key
  check('a users:moderate key is minted', r.status === 201 && typeof reviewKey === 'string', r.text)

  r = await req('GET', '/api/v1/admin/users?status=pending', { token: reviewKey })
  check('a users:moderate key can read the review queue', r.status === 200 && Array.isArray(r.body?.data), `${r.status} ${r.text.slice(0, 150)}`)

  r = await req('POST', '/api/v1/admin/users/review', { token: reviewKey, body: { userId: crypto.randomUUID(), action: 'approve' } })
  check('a users:moderate key reaches the review endpoint (404 for an unknown id)', r.status === 404, `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/skills?limit=5', { token: reviewKey })
  check('a users:moderate key cannot read the skill catalogue → 403', r.status === 403, `${r.status} ${r.text}`)

  r = await req('POST', '/api/v1/admin/users/review', { token: readOnlyKey, body: { userId: crypto.randomUUID(), action: 'approve' } })
  check('a skills-only key cannot review accounts → 403', r.status === 403 && r.body?.error === 'this API key is not allowed for this endpoint', `${r.status} ${r.text}`)

  r = await req('POST', '/api/v1/admin/users/ban', { token: reviewKey, body: { userId: crypto.randomUUID(), reason: 'x' } })
  check('banning stays session-only, so a user key is refused → 403', r.status === 403, `${r.status} ${r.text}`)

  // Bound to a namespace: publishing without an explicit namespace lands there.
  r = await req('POST', '/api/v1/namespaces', { body: { slug: 'apikey-ns', displayName: 'API key namespace' } })
  const boundNamespace = r.body?.slug ?? 'apikey-ns'
  r = await req('POST', '/api/v1/admin/api-keys', {
    body: { name: 'smoke-bound', scopes: ['skills:publish'], namespaceSlug: boundNamespace },
  })
  const boundKey = r.body?.key
  check('a key can be bound to a namespace', r.status === 201 && r.body?.metadata?.namespaceSlug === boundNamespace, r.text)

  r = await req('POST', '/api/v1/skills', {
    token: boundKey,
    body: multipart({ slug: 'apikey-bound-skill', version: '1.0.0' }, { 'SKILL.md': skillMd('apikey-bound-skill') }),
  })
  check('a bound key publishes into its namespace', r.status === 200 && r.body?.skill?.namespaceSlug === boundNamespace, `${r.status} ${r.text.slice(0, 250)}`)

  r = await req('POST', '/api/v1/skills', {
    token: boundKey,
    body: multipart({ slug: 'apikey-elsewhere', version: '1.0.0', namespace: 'admin' }, { 'SKILL.md': skillMd('apikey-elsewhere') }),
  })
  check('a bound key cannot publish elsewhere → 403', r.status === 403, `${r.status} ${r.text}`)

  // Validation.
  r = await req('POST', '/api/v1/admin/api-keys', { body: { scopes: ['skills:read'] } })
  check('a key without a name → 400', r.status === 400 && r.body?.error === 'name is required', `${r.status} ${r.text}`)

  r = await req('POST', '/api/v1/admin/api-keys', { body: { name: 'no-scopes', scopes: [] } })
  check('a key without scopes → 400', r.status === 400 && /scopes must include/.test(r.body?.error ?? ''), `${r.status} ${r.text}`)

  r = await req('POST', '/api/v1/admin/api-keys', { body: { name: 'bad-scope', scopes: ['skills:everything'] } })
  check('an unknown scope → 400', r.status === 400 && /invalid scope/.test(r.body?.error ?? ''), `${r.status} ${r.text}`)

  r = await req('POST', '/api/v1/admin/api-keys', { body: { name: 'bad-ns', scopes: ['skills:read'], namespaceSlug: 'nope-ns' } })
  check('an unknown namespace → 404', r.status === 404, `${r.status} ${r.text}`)

  r = await req('DELETE', '/api/v1/admin/api-keys/not-a-uuid')
  check('an invalid key id → 400 "invalid API key ID"', r.status === 400 && r.body?.error === 'invalid API key ID', `${r.status} ${r.text}`)

  // Deleting goes through the key while it still exists. `undelete` only
  // resolves live rows upstream, so the removal is deliberately not reversed.
  r = await req('DELETE', '/api/v1/skills/@admin/apikey-skill', { token: fullKey })
  check('a key with skills:delete can delete a skill', r.status === 200, `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/skills/@admin/apikey-skill')
  check('the deleted skill leaves the catalogue', r.status === 404, `${r.status} ${r.text.slice(0, 150)}`)

  // Expiry: a key that runs out behaves like a revoked one. `whoami` requires
  // authentication, so a dead credential answers 401 rather than simply falling
  // back to anonymous access the way a public read would.
  r = await req('POST', '/api/v1/admin/api-keys', { body: { name: 'smoke-expiring', scopes: ['skills:read'], expiresIn: '1s' } })
  const expiringKey = r.body?.key
  check('a key can carry an expiry', r.status === 201 && r.body?.metadata?.expiresAt !== undefined, r.text)
  await sleep(1300)
  // The session cookie is dropped so it cannot stand in for the dead key.
  cookie = ''
  r = await req('GET', '/api/v1/whoami', { token: expiringKey })
  check('an expired key → 401', r.status === 401, `${r.status} ${r.text}`)

  // Revocation takes effect immediately.
  cookie = adminCookie
  r = await req('DELETE', `/api/v1/admin/api-keys/${fullKeyId}`)
  check('DELETE /admin/api-keys/:id → 200', r.status === 200 && r.body?.message === 'API key revoked', `${r.status} ${r.text}`)

  cookie = ''
  r = await req('GET', '/api/v1/whoami', { token: fullKey })
  check('a revoked key → 401', r.status === 401, `${r.status} ${r.text}`)
  cookie = adminCookie

  r = await req('GET', '/api/v1/admin/api-keys')
  check(
    'the revoked key stays in the list with revokedAt set',
    (r.body?.data ?? []).some((k) => k.id === fullKeyId && k.revokedAt),
    r.text.slice(0, 250),
  )

  r = await req('DELETE', `/api/v1/admin/api-keys/${fullKeyId}` )
  check('revoking twice → 400', r.status === 400, `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/admin/audit-logs?limit=100')
  check(
    'minting and revoking a key is audited',
    r.status === 200 &&
      (r.body?.data ?? []).some((l) => l.action === 'admin_create_api_key') &&
      (r.body?.data ?? []).some((l) => l.action === 'admin_revoke_api_key'),
    r.text.slice(0, 250),
  )

  // ── 17. skill detail HTML ────────────────────────────────────────────────
  section('Skill detail HTML')

  // The payload is hostile on purpose: the point is what comes back out.
  const hostile = [
    '<h2>详情</h2>',
    '<p>正文 <strong>粗体</strong> 与 <a href="/skills">站内链接</a></p>',
    '<script>alert(1)</script>',
    '<img src="x" onerror="alert(1)">',
    '<a href="javascript:alert(1)">bad</a>',
    '<a href="java&#115;cript:alert(1)">bad2</a>',
    '<iframe src="https://evil.test"></iframe>',
    '<svg><script>alert(2)</script></svg>',
    '<p style="color:red">styled</p>',
  ].join('')

  r = await req('PUT', '/api/v1/skills/@admin/smoke-skill/detail-html', { body: { html: hostile } })
  const storedHtml = r.body?.detailHtml ?? ''
  check('PUT detail-html → 200 with the skill', r.status === 200 && r.body?.slug === 'smoke-skill', `${r.status} ${r.text.slice(0, 200)}`)
  check('the stored body keeps legitimate markup', storedHtml.includes('<h2>详情</h2>') && storedHtml.includes('<strong>粗体</strong>'), storedHtml.slice(0, 200))
  check('script elements are stripped', !/<script/i.test(storedHtml), storedHtml.slice(0, 200))
  check('event handlers are stripped', !/onerror/i.test(storedHtml), storedHtml.slice(0, 200))
  check('javascript: links are neutralised', !/javascript:/i.test(storedHtml), storedHtml.slice(0, 200))
  check('iframe and svg are dropped', !/<iframe/i.test(storedHtml) && !/<svg/i.test(storedHtml), storedHtml.slice(0, 200))
  check('style attributes are dropped', !/style=/i.test(storedHtml), storedHtml.slice(0, 200))
  check('a detail timestamp is recorded', r.body?.detailHtmlUpdatedAt !== undefined, JSON.stringify(r.body?.detailHtmlUpdatedAt))

  r = await req('GET', '/api/v1/skills/@admin/smoke-skill')
  check('the detail body is served by the skill endpoint', r.status === 200 && r.body?.detailHtml === storedHtml, `${r.status} ${r.text.slice(0, 150)}`)

  r = await req('GET', '/api/v1/skills?limit=20')
  check(
    'list responses never carry the body (either language)',
    r.status === 200 && (r.body?.data ?? []).every((s) => s.detailHtml === undefined && s.detailHtmlEn === undefined),
    r.text.slice(0, 150),
  )

  // Inline raster images may be embedded so detail pages can carry screenshots
  // without hosting; every other data: URI (including SVG) stays neutralised.
  // Image-only bodies are content too — isBlankHtml must not clear them.
  const PNG_PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
  r = await req('PUT', '/api/v1/skills/@admin/smoke-skill/detail-html', {
    body: {
      html:
        `<img src="data:image/png;base64,${PNG_PIXEL}">` +
        '<img src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">' +
        '<img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=">',
    },
  })
  const dataUriHtml = r.body?.detailHtml ?? ''
  check(
    'inline raster data images survive on img src',
    dataUriHtml.includes(`data:image/png;base64,${PNG_PIXEL}`),
    dataUriHtml.slice(0, 200) || `empty; status=${r.status} text=${r.text.slice(0, 200)}`,
  )
  check(
    'non-image data URIs are neutralised (html, svg)',
    !dataUriHtml.includes('data:text/html') && !dataUriHtml.includes('data:image/svg') && dataUriHtml.split('src="#"').length >= 3,
    dataUriHtml.slice(0, 200),
  )

  // The English body is its own column: it updates and clears independently,
  // and the page falls back to the Chinese body while it is absent.
  r = await req('PUT', '/api/v1/skills/@admin/smoke-skill/detail-html', { body: { htmlEn: '<p>English body</p>' } })
  check(
    'htmlEn updates only the English body',
    r.status === 200 && r.body?.detailHtmlEn === '<p>English body</p>' && r.body?.detailHtml === dataUriHtml,
    `${r.status} ${r.text.slice(0, 200)}`,
  )
  r = await req('PUT', '/api/v1/skills/@admin/smoke-skill/detail-html', { body: {} })
  check('a body without html or htmlEn → 400', r.status === 400 && r.body?.error === 'html or htmlEn is required', `${r.status} ${r.text}`)
  r = await req('PUT', '/api/v1/skills/@admin/smoke-skill/detail-html', { body: { htmlEn: '' } })
  check(
    'blank htmlEn clears only the English body',
    r.status === 200 && r.body?.detailHtmlEn === undefined && r.body?.detailHtml === dataUriHtml,
    `${r.status} ${r.text.slice(0, 200)}`,
  )
  r = await req('GET', '/api/v1/skills/@admin/smoke-skill')
  check('the English body clears independently on the skill endpoint', r.status === 200 && r.body?.detailHtmlEn === undefined && r.body?.detailHtml === dataUriHtml, `${r.status} ${r.text.slice(0, 150)}`)

  // The page picks one source or the other; the published file itself is
  // untouched and still served either way.
  r = await req('GET', '/api/v1/skills/@admin/smoke-skill/file?version=1.0.0&path=SKILL.md')
  check(
    'the published SKILL.md survives alongside a detail body',
    r.status === 200 && r.text.includes('# smoke-skill'),
    `${r.status} ${r.text.slice(0, 120)}`,
  )

  r = await req('PUT', '/api/v1/skills/@admin/smoke-skill/detail-html', { body: { html: '   ' } })
  check('blank input clears the detail body', r.status === 200 && r.body?.detailHtml === undefined, `${r.status} ${r.text.slice(0, 150)}`)

  r = await req('PUT', '/api/v1/skills/@admin/smoke-skill/detail-html', { body: { html: '<p>回到 SKILL.md</p>' } })
  check('a detail body can be set again', r.status === 200 && r.body?.detailHtml === '<p>回到 SKILL.md</p>', `${r.status} ${r.text.slice(0, 150)}`)

  r = await req('PUT', '/api/v1/skills/@admin/smoke-skill/detail-html', { body: { html: 42 } })
  check('a non-string html → 400', r.status === 400 && r.body?.error === 'html must be a string', `${r.status} ${r.text}`)

  cookie = ''
  r = await req('PUT', '/api/v1/skills/@admin/smoke-skill/detail-html', { body: { html: '<p>x</p>' } })
  check('no credentials → 401', r.status === 401, `${r.status} ${r.text}`)
  cookie = adminCookie

  r = await req('PUT', '/api/v1/skills/@admin/smoke-skill/detail-html', { token: readOnlyKey, body: { html: '<p>x</p>' } })
  check('a read-only key cannot update it → 403', r.status === 403, `${r.status} ${r.text}`)

  r = await req('POST', '/api/v1/admin/api-keys', { body: { name: 'smoke-detail-publish', scopes: ['skills:publish'] } })
  const publishKey = r.body?.key
  check('a publishing key is minted', r.status === 201 && typeof publishKey === 'string', r.text)

  r = await req('PUT', '/api/v1/skills/@admin/smoke-skill/detail-html', { token: publishKey, body: { html: '<p>来自 API Key</p>' } })
  check('a key with skills:publish can update it', r.status === 200 && r.body?.detailHtml === '<p>来自 API Key</p>', `${r.status} ${r.text.slice(0, 200)}`)

  // A second account with no relationship to the skill must be refused.
  const otherUserId = await signUpAndApprove('detail-other')
  const otherCookie = await loginCookie('detail-other')
  check('a second account signs in', otherCookie !== '', `${otherCookie}`)

  cookie = otherCookie
  r = await req('PUT', '/api/v1/skills/@admin/smoke-skill/detail-html', { body: { html: '<p>mine now</p>' } })
  check('an unrelated account cannot update it → 403', r.status === 403, `${r.status} ${r.text}`)
  cookie = adminCookie

  r = await req('PUT', '/api/v1/skills/@admin/does-not-exist/detail-html', { body: { html: '<p>x</p>' } })
  check('an unknown skill → 404', r.status === 404, `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/admin/audit-logs?limit=100')
  check(
    'updating the detail body is audited',
    r.status === 200 && (r.body?.data ?? []).some((l) => l.action === 'update_detail_html'),
    r.text.slice(0, 200),
  )

  // ── 18. ordinary-user permissions ────────────────────────────────────────
  section('Ordinary user permissions')

  // The console's download column counts skills and knowledge bases apart, so
  // the account below takes one of each. The entries from the knowledge-base
  // section were purged, which leaves a fresh pair to download — created here,
  // while the cookie is still the administrator's.
  r = await req('POST', '/api/v1/admin/skills', {
    body: multipart(
      { slug: 'smoke-dl-skill', displayName: '下载自检技能', listing: 'listed' },
      { 'SKILL.md': skillMd('smoke-dl-skill') },
    ),
  })
  check('a listed skill for the download counters exists', r.status === 201, `${r.status} ${r.text.slice(0, 120)}`)

  r = await req('POST', '/api/v1/admin/skills', {
    body: multipart(
      { slug: 'smoke-dl-kb', displayName: '下载自检知识库', type: 'knowledge_base', listing: 'listed' },
      { 'notes.md': '# notes' },
    ),
  })
  check('a listed knowledge base for the download counters exists', r.status === 201, `${r.status} ${r.text.slice(0, 120)}`)

  cookie = plainUserCookie

  // Everything below runs as `smokeuser`, whose role is `user`. The policy is
  // that such an account may only browse, favourite and download a skill —
  // everything else is administrator territory, refused with 403 by the
  // middleware before any handler runs.
  const catalogue = await req('GET', '/api/v1/skills?limit=20&sort=name')
  const anySkill = (catalogue.body?.data ?? []).find(
    (s) => s.listing === 'listed',
  )
  const anyRef = anySkill?.namespaceSlug ? `@${anySkill.namespaceSlug}/${anySkill.slug}` : anySkill?.slug
  check('a plain user can browse the catalogue', catalogue.status === 200 && !!anyRef, `${catalogue.status} ${catalogue.text.slice(0, 120)}`)

  r = await req('POST', `/api/v1/stars/${anyRef}`)
  check('a plain user can favourite a skill', r.status === 200 && r.body?.message === 'starred', `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/stars')
  check('a plain user can read their own collection', r.status === 200 && Array.isArray(r.body?.data), `${r.status}`)

  r = await req('DELETE', `/api/v1/stars/${anyRef}`)
  check('a plain user can un-favourite', r.status === 200 && r.body?.message === 'unstarred', `${r.status} ${r.text}`)

  r = await req(
    'GET',
    `/api/v1/download?slug=${anySkill?.slug}&version=latest${anySkill?.namespaceSlug ? `&namespace=${anySkill.namespaceSlug}` : ''}`,
  )
  check('a plain user can download a skill', r.status === 200, `${r.status} ${r.text.slice(0, 120)}`)

  // The console's download column is split by kind, so the account takes one of
  // each: a skill and a knowledge base. Each half of the figure has to move on
  // its own, which is what the activity checks below pin down.
  r = await req('GET', '/api/v1/download?slug=smoke-dl-skill&version=latest')
  check('a plain user can download a listed skill', r.status === 200, `${r.status} ${r.text.slice(0, 120)}`)

  r = await req('GET', '/api/v1/download?slug=smoke-dl-kb&version=latest')
  check('a plain user can download a listed knowledge base', r.status === 200, `${r.status} ${r.text.slice(0, 120)}`)

  r = await req('POST', '/api/v1/skills', {
    body: multipart({ slug: 'plain-denied', version: '1.0.0' }, { 'SKILL.md': skillMd('plain-denied') }),
  })
  check(
    'a plain user cannot publish a skill → 403',
    r.status === 403 && r.body?.error === 'insufficient permissions',
    `${r.status} ${r.text.slice(0, 120)}`,
  )

  // The console's own create/edit pair is administrator-only too.
  r = await req('POST', '/api/v1/admin/skills', { body: { slug: 'plain-denied', listing: 'unlisted' } })
  check(
    'a plain user cannot create content → 403',
    r.status === 403 && r.body?.error === 'insufficient permissions',
    `${r.status} ${r.text.slice(0, 120)}`,
  )

  r = await req('PUT', '/api/v1/admin/skills/smoke-skill', { body: { displayName: 'x' } })
  check(
    'a plain user cannot edit content → 403',
    r.status === 403 && r.body?.error === 'insufficient permissions',
    `${r.status} ${r.text.slice(0, 120)}`,
  )

  // The remaining write surfaces, all expected to be refused outright.
  const refusals = [
    ['publish via the agent API', 'POST', '/api/agent/skills', multipart({ slug: 'plain-denied-agent', version: '1.0.0' }, { 'SKILL.md': skillMd('plain-denied-agent') })],
    ['create a namespace', 'POST', '/api/v1/namespaces', { slug: 'plain-denied-ns' }],
    ['list namespaces', 'GET', '/api/v1/namespaces', undefined],
    ['rate a skill', 'POST', `/api/v1/skills/${anyRef}/ratings`, { score: 5 }],
    ['comment on a skill', 'POST', `/api/v1/skills/${anyRef}/comments`, { body: 'nope' }],
    ['edit a skill file', 'PUT', `/api/v1/skills/${anyRef}/file`, { path: 'SKILL.md', content: 'x' }],
    ['edit a skill detail page', 'PUT', `/api/v1/skills/${anyRef}/detail-html`, { html: '<p>x</p>' }],
    ['delete a skill', 'DELETE', `/api/v1/skills/${anyRef}`, undefined],
    ['yank a version', 'POST', `/api/v1/skills/${anyRef}/versions/1.0.0/yank`, { reason: 'x' }],
    ['ban a user', 'POST', '/api/v1/admin/users/ban', { userId: otherUserId, banned: true }],
    ['update the featured list', 'PUT', '/api/v1/admin/features', { skillIds: [] }],
  ]
  for (const [label, method, path, body] of refusals) {
    const res = await req(method, path, { body })
    check(`a plain user cannot ${label} → 403`, res.status === 403, `${res.status} ${res.text.slice(0, 120)}`)
  }

  cookie = adminCookie

  // ── 19. user activity & password reset ───────────────────────────────────
  section('User activity & password reset')

  // The counters the console shows per row. `smokeuser` signed in once and
  // downloaded one skill and one knowledge base in the section above, so each
  // figure must have moved — and the download must be attributed to the
  // downloader, who is the only thing `download_dedupes` cannot identify.
  r = await req('GET', '/api/v1/admin/users')
  const rowOf = (handle) => (r.body?.data ?? []).find((u) => u.handle === handle)
  const smokeUserRow = rowOf('smokeuser')
  check(
    'the user listing carries the activity counters as numbers',
    r.status === 200 &&
      typeof smokeUserRow?.downloadCount === 'number' &&
      typeof smokeUserRow?.knowledgeBaseDownloadCount === 'number' &&
      typeof smokeUserRow?.loginCount === 'number',
    `${r.status} ${JSON.stringify(smokeUserRow && { skills: smokeUserRow.downloadCount, knowledgeBases: smokeUserRow.knowledgeBaseDownloadCount, logins: smokeUserRow.loginCount })}`,
  )
  check(
    'a signed-in skill download is counted against that account',
    (smokeUserRow?.downloadCount ?? 0) >= 1,
    `downloadCount=${smokeUserRow?.downloadCount}`,
  )
  check(
    'a signed-in knowledge-base download lands in its own counter',
    (smokeUserRow?.knowledgeBaseDownloadCount ?? 0) >= 1,
    `knowledgeBaseDownloadCount=${smokeUserRow?.knowledgeBaseDownloadCount}`,
  )
  check(
    'a sign-in is counted against that account',
    (smokeUserRow?.loginCount ?? 0) >= 1,
    `loginCount=${smokeUserRow?.loginCount}`,
  )
  check(
    'the administrator\'s own sign-in is counted too',
    (rowOf(ADMIN_USER)?.loginCount ?? 0) >= 1,
    `loginCount=${rowOf(ADMIN_USER)?.loginCount}`,
  )

  // The download fixtures have served their purpose. Purging them cascades the
  // activity rows away, so it can only happen once the figures above are read.
  for (const slug of ['smoke-dl-skill', 'smoke-dl-kb']) {
    r = await req('DELETE', `/api/v1/skills/${slug}/purge`)
    check(`purging ${slug} → 200`, r.status === 200, `${r.status} ${r.text.slice(0, 120)}`)
  }

  const resetUserId = await signUpAndApprove('reset-target')
  check('an account to reset exists', resetUserId !== '', `${resetUserId}`)

  // Negative control: an account that has never signed in and downloaded nothing
  // reads as zero, so a counter that never moves cannot pass the checks above.
  r = await req('GET', '/api/v1/admin/users')
  const freshRow = (r.body?.data ?? []).find((u) => u.handle === 'reset-target')
  check(
    'a brand-new account reads zero for every counter',
    freshRow?.downloadCount === 0 && freshRow?.knowledgeBaseDownloadCount === 0 && freshRow?.loginCount === 0,
    JSON.stringify(freshRow && { skills: freshRow.downloadCount, knowledgeBases: freshRow.knowledgeBaseDownloadCount, logins: freshRow.loginCount }),
  )

  // Resetting takes a password chosen by the administrator, and never hands it
  // back — the console is where it is read and copied.
  const freshPassword = 'SmokeFresh!2345'

  r = await req('POST', '/api/v1/admin/users/password', { body: { userId: resetUserId, password: 'short' } })
  check(
    'a password under the server floor → 400',
    r.status === 400 && /at least 8 characters/.test(r.body?.error ?? ''),
    `${r.status} ${r.text}`,
  )

  r = await req('POST', '/api/v1/admin/users/password', { body: { userId: resetUserId } })
  check('a missing password → 400 "invalid request"', r.status === 400 && r.body?.error === 'invalid request', `${r.status} ${r.text}`)

  r = await req('POST', '/api/v1/admin/users/password', { body: { userId: 'not-a-uuid', password: freshPassword } })
  check('resetting with an invalid user id → 400 "invalid user ID"', r.status === 400 && r.body?.error === 'invalid user ID', `${r.status} ${r.text}`)

  r = await req('POST', '/api/v1/admin/users/password', { body: { userId: crypto.randomUUID(), password: freshPassword } })
  check('resetting an unknown account → 404', r.status === 404 && r.body?.error === 'user not found', `${r.status} ${r.text}`)

  r = await req('POST', '/api/v1/admin/users/password', { body: { userId: resetUserId, password: freshPassword } })
  check('reset a password → 200', r.status === 200 && r.body?.message === 'password updated', `${r.status} ${r.text}`)

  const resetCookie = await loginCookie('reset-target', freshPassword)
  check('the account signs in with the new password', resetCookie !== '', `${resetCookie}`)

  const staleLogin = await fetch(`${base}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ handle: 'reset-target', password: ADMIN_PASSWORD }),
  })
  check('the password it was created with no longer works → 401', staleLogin.status === 401, `${staleLogin.status}`)

  // The sign-in above is the only one this account has ever made, so the count
  // is exact rather than merely non-zero.
  r = await req('GET', '/api/v1/admin/users')
  check(
    'that sign-in moved the counter to exactly one',
    (r.body?.data ?? []).find((u) => u.handle === 'reset-target')?.loginCount === 1,
    JSON.stringify((r.body?.data ?? []).find((u) => u.handle === 'reset-target')),
  )

  // Setting someone's password is session-only: like `ban` and `role`, the route
  // declares no `apiKeyScope`, so even a users:moderate key is refused.
  r = await req('POST', '/api/v1/admin/users/password', { token: reviewKey, body: { userId: resetUserId, password: freshPassword } })
  check('a users:moderate API key cannot reset a password → 403', r.status === 403, `${r.status} ${r.text.slice(0, 120)}`)

  cookie = plainUserCookie
  r = await req('POST', '/api/v1/admin/users/password', { body: { userId: resetUserId, password: freshPassword } })
  check('a plain user cannot reset a password → 403', r.status === 403, `${r.status} ${r.text.slice(0, 120)}`)
  cookie = adminCookie

  const auditLog = await req('GET', '/api/v1/admin/audit-logs?limit=200')
  check(
    'the reset is recorded in the audit log',
    (auditLog.body?.data ?? []).some((l) => l.action === 'reset_user_password' && l.resourceId === resetUserId),
    auditLog.text.slice(0, 250),
  )
  check(
    'the audit log never records the password itself',
    !auditLog.text.includes(freshPassword),
  )

  // ── 20. rate limiting (tight limits, separate process) ───────────────────
  section('Rate limiting')

  {
    // The functional suite above ran with the limiter effectively disabled;
    // this phase starts a fresh server whose buckets are deliberately small.
    const tight = await startServer({ rateLimit: 'tight' })
    try {
      const res = await fetch(`${tight.base}/api/v1/skills?limit=1`)
      const sawHeaders =
        res.headers.get('ratelimit-limit') === '4' &&
        res.headers.get('ratelimit-remaining') !== null &&
        res.headers.get('ratelimit-reset') !== null
      check('rate-limited routes emit RateLimit-Limit/Remaining/Reset', sawHeaders, JSON.stringify({
        limit: res.headers.get('ratelimit-limit'),
        remaining: res.headers.get('ratelimit-remaining'),
      }))

      // The read bucket allows 4; the 6th request must be refused.
      let limited = null
      for (let i = 0; i < 8 && limited === null; i += 1) {
        const r2 = await fetch(`${tight.base}/api/v1/skills?limit=1`)
        if (r2.status === 429) limited = r2
      }
      check('exceeding the read bucket → 429', limited !== null, 'no 429 after 8 requests')
      if (limited) {
        const body = await limited.json()
        check(
          'a 429 carries {"error":"rate limit exceeded"} and Retry-After',
          body?.error === 'rate limit exceeded' && Number(limited.headers.get('retry-after')) > 0,
          JSON.stringify(body),
        )
      }

      // Verification still runs on the throttled server: 401 precedes 429 for
      // credentialed routes only after the bucket drains, so use whoami which
      // is in the write bucket and already exhausted by the loop above.
      const unauth = await fetch(`${tight.base}/api/v1/whoami`)
      check(
        'a 429 from an anonymous caller is still a limiter response',
        unauth.status === 429 || unauth.status === 401,
        `${unauth.status}`,
      )
    } finally {
      await tight.stop()
    }
  }

  // ── 21. persistence across restart ────────────────────────────────────────
  section('Persistence')

  const before = await req('GET', '/api/v1/skills?limit=100')
  const countBefore = before.body?.data?.length ?? 0
  await server.stop()

  server = await startServer()
  base = server.base
  console.log(`  (restarted on ${base})`)

  r = await req('GET', `/api/v1/skills/${skillRef}`)
  check('the skill survives a restart', r.status === 200 && r.body?.slug === 'smoke-skill', `${r.status}`)

  r = await req('GET', '/api/v1/skills?limit=100')
  check(
    'no phantom rows appear after a restart (seed is idempotent)',
    (r.body?.data?.length ?? 0) === countBefore,
    `${r.body?.data?.length} vs ${countBefore}`,
  )

  r = await req('GET', '/api/v1/skills/smoke-skill/file?version=1.0.0&path=SKILL.md', { raw: true })
  check('stored file bytes survive a restart', (await r.text()).includes('# smoke-skill'))

  r = await req('GET', '/api/v1/search?q=smoke')
  check('the search index survives a restart', (r.body?.hits ?? []).some((h) => h.slug === 'smoke-skill'), r.text.slice(0, 200))

  // The activity log is a table of its own and the sign-in counter is a column,
  // so both have to come back from disk with the rest.
  r = await req('GET', '/api/v1/admin/users')
  const survivor = (r.body?.data ?? []).find((u) => u.handle === 'reset-target')
  check(
    'the activity counters survive a restart',
    survivor?.loginCount === 1 &&
      typeof survivor?.downloadCount === 'number' &&
      typeof survivor?.knowledgeBaseDownloadCount === 'number',
    JSON.stringify(survivor && { skills: survivor.downloadCount, knowledgeBases: survivor.knowledgeBaseDownloadCount, logins: survivor.loginCount }),
  )
} catch (e) {
  failed += 1
  failures.push(`unhandled: ${e.message}`)
  console.error(`\n!! smoke run threw: ${e?.stack ?? e}`)
  console.error('--- server log ---')
  console.error(server.logs.join('').slice(-3000))
} finally {
  await server.stop()
}

// ─────────────────────────────────────────────────────────────────────────────
// Report
// ─────────────────────────────────────────────────────────────────────────────

console.log(`\n${'═'.repeat(64)}`)
console.log(`  ${passed} passed, ${failed} failed  (${passed + failed} assertions)`)
if (failed > 0) {
  console.log('\n  failures:')
  for (const f of failures) console.log(`    - ${f}`)
}
console.log(`${'═'.repeat(64)}\n`)

// The temporary database is intentionally left in place for inspection.
console.log(`database kept at: ${DB_FILE}`)
process.exit(failed === 0 ? 0 : 1)
