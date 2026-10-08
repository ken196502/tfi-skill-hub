/**
 * Administrative operations and the agent-facing publishing API.
 *
 * Admin endpoints all require `role === 'admin'` (enforced by the route table's
 * `auth: 'admin'`). Mutations write an audit row so reviewers can reconstruct
 * who changed what.
 */

import crypto from 'node:crypto'
import { fail, notFound } from '../errors'
import { asNumber, nowIso, query, type Row } from '../db'
import { VALID_ROLES } from '../../lib/types'
import type { SkillWithOwner, UserRole, UserStatus, Visibility } from '../../lib/types'
import { audit, users, tokens as tokenRepo, type UserRecord } from '../repo/core'
import { skills as skillRepo, stars as starRepo } from '../repo/skills'
import { plugins as pluginRepo } from '../repo/plugins'
import { generateRawToken, hashPassword, hashToken, extractPrefix, MIN_PASSWORD_LENGTH } from '../auth'
import {
  auditLog,
  reindexSkill,
  reindexPlugin,
  resolvePluginRef,
  resolveSkillRef,
  type Viewer,
} from './shared'
import type { SkillRef } from '../../lib/types'
import type { APIToken } from '../../lib/types'

// ─────────────────────────────────────────────────────────────────────────────
// Users
// ─────────────────────────────────────────────────────────────────────────────

export function listUsers(cursor: string, status?: string) {
  // `limit` is fixed at 20 upstream — a supplied value is ignored. Strip the
  // internal credential projection before returning it to an API handler.
  const filter = isUserStatus(status) ? status : undefined
  const page = users.list(cursor, 20, filter)
  return {
    ...page,
    // Carried alongside the page so the console can badge the review queue
    // without a second round trip.
    pendingCount: users.countByStatus('pending'),
    data: page.data.map(({ passwordHash: _passwordHash, ...user }) => user),
  }
}

/** Number of accounts still waiting for a decision — drives the admin badge. */
export function countPendingUsers(): number {
  return users.countByStatus('pending')
}

function isUserStatus(value: string | undefined): value is UserStatus {
  return value === 'pending' || value === 'approved' || value === 'rejected'
}

/**
 * Approve or reject a self-registered account. A decision is recorded rather
 * than the row being deleted: rejected accounts stay visible (and their handle
 * stays taken) so the outcome is auditable and not silently re-registerable.
 */
export function reviewUser(actorId: string, userId: string, action: string, note: string): void {
  if (action !== 'approve' && action !== 'reject') {
    fail('invalid action, must be one of: approve, reject')
  }
  const target = users.getById(userId)
  if (!target) notFound('user not found')
  if (target.id === actorId) fail('you cannot review your own account')

  const reason = action === 'reject' && note.trim() !== '' ? note.trim() : null
  users.review(userId, action === 'approve' ? 'approved' : 'rejected', reason, actorId)
  auditLog({
    actorId,
    action: `review_user_${action}`,
    resourceType: 'user',
    resourceId: userId,
    details: reason ? `handle=${target.handle},note=${reason}` : `handle=${target.handle}`,
  })
}

export function createUser(input: {
  handle: string
  displayName?: string
  email?: string
  role?: string
}): UserRecord {
  if (!input.handle || input.handle.trim() === '') fail('invalid request')
  if (users.getByHandle(input.handle)) fail(`handle '${input.handle}' already exists`)

  const role = (input.role && input.role !== '' ? input.role : 'user') as UserRole
  if (!VALID_ROLES.includes(role)) {
    fail('invalid role, must be one of: user, admin')
  }

  const created = users.create({
    handle: input.handle,
    displayName: input.displayName || null,
    email: input.email || null,
    role,
    // No password is set: the account exists but cannot sign in until one is set.
  })
  auditLog({
    actorId: null,
    action: 'admin_create_user',
    resourceType: 'user',
    resourceId: created.id,
    details: `handle=${created.handle},role=${role}`,
  })
  return created
}

/** Handles offered through public registration: 2–32 chars, URL-safe. */
const HANDLE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{1,31}$/

/**
 * Self-service registration. Unlike `createUser` this sets a password straight
 * away, but the account lands in `pending`: it cannot sign in until an admin
 * approves it (see `reviewUser`).
 */
