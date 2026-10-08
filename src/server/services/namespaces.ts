/**
 * Namespace service: namespaces, membership and invitations.
 *
 * Authorization predicates mirror `NamespaceService`:
 *   * `IsMemberOrAdmin` — system admin, or any membership row.
 *   * `CanPublish`      — membership with a role other than `reader`.
 *
 * Owner-only failures carry a literal `forbidden: ` prefix so the HTTP layer
 * reports 403 with the same text the original produced.
 */

import { forbidden, notFound, fail } from '../errors'
import { nowIso } from '../db'
import type {
  Namespace,
  NamespaceRole,
  NamespaceType,
  Visibility,
} from '../../lib/types'
import {
  invitations,
  members,
  namespaces,
  users,
  type UserRecord,
} from '../repo/core'
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
  // Membership, skills, plugins and invitations cascade via FK.
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

export { nowIso }
