/**
 * Namespace service: namespaces, membership, invitations and team tokens.
 *
 * Authorization predicates mirror `NamespaceService`:
 *   * `IsMemberOrAdmin` — system admin, or any membership row.
 *   * `CanPublish`      — membership with a role other than `reader`.
 *   * `CanManageTokens` — system admin, or namespace `owner`/`admin`.
 *
 * Owner-only failures carry a literal `forbidden: ` prefix so the HTTP layer
 * reports 403 with the same text the original produced.
 */

import { forbidden, notFound, fail } from '../errors'
import { nowIso } from '../db'
import type {
  APIToken,
  Namespace,
  NamespaceRole,
  NamespaceType,
  TokenScope,
  Visibility,
} from '../../lib/types'
import {
  invitations,
  members,
  namespaces,
  tokens as tokenRepo,
  users,
  type UserRecord,
} from '../repo/core'
import { generateRawToken, hashToken, extractPrefix, TEAM_TOKEN_LIMIT, TEAM_TOKEN_MAX_SECONDS } from '../auth'
import { auditLog } from './shared'

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/

/** Default invitation lifetime — long enough not to be annoying, short enough to expire. */
const INVITATION_TTL_SECONDS = 7 * 24 * 3600

export interface ViewerInfo {
  id: string
  role: string
}

function isSystemAdmin(viewer: ViewerInfo): boolean {
  return viewer.role === 'admin'
}

export function isMemberOrAdmin(namespaceId: string, viewer: ViewerInfo): boolean {
  if (isSystemAdmin(viewer)) return true
  return members.isMember(namespaceId, viewer.id)
}

export function canManageTokens(namespaceId: string, viewer: ViewerInfo): boolean {
  if (isSystemAdmin(viewer)) return true
  return members.canManage(namespaceId, viewer.id)
}

// ─────────────────────────────────────────────────────────────────────────────
// Namespaces
// ─────────────────────────────────────────────────────────────────────────────

export function createNamespace(
  user: UserRecord,
  input: {
    slug: string
    displayName?: string
    description?: string
    type?: string
    defaultVisibility?: string
    maxSkills?: number
  },
): Namespace {
  if (!input.slug || !SLUG_RE.test(input.slug)) {
    fail('invalid namespace slug: must be 3-64 lowercase alphanumeric characters or hyphens')
  }
  if (namespaces.getBySlug(input.slug)) {
    fail(`namespace slug '${input.slug}' already taken`)
  }

  const type = input.type && input.type !== '' ? input.type : 'team'
  if (type !== 'personal' && type !== 'team') {
    fail("type must be 'personal' or 'team'")
  }

  // `defaultVisibility` is only honoured for the two literal values.
  const defaultVisibility: Visibility =
    input.defaultVisibility === 'public' ? 'public' : 'private'

  const ns = namespaces.create({
    slug: input.slug,
    displayName: input.displayName || null,
    description: input.description || null,
    ownerId: user.id,
    type: type as NamespaceType,
    defaultVisibility,
    // `maxSkills` only takes effect when positive.
    maxSkills: input.maxSkills && input.maxSkills > 0 ? input.maxSkills : 0,
  })
  members.add(ns.id, user.id, 'owner')
  auditLog({
    actorId: user.id,
    action: 'namespace_create',
    resourceType: 'namespace',
    resourceId: ns.id,
    details: ns.slug,
  })
  return ns
}

export function listNamespaces(user: UserRecord): Namespace[] {
  return namespaces.listForUser(user.id)
}

export function getNamespaceForUser(slug: string, viewer: ViewerInfo): Namespace {
  const ns = namespaces.getBySlug(slug)
  if (!ns) notFound('namespace not found')
  if (!isMemberOrAdmin(ns.id, viewer)) forbidden('access denied')
  return ns
}

