/**
 * Typed endpoint functions — the only thing the UI imports.
 *
 * Every function delegates to the live-backend adapter in `./real`, which
 * speaks the backend dialect (Resp envelope + pageNum paging) and maps
 * responses back into the internal shapes.
 */

import { apiFetchRaw } from "./client";
import { ApiError } from "./errors";
import * as real from "./real";
import { forgetAuthHint, hasAuthHint } from "@/lib/auth-hint";
import type {
  AdminApiKey,
  AdminSkillInput,
  AdminSkillListResponse,
  AdminSkillQuery,
  AdminAuditQuery,
  AuditAction,
  AuditListResponse,
  Brand,
  ContentType,
  CreateApiKeyInput,
  CreateApiKeyResult,
  CreateUserInput,
  RegisterInput,
  RegisterResult,
  SkillListResponse,
  SkillWithOwner,
  User,
  UserListResponse,
  UserRole,
  VersionsResponse,
} from "./types";

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "" && value !== null) {
      search.set(key, String(value));
    }
  }
  const suffix = search.toString();
  return suffix ? `?${suffix}` : "";
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

/** `null` means "not signed in"; a thrown ApiError means the request failed. */
export async function whoami(): Promise<User | null> {
  // Anonymous visitors have no session to probe — only ask after a sign-in
  // was seen on this browser (401/403 then forgets the hint, so later page
  // loads skip the probe once the session turns stale).
  if (!hasAuthHint()) return null;
  try {
    return await real.whoami();
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      forgetAuthHint();
      return null;
    }
    throw error;
  }
}

export function login(handle: string, password: string): Promise<void> {
  return real.login(handle, password);
}

export function logout(): Promise<void> {
  return real.logout();
}

export function register(input: RegisterInput): Promise<RegisterResult> {
  return real.register(input);
}

/** Sends (or re-sends) the six-digit sign-up verification code to `email`. */
export function sendEmailCode(email: string): Promise<void> {
  return real.sendEmailCode(email);
}

