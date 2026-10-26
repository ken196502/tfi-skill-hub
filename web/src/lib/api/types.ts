/**
 * Domain types shared by the API layer and the UI.
 *
 * Field names mirror the live Skill Hub backend so the adapter in
 * `./real` stays the only place that knows wire formats.
 */

export type Visibility = "private" | "public";
export type ModerationStatus = "approved" | "pending_review" | "rejected";
export type SkillKind = "builtin" | "domain" | "learned" | "custom";
/**
 * What a catalogue entry represents.
 *
 * Knowledge bases share the skill record, endpoints and detail page; the type
 * is the discriminator that only changes labels, badges and the home split.
 * The wire field is `contentType` (`skill` / `knowledge`); records from older
 * backends carry no field and therefore read as skills.
 */
export type ContentType = "skill" | "knowledge";
export type UserRole = "user" | "admin";
export type UserStatus = "pending" | "approved" | "rejected";

/**
 * Capability scopes of an API key. Knowledge bases share the skill record,
 * endpoints and scopes, so `skills:*` already covers both content types.
 */
export type ApiKeyScope =
  | "skills:read"
  | "skills:publish"
  | "skills:delete"
  | "skills:moderate"
  | "users:moderate";

export const API_KEY_SCOPES: ApiKeyScope[] = [
  "skills:read",
  "skills:publish",
  "skills:delete",
  "skills:moderate",
  "users:moderate",
];

export const VALID_CATEGORIES = ["finance", "personal", "workspace", "general"] as const;
export type Category = (typeof VALID_CATEGORIES)[number];

export type ApiKeyExpiry = "never" | "30d" | "90d" | "365d";

/** A brand (affiliation organisation) from `GET /api/v1/brands`. */
export interface Brand {
  /**
   * Brand ID — the value users submit as their affiliation (`orgCode` on the
   * wire). Kept as a string because `orgCode` is one.
   */
  brandId: string;
  /** English name, always present. */
  nameEn: string;
  /** Chinese name; falls back to `nameEn` when the backend sends null. */
  nameZh: string;
}

