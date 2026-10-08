/**
 * Shared domain types.
 *
 * These mirror `pkg/model/*.go` field-for-field, including which fields are
 * optional (`json:",omitempty"` in Go → optional + omitted when absent here).
 * The optionality distinction is load-bearing: consumers rely on the key being
 * *absent* rather than `null`.
 */

export type Visibility = 'private' | 'public'
export type ModerationStatus = 'approved' | 'pending_review' | 'rejected'
export type SkillKind = 'builtin' | 'domain' | 'learned' | 'custom'
/**
 * Roles a person can hold: `admin` and `user`, nothing in between. `agent` is
 * not a human role — it marks accounts created by the agent provisioning flow
 * (`/api/agent/provision`) so machine publishers stay distinguishable, and it
 * is never offered as a choice anywhere in the UI.
 */
export type UserRole = 'user' | 'admin' | 'agent'
/**
 * Review state of an account. Self-service registration lands in `pending` and
 * waits for an admin decision; accounts that predate registration (or were
 * created by an admin) are `approved` from the start.
 */
export type UserStatus = 'pending' | 'approved' | 'rejected'
export type NamespaceType = 'personal' | 'team'
export type NamespaceRole = 'owner' | 'admin' | 'member' | 'reader'

/**
 * Capabilities an admin API key can hold.
 *
 * The key is minted for one job — driving the skill catalogue over HTTP, or
 * reviewing accounts — so its powers are enumerated per endpoint group rather
 * than inherited from its creator's whole role. A route declares the single
 * capability it needs (`apiKeyScope` in the route table) and a key is refused
 * unless it holds that one.
 */
export type ApiKeyScope =
  | 'skills:read'
  | 'skills:publish'
  | 'skills:delete'
  | 'skills:moderate'
  | 'users:moderate'

export const API_KEY_SCOPES: ApiKeyScope[] = [
  'skills:read',
  'skills:publish',
  'skills:delete',
  'skills:moderate',
  'users:moderate',
]
export type SignatureStatus = 'unsigned' | 'unverified' | 'verified' | 'invalid'

export const VALID_CATEGORIES = [
  'finance',
  'personal',
  'workspace',
  'general',
] as const

export const VALID_KINDS: SkillKind[] = ['builtin', 'domain', 'learned', 'custom']

export const VALID_ROLES: UserRole[] = ['user', 'admin']

/** `model.ReservedNamespaces` — slug prefixes reserved for official distribution. */
export const RESERVED_NAMESPACE_PREFIXES = ['animus-builtin/', 'animus-domain/']

export interface User {
  id: string
  handle: string
  displayName?: string
  avatarUrl?: string
  email?: string
  role: UserRole
  /** Present on every account; `pending` until an admin reviews it. */
  status: UserStatus
  isBanned: boolean
  banReason?: string
  /** Note left by the admin who rejected the account. */
  reviewNote?: string
  reviewedAt?: string
  reviewedBy?: string
  createdAt: string
  updatedAt: string
}

export interface Skill {
  id: string
  slug: string
  displayName?: string
  summary?: string
  /** English display name for the zh/en switch; absent when not provided. */
  displayNameEn?: string
  /** English summary; absent when not provided. */
  summaryEn?: string
  ownerId: string
  namespaceId?: string
  latestVersionId?: string
  visibility: Visibility
  moderationStatus: ModerationStatus
  isSuspicious: boolean
  kind: SkillKind
  /**
   * Rich detail markup rendered on the skill's page instead of SKILL.md.
   * Sanitised on the way in; absent when the publisher has not set one, in
   * which case the page falls back to the SKILL.md of the latest version.
   * Only the detail endpoint carries it — list responses never do, because a
   * page of skills would otherwise ship every body in full.
   */
  detailHtml?: string
  detailHtmlUpdatedAt?: string
  /**
   * English variant of the rich detail body. Absent when not set — the page
   * then renders the Chinese `detailHtml` (or SKILL.md) in English mode too.
   * Same carriage rules as `detailHtml`: detail endpoint only, sanitised.
   */
  detailHtmlEn?: string
  detailHtmlEnUpdatedAt?: string
  category: string
  tags: string[]
  downloads: number
  installs: number
  starsCount: number
  versionsCount: number
  commentsCount: number
  averageRating: number
  ratingsCount: number
  createdAt: string
  updatedAt: string
  softDeletedAt?: string
}

