/**
 * Adapter for the real SkillHub backend (`src/server`, rewritten from
 * saker-ai/skillhub).
 *
 * The live backend is documented by its own source and differs from the demo
 * contract the UI was originally built against:
 *
 *   - No response envelope. Successful JSON responses are the payload itself
 *     (e.g. `{ data, nextCursor, total }`, `{ categories: [...] }`, or a bare
 *     skill/user object). Errors are HTTP-status-driven (`ApiError`).
 *   - Cursor pagination for lists: send `cursor` (opaque id) + `limit`; the
 *     response carries the next `cursor` ("" when exhausted) and a `total`.
 *   - Content type travels as `type` with the wire values `skill` /
 *     `knowledge_base` (the UI narrows that to `skill` / `knowledge`).
 *   - Visibility travels as `listing` (`listed` / `unlisted`), not
 *     `visibility` / `moderationStatus` — those derived fields are synthesised
 *     here, and the backend has no moderation state to expose.
 *   - Auth is plaintext password + scrypt on the server. There is **no** AES
 *     pre-encryption step on the client.
 *
 * Everything here translates that backend dialect back into the internal shapes
 * the UI consumes, so hooks and components never see the difference.
 */

import { apiLangHeader } from "../../i18n/config";
import { ApiError } from "./errors";
import type {
  AdminApiKey,
  AdminAuditQuery,
  AdminSkillInput,
  AdminSkillListResponse,
  ApiKeyScope,
  AuditAction,
  AuditLog,
  AuditListResponse,
  Brand,
  ContentType,
  CreateApiKeyInput,
  CreateApiKeyResult,
  CreateUserInput,
  RegisterInput,
  RegisterResult,
  SkillListResponse,
  SkillVersion,
  SkillWithOwner,
  User,
  UserListResponse,
  UserRole,
  VersionFile,
  VersionsResponse,
} from "./types";
import { API_KEY_SCOPES } from "./types";

const BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");

// ─────────────────────────────────────────────────────────────────────────────
// Loose JSON helpers (the backend mixes typed VOs with dynamic Maps)
// ─────────────────────────────────────────────────────────────────────────────

type Loose = Record<string, unknown>;

function obj(value: unknown): Loose {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Loose)
    : {};
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  return String(value);
}

function num(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function flag(value: unknown): boolean {
  return value === true || value === 1 || value === "1" || value === "true";
}

/** First non-nullish value among `keys` — some responses are dynamic Maps. */
function pick(source: Loose, keys: string[]): unknown {
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function qs(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const suffix = search.toString();
  return suffix ? `?${suffix}` : "";
}

/**
 * The backend returns the payload directly (no `Resp<T>` envelope). This is a
 * pass-through that only normalises a failed-API shape into an `ApiError`.
 */
function unwrap<T>(body: unknown): T {
  return body as T;
}

async function realFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  // Every call carries the UI language: 1 Simplified / 2 Traditional / 3 English.
  headers.set("lang", apiLangHeader());
  const isRawBody = init.body instanceof FormData || init.body instanceof URLSearchParams;
  if (init.body && !isRawBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: "include",
    ...init,
    headers,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new ApiError(res.status, body);
  }
  if (res.status === 204) return undefined as T;

  const text = await res.text();
  if (!text) return undefined as T;
  let parsed: unknown = text;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text as unknown as T;
  }
  return unwrap<T>(parsed);
}

// ─────────────────────────────────────────────────────────────────────────────
// Field mappers: backend VO → internal domain types
// ─────────────────────────────────────────────────────────────────────────────

function mapUser(vo: Loose): User {
  const status = str(vo.status);
  return {
    id: String(vo.id ?? ""),
    handle: str(vo.handle) ?? "",
    displayName: str(vo.displayName),
    avatarUrl: str(vo.avatarUrl),
    email: str(vo.email),
    country: str(vo.country),
    officeLocation: str(vo.officeLocation),
    // The backend profile fields are `organization` / `jobTitle` /
    // `researchNeeds` / `markets`; the UI renames them for display.
    orgName: str(vo.organization),
    position: str(vo.jobTitle),
    researchNeed: str(vo.researchNeeds),
    focusMarkets: arr(vo.markets).map((market) => String(market)),
    role: vo.role === "admin" ? "admin" : "user",
    status: status === "pending" || status === "rejected" ? status : "approved",
    isBanned: flag(vo.isBanned),
    banReason: str(vo.banReason),
    reviewNote: str(vo.reviewNote),
    reviewedAt: str(vo.reviewedAt),
    // The whoami payload omits these counters; the admin list reports them.
    // Default to 0 so the typed `User` is always complete.
    downloadCount: num(vo.downloadCount),
    skillDownloadCount: num(vo.skillDownloadCount) || num(vo.downloadCount),
    knowledgeDownloadCount: num(vo.knowledgeBaseDownloadCount),
    loginCount: num(vo.loginCount),
    createdAt: str(vo.createdAt) ?? "",
    updatedAt: str(vo.updatedAt) ?? "",
  };
}

