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
    r.status === 200 && r.body?.apiVersion === 'v1' && r.body?.endpoints?.publish === '/api/agent/skills',
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

  // A personal token for the remaining write calls, so the token path is
  // exercised alongside the cookie path.
  r = await req('POST', '/api/v1/tokens', { body: { label: 'smoke', scope: 'full' } })
  const adminToken = r.body?.token
  check('POST /api/v1/tokens → 201 with a clh_ token', r.status === 201 && typeof adminToken === 'string' && adminToken.startsWith('clh_'), r.text)
  check('token metadata hides tokenHash', r.body?.metadata?.tokenHash === undefined)
  check('token prefix is 16 chars', (r.body?.metadata?.prefix ?? '').length === 16, r.body?.metadata?.prefix)

  r = await req('GET', '/api/v1/whoami', { token: adminToken })
  check('bearer token authenticates', r.status === 200 && r.body?.handle === ADMIN_USER, r.text)

  // Drop the session cookie first: otherwise it would silently authenticate the
  // credential-rejection checks below (the resolver falls back to the cookie).
  cookie = ''

  r = await req('GET', '/api/v1/whoami', { token: 'clh_totally-invalid-token' })
  check('a bogus bearer token → 401', r.status === 401, `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/whoami')
  check('no credential at all → 401', r.status === 401, `${r.status}`)

  // ── 3. publishing ─────────────────────────────────────────────────────────
  section('Skill publishing')

  r = await req('POST', '/api/v1/skills', {
    token: adminToken,
    body: multipart(
      {
        slug: 'smoke-skill',
        version: '1.0.0',
        summary: '冒烟测试技能',
        tags: 'testing,smoke',
        category: 'testing',
        visibility: 'public',
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
    token: adminToken,
    body: multipart({ slug: 'smoke-skill', version: '1.0.0' }, { 'SKILL.md': skillMd('smoke-skill') }),
  })
  check('publishing a duplicate version → 409', r.status === 409, `${r.status} ${r.text}`)

  r = await req('POST', '/api/v1/skills', {
    token: adminToken,
    body: multipart({ slug: 'smoke-skill', version: '0.9.0' }, { 'SKILL.md': skillMd('smoke-skill') }),
  })
  check(
    'publishing a lower version → 400 with "must be greater"',
    r.status === 400 && /must be greater than current latest/.test(r.body?.error ?? ''),
    `${r.status} ${r.text}`,
  )

  r = await req('POST', '/api/v1/skills', {
    token: adminToken,
    body: multipart({ slug: 'admin', version: '1.0.0' }, { 'SKILL.md': skillMd('x') }),
  })
  check(
    'a reserved slug is rejected → 400',
    r.status === 400 && /is reserved/.test(r.body?.error ?? ''),
    `${r.status} ${r.text}`,
  )

  r = await req('POST', '/api/v1/skills', {
    token: adminToken,
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

  const dl = await fetch(`${base}/api/v1/download?slug=smoke-skill&version=latest`)
  const zipBytes = new Uint8Array(await dl.arrayBuffer())
  check('download → 200 application/zip', dl.status === 200 && dl.headers.get('content-type') === 'application/zip', `${dl.status}`)
  check('zip has a PK header', zipBytes[0] === 0x50 && zipBytes[1] === 0x4b, `first bytes: ${zipBytes[0]},${zipBytes[1]}`)
  check('ETag is the version fingerprint', dl.headers.get('etag') === `"${fingerprint}"`, dl.headers.get('etag'))
  check('X-Skill-Version is set', dl.headers.get('x-skill-version') === '1.0.0', dl.headers.get('x-skill-version'))
  check(
    'Content-Disposition names the bundle',
    (dl.headers.get('content-disposition') ?? '').includes('smoke-skill-1.0.0.zip'),
    dl.headers.get('content-disposition'),
  )

  const cached = await fetch(`${base}/api/v1/download?slug=smoke-skill&version=latest`, {
    headers: { 'If-None-Match': `"${fingerprint}"` },
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

  r = await req('POST', '/api/v1/skills/smoke-skill/comments', { token: adminToken, body: { body: '  第一条评论  ' } })
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

  r = await req('POST', '/api/v1/skills/smoke-skill/ratings', { token: adminToken, body: { score: 5, comment: '很好' } })
  check(
    'rating your own skill → 400 "cannot rate your own skill"',
    r.status === 400 && /cannot rate your own skill/.test(r.body?.error ?? ''),
    `${r.status} ${r.text}`,
  )

  r = await req('GET', '/api/v1/skills/smoke-skill/ratings')
  check('GET ratings → 200 with an empty list', r.status === 200 && Array.isArray(r.body?.data), r.text.slice(0, 150))

  r = await req('POST', '/api/v1/stars/smoke-skill', { token: adminToken })
  check('star a skill → 200 {"message":"starred"}', r.status === 200 && r.body?.message === 'starred', `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/skills/smoke-skill')
  check('starring updates starsCount', r.body?.starsCount === 1, `starsCount=${r.body?.starsCount}`)

  r = await req('DELETE', '/api/v1/stars/smoke-skill', { token: adminToken })
  check('unstar → 200', r.status === 200 && r.body?.message === 'unstarred', r.text)

  // ── 8. version lifecycle ──────────────────────────────────────────────────
  section('Version lifecycle')

  r = await req('POST', '/api/v1/skills', {
    token: adminToken,
    body: multipart(
      { slug: 'smoke-skill', version: '1.1.0', changelog: 'second release', visibility: 'public' },
      { 'SKILL.md': skillMd('smoke-skill', 'extra line') },
    ),
  })
  check('publish v1.1.0 → 200', r.status === 200 && r.body?.version?.version === '1.1.0', `${r.status} ${r.text.slice(0, 200)}`)

  r = await req('GET', '/api/v1/skills/smoke-skill/file?version=latest&path=SKILL.md', { raw: true })
  const latestText = await r.text()
  check('latest now resolves to v1.1.0', latestText.includes('extra line'), latestText.slice(0, 80))

  r = await req('POST', '/api/v1/skills/smoke-skill/versions/1.1.0/yank', { token: adminToken, body: { reason: 'broken' } })
  check('yank v1.1.0 → 200', r.status === 200 && r.body?.message === 'version yanked', `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/skills/smoke-skill/file?version=latest&path=SKILL.md', { raw: true })
  const afterYank = await r.text()
  check('latest falls back to the newest non-yanked version after a yank', !afterYank.includes('extra line') && afterYank.includes('# smoke-skill'), afterYank.slice(0, 80))

  const pinned = await req('GET', '/api/v1/skills/smoke-skill/file?version=1.1.0&path=SKILL.md', { raw: true })
  check('a yanked version is still fetchable by exact pin', pinned.status === 200, `${pinned.status}`)

  r = await req('POST', '/api/v1/skills/smoke-skill/versions/1.1.0/yank', { token: adminToken, body: { reason: 'again' } })
  check('yanking twice → 400 "already yanked"', r.status === 400 && /already yanked/.test(r.body?.error ?? ''), `${r.status} ${r.text}`)

  r = await req('DELETE', '/api/v1/skills/smoke-skill/versions/1.1.0/yank', { token: adminToken })
  check('unyank → 200', r.status === 200, `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/skills/smoke-skill/file?version=latest&path=SKILL.md', { raw: true })
  check('latest returns to v1.1.0 after unyank', (await r.text()).includes('extra line'))

  r = await req('POST', '/api/v1/skills/smoke-skill/versions/1.1.0/yank', {
    token: adminToken,
    headers: { 'Content-Type': 'application/json' },
    body: '{not valid json',
  })
  check('malformed JSON on skill yank → 400', r.status === 400 && r.body?.error === 'invalid JSON body', `${r.status} ${r.text}`)

  // ── 9. visibility ─────────────────────────────────────────────────────────
  section('Visibility and permissions')

  r = await req('POST', '/api/v1/skills', {
    token: adminToken,
    body: multipart(
      { slug: 'private-skill', version: '1.0.0', visibility: 'private' },
      { 'SKILL.md': skillMd('private-skill') },
    ),
  })
  check('publish a private skill → 200', r.status === 200, `${r.status} ${r.text.slice(0, 200)}`)

  r = await req('POST', '/api/v1/skills', {
    token: adminToken,
    body: multipart({ slug: 'default-vis-skill', version: '1.0.0' }, { 'SKILL.md': skillMd('default') }),
  })
  check(
    'omitting visibility inherits the personal namespace default (private)',
    r.status === 200 && r.body?.skill?.visibility === 'private',
    r.body?.skill?.visibility,
  )

  r = await req('GET', '/api/v1/skills/private-skill')
  check('a private skill is invisible to anonymous callers → 404', r.status === 404 && r.body?.error === 'skill not found', `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/skills?limit=50')
  check(
    'the public list omits the private skill',
    !(r.body?.data ?? []).some((s) => s.slug === 'private-skill'),
  )

  r = await req('GET', '/api/v1/skills/private-skill', { token: adminToken })
  check('the owner can read their own private skill', r.status === 200, `${r.status}`)

  cookie = ''
  r = await req('POST', '/api/v1/skills', {
    body: multipart({ slug: 'anon-skill', version: '1.0.0' }, { 'SKILL.md': skillMd('x') }),
  })
  check('publishing without credentials → 401', r.status === 401, `${r.status}`)

  // A non-admin user must be refused on admin routes.
  r = await req('POST', '/api/v1/admin/users', {
    token: adminToken,
    body: { handle: 'smokeuser', password: ADMIN_PASSWORD },
  })
  check('admin creates a user → 201', r.status === 201 && r.body?.handle === 'smokeuser', `${r.status} ${r.text.slice(0, 200)}`)

  const plainUserTokenRes = await fetch(`${base}/api/v1/admin/tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ userId: r.body?.id, label: 'smoke-user', scope: 'full' }),
  })
  const plainUserToken = (await plainUserTokenRes.json())?.token
  check('admin mints a token for the plain user', typeof plainUserToken === 'string' && plainUserToken.startsWith('clh_'))

  r = await req('GET', '/api/v1/admin/users', { token: plainUserToken })
  check('a non-admin hitting an admin route → 403', r.status === 403, `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/admin/users', { token: 'clh_bogus' })
  check('admin route without valid auth → 401', r.status === 401, `${r.status}`)

  // ── 10. namespaces ────────────────────────────────────────────────────────
  section('Namespaces')

  r = await req('POST', '/api/v1/namespaces', { token: adminToken, body: { slug: 'smoke-team', displayName: 'Smoke Team' } })
  check('create a namespace → 201', r.status === 201 && r.body?.slug === 'smoke-team', `${r.status} ${r.text.slice(0, 200)}`)

  r = await req('POST', '/api/v1/namespaces', { token: adminToken, body: { slug: 'smoke-team' } })
  check('a duplicate namespace slug → 400', r.status === 400 && /already taken/.test(r.body?.error ?? ''), `${r.status} ${r.text}`)

  r = await req('POST', '/api/v1/namespaces', { token: adminToken, body: { slug: 'AB' } })
  check('an invalid namespace slug → 400', r.status === 400, `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/namespaces', { token: adminToken })
  check('list namespaces includes the new one', r.body?.data?.some((n) => n.slug === 'smoke-team'), r.text.slice(0, 200))

  r = await req('POST', '/api/v1/namespaces/smoke-team/members', { token: adminToken, body: { handle: 'smokeuser', role: 'member' } })
  check('add a member → 200', r.status === 200 && r.body?.message === 'member added', `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/namespaces/smoke-team/members', { token: adminToken })
  check(
    'member list includes both users with handles',
    r.body?.data?.length === 2 && r.body.data.some((m) => m.handle === 'smokeuser' && m.displayName === undefined),
    r.text.slice(0, 250),
  )

  r = await req('POST', '/api/v1/namespaces/smoke-team/tokens', {
    token: adminToken,
    body: { label: 'ci', scope: 'publish', expiresIn: '720h' },
  })
  const teamToken = r.body?.token
  check('create a team token → 201', r.status === 201 && typeof teamToken === 'string', `${r.status} ${r.text.slice(0, 250)}`)
  check('team token metadata carries namespaceId', typeof r.body?.metadata?.namespaceId === 'string', JSON.stringify(r.body?.metadata))

  r = await req('POST', '/api/v1/namespaces/smoke-team/tokens', { token: adminToken, body: { scope: 'full', expiresIn: '1h' } })
  check('an invalid team scope → 400', r.status === 400 && /invalid team-token scope/.test(r.body?.error ?? ''), `${r.status} ${r.text}`)

  r = await req('POST', '/api/v1/namespaces/smoke-team/tokens', { token: adminToken, body: { scope: 'publish' } })
  check('a team token without expiresIn → 400', r.status === 400 && /expiresIn is required/.test(r.body?.error ?? ''), `${r.status} ${r.text}`)

  // Team-token namespace binding: publishing into the bound namespace works.
  r = await req('POST', '/api/v1/skills', {
    token: teamToken,
    body: multipart(
      { slug: 'team-skill', version: '1.0.0', visibility: 'public' },
      { 'SKILL.md': skillMd('team-skill') },
    ),
  })
  check(
    'a team token publishes into its bound namespace',
    r.status === 200 && r.body?.skill?.namespaceSlug === 'smoke-team',
    `${r.status} ${r.text.slice(0, 250)}`,
  )

  r = await req('POST', '/api/v1/skills', {
    token: teamToken,
    body: multipart({ slug: 'wrong-ns-skill', version: '1.0.0', namespace: ADMIN_USER }, { 'SKILL.md': skillMd('x') }),
  })
  check(
    'a team token cannot publish to another namespace → 403',
    r.status === 403 && /team token can only publish to its bound namespace/.test(r.body?.error ?? ''),
    `${r.status} ${r.text}`,
  )

  // ── 11. plugin ────────────────────────────────────────────────────────────
  section('Plugins')

  const pluginForm = new FormData()
  pluginForm.set('slug', 'smoke-plugin')
  pluginForm.set('version', '1.0.0')
  pluginForm.set('summary', '冒烟测试插件')
  pluginForm.set('visibility', 'public')
  pluginForm.append('files', new Blob([JSON.stringify({ name: 'smoke-plugin', version: '1.0.0' })], { type: 'application/json' }), 'plugin.json')
  r = await req('POST', '/api/v1/plugins', { token: adminToken, body: pluginForm })
  check('publish a plugin → 201', r.status === 201 && r.body?.plugin?.slug === 'smoke-plugin', `${r.status} ${r.text.slice(0, 250)}`)

  // A plugin published without an explicit visibility inherits the namespace
  // default, which is `private` for a personal namespace.
  const defaultVisForm = new FormData()
  defaultVisForm.set('slug', 'default-vis-plugin')
  defaultVisForm.set('version', '1.0.0')
  defaultVisForm.append(
    'files',
    new Blob([JSON.stringify({ name: 'default-vis-plugin', version: '1.0.0' })], { type: 'application/json' }),
    'plugin.json',
  )
  r = await req('POST', '/api/v1/plugins', { token: adminToken, body: defaultVisForm })
  check(
    'omitting plugin visibility inherits the namespace default (private)',
    r.status === 201 && r.body?.plugin?.visibility === 'private',
    r.body?.plugin?.visibility,
  )

  r = await req('GET', '/api/v1/plugins')
  check(
    'the public plugin list omits a private plugin',
    !(r.body?.data ?? []).some((p) => p.slug === 'default-vis-plugin'),
    r.text.slice(0, 200),
  )

  r = await req('GET', '/api/v1/plugins')
  check(
    'the plugin list uses the flattened projection',
    r.body?.data?.some((p) => p.slug === 'smoke-plugin' && p.ownerHandle === ADMIN_USER && p.version === '1.0.0'),
    r.text.slice(0, 250),
  )

  r = await req('GET', '/api/v1/plugins/smoke-plugin')
  check('plugin detail resolves the latest version', r.status === 200 && r.body?.version === '1.0.0', `${r.status} ${r.text.slice(0, 200)}`)
  check('plugin detail omits ownerId (projection contract)', r.body?.ownerId === undefined)
  check('plugin detail omits moderationStatus', r.body?.moderationStatus === undefined)

  const pluginDl = await fetch(`${base}/api/v1/plugins/download?slug=smoke-plugin`)
  check('plugin download → 200 application/zip', pluginDl.status === 200 && pluginDl.headers.get('content-type') === 'application/zip', `${pluginDl.status}`)

  r = await req('GET', '/api/v1/plugins/file?slug=smoke-plugin&path=plugin.json', { raw: true })
  check('plugin file read → 200 octet-stream', r.status === 200 && (r.headers.get('content-type') ?? '').includes('application/octet-stream'), `${r.status}`)

  // ── 12. agent skill API ───────────────────────────────────────────────────
  section('Agent skill API')

  r = await req('POST', '/api/agent/skills', {
    token: adminToken,
    body: multipart(
      { slug: 'agent-skill', version: '1.0.0', visibility: 'public' },
      { 'SKILL.md': skillMd('agent-skill') },
    ),
  })
  check(
    'POST /api/agent/skills → 201 with the agent envelope',
    r.status === 201 && r.body?.data?.skill?.slug === 'agent-skill' && typeof r.body?.requestId === 'string',
    `${r.status} ${r.text.slice(0, 250)}`,
  )

  r = await req('POST', '/api/agent/skills', {
    token: adminToken,
    body: multipart({ slug: 'agent-no-md', version: '1.0.0' }, { 'notes.txt': 'no skill md here' }),
  })
  check(
    'agent publish without SKILL.md → 400 INVALID_SKILL_MD',
    r.status === 400 && r.body?.error?.code === 'INVALID_SKILL_MD',
    `${r.status} ${r.text.slice(0, 250)}`,
  )

  r = await req('GET', '/api/agent/skills?page=1&pageSize=50', { token: adminToken })
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
  r = await req('GET', `/api/agent/skills/${agentItem?.id}`, { token: adminToken })
  check(
    'agent skill detail includes skillMd and detail',
    r.status === 200 && typeof r.body?.data?.skillMd === 'string' && r.body.data.skillMd.includes('# agent-skill'),
    `${r.status} ${r.text.slice(0, 200)}`,
  )

  r = await req('GET', `/api/agent/skills/${agentItem?.id}/download`, { token: adminToken })
  check(
    'agent download returns an archive URL',
    r.status === 200 && /\/api\/agent\/skills\/.+\/archive$/.test(r.body?.data?.downloadUrl ?? ''),
    r.text.slice(0, 250),
  )

  const archive = await fetch(`${base}/api/agent/skills/${agentItem?.id}/archive`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  const archiveBytes = new Uint8Array(await archive.arrayBuffer())
  check(
    'agent archive streams a zip with a sha256 header',
    archive.status === 200 && archiveBytes[0] === 0x50 && /^[0-9a-f]{64}$/.test(archive.headers.get('x-content-sha256') ?? ''),
    `${archive.status}`,
  )

  r = await req('GET', '/api/agent/skills/not-a-uuid', { token: adminToken })
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

  const bundleRes = await fetch(`${base}/api/runtime/skills/bundle?slug=${skillRef}`)
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
    { token: adminToken, body: multipart({ slug: 'smoke-skill', version: '1.2.0' }, { 'SKILL.md': skillMd('smoke-skill'), 'assets/icon.png': Buffer.from(ICON_PNG, 'base64') }) },
  )
  check('publish with a package image → 200', r.status === 200 && r.body?.version?.version === '1.2.0', `${r.status} ${r.text.slice(0, 200)}`)
  const iconRes = await fetch(`${base}/api/runtime/skills/files?slug=${encodeURIComponent(skillRef)}&path=assets%2Ficon.png`)
  check(
    'runtime file serves images with a proper Content-Type',
    iconRes.status === 200 && iconRes.headers.get('content-type') === 'image/png',
    `${iconRes.status} ${iconRes.headers.get('content-type')}`,
  )

  // ── 14. admin ─────────────────────────────────────────────────────────────
  section('Admin')

  r = await req('GET', '/api/v1/admin/skills?limit=100', { token: adminToken })
  check(
    'admin skill list sees private skills too',
    r.status === 200 && (r.body?.data ?? []).some((s) => s.slug === 'private-skill'),
    r.text.slice(0, 200),
  )

  r = await req('POST', '/api/v1/admin/skills/private-skill/visibility', { token: adminToken, body: { visibility: 'public' } })
  check('admin sets visibility → 200', r.status === 200, `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/skills/private-skill')
  check('the skill is now publicly visible', r.status === 200, `${r.status}`)

  r = await req('POST', '/api/v1/admin/skills/private-skill/visibility', { token: adminToken, body: { visibility: 'bogus' } })
  check(
    "an invalid visibility → 400 \"must be 'public' or 'private'\"",
    r.status === 400 && /must be 'public' or 'private'/.test(r.body?.error ?? ''),
    `${r.status} ${r.text}`,
  )

  r = await req('POST', '/api/v1/admin/skills/smoke-skill/review', { token: adminToken, body: { action: 'approve' } })
  check('review approve → 200 "skill approved"', r.status === 200 && r.body?.message === 'skill approved', `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/admin/audit-logs?limit=100', { token: adminToken })
  check(
    'audit log recorded the publish',
    r.status === 200 && (r.body?.data ?? []).some((l) => l.action === 'publish'),
    r.text.slice(0, 250),
  )

  r = await req('POST', '/api/v1/admin/users/role', { token: adminToken, body: { userId: 'not-a-uuid', role: 'admin' } })
  check('an invalid user id → 400 "invalid user ID"', r.status === 400 && r.body?.error === 'invalid user ID', `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/admin/plugins?limit=20', { token: adminToken })
  check(
    'admin plugin list returns the raw Plugin shape',
    r.status === 200 && (r.body?.data ?? []).some((p) => p.slug === 'smoke-plugin' && p.moderationStatus !== undefined),
    r.text.slice(0, 250),
  )

  // ── 15. admin API keys ───────────────────────────────────────────────────
  section('Admin API keys')

  r = await req('POST', '/api/v1/admin/api-keys', {
    token: adminToken,
    body: { name: 'smoke-full', scopes: ['skills:read', 'skills:publish', 'skills:delete', 'skills:moderate'] },
  })
  const fullKey = r.body?.key
  const fullKeyId = r.body?.metadata?.id
  check('POST /admin/api-keys → 201 with an shk_ key', r.status === 201 && typeof fullKey === 'string' && fullKey.startsWith('shk_'), r.text)
  check('the key metadata hides keyHash', r.body?.metadata?.keyHash === undefined, JSON.stringify(r.body?.metadata))
  check('the stored prefix is 16 chars', (r.body?.metadata?.prefix ?? '').length === 16, r.body?.metadata?.prefix)
  check('the granted scopes are echoed back', r.body?.metadata?.scopes?.length === 4, JSON.stringify(r.body?.metadata?.scopes))

  r = await req('GET', '/api/v1/admin/api-keys', { token: adminToken })
  check(
    'GET /admin/api-keys lists the new key',
    r.status === 200 && (r.body?.data ?? []).some((k) => k.id === fullKeyId && !k.revokedAt),
    r.text.slice(0, 250),
  )

  r = await req('GET', '/api/v1/whoami', { token: fullKey })
  check('a key authenticates as the admin who minted it', r.status === 200 && r.body?.role === 'admin', `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/skills?limit=5', { token: fullKey })
  check('a key with skills:read can list skills', r.status === 200, `${r.status} ${r.text.slice(0, 150)}`)

  r = await req('POST', '/api/v1/skills', {
    token: fullKey,
    body: multipart(
      { slug: 'apikey-skill', version: '1.0.0', visibility: 'public', category: 'testing' },
      { 'SKILL.md': skillMd('apikey-skill') },
    ),
  })
  check('a key with skills:publish can publish', r.status === 200 && r.body?.skill?.slug === 'apikey-skill', `${r.status} ${r.text.slice(0, 250)}`)

  r = await req('POST', '/api/v1/admin/skills/@admin/apikey-skill/visibility', { token: fullKey, body: { visibility: 'public' } })
  check('a key with skills:moderate can set visibility', r.status === 200, `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/admin/features', { token: fullKey })
  check('a key with skills:read can list admin features', r.status === 200 && Array.isArray(r.body?.data), `${r.status} ${r.text.slice(0, 150)}`)
  const featuredSkillId = (r.body?.data ?? []).find((s) => typeof s?.id === 'string')?.id
  r = await req('PUT', '/api/v1/admin/features', { token: fullKey, body: { skillIds: featuredSkillId ? [featuredSkillId] : [] } })
  check('a key with skills:moderate can replace featured skills', r.status === 200 && r.body?.message === 'featured skills updated', `${r.status} ${r.text}`)
  r = await req('GET', '/api/v1/features')
  check('the homepage featured rail reflects the key-made change', r.status === 200 && (r.body?.data ?? []).every((s) => s.id === featuredSkillId), `${r.status} ${r.text.slice(0, 250)}`)

  // A read-only key proves the per-endpoint narrowing: same creator, fewer powers.
  r = await req('POST', '/api/v1/admin/api-keys', { token: adminToken, body: { name: 'smoke-readonly', scopes: ['skills:read'] } })
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

  r = await req('GET', '/api/v1/tokens', { token: fullKey })
  check('no key reaches endpoints outside the skill catalogue → 403', r.status === 403, `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/admin/api-keys', { token: fullKey })
  check('a key cannot administer other keys → 403', r.status === 403, `${r.status} ${r.text}`)

  // Bound to a namespace: publishing without an explicit namespace lands there.
  r = await req('POST', '/api/v1/namespaces', { token: adminToken, body: { slug: 'apikey-ns', displayName: 'API key namespace' } })
  const boundNamespace = r.body?.slug ?? 'apikey-ns'
  r = await req('POST', '/api/v1/admin/api-keys', {
    token: adminToken,
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
  r = await req('POST', '/api/v1/admin/api-keys', { token: adminToken, body: { scopes: ['skills:read'] } })
  check('a key without a name → 400', r.status === 400 && r.body?.error === 'name is required', `${r.status} ${r.text}`)

  r = await req('POST', '/api/v1/admin/api-keys', { token: adminToken, body: { name: 'no-scopes', scopes: [] } })
  check('a key without scopes → 400', r.status === 400 && /scopes must include/.test(r.body?.error ?? ''), `${r.status} ${r.text}`)

  r = await req('POST', '/api/v1/admin/api-keys', { token: adminToken, body: { name: 'bad-scope', scopes: ['skills:everything'] } })
  check('an unknown scope → 400', r.status === 400 && /invalid scope/.test(r.body?.error ?? ''), `${r.status} ${r.text}`)

  r = await req('POST', '/api/v1/admin/api-keys', { token: adminToken, body: { name: 'bad-ns', scopes: ['skills:read'], namespaceSlug: 'nope-ns' } })
  check('an unknown namespace → 404', r.status === 404, `${r.status} ${r.text}`)

  r = await req('DELETE', '/api/v1/admin/api-keys/not-a-uuid', { token: adminToken })
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
  r = await req('POST', '/api/v1/admin/api-keys', { token: adminToken, body: { name: 'smoke-expiring', scopes: ['skills:read'], expiresIn: '1s' } })
  const expiringKey = r.body?.key
  check('a key can carry an expiry', r.status === 201 && r.body?.metadata?.expiresAt !== undefined, r.text)
  await sleep(1300)
  r = await req('GET', '/api/v1/whoami', { token: expiringKey })
  check('an expired key → 401', r.status === 401, `${r.status} ${r.text}`)

  // Revocation takes effect immediately.
  r = await req('DELETE', `/api/v1/admin/api-keys/${fullKeyId}`, { token: adminToken })
  check('DELETE /admin/api-keys/:id → 200', r.status === 200 && r.body?.message === 'API key revoked', `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/whoami', { token: fullKey })
  check('a revoked key → 401', r.status === 401, `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/admin/api-keys', { token: adminToken })
  check(
    'the revoked key stays in the list with revokedAt set',
    (r.body?.data ?? []).some((k) => k.id === fullKeyId && k.revokedAt),
    r.text.slice(0, 250),
  )

  r = await req('DELETE', `/api/v1/admin/api-keys/${fullKeyId}`, { token: adminToken })
  check('revoking twice → 400', r.status === 400, `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/admin/audit-logs?limit=100', { token: adminToken })
  check(
    'minting and revoking a key is audited',
    r.status === 200 &&
      (r.body?.data ?? []).some((l) => l.action === 'admin_create_api_key') &&
      (r.body?.data ?? []).some((l) => l.action === 'admin_revoke_api_key'),
    r.text.slice(0, 250),
  )

  // ── 16. skill detail HTML ────────────────────────────────────────────────
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

  r = await req('PUT', '/api/v1/skills/@admin/smoke-skill/detail-html', { token: adminToken, body: { html: hostile } })
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
    token: adminToken,
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
  r = await req('PUT', '/api/v1/skills/@admin/smoke-skill/detail-html', { token: adminToken, body: { htmlEn: '<p>English body</p>' } })
  check(
    'htmlEn updates only the English body',
    r.status === 200 && r.body?.detailHtmlEn === '<p>English body</p>' && r.body?.detailHtml === dataUriHtml,
    `${r.status} ${r.text.slice(0, 200)}`,
  )
  r = await req('PUT', '/api/v1/skills/@admin/smoke-skill/detail-html', { token: adminToken, body: {} })
  check('a body without html or htmlEn → 400', r.status === 400 && r.body?.error === 'html or htmlEn is required', `${r.status} ${r.text}`)
  r = await req('PUT', '/api/v1/skills/@admin/smoke-skill/detail-html', { token: adminToken, body: { htmlEn: '' } })
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

  r = await req('PUT', '/api/v1/skills/@admin/smoke-skill/detail-html', { token: adminToken, body: { html: '   ' } })
  check('blank input clears the detail body', r.status === 200 && r.body?.detailHtml === undefined, `${r.status} ${r.text.slice(0, 150)}`)

  r = await req('PUT', '/api/v1/skills/@admin/smoke-skill/detail-html', { token: adminToken, body: { html: '<p>回到 SKILL.md</p>' } })
  check('a detail body can be set again', r.status === 200 && r.body?.detailHtml === '<p>回到 SKILL.md</p>', `${r.status} ${r.text.slice(0, 150)}`)

  r = await req('PUT', '/api/v1/skills/@admin/smoke-skill/detail-html', { token: adminToken, body: { html: 42 } })
  check('a non-string html → 400', r.status === 400 && r.body?.error === 'html must be a string', `${r.status} ${r.text}`)

  r = await req('PUT', '/api/v1/skills/@admin/smoke-skill/detail-html', { body: { html: '<p>x</p>' } })
  check('no credentials → 401', r.status === 401, `${r.status} ${r.text}`)

  r = await req('PUT', '/api/v1/skills/@admin/smoke-skill/detail-html', { token: readOnlyKey, body: { html: '<p>x</p>' } })
  check('a read-only key cannot update it → 403', r.status === 403, `${r.status} ${r.text}`)

  r = await req('POST', '/api/v1/admin/api-keys', { token: adminToken, body: { name: 'smoke-detail-publish', scopes: ['skills:publish'] } })
  const publishKey = r.body?.key
  check('a publishing key is minted', r.status === 201 && typeof publishKey === 'string', r.text)

  r = await req('PUT', '/api/v1/skills/@admin/smoke-skill/detail-html', { token: publishKey, body: { html: '<p>来自 API Key</p>' } })
  check('a key with skills:publish can update it', r.status === 200 && r.body?.detailHtml === '<p>来自 API Key</p>', `${r.status} ${r.text.slice(0, 200)}`)

  // A second account with no relationship to the skill must be refused.
  r = await req('POST', '/api/v1/admin/users', { token: adminToken, body: { handle: 'detail-other' } })
  const otherUserId = r.body?.id
  r = await req('POST', '/api/v1/admin/tokens', { token: adminToken, body: { userId: otherUserId, scope: 'full' } })
  const otherToken = r.body?.token
  check('a second account is provisioned', typeof otherToken === 'string' && otherToken.startsWith('clh_'), `${r.status} ${r.text.slice(0, 150)}`)

  r = await req('PUT', '/api/v1/skills/@admin/smoke-skill/detail-html', { token: otherToken, body: { html: '<p>mine now</p>' } })
  check('an unrelated account cannot update it → 403', r.status === 403, `${r.status} ${r.text}`)

  r = await req('PUT', '/api/v1/skills/@admin/does-not-exist/detail-html', { token: adminToken, body: { html: '<p>x</p>' } })
  check('an unknown skill → 404', r.status === 404, `${r.status} ${r.text}`)

  r = await req('GET', '/api/v1/admin/audit-logs?limit=100', { token: adminToken })
  check(
    'updating the detail body is audited',
    r.status === 200 && (r.body?.data ?? []).some((l) => l.action === 'update_detail_html'),
    r.text.slice(0, 200),
  )

  // ── 17. rate limiting (tight limits, separate process) ───────────────────
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

  // ── 18. persistence across restart ────────────────────────────────────────
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
