/**
 * SQL for core domains: users, sessions, namespaces (members + invitations),
 * notifications and audit logs.
 *
 * This is the only layer that writes SQL for these tables. Row → model mapping
 * lives here too, because the optional-field rules (`omitempty` upstream) are
 * part of the wire contract and must not leak into callers.
 */

import { asBool, asNumber, asString, nowIso, newId, query, tx, type Row } from '../db'
import type {
  AuditLog,
  ListingStatus,
  Namespace,
  NamespaceInvitation,
  NamespaceMemberWithUser,
  NamespaceRole,
  NamespaceType,
  Notification,
  User,
  UserRole,
  UserStatus,
} from '../../lib/types'

// ─────────────────────────────────────────────────────────────────────────────
// Users
// ─────────────────────────────────────────────────────────────────────────────

/** Internal shape — carries the credential column callers must never serialise. */
export interface UserRecord extends User {
  passwordHash?: string
}

function mapUser(r: Row): UserRecord {
  return {
    id: asString(r.id),
    handle: asString(r.handle),
    // `omitempty` upstream → key absent, not null.
    ...(r.display_name != null ? { displayName: asString(r.display_name) } : {}),
    ...(r.avatar_url != null ? { avatarUrl: asString(r.avatar_url) } : {}),
    ...(r.email != null ? { email: asString(r.email) } : {}),
    ...(r.password_hash != null ? { passwordHash: asString(r.password_hash) } : {}),
    role: asString(r.role) as UserRole,
    // Always present: the column is NOT NULL with an 'approved' default, so
    // accounts that predate registration keep working unchanged.
    status: (asString(r.status) || 'approved') as UserStatus,
    isBanned: asBool(r.is_banned),
    ...(r.ban_reason != null ? { banReason: asString(r.ban_reason) } : {}),
    ...(r.review_note != null ? { reviewNote: asString(r.review_note) } : {}),
    ...(r.reviewed_at != null ? { reviewedAt: asString(r.reviewed_at) } : {}),
    ...(r.reviewed_by != null ? { reviewedBy: asString(r.reviewed_by) } : {}),
    ...(r.country != null ? { country: asString(r.country) } : {}),
    ...(r.organization != null ? { organization: asString(r.organization) } : {}),
    ...(r.job_title != null ? { jobTitle: asString(r.job_title) } : {}),
    ...(r.office_location != null ? { officeLocation: asString(r.office_location) } : {}),
    ...(r.research_needs != null ? { researchNeeds: asString(r.research_needs) } : {}),
    // `markets` is NOT NULL with a '[]' default, so the key is only emitted
    // when the person actually picked something.
    ...marketSlugs(r.markets).length > 0 ? { markets: marketSlugs(r.markets) } : {},
    createdAt: asString(r.created_at),
    updatedAt: asString(r.updated_at),
  }
}

/**
 * `markets` is a JSON array column. A malformed value yields no markets rather
 * than throwing — a bad row must not take down every user listing.
 */