/** Normalises the wire content type; anything unknown reads as a skill. */
function mapContentType(value: unknown): ContentType {
  return value === "knowledge_base" ? "knowledge" : "skill";
}

/** Backend `listing` ('listed' | 'unlisted') → internal `visibility`. */
function mapVisibility(value: unknown): "public" | "private" {
  return value === "listed" ? "public" : "private";
}

function mapSkill(vo: Loose): SkillWithOwner {
  const tags = Array.isArray(vo.tags) ? (vo.tags as unknown[]).map(String) : [];
  const listing = mapVisibility(vo.listing);
  return {
    id: String(vo.id ?? ""),
    slug: str(vo.slug) ?? "",
    contentType: mapContentType(vo.type),
    displayName: str(vo.displayName),
    summary: str(vo.summary),
    displayNameEn: str(vo.displayNameEn),
    summaryEn: str(vo.summaryEn),
    ownerId: String(vo.ownerId ?? ""),
    namespaceId:
      vo.namespaceId === null || vo.namespaceId === undefined
        ? undefined
        : String(vo.namespaceId),
    // The backend has no moderation state; every listed entry is approved.
    visibility: listing,
    moderationStatus: "approved",
    kind: ((str(vo.kind) as SkillWithOwner["kind"]) ?? "custom"),
    detailHtml: str(vo.detailHtml),
    detailHtmlEn: str(vo.detailHtmlEn),
    category: str(vo.category) ?? "general",
    tags,
    downloads: num(vo.downloads),
    installs: num(vo.installs),
    starsCount: num(vo.starsCount),
    versionsCount: num(vo.versionsCount),
    createdAt: str(vo.createdAt) ?? "",
    updatedAt: str(vo.updatedAt) ?? "",
    ...(str(vo.softDeletedAt)
      ? { softDeletedAt: str(vo.softDeletedAt) }
      : {}),
    ownerHandle: str(vo.ownerHandle) ?? "",
    ownerDisplayName: str(vo.ownerDisplayName),
    namespaceSlug: str(vo.namespaceSlug) ?? "",
    ...(vo.starred === undefined ? {} : { starred: flag(vo.starred) }),
  };
}

function mapVersionFile(vo: Loose): VersionFile {
  return {
    path: str(vo.path) ?? "",
    size: num(vo.size),
    sha256: str(vo.sha256) ?? "",
    contentType: str(vo.contentType),
  };
}

function mapVersion(vo: Loose): SkillVersion {
  return {
    id: String(vo.id ?? ""),
    skillId: String(vo.skillId ?? ""),
    version: str(vo.version) ?? "",
    fingerprint: str(vo.fingerprint) ?? "",
    changelog: str(vo.changelog),
    files: arr(vo.files).map((file) => mapVersionFile(obj(file))),
    createdAt: str(vo.createdAt) ?? "",
    yankedAt: str(vo.yankedAt),
    deprecatedAt: str(vo.deprecatedAt),
    dependencies: arr(vo.dependencies).map((dep) => {
      const d = obj(dep);
      return {
        slug: str(d.slug) ?? "",
        namespace: str(d.namespace),
        version: str(d.version) ?? "",
      };
    }),
  };
}

function mapAuditLog(vo: Loose): AuditLog {
  return {
    id: String(vo.id ?? ""),
    actorId:
      vo.actorId === null || vo.actorId === undefined ? undefined : String(vo.actorId),
    actorHandle: str(vo.actorHandle),
    action: str(vo.action) ?? "",
    actionDescription: str(vo.actionDescription),
    resourceType: str(vo.resourceType) ?? "",
    contentType:
      vo.contentType === "knowledge" || vo.contentType === "knowledge_base"
        ? "knowledge"
        : vo.contentType === "skill"
          ? "skill"
          : undefined,
    resourceId: str(vo.resourceId),
    details: str(vo.details),
    ipAddress: str(vo.ipAddress),
    createdAt: str(vo.createdAt) ?? "",
  };
}