export function updateNamespace(
  slug: string,
  viewer: ViewerInfo,
  fields: {
    displayName?: string
    description?: string
    defaultVisibility?: string
    maxSkills?: number
  },
): Namespace {
  const ns = getNamespaceForUser(slug, viewer)
  const canEdit = isSystemAdmin(viewer) || members.canManage(ns.id, viewer.id)
  if (!canEdit) forbidden('only owner or admin can update a namespace')

  return namespaces.update(ns.id, {
    displayName: fields.displayName !== undefined ? fields.displayName : undefined,
    description: fields.description !== undefined ? fields.description : undefined,
    defaultVisibility:
      fields.defaultVisibility === 'public'
        ? 'public'
        : fields.defaultVisibility === 'private'
          ? 'private'
          : undefined,
    maxSkills:
      fields.maxSkills !== undefined && fields.maxSkills > 0 ? fields.maxSkills : undefined,
  })
}

export function deleteNamespace(slug: string, viewer: ViewerInfo): void {
  const ns = namespaces.getBySlug(slug)
  if (!ns) notFound('namespace not found')
  if (!isSystemAdmin(viewer) && ns.ownerId !== viewer.id) {
    forbidden('only the owner can delete a namespace')
  }
  // Revoke team tokens first so no credential outlives its namespace, then
  // delete — membership, skills, plugins and invitations cascade via FK.
  tokenRepo.revokeAllInNamespace(ns.id)
  namespaces.delete(ns.id)
  auditLog({
    actorId: viewer.id,
    action: 'namespace_delete',
    resourceType: 'namespace',
    resourceId: ns.id,
    details: ns.slug,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Membership
// ─────────────────────────────────────────────────────────────────────────────

export function listMembers(slug: string, viewer: ViewerInfo) {
  const ns = getNamespaceForUser(slug, viewer)
  return members.list(ns.id)
}

export function addMember(
  slug: string,
  viewer: ViewerInfo,
  handle: string,
  role: string,
): void {
  const ns = namespaces.getBySlug(slug)
  if (!ns) notFound('namespace not found')
  if (!isSystemAdmin(viewer) && !members.canManage(ns.id, viewer.id)) {
    forbidden('only owner or admin can manage members')
  }
  const target = users.getByHandle(handle)
  if (!target) notFound(`user '${handle}' not found`)
  members.add(ns.id, target.id, (role || 'member') as NamespaceRole)
  auditLog({
    actorId: viewer.id,
    action: 'member_add',
    resourceType: 'namespace',
    resourceId: ns.id,
    details: `handle=${handle},role=${role || 'member'}`,
  })
}

export function removeMember(slug: string, viewer: ViewerInfo, handle: string): void {
  const ns = namespaces.getBySlug(slug)
  if (!ns) notFound('namespace not found')
  if (!isSystemAdmin(viewer) && !members.canManage(ns.id, viewer.id)) {
    forbidden('only owner or admin can manage members')
  }
  const target = users.getByHandle(handle)
  if (!target) notFound(`user '${handle}' not found`)

  if (target.id === ns.ownerId && members.countByRole(ns.id, 'owner') <= 1) {
    fail('cannot remove the last owner of a namespace')
  }

  members.remove(ns.id, target.id)
  // Leaving invalidates any team token the user held here.
  tokenRepo.revokeForUserInNamespace(target.id, ns.id)
  auditLog({
    actorId: viewer.id,
    action: 'member_remove',
    resourceType: 'namespace',
    resourceId: ns.id,
    details: `handle=${handle}`,
  })
}

export function leaveNamespace(slug: string, viewer: ViewerInfo): void {
  const ns = namespaces.getBySlug(slug)
  if (!ns) notFound('namespace not found')
  if (!members.isMember(ns.id, viewer.id)) fail('you are not a member of this namespace')
  if (ns.ownerId === viewer.id) {
    fail('the owner cannot leave; transfer ownership first')
  }
  members.remove(ns.id, viewer.id)
  tokenRepo.revokeForUserInNamespace(viewer.id, ns.id)
}

export function transferOwnership(slug: string, viewer: ViewerInfo, newOwnerHandle: string): void {
  const ns = namespaces.getBySlug(slug)
  if (!ns) notFound('namespace not found')
  if (!isSystemAdmin(viewer) && ns.ownerId !== viewer.id) {
    forbidden('only the owner can transfer ownership')
  }
  const target = users.getByHandle(newOwnerHandle)
  if (!target) notFound(`user '${newOwnerHandle}' not found`)
  if (!members.isMember(ns.id, target.id)) {
    fail(`'${newOwnerHandle}' is not a member of this namespace`)
  }
  // Previous owner is demoted rather than removed.
  members.add(ns.id, ns.ownerId, 'admin')
  members.add(ns.id, target.id, 'owner')
  namespaces.setOwner(ns.id, target.id)
  auditLog({
    actorId: viewer.id,
    action: 'namespace_transfer',
    resourceType: 'namespace',
    resourceId: ns.id,
    details: `newOwner=${newOwnerHandle}`,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Invitations
// ─────────────────────────────────────────────────────────────────────────────

export function inviteMember(
  slug: string,
  viewer: ViewerInfo,
  handle: string,
  role: string,
  message?: string,
) {
  const ns = namespaces.getBySlug(slug)
  if (!ns) notFound('namespace not found')
  if (!isSystemAdmin(viewer) && !members.canManage(ns.id, viewer.id)) {
    forbidden('only owner or admin can invite members')
  }
  const target = users.getByHandle(handle)
  if (!target) notFound(`user '${handle}' not found`)
  if (members.isMember(ns.id, target.id)) fail(`'${handle}' is already a member`)

  const existing = invitations.findPending(ns.id, target.id)
  if (existing) return existing

  return invitations.create({
    namespaceId: ns.id,
    inviterId: viewer.id,
    inviteeId: target.id,
    inviteeHandle: target.handle,
    role: (role || 'member') as NamespaceRole,
    message: message || null,
    ttlSeconds: INVITATION_TTL_SECONDS,
  })
}

export function listNamespaceInvitations(slug: string, viewer: ViewerInfo, status: string) {
  const ns = namespaces.getBySlug(slug)
  if (!ns) notFound('namespace not found')
  if (!isSystemAdmin(viewer) && !members.canManage(ns.id, viewer.id)) {
    forbidden('only owner or admin can view invitations')
  }
  return invitations.listForNamespace(ns.id, status)
}

export function revokeInvitation(slug: string, viewer: ViewerInfo, id: string): void {
  const ns = namespaces.getBySlug(slug)
  if (!ns) notFound('namespace not found')
  if (!isSystemAdmin(viewer) && !members.canManage(ns.id, viewer.id)) {
    forbidden('only owner or admin can revoke invitations')
  }
  const invitation = invitations.getById(id)
  if (!invitation || invitation.namespaceId !== ns.id) notFound('invitation not found')
  invitations.respond(id, 'revoked')
}

export function myInvitations(viewer: ViewerInfo) {
  return invitations.listForInvitee(viewer.id)
}

export function respondInvitation(
  viewer: ViewerInfo,
  id: string,
  action: 'accept' | 'decline',
): void {
  const invitation = invitations.getById(id)
  if (!invitation) notFound('invitation not found')
  if (invitation.inviteeId !== viewer.id) forbidden('this invitation is not yours')
  if (invitation.status !== 'pending') fail(`invitation is already ${invitation.status}`)
  if (Date.parse(invitation.expiresAt) <= Date.now()) {
    invitations.respond(id, 'expired')
    fail('invitation has expired')
  }

  if (action === 'accept') {
    members.add(invitation.namespaceId, viewer.id, invitation.role)
  }
  invitations.respond(id, action === 'accept' ? 'accepted' : 'declined')
}

// ─────────────────────────────────────────────────────────────────────────────
// Team tokens
// ─────────────────────────────────────────────────────────────────────────────

export function createTeamToken(
  slug: string,
  viewer: ViewerInfo,
  input: { label?: string; scope?: string; expiresIn: string },
): { token: string; metadata: APIToken } {
  const ns = namespaces.getBySlug(slug)
  if (!ns) notFound('namespace not found')
  if (!canManageTokens(ns.id, viewer)) {
    forbidden('only namespace owner/admin can manage tokens')
  }

  const scopeRaw = input.scope && input.scope !== '' ? input.scope : 'publish'
  if (scopeRaw !== 'read' && scopeRaw !== 'publish') {
    fail('invalid team-token scope, must be one of: read, publish')
  }

  const raw = (input.expiresIn ?? '').trim()
  if (raw === '') fail('expiresIn is required for team tokens (max 365d)')
  const seconds = parseDurationOrNull(raw)
  if (seconds === null || seconds <= 0) fail('invalid expiresIn duration')
  if (seconds > TEAM_TOKEN_MAX_SECONDS) {
    fail('expiresIn exceeds maximum team-token lifetime of 365d')
  }

  const active = tokenRepo.countActiveByNamespace(ns.id)
  if (active >= TEAM_TOKEN_LIMIT) {
    fail(
      'namespace already has the maximum number of active team tokens; revoke an unused token before creating a new one',
    )
  }

  const rawToken = generateRawToken()
  const metadata = tokenRepo.create({
    userId: viewer.id,
    namespaceId: ns.id,
    label: input.label || null,
    prefix: extractPrefix(rawToken),
    tokenHash: hashToken(rawToken),
    scope: scopeRaw as TokenScope,
    expiresAt: new Date(Date.now() + seconds * 1000).toISOString(),
  })

  auditLog({
    actorId: viewer.id,
    action: 'team_token_create',
    resourceType: 'api_token',
    resourceId: metadata.id,
    details: `namespace=${ns.slug},scope=${scopeRaw}`,
  })

  return { token: rawToken, metadata }
}

export function listTeamTokens(
  slug: string,
  viewer: ViewerInfo,
  limit: number,
  cursor: string,
): { data: APIToken[]; nextCursor?: string } {
  const ns = namespaces.getBySlug(slug)
  if (!ns) notFound('namespace not found')
  if (!canManageTokens(ns.id, viewer)) {
    forbidden('only namespace owner/admin can list tokens')
  }
  const effective = limit > 0 ? Math.min(limit, 100) : 20
  const { data, nextCursor } = tokenRepo.listByNamespace(ns.id, effective, cursor)
  // Unlike the skills list, `nextCursor` is omitted rather than `''`.
  return nextCursor ? { data, nextCursor } : { data }
}

export function revokeTeamToken(slug: string, viewer: ViewerInfo, id: string): void {
  const ns = namespaces.getBySlug(slug)
  if (!ns) notFound('namespace not found')

  const token = tokenRepo.getById(id)
  if (!token || token.namespaceId !== ns.id) notFound('token not found')

  const isManager = canManageTokens(ns.id, viewer)
  const isCreator = token.userId === viewer.id
  if (!isManager && !isCreator) {
    forbidden('only namespace owner/admin or the token creator can revoke')
  }

  tokenRepo.revoke(id)
  auditLog({
    actorId: viewer.id,
    action: 'team_token_revoke',
    resourceType: 'api_token',
    resourceId: id,
    details: `namespace=${ns.slug}${!isCreator ? ',by_admin=true' : ''}`,
  })
}

/** Shared with `services/manage.ts`; kept local to avoid a circular import. */
function parseDurationOrNull(raw: string): number | null {
  const text = raw.trim()
  if (text === '') return null
  const re = /(\d+(?:\.\d+)?)(ns|us|µs|ms|s|m|h|d)/g
  const unit: Record<string, number> = {
    ns: 1e-9,
    us: 1e-6,
    'µs': 1e-6,
    ms: 1e-3,
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  }
  let total = 0
  let matched = 0
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index !== last) return null
    total += Number(m[1]) * unit[m[2]]
    matched += 1
    last = re.lastIndex
  }
  if (matched === 0 || last !== text.length) return null
  return total
}

export { nowIso }