function marketSlugs(raw: unknown): string[] {
  if (raw == null) return []
  try {
    const parsed = JSON.parse(asString(raw))
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

export const users = {
  getById(id: string): UserRecord | null {
    const row = query.get<Row>('SELECT * FROM users WHERE id = ?', id)
    return row ? mapUser(row) : null
  },

  getByHandle(handle: string): UserRecord | null {
    const row = query.get<Row>('SELECT * FROM users WHERE handle = ?', handle)
    return row ? mapUser(row) : null
  },

  /** Case-insensitive lookup so `Foo@Bar.com` and `foo@bar.com` collide. */
  getByEmail(email: string): UserRecord | null {
    const value = email.trim()
    if (value === '') return null
    const row = query.get<Row>('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', value)
    return row ? mapUser(row) : null
  },

  listByIds(ids: string[]): UserRecord[] {
    if (ids.length === 0) return []
    const placeholders = ids.map(() => '?').join(',')
    return query
      .all<Row>(`SELECT * FROM users WHERE id IN (${placeholders})`, ...ids)
      .map(mapUser)
  },

  create(input: {
    handle: string
    role?: UserRole
    displayName?: string | null
    email?: string | null
    avatarUrl?: string | null
    passwordHash?: string | null
    /** Defaults to 'approved' — only self-registration passes 'pending'. */
    status?: UserStatus
    /** Registration profile; omitted by admin-created accounts. */
    country?: string | null
    organization?: string | null
    jobTitle?: string | null
    officeLocation?: string | null
    researchNeeds?: string | null
    markets?: string[]
  }): UserRecord {
    const id = newId()
    const now = nowIso()
    query.run(
      `INSERT INTO users (id, handle, display_name, avatar_url, email, password_hash, role, status, is_banned,
                          country, organization, job_title, office_location, research_needs, markets,
                          created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      input.handle,
      input.displayName ?? null,
      input.avatarUrl ?? null,
      input.email ?? null,
      input.passwordHash ?? null,
      input.role ?? 'user',
      input.status ?? 'approved',
      input.country ?? null,
      input.organization ?? null,
      input.jobTitle ?? null,
      input.officeLocation ?? null,
      input.researchNeeds ?? null,
      JSON.stringify(input.markets ?? []),
      now,
      now,
    )
    return users.getById(id)!
  },

  setPassword(id: string, passwordHash: string): void {
    query.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', passwordHash, nowIso(), id)
  },

  setRole(id: string, role: UserRole): void {
    query.run('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', role, nowIso(), id)
  },

  setBanned(id: string, banned: boolean, reason?: string | null): void {
    query.run(
      'UPDATE users SET is_banned = ?, ban_reason = ?, updated_at = ? WHERE id = ?',
      banned ? 1 : 0,
      reason ?? null,
      nowIso(),
      id,
    )
  },

  /** Records the admin decision on a self-registered account. */
  review(id: string, status: UserStatus, note?: string | null, reviewedBy?: string | null): void {
    const now = nowIso()
    query.run(
      `UPDATE users SET status = ?, review_note = ?, reviewed_at = ?, reviewed_by = ?, updated_at = ?
       WHERE id = ?`,
      status,
      note ?? null,
      now,
      reviewedBy ?? null,
      now,
      id,
    )
  },

  updateProfile(id: string, fields: { displayName?: string; avatarUrl?: string; email?: string }): void {
    const sets: string[] = []
    const params: unknown[] = []
    if (fields.displayName !== undefined) {
      sets.push('display_name = ?')
      params.push(fields.displayName)
    }
    if (fields.avatarUrl !== undefined) {
      sets.push('avatar_url = ?')
      params.push(fields.avatarUrl)
    }
    if (fields.email !== undefined) {
      sets.push('email = ?')
      params.push(fields.email)
    }
    if (sets.length === 0) return
    sets.push('updated_at = ?')
    params.push(nowIso(), id)
    query.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, ...params)
  },

  /** Admin listing: fixed page size, keyset cursor on `id`, optional status filter. */
  list(cursor: string, limit = 20, status?: UserStatus): { data: UserRecord[]; nextCursor: string } {
    const where: string[] = []
    const params: unknown[] = []
    if (status) {
      where.push('status = ?')
      params.push(status)
    }
    if (cursor) {
      where.push('id > ?')
      params.push(cursor)
    }
    const clause = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : ''
    const rows = query.all<Row>(
      `SELECT * FROM users${clause} ORDER BY id LIMIT ?`,
      ...params,
      limit + 1,
    )
    const items = rows.map(mapUser)
    const nextCursor = items.length > limit ? items[limit].id : ''
    return { data: items.slice(0, limit), nextCursor }
  },

  countByStatus(status: UserStatus): number {
    return asNumber(
      query.get<Row>('SELECT COUNT(*) AS c FROM users WHERE status = ?', status)?.c,
    )
  },

  countAdmins(): number {
    return asNumber(query.get<Row>("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'")?.c)
  },

  /**
   * Records a successful sign-in.
   *
   * `updated_at` moves with it: the row genuinely changed, and every other write
   * in this module keeps the two in step.
   */
  incrementLogin(id: string): void {
    query.run('UPDATE users SET login_count = login_count + 1, updated_at = ? WHERE id = ?', nowIso(), id)
  },

  /**
   * Per-account activity for the console's user list — how many bundles each
   * account has downloaded, and how many times it has signed in.
   *
   * One query for a whole page rather than a correlated subquery per column in
   * the row mapper: these figures belong to the list, not to the account, so
   * they never travel with a single user.
   */
  activityCounts(ids: string[]): Map<string, { downloadCount: number; loginCount: number }> {
    const counts = new Map<string, { downloadCount: number; loginCount: number }>()
    if (ids.length === 0) return counts
    const placeholders = ids.map(() => '?').join(',')
    const rows = query.all<Row>(
      `SELECT u.id AS id,
              u.login_count AS login_count,
              (SELECT COUNT(*) FROM user_downloads d WHERE d.user_id = u.id) AS download_count
         FROM users u
        WHERE u.id IN (${placeholders})`,
      ...ids,
    )
    for (const row of rows) {
      counts.set(asString(row.id), {
        downloadCount: asNumber(row.download_count),
        loginCount: asNumber(row.login_count),
      })
    }
    return counts
  },
}

/**
 * Downloads made by a signed-in account.
 *
 * Distinct from `downloadDedupes` in `repo/skills.ts`, which guards the *skill's*
 * popularity counter and identifies a downloader by IP hash. This table answers
 * "who downloaded, and how much", so an anonymous download has no row here.
 */
export const userDownloads = {
  /**
   * Logs a download. Returns `true` only the first time this account takes this
   * version, mirroring the de-duplication rule the skill counter uses.
   */
  record(userId: string, skillId: string, versionId: string): boolean {
    const result = query.run(
      `INSERT OR IGNORE INTO user_downloads (id, user_id, skill_id, version_id, downloaded_at)
       VALUES (?, ?, ?, ?, ?)`,
      newId(),
      userId,
      skillId,
      versionId,
      nowIso(),
    )
    return Number(result.changes ?? 0) > 0
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Sessions
// ─────────────────────────────────────────────────────────────────────────────

/** Internal shape carrying the hash used for constant-time comparison. */
export interface SessionRecord {
  id: string
  userId: string
  tokenHash: string
  expiresAt?: string
}

export const sessions = {
  create(input: { userId: string; prefix: string; tokenHash: string; expiresAt?: string | null }): void {
    query.run(
      `INSERT INTO sessions (id, user_id, prefix, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      newId(),
      input.userId,
      input.prefix,
      input.tokenHash,
      input.expiresAt ?? null,
      nowIso(),
    )
  },

  /**
   * The only accessor that exposes `tokenHash` — used exclusively to verify an
   * inbound session cookie. May return several candidates sharing a prefix.
   */
  getByPrefix(prefix: string): SessionRecord[] {
    return query
      .all<Row>('SELECT id, user_id, token_hash, expires_at FROM sessions WHERE prefix = ?', prefix)
      .map((row) => ({
        id: asString(row.id),
        userId: asString(row.user_id),
        tokenHash: asString(row.token_hash),
        ...(row.expires_at != null ? { expiresAt: asString(row.expires_at) } : {}),
      }))
  },

  touchLastUsed(id: string): void {
    query.run('UPDATE sessions SET last_used_at = ? WHERE id = ?', nowIso(), id)
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Namespaces
// ─────────────────────────────────────────────────────────────────────────────

function mapNamespace(r: Row): Namespace {
  return {
    id: asString(r.id),
    slug: asString(r.slug),
    ...(r.display_name != null ? { displayName: asString(r.display_name) } : {}),
    ...(r.description != null ? { description: asString(r.description) } : {}),
    ownerId: asString(r.owner_id),
    type: asString(r.type) as NamespaceType,
    status: asString(r.status) as 'active' | 'suspended',
    defaultListing: asString(r.default_listing) as ListingStatus,
    maxSkills: asNumber(r.max_skills),
    createdAt: asString(r.created_at),
    updatedAt: asString(r.updated_at),
  }
}

export const namespaces = {
  create(input: {
    slug: string
    displayName?: string | null
    description?: string | null
    ownerId: string
    type: NamespaceType
    defaultListing?: ListingStatus
    maxSkills?: number
  }): Namespace {
    const id = newId()
    const now = nowIso()
    query.run(
      `INSERT INTO namespaces (id, slug, display_name, description, owner_id, type, status, default_listing, max_skills, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
      id,
      input.slug,
      input.displayName ?? null,
      input.description ?? null,
      input.ownerId,
      input.type,
      input.defaultListing ?? 'unlisted',
      input.maxSkills && input.maxSkills > 0 ? input.maxSkills : 0,
      now,
      now,
    )
    return namespaces.getById(id)!
  },

  getById(id: string): Namespace | null {
    const row = query.get<Row>('SELECT * FROM namespaces WHERE id = ?', id)
    return row ? mapNamespace(row) : null
  },

  getBySlug(slug: string): Namespace | null {
    const row = query.get<Row>('SELECT * FROM namespaces WHERE slug = ?', slug)
    return row ? mapNamespace(row) : null
  },

  getPersonalByOwner(ownerId: string): Namespace | null {
    const row = query.get<Row>(
      "SELECT * FROM namespaces WHERE owner_id = ? AND type = 'personal' LIMIT 1",
      ownerId,
    )
    return row ? mapNamespace(row) : null
  },

  /** Namespaces the user is a member of, oldest first. */
  listForUser(userId: string): Namespace[] {
    return query
      .all<Row>(
        `SELECT n.* FROM namespaces n
         JOIN namespace_members m ON m.namespace_id = n.id
         WHERE m.user_id = ?
         ORDER BY n.created_at ASC`,
        userId,
      )
      .map(mapNamespace)
  },

  update(
    id: string,
    fields: {
      displayName?: string | null
      description?: string | null
      defaultListing?: ListingStatus
      maxSkills?: number
    },
  ): Namespace {
    const sets: string[] = []
    const params: unknown[] = []
    if (fields.displayName !== undefined) {
      sets.push('display_name = ?')
      params.push(fields.displayName)
    }
    if (fields.description !== undefined) {
      sets.push('description = ?')
      params.push(fields.description)
    }
    if (fields.defaultListing !== undefined) {
      sets.push('default_listing = ?')
      params.push(fields.defaultListing)
    }
    if (fields.maxSkills !== undefined) {
      sets.push('max_skills = ?')
      params.push(fields.maxSkills)
    }
    if (sets.length > 0) {
      sets.push('updated_at = ?')
      params.push(nowIso(), id)
      query.run(`UPDATE namespaces SET ${sets.join(', ')} WHERE id = ?`, ...params)
    }
    return namespaces.getById(id)!
  },

  setOwner(id: string, ownerId: string): void {
    query.run('UPDATE namespaces SET owner_id = ?, updated_at = ? WHERE id = ?', ownerId, nowIso(), id)
  },

  delete(id: string): void {
    // Child rows (members, skills, invitations, sessions) cascade via FK.
    query.run('DELETE FROM namespaces WHERE id = ?', id)
  },

  countSkills(namespaceId: string): number {
    return asNumber(
      query.get<Row>(
        'SELECT COUNT(*) AS c FROM skills WHERE namespace_id = ? AND soft_deleted_at IS NULL',
        namespaceId,
      )?.c,
    )
  },
}

// ── members ──────────────────────────────────────────────────────────────────

export const members = {
  add(namespaceId: string, userId: string, role: NamespaceRole): void {
    query.run(
      `INSERT INTO namespace_members (id, namespace_id, user_id, role, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (namespace_id, user_id) DO UPDATE SET role = excluded.role`,
      newId(),
      namespaceId,
      userId,
      role,
      nowIso(),
    )
  },

  get(namespaceId: string, userId: string): { role: NamespaceRole } | null {
    const row = query.get<Row>(
      'SELECT role FROM namespace_members WHERE namespace_id = ? AND user_id = ?',
      namespaceId,
      userId,
    )
    return row ? { role: asString(row.role) as NamespaceRole } : null
  },

  /**
   * `CanPublish` — any membership row whose role is not `reader`.
   * System admins bypass this at the service layer.
   */
  canPublish(namespaceId: string, userId: string): boolean {
    const m = members.get(namespaceId, userId)
    return m !== null && m.role !== 'reader'
  },

  /** `CanManageTokens` — owner or admin of the namespace. */
  canManage(namespaceId: string, userId: string): boolean {
    const m = members.get(namespaceId, userId)
    return m !== null && (m.role === 'owner' || m.role === 'admin')
  },

  isMember(namespaceId: string, userId: string): boolean {
    return members.get(namespaceId, userId) !== null
  },

  list(namespaceId: string): NamespaceMemberWithUser[] {
    return query
      .all<Row>(
        `SELECT m.*, u.handle AS handle, u.display_name AS display_name
         FROM namespace_members m
         JOIN users u ON u.id = m.user_id
         WHERE m.namespace_id = ?
         ORDER BY m.created_at ASC`,
        namespaceId,
      )
      .map((r) => ({
        id: asString(r.id),
        namespaceId: asString(r.namespace_id),
        userId: asString(r.user_id),
        role: asString(r.role) as NamespaceRole,
        createdAt: asString(r.created_at),
        handle: asString(r.handle),
        ...(r.display_name != null ? { displayName: asString(r.display_name) } : {}),
      }))
  },

  /** Member user ids — used for notification fan-out. */
  memberUserIds(namespaceId: string): string[] {
    return query
      .all<Row>('SELECT user_id FROM namespace_members WHERE namespace_id = ?', namespaceId)
      .map((r) => asString(r.user_id))
  },

  remove(namespaceId: string, userId: string): void {
    query.run('DELETE FROM namespace_members WHERE namespace_id = ? AND user_id = ?', namespaceId, userId)
  },

  removeByHandle(namespaceId: string, handle: string): void {
    query.run(
      `DELETE FROM namespace_members
       WHERE namespace_id = ? AND user_id = (SELECT id FROM users WHERE handle = ?)`,
      namespaceId,
      handle,
    )
  },

  /** Used to enforce "at least one owner remains". */
  countByRole(namespaceId: string, role: NamespaceRole): number {
    return asNumber(
      query.get<Row>(
        'SELECT COUNT(*) AS c FROM namespace_members WHERE namespace_id = ? AND role = ?',
        namespaceId,
        role,
      )?.c,
    )
  },
}

// ── invitations ──────────────────────────────────────────────────────────────

function mapInvitation(r: Row): NamespaceInvitation {
  return {
    id: asString(r.id),
    namespaceId: asString(r.namespace_id),
    inviterId: asString(r.inviter_id),
    inviteeId: asString(r.invitee_id),
    inviteeHandle: asString(r.invitee_handle),
    role: asString(r.role) as NamespaceRole,
    status: asString(r.status) as NamespaceInvitation['status'],
    ...(r.message != null ? { message: asString(r.message) } : {}),
    createdAt: asString(r.created_at),
    expiresAt: asString(r.expires_at),
    ...(r.responded_at != null ? { respondedAt: asString(r.responded_at) } : {}),
  }
}

export const invitations = {
  create(input: {
    namespaceId: string
    inviterId: string
    inviteeId: string
    inviteeHandle: string
    role: NamespaceRole
    message?: string | null
    ttlSeconds: number
  }): NamespaceInvitation {
    const id = newId()
    const now = nowIso()
    const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000).toISOString()
    query.run(
      `INSERT INTO namespace_invitations
        (id, namespace_id, inviter_id, invitee_id, invitee_handle, role, status, message, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      id,
      input.namespaceId,
      input.inviterId,
      input.inviteeId,
      input.inviteeHandle,
      input.role,
      input.message ?? null,
      now,
      expiresAt,
    )
    return invitations.getById(id)!
  },

  getById(id: string): NamespaceInvitation | null {
    const row = query.get<Row>('SELECT * FROM namespace_invitations WHERE id = ?', id)
    return row ? mapInvitation(row) : null
  },

  /** Pending invitations addressed to a user. */
  listForInvitee(inviteeId: string): NamespaceInvitation[] {
    return query
      .all<Row>(
        `SELECT * FROM namespace_invitations
         WHERE invitee_id = ? AND status = 'pending'
         ORDER BY created_at DESC`,
        inviteeId,
      )
      .map(mapInvitation)
  },

  listForNamespace(namespaceId: string, status: string): NamespaceInvitation[] {
    return status
      ? query
          .all<Row>(
            'SELECT * FROM namespace_invitations WHERE namespace_id = ? AND status = ? ORDER BY created_at DESC',
            namespaceId,
            status,
          )
          .map(mapInvitation)
      : query
          .all<Row>(
            'SELECT * FROM namespace_invitations WHERE namespace_id = ? ORDER BY created_at DESC',
            namespaceId,
          )
          .map(mapInvitation)
  },

  findPending(namespaceId: string, inviteeId: string): NamespaceInvitation | null {
    const row = query.get<Row>(
      `SELECT * FROM namespace_invitations
       WHERE namespace_id = ? AND invitee_id = ? AND status = 'pending' LIMIT 1`,
      namespaceId,
      inviteeId,
    )
    return row ? mapInvitation(row) : null
  },

  respond(id: string, status: 'accepted' | 'declined' | 'revoked' | 'expired'): void {
    query.run(
      'UPDATE namespace_invitations SET status = ?, responded_at = ? WHERE id = ?',
      status,
      nowIso(),
      id,
    )
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Notifications
// ─────────────────────────────────────────────────────────────────────────────

function mapNotification(r: Row): Notification {
  return {
    id: asString(r.id),
    userId: asString(r.user_id),
    category: asString(r.category),
    title: asString(r.title),
    ...(r.body != null ? { body: asString(r.body) } : {}),
    ...(r.link != null ? { link: asString(r.link) } : {}),
    isRead: asBool(r.is_read),
    createdAt: asString(r.created_at),
  }
}

export const notifications = {
  /** Bulk insert for fan-out; one transaction for the whole batch. */
  createMany(
    rows: Array<{ userId: string; category: string; title: string; body?: string; link?: string }>,
  ): void {
    if (rows.length === 0) return
    const stmt = query.stmt(
      `INSERT INTO notifications (id, user_id, category, title, body, link, is_read, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    )
    const now = nowIso()
    tx(() => {
      for (const r of rows) {
        stmt.run(newId(), r.userId, r.category, r.title, r.body ?? null, r.link ?? null, now)
      }
    })
  },

  list(
    userId: string,
    limit: number,
    cursor: string,
  ): { data: Notification[]; nextCursor: string } {
    const effective = limit <= 0 || limit > 100 ? 20 : limit
    const rows = cursor
      ? query.all<Row>(
          `SELECT * FROM notifications WHERE user_id = ? AND id < ?
           ORDER BY created_at DESC, id DESC LIMIT ?`,
          userId,
          cursor,
          effective + 1,
        )
      : query.all<Row>(
          `SELECT * FROM notifications WHERE user_id = ?
           ORDER BY created_at DESC, id DESC LIMIT ?`,
          userId,
          effective + 1,
        )
    const items = rows.map(mapNotification)
    const nextCursor = items.length > effective ? items[effective].id : ''
    return { data: items.slice(0, effective), nextCursor }
  },

  unreadCount(userId: string): number {
    return asNumber(
      query.get<Row>(
        'SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0',
        userId,
      )?.c,
    )
  },

  markRead(userId: string, id: string): void {
    // Silent no-op for unknown/foreign ids, matching upstream.
    query.run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', id, userId)
  },

  markAllRead(userId: string): void {
    query.run('UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0', userId)
  },
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit log
// ─────────────────────────────────────────────────────────────────────────────

function mapAudit(r: Row): AuditLog {
  return {
    id: asString(r.id),
    ...(r.actor_id != null ? { actorId: asString(r.actor_id) } : {}),
    action: asString(r.action),
    resourceType: asString(r.resource_type),
    ...(r.resource_id != null ? { resourceId: asString(r.resource_id) } : {}),
    ...(r.details != null ? { details: asString(r.details) } : {}),
    ...(r.ip_address != null ? { ipAddress: asString(r.ip_address) } : {}),
    createdAt: asString(r.created_at),
  }
}

export const audit = {
  insert(input: {
    actorId?: string | null
    action: string
    resourceType: string
    resourceId?: string | null
    details?: string | null
    ipAddress?: string | null
  }): void {
    query.run(
      `INSERT INTO audit_logs (id, actor_id, action, resource_type, resource_id, details, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      newId(),
      input.actorId ?? null,
      input.action,
      input.resourceType,
      input.resourceId ?? null,
      input.details ?? null,
      input.ipAddress ?? null,
      nowIso(),
    )
  },

  list(
    opts: { limit: number; cursor: string; action: string; resourceType: string; actorId: string },
  ): { data: AuditLog[]; nextCursor: string } {
    const effective = opts.limit <= 0 || opts.limit > 200 ? 50 : opts.limit
    const where: string[] = []
    const params: unknown[] = []
    // Note the snake_case query params upstream uses for these two filters.
    if (opts.action) {
      where.push('action = ?')
      params.push(opts.action)
    }
    if (opts.resourceType) {
      where.push('resource_type = ?')
      params.push(opts.resourceType)
    }
    if (opts.actorId) {
      where.push('actor_id = ?')
      params.push(opts.actorId)
    }
    if (opts.cursor) {
      where.push('id < ?')
      params.push(opts.cursor)
    }
    const clause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''
    const rows = query.all<Row>(
      `SELECT * FROM audit_logs ${clause} ORDER BY created_at DESC, id DESC LIMIT ?`,
      ...params,
      effective + 1,
    )
    const items = rows.map(mapAudit)
    const nextCursor = items.length > effective ? items[effective].id : ''
    return { data: items.slice(0, effective), nextCursor }
  },
}