function mapAuditAction(vo: Loose): AuditAction {
  return {
    action: str(vo.action) ?? "",
    description: str(vo.description) ?? str(vo.action) ?? "",
    resourceType: str(vo.resourceType) ?? "",
  };
}

function mapApiKey(vo: Loose): AdminApiKey {
  return {
    id: String(vo.id ?? ""),
    name: str(vo.name) ?? "",
    createdBy: String(vo.createdBy ?? ""),
    createdByHandle: str(vo.createdByHandle),
    prefix: str(vo.prefix) ?? "",
    secret: str(vo.secret),
    scopes: arr(vo.scopes)
      .map((scope) => String(scope))
      .filter((scope): scope is ApiKeyScope =>
        (API_KEY_SCOPES as readonly string[]).includes(scope),
      ),
    lastUsedAt: str(vo.lastUsedAt),
    expiresAt: str(vo.expiresAt),
    createdAt: str(vo.createdAt) ?? "",
    revokedAt: str(vo.revokedAt),
  };
}

interface MappedPage {
  list: Loose[];
  total: number;
  nextCursor: string;
}

/**
 * Accepts either the real backend cursor shape (`{ data, nextCursor, total }`)
 * or a legacy pageNum/`PageInfo` shape, so both admin lists and any other
 * paged endpoint parse consistently. Prefers a real `nextCursor` when present.
 */
