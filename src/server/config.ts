/**
 * Runtime configuration.
 *
 * Mirrors `pkg/config/config.go` from the Go implementation: everything is
 * env-overridable, and the defaults reproduce the standalone binary's
 * zero-argument behaviour (SQLite in ./data, listening on 0.0.0.0:10070).
 */

import path from 'node:path'

function envStr(key: string, fallback: string): string {
  const v = process.env[key]
  return v === undefined || v === '' ? fallback : v
}

function envInt(key: string, fallback: number): number {
  const raw = process.env[key]
  if (raw === undefined || raw === '') return fallback
  const n = Number.parseInt(raw, 10)
  return Number.isFinite(n) ? n : fallback
}

/** Truthy unless explicitly switched off (`0` / `false` / `no` / `off`). */
function envBool(key: string, fallback: boolean): boolean {
  const raw = process.env[key]
  if (raw === undefined || raw === '') return fallback
  return !['0', 'false', 'no', 'off'].includes(raw.trim().toLowerCase())
}

const root = process.cwd()

export interface RateLimitConfig {
  readLimit: number
  readWindow: number
  writeLimit: number
  writeWindow: number
  downloadLimit: number
  downloadWindow: number
}

export interface Config {
  host: string
  port: number
  baseUrl: string
  basePath: string
  dbPath: string
  tokenPrefix: string
  /** Prefix for admin-issued management keys; must differ from `tokenPrefix`. */
  apiKeyPrefix: string
  sessionTtlSeconds: number
  adminUser: string
  adminPassword: string
  /**
   * Whether the public registration form is open. Accounts created through it
   * start out awaiting review; switching this off hides the entry point and
   * rejects submissions, without affecting existing accounts.
   */
  allowRegistration: boolean
  rateLimit: RateLimitConfig
  runId: string
}

let cached: Config | null = null

export function getConfig(): Config {
  if (cached) return cached
  const dbPath = envStr(
    'SKILLHUB_DATABASE_URL',
    envStr('SKILLHUB_DB_PATH', path.join(root, 'data', 'skillhub.db')),
  )
  cached = {
    host: envStr('SKILLHUB_HOST', '0.0.0.0'),
    port: envInt('SKILLHUB_PORT', envInt('PORT', 10070)),
    baseUrl: envStr('SKILLHUB_BASE_URL', ''),
    basePath: normalizeBasePath(envStr('SKILLHUB_BASE_PATH', '')),
    dbPath,
    tokenPrefix: envStr('SKILLHUB_TOKEN_PREFIX', 'clh_'),
    // Management keys minted in the admin console. Kept distinct from the
    // personal-token prefix so a key can never be mistaken for one.
    apiKeyPrefix: envStr('SKILLHUB_API_KEY_PREFIX', 'shk_'),
    // Go: Login issues a "web-session" token with a 30-day expiry.
    sessionTtlSeconds: envInt('SKILLHUB_SESSION_TTL', 30 * 24 * 3600),
    adminUser: envStr('SKILLHUB_ADMIN_USER', ''),
    adminPassword: envStr('SKILLHUB_ADMIN_PASSWORD', ''),
    allowRegistration: envBool('SKILLHUB_ALLOW_REGISTRATION', true),
    rateLimit: {
      readLimit: envInt('SKILLHUB_RATE_READ_LIMIT', 120),
      readWindow: envInt('SKILLHUB_RATE_READ_WINDOW', 600),
      writeLimit: envInt('SKILLHUB_RATE_WRITE_LIMIT', 30),
      writeWindow: envInt('SKILLHUB_RATE_WRITE_WINDOW', 120),
      downloadLimit: envInt('SKILLHUB_RATE_DOWNLOAD_LIMIT', 20),
      downloadWindow: envInt('SKILLHUB_RATE_DOWNLOAD_WINDOW', 120),
    },
    runId: envStr('SKILLHUB_RUN_ID', ''),
  }
  return cached
}

/** `"" | "/skillhub"` — always either empty or leading-slash, never trailing-slash. */
export function normalizeBasePath(raw: string): string {
  if (!raw || raw === '/') return ''
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`
  return withSlash.replace(/\/+$/, '')
}
