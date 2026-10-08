/**
 * Administrative operations and the agent-facing publishing API.
 *
 * Admin endpoints all require `role === 'admin'` (enforced by the route table's
 * `auth: 'admin'`). Mutations write an audit row so reviewers can reconstruct
 * who changed what.
 */

import { conflict, fail, notFound } from '../errors'
import { asNumber, nowIso, query, type Row } from '../db'
import { VALID_ROLES } from '../../lib/types'
import type { SkillWithOwner, UserRole, UserStatus, Visibility } from '../../lib/types'
import { audit, users, type UserRecord } from '../repo/core'
import { skills as skillRepo, stars as starRepo } from '../repo/skills'
import { plugins as pluginRepo } from '../repo/plugins'
import type { FileMap } from '../content'
import { hashPassword, MIN_PASSWORD_LENGTH } from '../auth'
import {
  auditLog,
  ensurePersonalNamespace,
  reindexSkill,
  reindexPlugin,
  resolvePluginRef,
  resolveSkillRef,
  type Viewer,
} from './shared'
import { publishVersion, setDetailHtml } from './skills'
import type { SkillRef } from '../../lib/types'

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

  // Email stays optional for admin-created accounts, but when supplied it must
  // be valid and not already taken by another user.
  const email = input.email ? normalizeEmail(input.email) : null
  if (email !== null) {
    if (!EMAIL_PATTERN.test(email)) fail('email is not a valid address')
    if (users.getByEmail(email)) fail(`email '${email}' is already registered`)
  }

  const created = users.create({
    handle: input.handle,
    displayName: input.displayName || null,
    email,
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
 * Email is mandatory on self-service registration and must be unique. The check
 * is deliberately permissive — it rejects obvious non-addresses rather than
 * attempting a full RFC validator — and the value is stored lower-cased so
 * `Foo@bar.com` and `foo@bar.com` resolve to the same account.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

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
  // Email is mandatory for self-service registration and must be unique.
  const email = normalizeEmail(input.email ?? '')
  if (email === '') fail('email is required')
  if (!EMAIL_PATTERN.test(email)) fail('email is not a valid address')
  if (users.getByHandle(handle)) fail(`handle '${handle}' already exists`)
  if (users.getByEmail(email)) fail(`email '${email}' is already registered`)

  const created = users.create({
    handle,
    displayName: input.displayName?.trim() || null,
    email,
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

// Skills
// ─────────────────────────────────────────────────────────────────────────────

export function listAllSkills(opts: {
  visibility: string
  cursor: string
  limit: number
  page: number
}) {
  const limit = opts.limit <= 0 || opts.limit > 100 ? 20 : opts.limit
  return skillRepo.listForAdmin({ ...opts, limit })
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill content management (admin console)
//
// The console edits the catalogue directly: create a skill from a form, change
// its metadata and rich body, take it on or offline, remove it for good. This
// replaces the former review queue, so none of it consults a moderation state —
// an administrative save *is* the decision.
// ─────────────────────────────────────────────────────────────────────────────

/** The fields the console's create/edit form owns. */
export interface SkillFormInput {
  slug: string
  displayName: string
  summary: string
  displayNameEn: string
  summaryEn: string
  category: string
  tags: string[]
  visibility: string
  /**
   * Rich detail markup. An empty string clears the stored body and sends the
   * page back to rendering `SKILL.md`.
   */
  html: string
  htmlEn: string
}

/** Version every console-created skill starts at. */
const FIRST_VERSION = '1.0.0'

/**
 * Stub `SKILL.md` for a skill created from the console.
 *
 * A skill needs at least one version, and both the detail page and the download
 * bundle fall back to that version's `SKILL.md` when no rich body has been
 * saved. The stub is deliberately thin — the console's editor is where the real
 * content goes.
 */
function skillMdStub(input: SkillFormInput): string {
  const name = input.displayName.trim() || input.slug.trim()
  const description = input.summary.trim()
  // Frontmatter values are stored verbatim, but quoting keeps a colon or a `#`
  // inside a name from turning into YAML structure downstream.
  const quote = (value: string) => `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  return [
    '---',
    `name: ${quote(name)}`,
    `description: ${quote(description)}`,
    '---',
    '',
    `# ${name}`,
    '',
    description,
    '',
  ].join('\n')
}

function checkedVisibility(raw: string): Visibility {
  if (raw !== 'public' && raw !== 'private') fail("visibility must be 'public' or 'private'")
  return raw
}

/**
 * Category is a free-form label on the row; `VALID_CATEGORIES` only gates what
 * `/categories` advertises and what `publishVersion` will accept for a new
 * skill. Existing records legitimately carry others — the seeded catalogue uses
 * design, research, documentation and writing — so a console edit must preserve
 * them. Coercing an unknown value to `general` would silently refile every one
 * of those skills the moment an admin pressed Save.
 *
 * Only an empty value falls back, and the length cap plus control-character
 * strip keep the column from becoming a dumping ground.
 */
function checkedCategory(raw: string): string {
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 64)
  return cleaned === '' ? 'general' : cleaned
}

/** Trims an optional text field, collapsing a blank input to "not set". */
function nullable(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Creates a skill from the console form: a real version carrying a stub
 * `SKILL.md`, plus the rich body when one was written.
 *
 * Publishing through `publishVersion` rather than inserting a row keeps every
 * downstream invariant — reserved slugs, namespace quota, fingerprint, search
 * index, audit trail — in one place.
 *
 * The "slug already taken" check is deliberate and lives here rather than in
 * `publishVersion`: that function's `overwrite === false` guard fires from the
 * *not existing* branch too (see `services/skills.ts` step 11), so passing it
 * would reject every create. Rather than change a guard the agent API depends
 * on, the console checks for itself and gets a precise message.
 */
export function createSkillFromForm(actor: UserRecord, input: SkillFormInput): SkillWithOwner {
  const slug = input.slug.trim()
  if (slug === '') fail('slug is required')

  // Mirrors how `publishVersion` resolves the namespace for a form create:
  // no namespace slug and no team token means the author's personal namespace.
  const namespace = ensurePersonalNamespace(actor)
  if (skillRepo.getWithOwnerByNsAndSlug(namespace.id, slug, { includeDeleted: true })) {
    conflict(`skill '${slug}' already exists`)
  }

  const files: FileMap = new Map([['SKILL.md', new TextEncoder().encode(skillMdStub(input))]])
  const { skill } = publishVersion(actor, {
    slug,
    version: FIRST_VERSION,
    changelog: 'Initial version',
    displayName: input.displayName.trim(),
    summary: input.summary.trim(),
    displayNameEn: input.displayNameEn.trim(),
    summaryEn: input.summaryEn.trim(),
    category: checkedCategory(input.category),
    visibility: checkedVisibility(input.visibility),
    tags: input.tags,
    files,
    tokenNamespaceId: null,
  })

  return setDetailHtml(
    actor,
    { namespace: skill.namespaceSlug, slug: skill.slug },
    input.html,
    input.htmlEn,
    null,
  )
}

/**
 * Replaces a skill's editable content. Every field the form owns is written,
 * so emptying an input clears the column (`updateMetadata` would skip it).
 */
export function updateSkillFromForm(
  actor: UserRecord,
  ref: SkillRef,
  input: SkillFormInput,
): SkillWithOwner {
  const skill = resolveSkillRef(ref, { id: actor.id, role: 'admin' })
  if (!skill) notFound('skill not found')

  skillRepo.updateForAdmin(skill.id, {
    displayName: nullable(input.displayName),
    summary: nullable(input.summary),
    displayNameEn: nullable(input.displayNameEn),
    summaryEn: nullable(input.summaryEn),
    category: checkedCategory(input.category),
    tags: input.tags,
    visibility: checkedVisibility(input.visibility),
    // An administrative save is a decision, so the row leaves the review queue.
    moderationStatus: 'approved',
  })
  reindexSkill(skillRepo.getWithOwnerById(skill.id)!)
  auditLog({
    actorId: actor.id,
    action: 'update_skill_content',
    resourceType: 'skill',
    resourceId: skill.id,
    details: `ref=${ref.namespace ? `@${ref.namespace}/` : ''}${ref.slug},visibility=${input.visibility}`,
  })

  // Re-resolves through the caller's own ref, which is already known to be
  // unambiguous — a bare slug lookup here could hit a namesake elsewhere.
  return setDetailHtml(actor, ref, input.html, input.htmlEn, null)
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