function mapPage(value: unknown): MappedPage {
  const root = obj(value);
  const listValue =
    pick(root, ["list", "records", "items", "data", "users", "skills", "keys", "apiKeys"]) ??
    root;
  const list = arr(listValue).map(obj);
  const total = num(root.total, list.length);
  const nextCursorRaw = str(root.nextCursor);
  if (nextCursorRaw !== undefined && nextCursorRaw !== "") {
    return { list, total, nextCursor: nextCursorRaw };
  }
  const pageNum = num(root.pageNum, 1);
  const pages = num(root.pages, 0);
  const hasNext =
    root.hasNextPage === undefined ? pages > pageNum : flag(root.hasNextPage);
  return { list, total, nextCursor: hasNext ? String(pageNum + 1) : "" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Ref helpers: `slug` or `@namespace/slug`
// ─────────────────────────────────────────────────────────────────────────────

function splitRef(ref: string): { ns?: string; slug: string } {
  const slash = ref.indexOf("/");
  const first = slash === -1 ? ref : ref.slice(0, slash);
  if (first.startsWith("@") && slash !== -1) {
    return { ns: first.slice(1), slug: ref.slice(slash + 1) };
  }
  return { slug: ref };
}

export function skillBase(ref: string): string {
  const { ns, slug } = splitRef(ref);
  if (ns) {
    return `/api/v1/skills/@${encodeURIComponent(ns)}/${encodeURIComponent(slug)}`;
  }
  return `/api/v1/skills/${encodeURIComponent(slug)}`;
}

function adminSkillBase(ref: string): string {
  const { ns, slug } = splitRef(ref);
  if (ns) {
    // The admin routes expect the namespace segment WITH its `@` prefix
    // (a = "@namespace"); omitting it answers 404.
    return `/api/v1/admin/skills/@${encodeURIComponent(ns)}/${encodeURIComponent(slug)}`;
  }
  return `/api/v1/admin/skills/${encodeURIComponent(slug)}`;
}

function starBase(ref: string): string {
  const { ns, slug } = splitRef(ref);
  if (ns) {
    return `/api/v1/stars/@${encodeURIComponent(ns)}/${encodeURIComponent(slug)}`;
  }
  return `/api/v1/stars/${encodeURIComponent(slug)}`;
}

const ok = (): { message: string } => ({ message: "ok" });

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

export async function whoami(): Promise<User | null> {
  try {
    return mapUser(obj(await realFetch<unknown>("/api/v1/whoami")));
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
      return null;
    }
    throw error;
  }
}

export async function login(handle: string, password: string): Promise<void> {
  // The backend compares the clear-text password against a scrypt hash; there
  // is no client-side encryption step.
  await realFetch<unknown>("/login", {
    method: "POST",
    body: JSON.stringify({ handle, password }),
  });
}

export async function logout(): Promise<void> {
  await realFetch<unknown>("/logout", { method: "POST" });
}

export async function register(input: RegisterInput): Promise<RegisterResult> {
  const payload: Loose = {
    handle: input.handle,
    password: input.password,
    emailCode: input.emailCode,
    displayName: input.displayName,
    email: input.email,
    country: input.country,
    // The affiliation travels as `organization` (a free-text string in this
    // backend; there is no brand directory).
    organization: input.organization,
    jobTitle: input.jobTitle,
    researchNeed: input.researchNeeds,
    focusMarkets: input.markets,
  };
  // The only optional field, so it is only sent when filled in.
  if (input.officeLocation) payload.officeLocation = input.officeLocation;

  const res = obj(
    await realFetch<unknown>("/register", { method: "POST", body: JSON.stringify(payload) }),
  );
  const status = str(pick(res, ["status"]));
  return {
    ok: true,
    status: status === "approved" || status === "rejected" ? status : "pending",
  };
}

/**
 * Sends (or re-sends) the sign-up verification code to `email`. NOTE: the
 * current backend does not expose an email-code endpoint, so this is a no-op
 * stub until registration wiring is (re)added — kept so the UI compiles.
 */
export async function sendEmailCode(email: string): Promise<void> {
  await realFetch<unknown>("/api/v1/email-code", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function registrationStatus(): Promise<{ enabled: boolean }> {
  const res = obj(await realFetch<unknown>("/api/v1/registration"));
  return { enabled: flag(pick(res, ["enabled", "registrationEnabled", "open", "allowRegister"])) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Catalogue
// ─────────────────────────────────────────────────────────────────────────────

export interface RealListSkillsParams {
  limit?: number;
  cursor?: string;
  sort?: string;
  category?: string;
  q?: string;
  namespace?: string;
  /** Content-type filter as the UI knows it (`skill` / `knowledge`). */
  type?: ContentType;
}

/** Maps the UI's `hot` ranking onto the backend's `downloads` sort. */
function mapSort(sort?: string): string | undefined {
  if (sort === "hot") return "downloads";
  return sort;
}

export async function listSkills(
  params: RealListSkillsParams = {},
): Promise<SkillListResponse> {
  const typeParam =
    params.type === "knowledge"
      ? "knowledge_base"
      : params.type === "skill"
        ? "skill"
        : undefined;
  const root = obj(
    await realFetch<unknown>(
      `/api/v1/skills${qs({
        category: params.category,
        namespace: params.namespace,
        q: params.q,
        sort: mapSort(params.sort),
        type: typeParam,
        limit: params.limit,
        cursor: params.cursor,
      })}`,
    ),
  );
  const rawTotal = root.total;
  return {
    data: arr(root.data).map((entry) => mapSkill(obj(entry))),
    nextCursor: str(root.nextCursor) ?? "",
    total: typeof rawTotal === "number" ? rawTotal : undefined,
  };
}

export async function getSkill(ref: string): Promise<SkillWithOwner> {
  return mapSkill(obj(await realFetch<unknown>(skillBase(ref))));
}

export async function getSkillVersions(ref: string): Promise<VersionsResponse> {
  const res = await realFetch<unknown>(`${skillBase(ref)}/versions`);
  const root = obj(res);
  const listValue = pick(root, ["versions", "list", "items", "data"]) ?? res;
  const versions = arr(listValue).map((version) => mapVersion(obj(version)));
  return { versions: versions.length > 0 ? versions : null };
}

export async function getSkillFile(
  ref: string,
  version: string,
  path: string,
): Promise<string> {
  const res = await realFetch<unknown>(
    `${skillBase(ref)}/file${qs({ version: version || "latest", path: path || "SKILL.md" })}`,
  );
  return typeof res === "string" ? res : JSON.stringify(res);
}

/** Categories the catalogue actually holds — drives the browse sidebar. */
export async function listCategories(): Promise<{ categories: string[] }> {
  const res = obj(await realFetch<unknown>("/api/v1/categories/in-use"));
  const listValue = pick(res, ["categories", "list", "items", "data"]) ?? res;
  const categories = arr(listValue)
    .map((entry) => (typeof entry === "string" ? entry : str(pick(obj(entry), ["slug", "code", "value", "name"]))))
    .filter((entry): entry is string => Boolean(entry));
  return { categories };
}

/** Curated skills for the home "Featured" strips (raw `{ data: [...] }`). */
export async function listFeatures(): Promise<{ data: SkillWithOwner[] }> {
  const res = obj(await realFetch<unknown>("/api/v1/features"));
  const listValue = pick(res, ["skills", "features", "list", "items", "data"]) ?? res;
  return { data: arr(listValue).map((entry) => mapSkill(obj(entry))) };
}

/**
 * Organisation brands for the affiliation picker. The live backend has no brand
 * directory, so this is an empty stub until that concept is (re)introduced.
 */
export async function listBrands(): Promise<{ data: Brand[] }> {
  return { data: [] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stars
// ─────────────────────────────────────────────────────────────────────────────

export async function starSkill(ref: string): Promise<{ message: string }> {
  await realFetch<unknown>(starBase(ref), { method: "POST" });
  return ok();
}

export async function unstarSkill(ref: string): Promise<{ message: string }> {
  await realFetch<unknown>(starBase(ref), { method: "DELETE" });
  return ok();
}

export async function listStarredSkills(
  params: { limit?: number; cursor?: string } = {},
): Promise<SkillListResponse> {
  const page = mapPage(
    await realFetch<unknown>(
      `/api/v1/stars${qs({
        limit: params.limit,
        cursor: params.cursor,
      })}`,
    ),
  );
  const data = page.list.map(mapSkill);
  return { data, nextCursor: page.nextCursor, total: page.total };
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: users
// ─────────────────────────────────────────────────────────────────────────────

export interface RealAdminUsersQuery {
  page?: number;
  pageSize?: number;
  status?: string;
  keyword?: string;
  /** true = banned only, false = active only, omitted = no ban filtering. */
  banned?: boolean;
  cursor?: string;
}

export async function adminListUsers(
  options: RealAdminUsersQuery = {},
): Promise<UserListResponse> {
  const page = mapPage(
    await realFetch<unknown>(
      `/api/v1/admin/users${qs({
        status: options.status,
        // The user listing is cursor-paged; there is no numbered page mode.
        cursor: options.cursor,
        keyword: options.keyword,
        banned: options.banned === undefined ? undefined : String(options.banned),
      })}`,
    ),
  );
  return {
    data: page.list.map(mapUser),
    nextCursor: page.nextCursor,
    pendingCount: 0,
    total: page.total,
  };
}

export async function adminReviewUser(
  userId: string,
  action: "approve" | "reject",
  note = "",
): Promise<{ message: string }> {
  await realFetch<unknown>("/api/v1/admin/users/review", {
    method: "POST",
    body: JSON.stringify({ userId: String(userId), action, note }),
  });
  return ok();
}

export async function adminCreateUser(
  input: CreateUserInput,
): Promise<User & { initialPassword?: string }> {
  const payload: Loose = { handle: input.handle };
  if (input.displayName) payload.displayName = input.displayName;
  if (input.email) payload.email = input.email;
  if (input.role) payload.role = input.role;
  // Plaintext password — the backend scrypt-hashes it. No client encryption.
  if (input.password) payload.password = input.password;
  if (input.confirmPassword) payload.confirmPassword = input.confirmPassword;
  if (input.country) payload.country = input.country;
  if (input.organization) payload.organization = input.organization;
  if (input.jobTitle) payload.jobTitle = input.jobTitle;
  if (input.researchNeeds) payload.researchNeeds = input.researchNeeds;
  if (input.markets) payload.markets = input.markets;
  if (input.officeLocation) payload.officeLocation = input.officeLocation;

  return mapUser(
    obj(
      await realFetch<unknown>("/api/v1/admin/users", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    ),
  );
}

export async function adminBanUser(
  userId: string,
  reason?: string,
): Promise<{ message: string }> {
  // One endpoint for both directions: a reason bans, an empty reason lifts the
  // ban.
  const payload: Loose = { userId: String(userId) };
  if (reason) payload.reason = reason;
  await realFetch<unknown>("/api/v1/admin/users/ban", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  return ok();
}

export async function adminSetRole(
  userId: string,
  role: UserRole,
): Promise<{ message: string }> {
  await realFetch<unknown>("/api/v1/admin/users/role", {
    method: "POST",
    body: JSON.stringify({ userId: String(userId), role }),
  });
  return ok();
}

export async function adminResetUserPassword(
  userId: string,
  newPassword: string,
): Promise<{ message: string }> {
  await realFetch<unknown>("/api/v1/admin/users/password", {
    method: "POST",
    body: JSON.stringify({ userId: String(userId), password: newPassword }),
  });
  return ok();
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: API keys
// ─────────────────────────────────────────────────────────────────────────────

export async function adminListApiKeys(): Promise<{ data: AdminApiKey[] }> {
  const res = obj(await realFetch<unknown>("/api/v1/admin/api-keys"));
  const listValue = pick(res, ["keys", "apiKeys", "list", "items", "data"]) ?? res;
  return { data: arr(listValue).map((entry) => mapApiKey(obj(entry))) };
}

export async function adminCreateApiKey(
  input: CreateApiKeyInput,
): Promise<CreateApiKeyResult> {
  const payload: Loose = { name: input.name, scopes: input.scopes };
  if (input.expiresIn && input.expiresIn !== "never") payload.expiresIn = input.expiresIn;

  const vo = obj(
    await realFetch<unknown>("/api/v1/admin/api-keys", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  );
  return { key: str(vo.secret) ?? str(vo.prefix) ?? "", metadata: mapApiKey(vo) };
}

export async function adminRevokeApiKey(id: string): Promise<{ message: string }> {
  await realFetch<unknown>(`/api/v1/admin/api-keys/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  return ok();
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: content management
// ─────────────────────────────────────────────────────────────────────────────

export interface RealAdminSkillQuery {
  visibility?: string;
  moderation?: string;
  type?: ContentType;
  page?: number;
  limit?: number;
  cursor?: string;
}

export async function adminListSkills(
  options: RealAdminSkillQuery = {},
): Promise<AdminSkillListResponse> {
  const typeParam =
    options.type === "knowledge"
      ? "knowledge_base"
      : options.type === "skill"
        ? "skill"
        : undefined;
  const page = mapPage(
    await realFetch<unknown>(
      `/api/v1/admin/skills${qs({
        // The backend filters the shelf state by `listing` ('listed' /
        // 'unlisted'), and pages by `page` (numbered) **or** `cursor` — they are
        // two different modes, not interchangeable.
        listing:
          options.visibility === "public"
            ? "listed"
            : options.visibility === "private"
              ? "unlisted"
              : undefined,
        type: typeParam,
        cursor: options.cursor,
        page: options.page && options.page > 0 ? options.page : undefined,
        limit: options.limit,
      })}`,
    ),
  );

  let data = page.list.map(mapSkill);
  let total = page.total;
  let nextCursor = page.nextCursor;
  if (options.moderation) {
    data = data.filter((skill) => skill.moderationStatus === options.moderation);
    total = data.length;
    nextCursor = "";
  }
  return { data, nextCursor, total };
}

/**
 * Approves or rejects a skill. NOTE: the live backend has no per-skill review
 * state, so this endpoint does not exist yet — kept so the UI compiles.
 */
export async function adminReviewSkill(
  ref: string,
  action: "approve" | "reject",
): Promise<{ message: string }> {
  await realFetch<unknown>(`${adminSkillBase(ref)}/review`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
  return ok();
}

/** Takes a skill on or off the shelf (backend `listing` route). */
export async function adminSetSkillVisibility(
  ref: string,
  visibility: "public" | "private",
): Promise<{ message: string }> {
  await realFetch<unknown>(`${adminSkillBase(ref)}/listing`, {
    method: "POST",
    body: JSON.stringify({ listing: visibility === "public" ? "listed" : "unlisted" }),
  });
  return ok();
}

/**
 * Packs the console form. Create always goes out as multipart (the backend
 * documents it that way); updates stay JSON unless files ride along.
 */
function skillFormBody(
  input: AdminSkillInput,
  files: File[] | undefined,
  forceMultipart: boolean,
): BodyInit {
  if (!forceMultipart && (!files || files.length === 0)) {
    // The backend form contract names the content type `type` (default
    // `skill`); sending `contentType` would silently create skills.
    const { contentType, ...rest } = input;
    return JSON.stringify({ ...rest, type: contentType });
  }

  const form = new FormData();
  form.set("slug", input.slug ?? "");
  form.set("type", input.contentType === "knowledge" ? "knowledge_base" : "skill");
  form.set("displayName", input.displayName);
  form.set("summary", input.summary);
  form.set("displayNameEn", input.displayNameEn);
  form.set("summaryEn", input.summaryEn);
  form.set("category", input.category);
  form.set("tags", input.tags.join(","));
  form.set("visibility", input.visibility);
  form.set("html", input.html);
  form.set("htmlEn", input.htmlEn);
  for (const file of files ?? []) {
    form.append("files", file, file.webkitRelativePath || file.name);
  }
  return form;
}

/** Maps a create/update response; falls back to the submitted form when the
 * backend answer carries no skill payload (the console only needs success). */
function createdSkillResult(
  res: unknown,
  input: AdminSkillInput,
): { skill: SkillWithOwner } {
  const payload = obj(res);
  const candidate = pick(payload, ["skill", "data", "vo", "item"]);
  const skillVo =
    candidate !== undefined
      ? obj(candidate)
      : payload.slug !== undefined
        ? payload
        : undefined;
  if (skillVo) return { skill: mapSkill(skillVo) };

  return {
    skill: {
      id: "",
      slug: input.slug ?? "",
      contentType: input.contentType,
      displayName: input.displayName,
      summary: input.summary,
      displayNameEn: input.displayNameEn,
      summaryEn: input.summaryEn,
      ownerId: "",
      visibility: input.visibility,
      moderationStatus: "approved",
      kind: "custom",
      category: input.category,
      tags: input.tags,
      downloads: 0,
      installs: 0,
      starsCount: 0,
      versionsCount: 0,
      createdAt: "",
      updatedAt: "",
      ownerHandle: "",
      namespaceSlug: "",
    },
  };
}

export async function adminCreateSkill(
  input: AdminSkillInput,
  files?: File[],
): Promise<{ skill: SkillWithOwner }> {
  const res = await realFetch<unknown>("/api/v1/admin/skills", {
    method: "POST",
    body: skillFormBody(input, files, true),
  });
  return createdSkillResult(res, input);
}

export async function adminUpdateSkill(
  ref: string,
  input: AdminSkillInput,
  files?: File[],
): Promise<{ skill: SkillWithOwner }> {
  const res = await realFetch<unknown>(adminSkillBase(ref), {
    method: "PUT",
    body: skillFormBody(input, files, false),
  });
  return createdSkillResult(res, input);
}

export async function adminRemoveSkill(ref: string): Promise<{ message: string }> {
  await realFetch<unknown>(skillBase(ref), { method: "DELETE" });
  return ok();
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin: featured & audit
// ─────────────────────────────────────────────────────────────────────────────

export async function adminListFeatures(
  type?: ContentType,
): Promise<{ data: SkillWithOwner[] }> {
  const typeParam =
    type === "knowledge" ? "knowledge_base" : type === "skill" ? "skill" : undefined;
  const res = obj(
    await realFetch<unknown>(`/api/v1/admin/features${typeParam ? qs({ type: typeParam }) : ""}`),
  );
  const listValue = pick(res, ["skills", "features", "list", "items", "data"]) ?? res;
  return { data: arr(listValue).map((entry) => mapSkill(obj(entry))) };
}

export async function adminReplaceFeatures(
  type: ContentType,
  skillIds: string[],
): Promise<{ message: string }> {
  const typeParam = type === "knowledge" ? "knowledge_base" : "skill";
  await realFetch<unknown>("/api/v1/admin/features", {
    method: "PUT",
    // `type` scopes the replacement to one strip; without it the backend
    // would rewrite every featured slot.
    body: JSON.stringify({ skillIds, type: typeParam }),
  });
  return ok();
}

export async function adminAuditLogs(
  options: AdminAuditQuery = {},
): Promise<AuditListResponse> {
  const page = mapPage(
    await realFetch<unknown>(
      `/api/v1/admin/audit-logs${qs({
        action: options.action,
        // The backend names this filter `resource_type` (snake_case).
        resource_type: options.resourceType,
        cursor: options.cursor,
        limit: options.limit,
      })}`,
    ),
  );
  return { data: page.list.map(mapAuditLog), nextCursor: page.nextCursor, total: page.total };
}

/** The action dictionary backing the audit page's filters and labels. */
export async function adminAuditActions(): Promise<{ data: AuditAction[] }> {
  const res = obj(await realFetch<unknown>("/api/v1/admin/audit-actions"));
  return { data: arr(res).map((entry) => mapAuditAction(obj(entry))) };
}