export interface User {
  id: string;
  handle: string;
  displayName?: string;
  avatarUrl?: string;
  email?: string;
  /** Registration profile — surfaced in the admin console (UserVo 同名字段). */
  country?: string;
  officeLocation?: string;
  orgName?: string;
  position?: string;
  researchNeed?: string;
  focusMarkets?: string[];
  role: UserRole;
  /** `pending` until an admin reviews a self-registered account. */
  status: UserStatus;
  isBanned: boolean;
  banReason?: string;
  /** Note left by the admin who rejected the account. */
  reviewNote?: string;
  reviewedAt?: string;
  /** Lifetime skill ZIP downloads by this user, agent downloads included. */
  downloadCount: number;
  /** Lifetime skill downloads; falls back to `downloadCount` on older backends. */
  skillDownloadCount: number;
  /** Lifetime knowledge-base downloads; `0` until the backend reports the split. */
  knowledgeDownloadCount: number;
  /** Lifetime successful sign-ins, counted since login statistics went live. */
  loginCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface VersionFile {
  path: string;
  size: number;
  sha256: string;
  contentType?: string;
}

export interface SkillDependency {
  slug: string;
  namespace?: string;
  version: string;
}

export interface SkillVersion {
  id: string;
  skillId: string;
  version: string;
  fingerprint: string;
  changelog?: string;
  files: VersionFile[];
  createdAt: string;
  yankedAt?: string;
  deprecatedAt?: string;
  dependencies: SkillDependency[];
}

export interface Skill {
  id: string;
  slug: string;
  /** Skill or knowledge base; the backend defaults to `skill`. */
  contentType: ContentType;
  displayName?: string;
  summary?: string;
  displayNameEn?: string;
  summaryEn?: string;
  ownerId: string;
  namespaceId?: string;
  visibility: Visibility;
  moderationStatus: ModerationStatus;
  kind: SkillKind;
  /** Sanitised rich detail markup; only present on detail responses. */
  detailHtml?: string;
  detailHtmlEn?: string;
  category: string;
  tags: string[];
  downloads: number;
  installs: number;
  starsCount: number;
  versionsCount: number;
  createdAt: string;
  updatedAt: string;
  softDeletedAt?: string;
}

/** `Skill` plus owner/namespace display fields, as returned by the API. */
export interface SkillWithOwner extends Skill {
  ownerHandle: string;
  ownerDisplayName?: string;
  /** Always present; `""` when the skill has no namespace. */
  namespaceSlug: string;
  /** Present only for signed-in viewers. */
  starred?: boolean;
}

export interface AdminApiKey {
  id: string;
  name: string;
  createdBy: string;
  createdByHandle?: string;
  prefix: string;
  /** Full value; the admin list endpoint returns it so any row can copy a usage sheet. */
  secret?: string;
  scopes: ApiKeyScope[];
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
  revokedAt?: string;
}

export interface AuditLog {
  id: string;
  actorId?: string;
  actorHandle?: string;
  action: string;
  /**
   * Human-readable action description, localized by the backend via the
   * `lang` header; falls back to the raw `action` for unregistered actions.
   */
  actionDescription?: string;
  resourceType: string;
  /** Content type of a content resource (`skill` / `knowledge`); unset otherwise. */
  contentType?: ContentType;
  resourceId?: string;
  details?: string;
  ipAddress?: string;
  createdAt: string;
}

/**
 * One entry of the admin action dictionary (`GET /api/v1/admin/audit-actions`).
 * The raw `action` doubles as the `action` filter value in audit queries.
 */
export interface AuditAction {
  action: string;
  /** Description localized via the `lang` header (falls back to `action`). */
  description: string;
  /** Resource kind (`skill` / `user` / `api_key` …), the `resourceType` filter value. */
  resourceType: string;
}

export interface AuditListResponse {
  data: AuditLog[];
  nextCursor: string;
  total: number;
}

export interface SkillListResponse {
  data: SkillWithOwner[];
  nextCursor: string;
  /**
   * Overall match count across all pages. The live backend does not compute it
   * for the public catalogue, so it may be absent — the UI falls back to the
   * number of currently loaded items in that case.
   */
  total?: number;
}

export interface UserListResponse {
  data: User[];
  nextCursor: string;
  pendingCount: number;
  /** Overall user count; absent on deployments that do not expose it yet. */
  total?: number;
}

export interface AdminSkillListResponse {
  data: SkillWithOwner[];
  nextCursor: string;
  total: number;
}

/** The console's skill form payload — every field is submitted on save. */
export interface AdminSkillInput {
  slug?: string;
  /** Required on create: a record is either a skill or a knowledge base. */
  contentType: ContentType;
  displayName: string;
  summary: string;
  displayNameEn: string;
  summaryEn: string;
  category: string;
  tags: string[];
  visibility: Visibility;
  html: string;
  htmlEn: string;
}

export interface VersionsResponse {
  versions: SkillVersion[] | null;
}

export interface PageParams {
  limit?: number;
  cursor?: string;
}

export interface AdminSkillQuery extends PageParams {
  visibility?: string;
  /** Content-type filter (`skill` / `knowledge`). */
  type?: ContentType;
  /** 1-based numbered page; the admin console uses this instead of cursors. */
  page?: number;
}

export interface AdminAuditQuery {
  /** 1-based numbered page; the console pages instead of loading everything. */
  page?: number;
  limit?: number;
  action?: string;
  resourceType?: string;
  /** Opaque cursor for the backend's cursor-paged audit listing. */
  cursor?: string;
}

/** The self-service registration payload; everything but `officeLocation` is required. */
export interface RegisterInput {
  handle: string;
  password: string;
  /** Re-sent for the backend's own equality check; encrypted the same way. */
  confirmPassword: string;
  /** Six-digit code the user received at `email`. */
  emailCode: string;
  displayName: string;
  email: string;
  /** Nationality enum code (see `@/lib/registration`). */
  country: string;
  /** Brand ID of the affiliation (`orgCode` on the wire). */
  organization: string;
  jobTitle: string;
  officeLocation?: string;
  researchNeeds: string;
  /** FocusMarket enum codes (see `@/lib/registration`). */
  markets: string[];
}

export interface RegisterResult {
  ok: boolean;
  status: UserStatus;
}

export interface CreateUserInput {
  handle: string;
  displayName?: string;
  email?: string;
  role?: UserRole;
  /** Initial password; AES-encrypted before sending (same scheme as /register). */
  password?: string;
  /** Re-sent for the backend's own equality check; encrypted the same way. */
  confirmPassword?: string;
  /** Profile fields mirroring the public sign-up, sent under /register's names. */
  country?: string;
  /** Brand ID of the affiliation (`orgCode` on the wire). */
  organization?: string;
  jobTitle?: string;
  officeLocation?: string;
  researchNeeds?: string;
  markets?: string[];
}

export interface CreateApiKeyInput {
  name: string;
  scopes: ApiKeyScope[];
  expiresIn?: ApiKeyExpiry;
}

export interface CreateApiKeyResult {
  key: string;
  metadata: AdminApiKey;
}

/** Whether an admin API key is usable right now. */
export function apiKeyStatus(
  key: Pick<AdminApiKey, "revokedAt" | "expiresAt">,
): "active" | "revoked" | "expired" {
  if (key.revokedAt) return "revoked";
  if (key.expiresAt && Date.parse(key.expiresAt) < Date.now()) return "expired";
  return "active";
}
