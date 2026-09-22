/**
 * SQLite connection, migrations and transaction helpers.
 *
 * Uses Node's built-in `node:sqlite` — no third-party driver. Only three things
 * live here: connection bootstrap, schema migration, and the value/transaction
 * utilities every repository depends on. All SQL statements belong to the
 * services and repositories, not to this module.
 */

import { DatabaseSync, type StatementSync } from 'node:sqlite'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { getConfig } from './config'
import { seedAdminUser, seedBuiltinSkills, seedFeaturedSkills } from './bootstrap'
import { MIGRATIONS, SEED_RESERVED_SLUGS, RESERVED_SLUG_REASON } from './schema'

// ─────────────────────────────────────────────────────────────────────────────
// Time & id helpers
// ─────────────────────────────────────────────────────────────────────────────

/** ISO-8601 UTC, millisecond precision, always suffixed `Z`. */
export function nowIso(): string {
  return new Date().toISOString()
}

/** Parse an ISO timestamp to epoch millis; `null`/invalid → `null`. */
export function epochMs(iso: string | null | undefined): number | null {
  if (!iso) return null
  const t = Date.parse(iso)
  return Number.isNaN(t) ? null : t
}

export function newId(): string {
  return crypto.randomUUID()
}

/** `true` when `a` is strictly after `b`. */
export function isAfter(a: string, b: string): boolean {
  return (epochMs(a) ?? 0) > (epochMs(b) ?? 0)
}

/** Add seconds to a timestamp, returning a new ISO string. */
export function addSeconds(iso: string, seconds: number): string {
  return new Date((epochMs(iso) ?? Date.now()) + seconds * 1000).toISOString()
}

// ─────────────────────────────────────────────────────────────────────────────
// Value binding
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `node:sqlite` accepts only `null | number | bigint | string | Uint8Array`.
 * Passing `undefined` or a `boolean` throws a type error, so every value that
 * reaches `.run()/.get()/.all()` must pass through here first.
 */
export function bindable(v: unknown): null | number | bigint | string | Uint8Array {
  if (v === undefined || v === null) return null
  if (typeof v === 'boolean') return v ? 1 : 0
  if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'string') return v
  if (v instanceof Uint8Array) return v
  return String(v)
}

export type BindValue = null | number | bigint | string | Uint8Array

function bindAll(params: unknown[]): BindValue[] {
  return params.map(bindable)
}

// ─────────────────────────────────────────────────────────────────────────────
// Connection
// ─────────────────────────────────────────────────────────────────────────────

interface DbHolder {
  db: DatabaseSync | null
  dbPath: string | null
}

// Cached on globalThis so Vite's dev-mode module reloading does not reopen the
// file (an open handle plus a fresh `DatabaseSync` on the same path is a good
// way to lose writes to a stale WAL).
const holder: DbHolder = ((globalThis as any).__skillhubDbHolder ??= {
  db: null,
  dbPath: null,
} satisfies DbHolder)

export function getDb(): DatabaseSync {
  const cfg = getConfig()
  if (holder.db && holder.dbPath === cfg.dbPath) return holder.db

  const dir = path.dirname(cfg.dbPath)
  if (cfg.dbPath !== ':memory:') {
    fs.mkdirSync(dir, { recursive: true })
  }

  const db = new DatabaseSync(cfg.dbPath)
  applyPragmas(db)
  migrate(db)
  seedReservedSlugs(db)
  // Creates SKILLHUB_ADMIN_USER on first boot; a no-op on every later start.
  seedAdminUser(db, (msg) => console.log(`[skillhub] ${msg}`))
  seedBuiltinSkills(db, (msg) => console.log(`[skillhub] ${msg}`))
  // Pre-populates the homepage Featured rail on a fresh install.
  seedFeaturedSkills(db, (msg) => console.log(`[skillhub] ${msg}`))

  holder.db = db
  holder.dbPath = cfg.dbPath
  return db
}

export function closeDb(): void {
  if (holder.db) {
    holder.db.close()
    holder.db = null
    holder.dbPath = null
  }
}

function applyPragmas(db: DatabaseSync): void {
  // WAL on a file DB; `:memory:` silently stays in memory mode.
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  db.exec('PRAGMA busy_timeout = 5000')
  db.exec('PRAGMA synchronous = NORMAL')
}

// ─────────────────────────────────────────────────────────────────────────────
// Migrations
// ─────────────────────────────────────────────────────────────────────────────

export interface AppliedMigration {
  v: number
  name: string
}

/**
 * Applies every migration newer than the database's `user_version`.
 * Migrations are append-only; existing entries are never edited so that
 * databases created by older releases keep upgrading cleanly.
 */
export function migrate(db: DatabaseSync): AppliedMigration[] {
  const current = Number(
    (db.prepare('PRAGMA user_version').get() as { user_version?: number } | undefined)
      ?.user_version ?? 0,
  )
  const applied: AppliedMigration[] = []

  for (const m of MIGRATIONS) {
    if (m.v <= current) continue
    db.exec('BEGIN')
    try {
      db.exec(m.sql)
      // `PRAGMA user_version = ?` cannot be parameterised; the value comes from
      // a literal in this module, never from user input.
      db.exec(`PRAGMA user_version = ${m.v}`)
      db.exec('COMMIT')
      applied.push({ v: m.v, name: m.name })
    } catch (e) {
      db.exec('ROLLBACK')
      throw new Error(`migration ${m.v} (${m.name}) failed: ${(e as Error).message}`)
    }
  }
  return applied
}

function seedReservedSlugs(db: DatabaseSync): void {
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO reserved_slugs (slug, reason, created_at) VALUES (?, ?, ?)',
  )
  const now = nowIso()
  for (const slug of SEED_RESERVED_SLUGS) {
    stmt.run(slug, RESERVED_SLUG_REASON, now)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Transactions
// ─────────────────────────────────────────────────────────────────────────────

let txDepth = 0

/**
 * Re-entrant transaction. Nested calls join the outermost transaction, so
 * service methods can compose without tracking whether they are already inside
 * one. Only the outermost frame commits or rolls back.
 */
export function tx<T>(fn: () => T): T {
  if (txDepth > 0) return fn()
  const db = getDb()
  db.exec('BEGIN')
  txDepth += 1
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (e) {
    try {
      db.exec('ROLLBACK')
    } catch {
      /* rollback failure must not mask the original error */
    }
    throw e
  } finally {
    txDepth = 0
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Query helpers
// ─────────────────────────────────────────────────────────────────────────────

export type Row = Record<string, unknown>

export const query = {
  all<T = Row>(sql: string, ...params: unknown[]): T[] {
    return getDb().prepare(sql).all(...bindAll(params)) as T[]
  },
  get<T = Row>(sql: string, ...params: unknown[]): T | undefined {
    return getDb().prepare(sql).get(...bindAll(params)) as T | undefined
  },
  run(sql: string, ...params: unknown[]) {
    return getDb().prepare(sql).run(...bindAll(params))
  },
  /** Prepare once and reuse — for hot loops such as seeding. */
  stmt(sql: string): StatementSync {
    return getDb().prepare(sql)
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Column coercion helpers (SQLite hands back loose types)
// ─────────────────────────────────────────────────────────────────────────────

export const asString = (v: unknown): string => (v == null ? '' : String(v))
export const asNumber = (v: unknown): number => (v == null ? 0 : Number(v))
export const asBool = (v: unknown): boolean => Number(v ?? 0) !== 0
export const asText = (v: unknown): string | undefined => (v == null ? undefined : String(v))
