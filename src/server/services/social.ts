/**
 * Social interactions: ratings, comments and notifications.
 *
 * Stars live in `services/skills.ts` because they mutate the skill's own
 * counter; ratings and comments are here.
 */

import { fail, forbidden, notFound } from '../errors'
import {
  comments as commentRepo,
  ratings as ratingRepo,
  skills as skillRepo,
} from '../repo/skills'
import { notifications, type UserRecord } from '../repo/core'
import {
  auditLog,
  auditResourceType,
  canViewSkill,
  reindexSkill,
  resolveSkillRef,
  type Viewer,
} from './shared'
import type { SkillRef } from '../../lib/types'

const MAX_COMMENT_LENGTH = 2000

// ─────────────────────────────────────────────────────────────────────────────
// Ratings
// ─────────────────────────────────────────────────────────────────────────────

export function rate(user: UserRecord, ref: SkillRef, score: number, comment?: string): void {
  const viewer: Viewer = { id: user.id, role: user.role }
  const skill = resolveSkillRef(ref, viewer)
  if (!skill) fail('skill not found')
  if (!Number.isInteger(score) || score < 1 || score > 5) fail('score must be between 1 and 5')
  if (skill.ownerId === user.id) fail('cannot rate your own skill')

  ratingRepo.upsert(skill.id, user.id, score, comment ?? null)
  skillRepo.recomputeRatings(skill.id)
  reindexSkill(skillRepo.getWithOwnerById(skill.id)!)
}

export function deleteRating(user: UserRecord, ref: SkillRef): void {
  const skill = resolveSkillRef(ref, { id: user.id, role: user.role })
  if (!skill) fail('skill not found')
  if (!ratingRepo.delete(skill.id, user.id)) fail('no rating found')
  skillRepo.recomputeRatings(skill.id)
  reindexSkill(skillRepo.getWithOwnerById(skill.id)!)
}

export function listRatings(
  ref: SkillRef,
  viewer: Viewer | null,
  limit: number,
  cursor: string,
) {
  // Ratings listing intentionally does not enforce visibility beyond resolution.
  const skill = resolveSkillRef(ref, viewer)
  if (!skill) fail('skill not found')
  return ratingRepo.list(skill.id, limit, cursor)
}

// ─────────────────────────────────────────────────────────────────────────────
// Comments
// ─────────────────────────────────────────────────────────────────────────────

export function createComment(
  user: UserRecord,
  ref: SkillRef,
  body: string,
): {
  id: string
  skillId: string
  userId: string
  body: string
  createdAt: string
  updatedAt: string
  softDeletedAt?: string
} {
  const viewer: Viewer = { id: user.id, role: user.role }
  const skill = resolveSkillRef(ref, viewer)
  if (!skill) fail('skill not found')

  const trimmed = (body ?? '').trim()
  if (trimmed === '') fail('comment body is required')
  if (trimmed.length > MAX_COMMENT_LENGTH) fail(`comment exceeds ${MAX_COMMENT_LENGTH} characters`)

  auditLog({
    actorId: user.id,
    action: 'comment_create',
    resourceType: auditResourceType(skill.type, 'skill'),
    resourceId: skill.id,
  })

  // The create response carries the bare comment only — the author join fields
  // (`handle`, `displayName`, `avatarUrl`) belong to the list endpoint.
  const created = commentRepo.create(skill.id, user.id, trimmed)
  return {
    id: created.id,
    skillId: created.skillId,
    userId: created.userId,
    body: created.body,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
    ...(created.softDeletedAt !== undefined ? { softDeletedAt: created.softDeletedAt } : {}),
  }
}

export function deleteComment(user: UserRecord, commentId: string): void {
  const comment = commentRepo.getById(commentId)
  if (!comment) fail('comment not found')

  const skill = skillRepo.getWithOwnerById(comment.skillId)
  if (!skill) fail('skill not found')

  const isAuthor = comment.userId === user.id
  const isOwner = skill.ownerId === user.id
  const isAdmin = user.role === 'admin'
  if (!isAuthor && !isOwner && !isAdmin) fail('forbidden')

  commentRepo.softDelete(commentId)
  // Keep the denormalised counter honest without a full recompute.
  skillRepo.incrementComments(skill.id, -1)
}

export function listComments(
  ref: SkillRef,
  viewer: Viewer | null,
  limit: number,
  cursor: string,
) {
  const skill = resolveSkillRef(ref, viewer)
  // Comment listing reports a missing skill as 404 (ratings report 400).
  if (!skill) notFound('skill not found')
  if (!canViewSkill(skill, viewer)) notFound('skill not found')
  return commentRepo.list(skill.id, limit, cursor)
}

// ─────────────────────────────────────────────────────────────────────────────
// Notifications
// ─────────────────────────────────────────────────────────────────────────────

export function listNotifications(userId: string, limit: number, cursor: string) {
  return notifications.list(userId, limit, cursor)
}

export function unreadCount(userId: string) {
  return notifications.unreadCount(userId)
}

export function markRead(userId: string, id: string): void {
  notifications.markRead(userId, id)
}

export function markAllRead(userId: string): void {
  notifications.markAllRead(userId)
}

export { forbidden }
