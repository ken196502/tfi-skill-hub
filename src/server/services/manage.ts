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
import type { SkillWithOwner, UserRole, UserStatus, ListingStatus } from '../../lib/types'
import { audit, users, type UserRecord } from '../repo/core'
import { skills as skillRepo, stars as starRepo, versions as versionRepo, versionFiles } from '../repo/skills'
import type { FileMap } from '../content'
import { nextPatch } from '../semver'
import { hashPassword, MIN_PASSWORD_LENGTH } from '../auth'
import {
  auditLog,
  ensurePersonalNamespace,
  reindexSkill,
  resolveSkillRef,
  type Viewer,
} from './shared'
import { publishVersion, setDetailHtml } from './skills'
import type { SkillRef } from '../../lib/types'
import {
  COUNTRIES,
  EMAIL_CODE_COOLDOWN_SECONDS,
  PROFILE_FIELD_MAX,
  RESEARCH_NEEDS_MAX,
  isEmailVerificationCode,
  knownMarketSlugs,
} from '../../lib/registration'

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
 *
 * **`approved` is a terminal state.** Once an account has been let in, this
 * endpoint will not take it back — the person is already using the platform, and
 * withdrawing access is a different decision with its own reason field and its
 * own audit action (`banUser`). Letting a review call silently revoke a live
 * account would also mean the rejection reason shown to the user ("your
 * registration was not approved") was untrue. Revoking access is what
 * `banUser` is for.
 *
 * The one transition still allowed is `rejected → approved`: the applicant
 * corrected their details and is being let in after a second look. Repeating a
 * decision that is already recorded is a no-op rather than an error, so a
 * double-clicked button or a retried request cannot fail or re-audit.
 */
export function reviewUser(actorId: string, userId: string, action: string, note: string): void {
  if (action !== 'approve' && action !== 'reject') {
    fail('invalid action, must be one of: approve, reject')
  }
  const target = users.getById(userId)
  if (!target) notFound('user not found')
  if (target.id === actorId) fail('you cannot review your own account')

  const next: UserStatus = action === 'approve' ? 'approved' : 'rejected'
  if (target.status === 'approved' && next === 'rejected') {
    fail('this account has already been approved; use ban to revoke access')
  }
  // Already in the requested state — nothing to change and nothing to record.
  if (target.status === next) return

  const reason = next === 'rejected' && note.trim() !== '' ? note.trim() : null
  users.review(userId, next, reason, actorId)
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

/** When a code was last requested per address, so the cooldown survives a reload. */
const codeRequests = new Map<string, number>()

/**
 * Handle the "send me a verification code" action on the sign-up form.
 *
 * `cooldownSeconds` is what the client counts down, and it is never 0 on this
 * path: a successful send reports the full window it just opened, and a send
 * suppressed by an existing wait reports what is left of it. So "0" means only
 * one thing to a caller — the address is free — which keeps the client from
 * having to know how the window came to be in order to decide whether to start
 * a countdown.
 *
 * The window is keyed on the address and enforced here rather than in the
 * browser: a countdown the client owns is one a refresh removes, and once a mail
 * provider is connected this endpoint is what actually costs money.
 *
 * No message is sent. The code is fixed, so there is nothing to deliver — the
 * action exists so the form's confirm step is real. Connecting a provider means
 * sending inside this function and storing the issued code; the cooldown, the
 * validation and the response shape stay as they are.
 */
export function requestEmailCode(rawEmail: string): { cooldownSeconds: number; sent: boolean } {
  const email = checkedCodeEmail(rawEmail)
  const remaining = emailCodeCooldownRemaining(email)
  if (remaining > 0) return { cooldownSeconds: remaining, sent: false }
  // Only a successful send opens the window. Looking at the clock never does —
  // see `emailCodeStatus`, which is what the form calls while you are typing.
  codeRequests.set(email, nowSeconds())
  return { cooldownSeconds: EMAIL_CODE_COOLDOWN_SECONDS, sent: true }
}

/**
 * Read the wait for an address without starting one.
 *
 * Separate from `requestEmailCode` because asking "how long is left?" and asking
 * for a code are different acts: if a lookup opened the window, merely typing an
 * address would consume the one send the user had available. The form uses this
 * on mount and while the address changes, and `requestEmailCode` only when the
 * button is actually pressed.
 */
export function emailCodeStatus(rawEmail: string): { cooldownSeconds: number } {
  return { cooldownSeconds: emailCodeCooldownRemaining(checkedCodeEmail(rawEmail)) }
}

function checkedCodeEmail(rawEmail: string): string {
  const email = normalizeEmail(rawEmail)
  if (email === '') fail('email is required')
  if (!EMAIL_PATTERN.test(email)) fail('email is not a valid address')
  return email
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

/**
 * Seconds until another code may be requested for this address; 0 when free.
 *
 * Entries are only pruned when the map is far larger than any real traffic —
 * one entry per address a code was sent to, which is small next to the request
 * rate it is protecting.
 */
export function emailCodeCooldownRemaining(rawEmail: string): number {
  const email = normalizeEmail(rawEmail)
  if (email === '') return 0
  if (codeRequests.size > 5000) {
    const cutoff = nowSeconds() - EMAIL_CODE_COOLDOWN_SECONDS
    for (const [key, at] of codeRequests) if (at <= cutoff) codeRequests.delete(key)
  }
  const last = codeRequests.get(email) ?? 0
  const elapsed = Math.floor(Date.now() / 1000) - last
  return elapsed < EMAIL_CODE_COOLDOWN_SECONDS ? EMAIL_CODE_COOLDOWN_SECONDS - elapsed : 0
}

/**
 * Self-service registration. Unlike `createUser` this sets a password straight
 * away, but the account lands in `pending`: it cannot sign in until an admin
 * approves it (see `reviewUser`).
 *
 * Registration also collects who the person is and what they intend to research
 * — organisation, role, country, office, focus areas and markets — so a reviewer
 * decides on the applicant's actual context rather than a handle and an email.
 * Everything except the office location is mandatory; a blank answer there is
 * legitimate (many people work from the same city as their employer).
 */
export function registerUser(input: {
  handle: string
  password: string
  emailCode?: string
  displayName?: string
  email?: string
  country?: string
  organization?: string
  jobTitle?: string
  officeLocation?: string
  researchNeeds?: string
  markets?: string[]
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

  // Confirms the address is reachable before the account is created. Checked
  // after the address itself is known to be well-formed, so a typo produces
  // "not a valid address" rather than a confusing code error.
  if (!isEmailVerificationCode(input.emailCode ?? '')) {
    fail('email verification code is incorrect')
  }

  // 姓名 — the person's real name, reused as the account's display name.
  const displayName = (input.displayName ?? '').trim()
  if (displayName === '') fail('name is required')

  const country = (input.country ?? '').trim()
  if (country === '') fail('country or region is required')
  if (!VALID_COUNTRY_CODES.has(country)) fail('country or region is not a supported option')

  const organization = requiredProfileField(input.organization, 'organization', PROFILE_FIELD_MAX)
  const jobTitle = requiredProfileField(input.jobTitle, 'job title', PROFILE_FIELD_MAX)
  const researchNeeds = requiredProfileField(input.researchNeeds, 'research needs', RESEARCH_NEEDS_MAX)

  // Office location is the one optional field.
  const officeLocation = clampField(input.officeLocation, PROFILE_FIELD_MAX)

  // Markets are a fixed catalogue; anything unrecognised is discarded so the
  // column only ever holds slugs the UI and the filters agree on.
  const submittedMarkets = Array.isArray(input.markets) ? input.markets : []
  const markets = [...new Set(submittedMarkets.filter((slug) => VALID_MARKET_SLUGS.has(slug)))]
  if (markets.length === 0) fail('at least one market of interest is required')

  if (users.getByHandle(handle)) fail(`handle '${handle}' already exists`)
  if (users.getByEmail(email)) fail(`email '${email}' is already registered`)

  const created = users.create({
    handle,
    displayName,
    email,
    passwordHash: hashPassword(input.password),
    role: 'user',
    status: 'pending',
    country,
    organization,
    jobTitle,
    officeLocation,
    researchNeeds,
    markets,
  })
  auditLog({
    action: 'register_user',
    resourceType: 'user',
    resourceId: created.id,
    details: `handle=${created.handle},country=${country},organization=${organization},markets=${markets.join('|')}`,
  })
  return created
}

/** Collapses a blank input to the "field is missing" error. */
function requiredProfileField(value: string | undefined, label: string, max: number): string {
  const cleaned = clampField(value, max)
  if (cleaned === null) fail(`${label} is required`)
  return cleaned
}

/**
 * Trims, replaces control characters with a space and caps the length. Returns
 * null for a blank value so callers store "not provided" as NULL rather than an
 * empty string. Line breaks are normalised first so a pasted paragraph does not
 * collapse into a single run-on line.
 */
function clampField(value: string | undefined, max: number): string | null {
  const cleaned = (value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max)
  return cleaned === '' ? null : cleaned
}

const VALID_COUNTRY_CODES = new Set(COUNTRIES.map((item) => item.code))
const VALID_MARKET_SLUGS = new Set(knownMarketSlugs())

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
  listing: string
  cursor: string
  limit: number
  page: number
}) {
  const limit = opts.limit <= 0 || opts.limit > 100 ? 20 : opts.limit
  return skillRepo.listForAdmin({ ...opts, limit })
}

/**
 * Categories already present in the catalogue, for the console's category
 * field to suggest. Unlike `/api/v1/categories` this reflects what the records
 * actually use, which is what an editor needs to see when picking one.
 *
 * An administrator sees every category, offline ones included — that is the
 * point of the console being where you file a skill before it goes live.
 */
export function listCategoriesInUse(): string[] {
  return skillRepo.listCategoriesInUse({ id: '', role: 'admin' })
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill content management (admin console)
//
// Three operations, and nothing else: publish a skill, edit it, and take it on
// or off the shelf. There is no review queue behind them and no separate
// public/private setting to configure.
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
  listing: string
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

function checkedListing(raw: string): ListingStatus {
  if (raw !== 'listed' && raw !== 'unlisted') fail("listing must be 'listed' or 'unlisted'")
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
 * The upload root must carry a `SKILL.md`, same rule the publish endpoint uses:
 * it is the file the skill page and the download bundle fall back to.
 */
function assertSkillMd(files: FileMap): void {
  if (!files.has('SKILL.md')) fail('SKILL.md is required')
}

/**
 * The next patch version's file set: everything the latest version already
 * carries, with the uploaded paths replacing what was there.
 *
 * Mirrors `updateFile` in `services/skills.ts` — file changes are never written
 * in place, they become a new patch version, which is what the version history
 * and the download bundle expect.
 */
function mergedVersionFiles(skill: SkillWithOwner, uploads: FileMap): FileMap {
  const merged: FileMap = new Map()
  const latestId = skill.latestVersionId
  if (latestId) {
    for (const file of versionFiles.listAll(latestId)) merged.set(file.path, file.content)
  }
  for (const [path, content] of uploads) merged.set(path, content)
  return merged
}

function currentVersionOf(skill: SkillWithOwner): string {
  if (!skill.latestVersionId) return '0.0.0'
  return versionRepo.getById(skill.latestVersionId)?.version ?? '0.0.0'
}

/**
 * Creates a skill from the console form: a real version carrying the uploaded
 * files, or — when nothing was uploaded — a stub `SKILL.md`, plus the rich body.
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
export function createSkillFromForm(
  actor: UserRecord,
  input: SkillFormInput,
  uploads?: FileMap,
): SkillWithOwner {
  const slug = input.slug.trim()
  if (slug === '') fail('slug is required')

  // Mirrors how `publishVersion` resolves the namespace for a form create:
  // no namespace slug and no team token means the author's personal namespace.
  const namespace = ensurePersonalNamespace(actor)
  if (skillRepo.getWithOwnerByNsAndSlug(namespace.id, slug, { includeDeleted: true })) {
    conflict(`skill '${slug}' already exists`)
  }

  // Uploaded files win: a package brought its own SKILL.md, and replacing the
  // stub with it is the whole point of uploading. With no upload the skill is
  // still created — metadata-only is a legitimate first step.
  const uploaded = uploads && uploads.size > 0
  if (uploaded) assertSkillMd(uploads!)

  const files: FileMap = uploaded
    ? uploads!
    : new Map([['SKILL.md', new TextEncoder().encode(skillMdStub(input))]])

  const { skill } = publishVersion(actor, {
    slug,
    version: FIRST_VERSION,
    changelog: 'Initial version',
    displayName: input.displayName.trim(),
    summary: input.summary.trim(),
    displayNameEn: input.displayNameEn.trim(),
    summaryEn: input.summaryEn.trim(),
    category: checkedCategory(input.category),
    listing: checkedListing(input.listing),
    tags: input.tags,
    files,
    tokenNamespaceId: null,
  })

  /*
   * `publishVersion` gates new skills against the fixed `/categories` taxonomy
   * and files anything outside it as `general` — correct for the publishing API,
   * wrong here, because the console's category field takes free text. Writing the
   * category again through the repo restores what the operator typed; nothing
   * else needs it, since the other fields pass through unfiltered.
   */
  const category = checkedCategory(input.category)
  if (category !== skill.category) {
    skillRepo.updateMetadata(skill.id, { category })
  }

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
 *
 * Uploaded files, when present, ride along as a new patch version — see
 * `mergedVersionFiles`. The metadata write happens afterwards and stays
 * authoritative, because `publishVersion` only overwrites non-empty fields.
 */
export function updateSkillFromForm(
  actor: UserRecord,
  ref: SkillRef,
  input: SkillFormInput,
  uploads?: FileMap,
): SkillWithOwner {
  const skill = resolveSkillRef(ref, { id: actor.id, role: 'admin' })
  if (!skill) notFound('skill not found')

  if (uploads && uploads.size > 0) {
    const current = currentVersionOf(skill)
    publishVersion(actor, {
      slug: skill.slug,
      version: nextPatch(current),
      changelog: 'Files updated from the console',
      displayName: input.displayName.trim(),
      summary: input.summary.trim(),
      displayNameEn: input.displayNameEn.trim(),
      summaryEn: input.summaryEn.trim(),
      category: checkedCategory(input.category),
      listing: checkedListing(input.listing),
      tags: input.tags,
      files: mergedVersionFiles(skill, uploads),
      tokenNamespaceId: null,
      namespaceSlug: skill.namespaceSlug,
      // The skill exists and this is a deliberate replacement of its files.
      overwrite: true,
    })
  }

  skillRepo.updateForAdmin(skill.id, {
    displayName: nullable(input.displayName),
    summary: nullable(input.summary),
    displayNameEn: nullable(input.displayNameEn),
    summaryEn: nullable(input.summaryEn),
    category: checkedCategory(input.category),
    tags: input.tags,
    listing: checkedListing(input.listing),
  })
  reindexSkill(skillRepo.getWithOwnerById(skill.id)!)
  auditLog({
    actorId: actor.id,
    action: 'update_skill_content',
    resourceType: 'skill',
    resourceId: skill.id,
    details: `ref=${ref.namespace ? `@${ref.namespace}/` : ''}${ref.slug},listing=${input.listing}${uploads && uploads.size > 0 ? `,files=${uploads.size}` : ''}`,
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

/**
 * Takes a skill on or off the shelf. The only visibility-shaped write a skill
 * has — the same edit an operator would make by hand in the catalogue.
 */
export function setSkillListing(ref: SkillRef, listing: string, actorId = ''): void {
  if (listing !== 'listed' && listing !== 'unlisted') {
    fail("listing must be 'listed' or 'unlisted'")
  }
  const skill = resolveSkillRef(ref, { id: '', role: 'admin' }, { includeDeleted: true })
  if (!skill) fail('skill not found')
  skillRepo.setListing(skill.id, listing)
  reindexSkill(skillRepo.getWithOwnerById(skill.id)!)
  auditLog({
    actorId: actorId || null,
    action: listing === 'listed' ? 'list_skill' : 'unlist_skill',
    resourceType: 'skill',
    resourceId: skill.id,
    details: `ref=${ref.namespace ? `@${ref.namespace}/` : ''}${ref.slug}`,
  })
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
  users: number
  downloads: number
} {
  return {
    skills: asNumber(
      query.get<Row>('SELECT COUNT(*) AS c FROM skills WHERE soft_deleted_at IS NULL')?.c,
    ),
    users: asNumber(query.get<Row>('SELECT COUNT(*) AS c FROM users')?.c),
    downloads: asNumber(query.get<Row>('SELECT COALESCE(SUM(downloads),0) AS c FROM skills')?.c),
  }
}

export { nowIso, type SkillWithOwner }