export function registrationStatus(): Promise<{ enabled: boolean }> {
  return real.registrationStatus();
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalogue
// ─────────────────────────────────────────────────────────────────────────────

export interface ListSkillsParams {
  limit?: number;
  cursor?: string;
  sort?: string;
  category?: string;
  q?: string;
  namespace?: string;
  /** Restrict the list to skills or knowledge bases. */
  type?: ContentType;
}

export function listSkills(params: ListSkillsParams = {}): Promise<SkillListResponse> {
  return real.listSkills(params);
}

export function getSkill(ref: string): Promise<SkillWithOwner> {
  return real.getSkill(ref);
}

export function getSkillVersions(ref: string): Promise<VersionsResponse> {
  return real.getSkillVersions(ref);
}

/** Raw text of a single file inside a skill version. */
export function getSkillFile(ref: string, version: string, path: string): Promise<string> {
  return real.getSkillFile(ref, version, path);
}

export function listCategories(): Promise<{ categories: string[] }> {
  return real.listCategories();
}

export function listFeatures(): Promise<{ data: SkillWithOwner[] }> {
  return real.listFeatures();
}

/** Organisation brands for the affiliation picker; filtered client-side. */
export function listBrands(): Promise<{ data: Brand[] }> {
  return real.listBrands();
}

// ─────────────────────────────────────────────────────────────────────────────
// Stars
// ─────────────────────────────────────────────────────────────────────────────

export function starSkill(ref: string): Promise<{ message: string }> {
  return real.starSkill(ref);
}

export function unstarSkill(ref: string): Promise<{ message: string }> {
  return real.unstarSkill(ref);
}

export function listStarredSkills(
  params: { limit?: number; cursor?: string } = {},
): Promise<SkillListResponse> {
  return real.listStarredSkills(params);
}

// ─────────────────────────────────────────────────────────────────────────────
// Download
// ─────────────────────────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Downloads a skill archive; the backend serves it as a ZIP. */
export async function downloadSkill(
  ref: { slug: string; namespaceSlug?: string },
  version = "latest",
  filename?: string,
): Promise<void> {
  const suffix = qs({ slug: ref.slug, namespace: ref.namespaceSlug, version });
  const response = await apiFetchRaw(`/api/v1/download${suffix}`);
  const blob = await response.blob();
  triggerDownload(blob, filename ?? `${ref.slug}.zip`);
}

/** Downloads one file of a skill version (raw bytes, not JSON). */
export async function downloadSkillFile(
  ref: string,
  path: string,
  version = "latest",
  filename?: string,
): Promise<void> {
  const response = await apiFetchRaw(
    `${real.skillBase(ref)}/file${qs({ version: version || "latest", path })}`,
  );
  const blob = await response.blob();
  triggerDownload(blob, filename ?? (path.split("/").pop() || path));
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: users
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminListUsersOptions {
  /** 1-based numbered page. */
  page?: number;
  pageSize?: number;
  status?: string;
  /** Ban filter: true = banned only, false = active only, omit = all. */
  banned?: boolean;
  /** Backend-side keyword search across username, name, email and organisation. */
  keyword?: string;
}

export function adminListUsers(options: AdminListUsersOptions = {}): Promise<UserListResponse> {
  return real.adminListUsers(options);
}

export function adminReviewUser(
  userId: string,
  action: "approve" | "reject",
  note = "",
): Promise<{ message: string }> {
  return real.adminReviewUser(userId, action, note);
}

export function adminCreateUser(
  input: CreateUserInput,
): Promise<User & { initialPassword?: string }> {
  return real.adminCreateUser(input);
}

/** Ban with a reason; omit the reason to lift an existing ban (same endpoint). */
export function adminBanUser(userId: string, reason?: string): Promise<{ message: string }> {
  return real.adminBanUser(userId, reason);
}

export function adminSetRole(userId: string, role: UserRole): Promise<{ message: string }> {
  return real.adminSetRole(userId, role);
}

export function adminResetUserPassword(
  userId: string,
  newPassword: string,
): Promise<{ message: string }> {
  return real.adminResetUserPassword(userId, newPassword);
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: API keys
// ─────────────────────────────────────────────────────────────────────────────

export function adminListApiKeys(): Promise<{ data: AdminApiKey[] }> {
  return real.adminListApiKeys();
}

export function adminCreateApiKey(input: CreateApiKeyInput): Promise<CreateApiKeyResult> {
  return real.adminCreateApiKey(input);
}

export function adminRevokeApiKey(id: string): Promise<{ message: string }> {
  return real.adminRevokeApiKey(id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: content management
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminListSkillsOptions extends AdminSkillQuery {
  /** Filter by review state; `pending_review` etc. */
  moderation?: string;
}

export function adminListSkills(
  options: AdminListSkillsOptions = {},
): Promise<AdminSkillListResponse> {
  return real.adminListSkills(options);
}

export function adminReviewSkill(
  ref: string,
  action: "approve" | "reject",
): Promise<{ message: string }> {
  return real.adminReviewSkill(ref, action);
}

export function adminSetSkillVisibility(
  ref: string,
  visibility: "public" | "private",
): Promise<{ message: string }> {
  return real.adminSetSkillVisibility(ref, visibility);
}

/**
 * Creates a catalogue entry; uploaded files become its first version and must
 * include `SKILL.md` — without files the listed metadata is the whole entry.
 */
export function adminCreateSkill(
  input: AdminSkillInput,
  files?: File[],
): Promise<{ skill: SkillWithOwner }> {
  return real.adminCreateSkill(input, files);
}

/**
 * Replaces a skill's editable content; uploaded files ride along as a new
 * version — file changes are never written in place.
 */
export function adminUpdateSkill(
  ref: string,
  input: AdminSkillInput,
  files?: File[],
): Promise<{ skill: SkillWithOwner }> {
  return real.adminUpdateSkill(ref, input, files);
}

/** Irreversible removal, together with every version and file it owns. */
export function adminRemoveSkill(ref: string): Promise<{ message: string }> {
  return real.adminRemoveSkill(ref);
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: featured & audit
// ─────────────────────────────────────────────────────────────────────────────

export function adminListFeatures(
  type?: ContentType,
): Promise<{ data: SkillWithOwner[] }> {
  return real.adminListFeatures(type);
}

export function adminReplaceFeatures(
  type: ContentType,
  skillIds: string[],
): Promise<{ message: string }> {
  return real.adminReplaceFeatures(type, skillIds);
}

export function adminAuditLogs(options: AdminAuditQuery = {}): Promise<AuditListResponse> {
  return real.adminAuditLogs(options);
}

/** Action dictionary for the audit page's filter options and display labels. */
export function adminAuditActions(): Promise<{ data: AuditAction[] }> {
  return real.adminAuditActions();
}
