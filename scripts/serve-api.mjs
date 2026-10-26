/**
 * Standalone API server for the existing SkillHub backend.
 *
 * The backend lives in `src/server/` and is exposed through two pure dispatch
 * functions — `dispatchApi` (covers `/api/**`, `/login`, `/logout`,
 * `/register`) and `dispatchRoot` (covers `/healthz`, `/readyz`, `/metrics`,
 * `/skills.md`, …). This script mounts both behind a tiny Node HTTP server so
 * the backend can run as an independent service in front of the Next.js
 * frontend, which proxies `/skillhubservice/*` here.
 *
 * None of the backend source is modified — this is purely a host entry point.
 */

import http from 'node:http'
import fs from 'node:fs'
import { Readable } from 'node:stream'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, '..')

// Load `.env` (and `.env.local`) from the project root before importing the
// backend, because `src/server/config.ts` reads credentials at import time.
function loadEnv(file) {
  try {
    const text = fs.readFileSync(file, 'utf8')
    for (const line of text.split('\n')) {
      const match = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/)
      if (!match) continue
      const key = match[1]
      let value = match[2]
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      if (process.env[key] === undefined) process.env[key] = value
    }
  } catch {
    // Missing env file is fine — backend falls back to its own defaults.
  }
}
loadEnv(path.join(projectRoot, '.env'))
loadEnv(path.join(projectRoot, '.env.local'))

const PORT = Number(process.env.SKILLHUB_API_PORT ?? process.env.SKILLHUB_PORT ?? 8787)
const HOST = process.env.SKILLHUB_API_HOST ?? '0.0.0.0'

const { dispatchApi } = await import(path.join(projectRoot, 'src/server/api/routes.ts'))
const { dispatchRoot } = await import(path.join(projectRoot, 'src/server/api/rootRoutes.ts'))

const MIME = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
}

function toWebRequest(req) {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(key, v)
    else if (value !== undefined) headers.set(key, value)
  }
  const method = req.method ?? 'GET'
  const hasBody = method !== 'GET' && method !== 'HEAD'
  return new Request(url, {
    method,
    headers,
    body: hasBody ? Readable.toWeb(req) : undefined,
    duplex: hasBody ? 'half' : undefined,
  })
}

async function writeWebResponse(res, response) {
  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') res.appendHeader(key, value)
    else res.setHeader(key, value)
  })
  if (response.status === 204 || response.status === 304 || !response.body) {
    res.end()
    return
  }
  const body = Readable.fromWeb(response.body)
  body.on('error', () => res.destroy())
  body.pipe(res)
}

const server = http.createServer(async (req, res) => {
  try {
    const request = toWebRequest(req)
    // `dispatchApi` answers `/api/**`, `/login`, `/logout`, `/register`; anything
    // it does not claim (root-only endpoints such as `/healthz`) is handled by
    // `dispatchRoot`. Unmatched paths fall through to a 404 from the second.
    let response = await dispatchApi(request)
    if (response.status === 404) response = await dispatchRoot(request)
    await writeWebResponse(res, response)
  } catch (error) {
    console.error('[skillhub-api] request failed', error)
    if (!res.headersSent) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
    }
    res.end(JSON.stringify({ error: 'internal error' }))
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[skillhub-api] listening on http://${HOST}:${PORT}`)
  // Warm up: open the database and seed builtin skills / featured rail so the
  // catalogue is ready the moment the frontend asks for it.
  const warmupUrl = `http://127.0.0.1:${PORT}/api/v1/features`
  fetch(warmupUrl, { signal: AbortSignal.timeout(10000) })
    .then(async (r) => {
      console.log(`[skillhub-api] init: database ready (features endpoint ${r.status})`)
    })
    .catch((e) => {
      console.warn(`[skillhub-api] init: warm-up failed (${e.message})`)
    })
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 3000).unref()
  })
}
