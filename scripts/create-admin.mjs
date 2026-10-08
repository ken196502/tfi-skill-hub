/**
 * Creates or updates a user directly in the SQLite database.
 *
 * Usage:
 *   node scripts/create-admin.mjs --handle alice --password secret --role admin
 *   node scripts/create-admin.mjs --handle bob --password secret --set-password
 *
 * Flags:
 *   --handle      required
 *   --password    required
 *   --role        user | admin   (default: user; ignored for --set-password on an existing account)
 *   --set-password only reset the password of an existing account
 *   --db          path to the SQLite file (default: $SKILLHUB_DATABASE_URL or ./data/skillhub.db)
 *
 * Works against the same schema the server uses; run it while the server is
 * stopped, or accept that a running server picks the change up on the next
 * request (password reads are not cached).
 */

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { scryptSync } from 'node:crypto'

const VALID_ROLES = ['user', 'admin']
const MIN_PASSWORD_LENGTH = 8

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i]
    if (!key.startsWith('--')) continue
    const name = key.slice(2)
    const next = argv[i + 1]
    if (next === undefined || next.startsWith('--')) out[name] = true
    else {
      out[name] = next
      i += 1
    }
  }
  return out
}

const args = parseArgs(process.argv.slice(2))

if (!args.handle || !args.password) {
  console.error('usage: node scripts/create-admin.mjs --handle <handle> --password <password> [--role admin]')
  process.exit(2)
}

const handle = String(args.handle)
const password = String(args.password)
const role = String(args.role ?? 'user')

if (password.length < MIN_PASSWORD_LENGTH) {
  console.error(`password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  process.exit(2)
}
if (!args['set-password'] && !VALID_ROLES.includes(role)) {
  console.error(`role must be one of: ${VALID_ROLES.join(', ')}`)
  process.exit(2)
}

const dbPath = String(
  args.db ?? process.env.SKILLHUB_DATABASE_URL ?? path.join(process.cwd(), 'data', 'skillhub.db'),
)

if (dbPath !== ':memory:' && !fs.existsSync(dbPath)) {
  console.error(`database not found: ${dbPath}`)
  console.error('start the server once (npm start) so the schema is created, then retry.')
  process.exit(1)
}

const hashPassword = (pwd) => {
  const salt = crypto.randomBytes(16)
  const hash = scryptSync(pwd, salt, 32)
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`
}

const db = new DatabaseSync(dbPath)
const existing = db.prepare('SELECT id, handle, role FROM users WHERE handle = ?').get(handle)
const now = new Date().toISOString()

if (existing) {
  if (!args['set-password']) {
    console.error(`user '${handle}' already exists (role ${existing.role}); pass --set-password to reset it`)
    process.exit(1)
  }
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
    hashPassword(password),
    now,
    existing.id,
  )
  console.log(`password updated for '${handle}'`)
} else {
  db.prepare(
    `INSERT INTO users (id, handle, display_name, password_hash, role, is_banned, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(crypto.randomUUID(), handle, handle, hashPassword(password), role, now, now)
  console.log(`created user '${handle}' with role '${role}'`)
}

db.close()
