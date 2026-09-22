/**
 * Production launcher.
 *
 * `vite build` emits `dist/server/server.js` exporting a Web-standard handler
 * (`{ fetch(request) => Response }`) plus the client bundle in `dist/client`.
 * TanStack Start normally pairs that with a hosting adapter; this script is the
 * plain-Node equivalent so the service runs as a single process — the same
 * posture as the original Go binary.
 *
 * Responsibilities, in order:
 *   1. Serve `dist/client/assets/*` and other prebuilt static files directly.
 *   2. Hand everything else to the Start handler (SSR pages + API routes).
 *
 * No dependencies: the Node↔Web stream bridging uses `node:stream` helpers.
 */

import http from 'node:http'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(here, '..')
const host = process.env.SKILLHUB_HOST ?? '0.0.0.0'
const port = Number(process.env.SKILLHUB_PORT ?? process.env.PORT ?? 10070)

// Both defaults can be overridden so a build can be staged outside `dist`
// (useful for blue/green swaps or for building into a scratch directory).
const clientDir = path.resolve(process.env.SKILLHUB_CLIENT_DIR ?? path.join(projectRoot, 'dist', 'client'))
const serverEntry = path.resolve(
  process.env.SKILLHUB_SERVER_ENTRY ?? path.join(projectRoot, 'dist', 'server', 'server.js'),
)

// Imported lazily so a missing build produces a clear message rather than a
// module-resolution stack trace.
let handler
try {
  ;({ default: handler } = await import(pathToFileURL(serverEntry).href))
} catch (e) {
  console.error(`[skillhub] could not load ${serverEntry} — run \`npm run build\` first.`)
  console.error(e)
  process.exit(1)
}

const MIME = {
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

/** Resolves a URL path inside `dist/client`, refusing traversal attempts. */
function resolveStatic(pathname) {
  const decoded = decodeURIComponent(pathname)
  const candidate = path.join(clientDir, decoded)
  const normalized = path.normalize(candidate)
  if (!normalized.startsWith(clientDir)) return null
  return normalized
}

async function serveStatic(pathname) {
  const filePath = resolveStatic(pathname)
  if (!filePath) return null
  try {
    const stat = await fsp.stat(filePath)
    if (!stat.isFile()) return null
    const stream = fs.createReadStream(filePath)
    return new Response(Readable.toWeb(stream), {
      status: 200,
      headers: {
        'Content-Type': MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream',
        'Content-Length': String(stat.size),
        // Hashed filenames are immutable; everything else stays short-lived.
        'Cache-Control': path.basename(path.dirname(filePath)) === 'assets'
          ? 'public, max-age=31536000, immutable'
          : 'public, max-age=300',
      },
    })
  } catch {
    return null
  }
}

/** Builds a Web `Request` from a Node request, streaming the body through. */
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
    // Required by Node when streaming a request body.
    duplex: hasBody ? 'half' : undefined,
  })
}

async function writeWebResponse(res, response) {
  res.statusCode = response.status
  response.headers.forEach((value, key) => {
    // `set-cookie` must be appended so multiple cookies survive.
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
  const pathname = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`).pathname

  try {
    // Prebuilt assets bypass SSR entirely.
    if (pathname.startsWith('/assets/') || pathname.startsWith('/favicon')) {
      const asset = await serveStatic(pathname)
      if (asset) {
        await writeWebResponse(res, asset)
        return
      }
    }

    const response = await handler.fetch(toWebRequest(req))
    await writeWebResponse(res, response)
  } catch (e) {
    console.error('[skillhub] request failed', req.method, pathname, e)
    if (!res.headersSent) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
    }
    res.end(JSON.stringify({ error: 'internal error' }))
  }
})

server.listen(port, host, () => {
  // A stable first line so a supervisor (or the smoke test) can detect
  // readiness without probing the port.
  console.log(`[skillhub] listening on http://${host}:${port}`)

  // Warm-up: trigger DB open + first-boot seeding (builtin skills & featured
  // rail) now, rather than waiting for the first inbound request. This way the
  // catalog is fully initialized the moment the container is considered healthy
  // — important for deployments (Docker/K8s) where "ready" should mean "data
  // is there", not just "the port is open".
  const warmupUrl = `http://127.0.0.1:${port}/api/v1/features`
  fetch(warmupUrl, { signal: AbortSignal.timeout(10000) })
    .then(async (res) => {
      console.log(`[skillhub] init: database ready (features endpoint ${res.status})`)
    })
    .catch((e) => {
      console.warn(
        `[skillhub] init: warm-up request failed (${e.message}); the first inbound request will initialize the database`,
      )
    })
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => process.exit(0))
    // Do not hang forever on keep-alive connections.
    setTimeout(() => process.exit(0), 3000).unref()
  })
}