/** `model.SkillWithOwner` — `Skill` inlined, plus owner/namespace display fields. */
export interface SkillWithOwner extends Skill {
  ownerHandle: string
  ownerDisplayName?: string
  ownerAvatarUrl?: string
  /** Always present; `""` when the joined namespace is missing. */
  namespaceSlug: string
  /**
   * Whether the signed-in viewer has favourited this skill. Present only when
   * the request carried a session — anonymous responses omit it entirely.
   */
  starred?: boolean
}

export interface VersionFile {
  path: string
  size: number
  sha256: string
  contentType?: string
}

export interface SkillDependency {
  slug: string
  namespace?: string
  /** Verbatim semver range, e.g. `^1.2.0`. */
  version: string
}

export interface SkillVersion {
  id: string
  skillId: string
  version: string
  fingerprint: string
  gitCommitHash?: string
  changelog?: string
  changelogSource?: string
  files: VersionFile[]
  /** Frontmatter extracted from SKILL.md, or `{}`. */
  parsed: Record<string, unknown>
  createdBy: string
  sha256Hash: string
  createdAt: string
  softDeletedAt?: string
  yankedAt?: string
  yankReason?: string
  deprecatedAt?: string
  deprecationMessage?: string
  dependencies: SkillDependency[]
  signatureBundle?: string
  signatureStatus: SignatureStatus
  signatureSubject?: string
  signatureIssuer?: string
}

export interface Plugin {
  id: string
  slug: string
  displayName?: string
  summary?: string
  displayNameEn?: string
  summaryEn?: string
  ownerId: string
  namespaceId?: string
  latestVersionId?: string
  visibility: Visibility
  moderationStatus: ModerationStatus
  category: string
  tags: string[]
  downloads: number
  starsCount: number
  versionsCount: number
  createdAt: string
  updatedAt: string
  softDeletedAt?: string
}

export interface PluginVersion {
  id: string
  pluginId: string
  version: string
  fingerprint: string
  manifest: Record<string, unknown>
  files: VersionFile[]
  changelog?: string
  createdBy: string
  sha256Hash: string
  createdAt: string
  softDeletedAt?: string
  yankedAt?: string
  yankReason?: string
}

export interface Namespace {
  id: string
  slug: string
  displayName?: string
  description?: string
  ownerId: string
  type: NamespaceType
  status: 'active' | 'suspended'
  defaultVisibility: Visibility
  /** 0 = unlimited. */
  maxSkills: number
  createdAt: string
  updatedAt: string
}

export interface NamespaceMemberWithUser {
  id: string
  namespaceId: string
  userId: string
  role: NamespaceRole
  createdAt: string
  handle: string
  displayName?: string
}

export interface NamespaceInvitation {
  id: string
  namespaceId: string
  inviterId: string
  inviteeId: string
  inviteeHandle: string
  role: NamespaceRole
  status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired'
  message?: string
  createdAt: string
  expiresAt: string
  respondedAt?: string
}

/**
 * An admin-issued API key. New in this rewrite — the Go registry had no
 * equivalent, so the shape follows the conventions of the rest of this file:
 * camelCase, and optional keys absent rather than `null`.
 *
 * The value is persisted as well as hashed so the admin console can hand back
 * a ready-to-run usage sheet for any key in the list, not just the one that was
 * just minted. The console is the only surface that reads it.
 */
export interface AdminApiKey {
  id: string
  name: string
  createdBy: string
  /** Joined for the admin listing; absent when the creator was deleted. */
  createdByHandle?: string
  namespaceId?: string
  namespaceSlug?: string
  prefix: string
  /** Full key value, for the console's copy-a-sheet affordance. Absent for rows minted before it was stored. */
  secret?: string
  scopes: ApiKeyScope[]
  lastUsedAt?: string
  expiresAt?: string
  createdAt: string
  revokedAt?: string
}

export interface Notification {
  id: string
  userId: string
  category: string
  title: string
  body?: string
  link?: string
  isRead: boolean
  createdAt: string
}

export interface RatingWithUser {
  id: string
  skillId: string
  userId: string
  score: number
  comment?: string
  createdAt: string
  updatedAt: string
  handle: string
  displayName?: string
}

export interface CommentWithUser {
  id: string
  skillId: string
  userId: string
  body: string
  createdAt: string
  updatedAt: string
  softDeletedAt?: string
  handle: string
  displayName?: string
  avatarUrl?: string
}

export interface AuditLog {
  id: string
  actorId?: string
  action: string
  resourceType: string
  resourceId?: string
  details?: string
  ipAddress?: string
  createdAt: string
}

/** Parsed `@namespace/slug` reference — mirrors `model.SkillRef`. */
export interface SkillRef {
  namespace: string
  slug: string
}