export function registerUser(input: {
  handle: string
  password: string
  displayName?: string
  email?: string
}): UserRecord {
  const handle = input.handle.trim()
  if (!HANDLE_PATTERN.test(handle)) {
    fail('invalid username: 2-32 characters, letters, digits, dot, dash or underscore')
  }
  if (input.password.length < MIN_PASSWORD_LENGTH) {
    fail(`password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  }
  if (users.getByHandle(handle)) fail(`handle '${handle}' already exists`)

  const created = users.create({
    handle,
    displayName: input.displayName?.trim() || null,
    email: input.email?.trim() || null,
    passwordHash: hashPassword(input.password),
    role: 'user',
    status: 'pending',
  })
  auditLog({
    action: 'register_user',
    resourceType: 'user',
    resourceId: created.id,
    details: `handle=${created.handle}`,
  })
  return created
}

export function setRole(actorId: string, userId: string, role: string): void {
  if (!VALID_ROLES.includes(role as UserRole)) {
    fail('invalid role, must be one of: user, admin')
  }
  const target = users.getById(userId)
  if (!target) notFound('user not found')

  // Guard rails: never strand the system without an admin, and never let an
  // admin demote themselves out of access.
  if (target.role === 'admin' && role !== 'admin') {
    if (userId === actorId) fail('you cannot change your own role')
    if (users.countAdmins() <= 1) fail('the system must keep at least one admin')
  }

  users.setRole(userId, role as UserRole)
  auditLog({
    actorId,
    action: 'set_role',
    resourceType: 'user',
    resourceId: userId,
    details: `role=${role}`,
  })
}

export function banUser(actorId: string, userId: string, reason: string): void {
  const target = users.getById(userId)
  if (!target) notFound('user not found')
  if (userId === actorId) fail('you cannot ban yourself')
  if (target.role === 'admin' && users.countAdmins() <= 1) {
    fail('the system must keep at least one admin')
  }
  users.setBanned(userId, true, reason || null)
  auditLog({
    actorId,
    action: 'ban_user',
    resourceType: 'user',
    resourceId: userId,
    details: reason || null,
  })
}

/** Admin-issued token. Unlike `POST /api/v1/tokens`, this one never expires. */
export function createUserToken(
  actorId: string,
  userId: string,
  label: string,
  scope: string,
): { token: string; metadata: APIToken } {
  const target = users.getById(userId)
  if (!target) notFound('user not found')
  const effectiveScope = scope && scope !== '' ? scope : 'full'
  if (effectiveScope !== 'full' && effectiveScope !== 'read' && effectiveScope !== 'publish') {
    fail('invalid scope, must be one of: full, read, publish')
  }

  const raw = generateRawToken()
  const metadata = tokenRepo.create({
    userId,
    label: label || null,
    prefix: extractPrefix(raw),
    tokenHash: hashToken(raw),
    scope: effectiveScope as APIToken['scope'],
    expiresAt: null,
  })
  auditLog({
    actorId,
    action: 'admin_create_token',
    resourceType: 'api_token',
    resourceId: metadata.id,
    details: `user=${target.handle},scope=${effectiveScope}`,
  })
  return { token: raw, metadata }
}

// ─────────────────────────────────────────────────────────────────────────────
// Skills
// ─────────────────────────────────────────────────────────────────────────────

export function listAllSkills(opts: { visibility: string; cursor: string; limit: number }) {
  const limit = opts.limit <= 0 || opts.limit > 100 ? 20 : opts.limit
  return skillRepo.listForAdmin({ ...opts, limit })
}

export function listFeaturedSkills(viewer: Viewer | null = null) {
  const items = query
    .all<{ skill_id: string }>(
      'SELECT skill_id FROM featured_skills ORDER BY position ASC, updated_at DESC',
    )
    .map(({ skill_id }) => skillRepo.getWithOwnerById(skill_id))
    .filter((skill): skill is SkillWithOwner => skill !== null)
  if (!viewer) return items
  // The card grid renders the same star toggle as the catalogue, so featured
  // rows carry the viewer's flag too.
  const starred = starRepo.starredIdSet(
    viewer.id,
    items.map((skill) => skill.id),
  )
  return items.map((skill) => ({ ...skill, starred: starred.has(skill.id) }))
}

export function replaceFeaturedSkills(actorId: string, skillIds: string[]): void {
  const ids = [...new Set(skillIds)]
  if (ids.length > 12) fail('at most 12 featured skills')
  for (const id of ids) {
    const skill = query.get<Row>('SELECT id FROM skills WHERE id = ? AND soft_deleted_at IS NULL', id)
    if (!skill) fail(`skill '${id}' not found`)
  }
  const now = nowIso()
  query.run('DELETE FROM featured_skills')
  ids.forEach((id, position) => {
    query.run(
      'INSERT INTO featured_skills (skill_id, position, created_at, updated_at) VALUES (?, ?, ?, ?)',
      id, position, now, now,
    )
  })
  auditLog({ actorId, action: 'replace_featured_skills', resourceType: 'featured_skills', resourceId: 'homepage', details: `count=${ids.length}` })
}

export function reviewSkill(ref: SkillRef, action: string, actorId = ''): 'approved' | 'rejected' {
  if (action !== 'approve' && action !== 'reject') {
    fail("action must be 'approve' or 'reject'")
  }
  const skill = resolveSkillRef(ref, { id: '', role: 'admin' }, { includeDeleted: true })
  if (!skill) fail('skill not found')

  const approved = action === 'approve'
  skillRepo.setVisibility(
    skill.id,
    approved ? 'public' : 'private',
    approved ? 'approved' : 'rejected',
  )
  reindexSkill(skillRepo.getWithOwnerById(skill.id)!)
  auditLog({ actorId: actorId || null, action: `review_skill_${action}`, resourceType: 'skill', resourceId: skill.id, details: `ref=${ref.namespace ? `@${ref.namespace}/` : ''}${ref.slug}` })
  return approved ? 'approved' : 'rejected'
}

export function setSkillVisibility(ref: SkillRef, visibility: string, actorId = ''): void {
  if (visibility !== 'public' && visibility !== 'private') {
    fail("visibility must be 'public' or 'private'")
  }
  const skill = resolveSkillRef(ref, { id: '', role: 'admin' }, { includeDeleted: true })
  if (!skill) fail('skill not found')
  // An explicit admin decision also clears the review state.
  skillRepo.setVisibility(skill.id, visibility as Visibility, 'approved')
  reindexSkill(skillRepo.getWithOwnerById(skill.id)!)
  auditLog({ actorId: actorId || null, action: 'set_skill_visibility', resourceType: 'skill', resourceId: skill.id, details: `visibility=${visibility}` })
}

export function listAllPlugins(opts: { limit: number; cursor: string; visibility: string }) {
  const limit = opts.limit <= 0 || opts.limit > 100 ? 20 : opts.limit
  return pluginRepo.listForAdmin({ ...opts, limit })
}

export function reviewPluginByRef(ref: SkillRef, action: string, actorId = ''): 'approved' | 'rejected' {
  if (action !== 'approve' && action !== 'reject') {
    fail("action must be 'approve' or 'reject'")
  }
  const plugin = resolvePluginRef(ref, { id: '', role: 'admin' })
  if (!plugin) fail('plugin not found')
  const approved = action === 'approve'
  pluginRepo.setVisibility(
    plugin.id,
    approved ? 'public' : 'private',
    approved ? 'approved' : 'rejected',
  )
  reindexPlugin(pluginRepo.getById(plugin.id)!)
  auditLog({ actorId: actorId || null, action: `review_plugin_${action}`, resourceType: 'plugin', resourceId: plugin.id, details: `ref=${ref.namespace ? `@${ref.namespace}/` : ''}${ref.slug}` })
  return approved ? 'approved' : 'rejected'
}

export function setPluginVisibility(ref: SkillRef, visibility: string, actorId = ''): void {
  if (visibility !== 'public' && visibility !== 'private') {
    fail("visibility must be 'public' or 'private'")
  }
  const plugin = resolvePluginRef(ref, { id: '', role: 'admin' })
  if (!plugin) notFound('plugin not found')
  pluginRepo.setVisibility(plugin.id, visibility as Visibility, 'approved')
  reindexPlugin(pluginRepo.getById(plugin.id)!)
  auditLog({ actorId: actorId || null, action: 'set_plugin_visibility', resourceType: 'plugin', resourceId: plugin.id, details: `visibility=${visibility}` })
}

export function auditLogs(opts: {
  limit: number
  cursor: string
  action: string
  resourceType: string
  actorId: string
}) {
  return auditRows(opts)
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent auto-provisioning
// ─────────────────────────────────────────────────────────────────────────────

const AGENT_SECRET_ENV = 'SKILLHUB_AGENT_SECRET'

export function agentProvision(handle: string, secret: string): {
  token: string
  handle: string
  userId: string
} {
  const configured = process.env[AGENT_SECRET_ENV] ?? ''
  if (configured === '') notFound('not found')

  if (handle.length < 2 || handle.length > 64) fail('handle must be 2-64 characters')
  if (!timingSafeEquals(configured, secret)) fail('invalid secret')

  let user = users.getByHandle(handle)
  if (user?.isBanned) fail('account is banned')
  if (!user) {
    user = users.create({ handle, role: 'agent' })
  }

  const raw = generateRawToken()
  tokenRepo.create({
    userId: user.id,
    label: 'agent-provision',
    prefix: extractPrefix(raw),
    tokenHash: hashToken(raw),
    scope: 'publish',
    expiresAt: new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString(),
  })

  return { token: raw, handle: user.handle, userId: user.id }
}

function timingSafeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8')
  const bufB = Buffer.from(b, 'utf8')
  // `timingSafeEqual` throws on length mismatch, so short-circuit first.
  if (bufA.length !== bufB.length) return false
  return crypto.timingSafeEqual(bufA, bufB)
}


// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function auditRows(opts: {
  limit: number
  cursor: string
  action: string
  resourceType: string
  actorId: string
}) {
  return audit.list(opts)
}


/** Helper used by the home page. */
export function platformStats(): {
  skills: number
  plugins: number
  users: number
  downloads: number
} {
  return {
    skills: asNumber(
      query.get<Row>('SELECT COUNT(*) AS c FROM skills WHERE soft_deleted_at IS NULL')?.c,
    ),
    plugins: asNumber(
      query.get<Row>('SELECT COUNT(*) AS c FROM plugins WHERE soft_deleted_at IS NULL')?.c,
    ),
    users: asNumber(query.get<Row>('SELECT COUNT(*) AS c FROM users')?.c),
    downloads: asNumber(query.get<Row>('SELECT COALESCE(SUM(downloads),0) AS c FROM skills')?.c),
  }
}

export { nowIso, type SkillWithOwner }
