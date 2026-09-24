/**
 * Browser-side API client.
 *
 * Thin wrapper over `fetch` for the `/api/v1` surface, mirroring the shape of
 * the original `web-client` package but without the workspace package indirection.
 * Every call carries `credentials: 'same-origin'` so the `session_token` cookie
 * authenticates the request.
 */

import type {
  AdminApiKey,
  APIToken,
  AuditLog,
  CommentWithUser,
  Namespace,
  NamespaceInvitation,
  NamespaceMemberWithUser,
  Notification,
  Plugin,
  PluginVersion,
  RatingWithUser,
  SkillVersion,
  SkillWithOwner,
  User,
} from './types'

export class ApiError extends Error {
  status: number
  body: Record<string, unknown>
  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body.error === 'string' ? body.error : `HTTP ${status}`)
    this.status = status
    this.body = body
  }
}

const BASE = '/api/v1'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {}
  // Let the browser set Content-Type for FormData so it includes the boundary.
  if (!(init?.body instanceof FormData)) headers['Content-Type'] = 'application/json'

  const res = await fetch(BASE + path, {
    credentials: 'same-origin',
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  })

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>
    throw new ApiError(res.status, body)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

async function requestText(path: string, init?: RequestInit): Promise<string> {
  const res = await fetch(BASE + path, { credentials: 'same-origin', ...init })
  if (!res.ok) throw new ApiError(res.status, {})
  return res.text()
}

export function apiUrl(path: string): string {
  return BASE + path
}

/** Uploads with real progress reporting; `fetch` cannot report upload progress. */
export function uploadWithProgress<T>(
  path: string,
  form: FormData,
  onProgress: (pct: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', BASE + path, true)
    xhr.withCredentials = true
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100))
    })
    xhr.onload = () => {
      let body: Record<string, unknown> = {}
      try {
        body = JSON.parse(xhr.responseText) as Record<string, unknown>
      } catch {
        /* non-JSON body */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T)
      else reject(new ApiError(xhr.status, body))
    }
    xhr.onerror = () => reject(new Error('Network error'))
    xhr.ontimeout = () => reject(new Error('Upload timed out'))
    xhr.send(form)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

/** `null` means "not signed in"; a thrown ApiError means the request itself failed. */
export async function whoami(): Promise<User | null> {
  try {
    return await request<User>('/whoami')
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403)) return null
    throw e
  }
}

export async function login(handle: string, password: string): Promise<void> {
  const body = new URLSearchParams({ handle, password })
  const res = await fetch('/login', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>
    throw new ApiError(res.status, parsed)
  }
}

export async function logout(): Promise<void> {
  await fetch('/logout', { method: 'POST', credentials: 'same-origin' })
}

// ─────────────────────────────────────────────────────────────────────────────
// Skills
// ─────────────────────────────────────────────────────────────────────────────

export interface SkillListResponse {
  data: SkillWithOwner[]
  nextCursor: string
}

export function listSkills(params: {
  limit?: number
  cursor?: string
  sort?: string
  category?: string
  namespace?: string
  q?: string
}): Promise<SkillListResponse> {
  const qs = new URLSearchParams()
  if (params.limit) qs.set('limit', String(params.limit))
  if (params.cursor) qs.set('cursor', params.cursor)
  if (params.sort) qs.set('sort', params.sort)
  if (params.category) qs.set('category', params.category)
  if (params.namespace) qs.set('namespace', params.namespace)
  if (params.q) qs.set('q', params.q)
  const suffix = qs.toString()
  return request<SkillListResponse>(`/skills${suffix ? `?${suffix}` : ''}`)
}

/** `ref` is `slug` or `@namespace/slug`. */
export function getSkill(ref: string): Promise<SkillWithOwner> {
  return request<SkillWithOwner>(`/skills/${encodeURI(ref)}`)
}

export function getSkillVersions(ref: string): Promise<{ versions: SkillVersion[] | null }> {
  return request<{ versions: SkillVersion[] | null }>(`/skills/${encodeURI(ref)}/versions`)
}

export function getSkillFile(ref: string, version: string, path: string): Promise<string> {
  const qs = new URLSearchParams({ version, path })
  return requestText(`/skills/${encodeURI(ref)}/file?${qs}`)
}

export function deleteSkill(ref: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/skills/${encodeURI(ref)}`, { method: 'DELETE' })
}

/** `ref` is `slug` or `@namespace/slug`. An empty `html` clears the detail. */
export function updateSkillDetailHtml(ref: string, html: string): Promise<SkillWithOwner> {
  return request<SkillWithOwner>(`/skills/${encodeURI(ref)}/detail-html`, {
    method: 'PUT',
    body: JSON.stringify({ html }),
  })
}

export function requestPublic(ref: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/skills/${encodeURI(ref)}/request-public`, { method: 'POST' })
}

export function publishSkill(form: FormData): Promise<{ skill: SkillWithOwner; version: SkillVersion }> {
  return request<{ skill: SkillWithOwner; version: SkillVersion }>('/skills', {
    method: 'POST',
    body: form,
  })
}

export function publishSkillWithProgress(
  form: FormData,
  onProgress: (pct: number) => void,
): Promise<{ skill: SkillWithOwner; version: SkillVersion }> {
  return uploadWithProgress('/skills', form, onProgress)
}

export function downloadUrl(ref: { slug: string; namespace?: string }, version = 'latest'): string {
  const qs = new URLSearchParams({ slug: ref.slug, version })
  if (ref.namespace) qs.set('namespace', ref.namespace)
  return apiUrl(`/download?${qs}`)
}

export function categories(): Promise<{ categories: string[] }> {
  return request<{ categories: string[] }>('/categories')
}

export function listFeatures(): Promise<{ data: SkillWithOwner[] }> {
  return request('/features')
}

// ─────────────────────────────────────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────────────────────────────────────

export interface SearchHit {
  id: string
  slug: string
  displayName: string
  summary: string
  displayNameEn: string
  summaryEn: string
  category: string
  tags: string[]
  ownerHandle: string
  namespaceSlug: string
  downloads: number
  stars: number
  updatedAt: number
  createdAt: number
  docType: string
}

export function search(q: string, limit = 20): Promise<{
  hits: SearchHit[]
  query: string
  processingTimeMs: number
  estimatedTotalHits: number
}> {
  const qs = new URLSearchParams({ q, limit: String(limit) })
  return request(`/search?${qs}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Plugins
// ─────────────────────────────────────────────────────────────────────────────

export function listPlugins(params: {
  limit?: number
  cursor?: string
  sort?: string
  category?: string
}): Promise<{ data: Plugin[]; nextCursor: string }> {
  const qs = new URLSearchParams()
  if (params.limit) qs.set('limit', String(params.limit))
  if (params.cursor) qs.set('cursor', params.cursor)
  if (params.sort) qs.set('sort', params.sort)
  if (params.category) qs.set('category', params.category)
  const suffix = qs.toString()
  return request(`/plugins${suffix ? `?${suffix}` : ''}`)
}

export type PluginJson = Plugin & {
  ownerHandle?: string
  namespaceSlug?: string
  /** Present only once a latest version resolves. */
  version?: string
  fingerprint?: string
  sha256Hash?: string
  files?: Array<{ path: string; size: number; sha256: string }>
}

export function getPlugin(ref: string): Promise<PluginJson> {
  return request<PluginJson>(`/plugins/${encodeURI(ref)}`)
}

export function getPluginVersions(ref: string): Promise<{ versions: PluginVersion[] }> {
  return request<{ versions: PluginVersion[] }>(`/plugins/${encodeURI(ref)}/versions`)
}

export function pluginDownloadUrl(slug: string, version = '', namespace = ''): string {
  const qs = new URLSearchParams({ slug })
  if (version) qs.set('version', version)
  if (namespace) qs.set('namespace', namespace)
  return apiUrl(`/plugins/download?${qs}`)
}

export function pluginFileUrl(slug: string, path: string, version = '', namespace = ''): string {
  const qs = new URLSearchParams({ slug, path })
  if (version) qs.set('version', version)
  if (namespace) qs.set('namespace', namespace)
  return apiUrl(`/plugins/file?${qs}`)
}

export function pluginFile(slug: string, path: string, version = '', namespace = ''): Promise<string> {
  const qs = new URLSearchParams({ slug, path })
  if (version) qs.set('version', version)
  if (namespace) qs.set('namespace', namespace)
  return requestText(`/plugins/file?${qs}`)
}

// ─────────────────────────────────────────────────────────────────────────────
// Namespaces
// ─────────────────────────────────────────────────────────────────────────────

export function listNamespaces(): Promise<{ data: Namespace[] }> {
  return request<{ data: Namespace[] }>('/namespaces')
}

export function getNamespace(slug: string): Promise<Namespace> {
  return request<Namespace>(`/namespaces/${encodeURIComponent(slug)}`)
}

export function createNamespace(input: {
  slug: string
  displayName?: string
  description?: string
  type?: string
  defaultVisibility?: string
}): Promise<Namespace> {
  return request<Namespace>('/namespaces', { method: 'POST', body: JSON.stringify(input) })
}

export function listNamespaceMembers(slug: string): Promise<{ data: NamespaceMemberWithUser[] }> {
  return request<{ data: NamespaceMemberWithUser[] }>(
    `/namespaces/${encodeURIComponent(slug)}/members`,
  )
}

export function addNamespaceMember(slug: string, handle: string, role: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/namespaces/${encodeURIComponent(slug)}/members`, {
    method: 'POST',
    body: JSON.stringify({ handle, role }),
  })
}

export function removeNamespaceMember(slug: string, handle: string): Promise<{ message: string }> {
  return request<{ message: string }>(
    `/namespaces/${encodeURIComponent(slug)}/members/${encodeURIComponent(handle)}`,
    { method: 'DELETE' },
  )
}

export function listInvitations(slug: string): Promise<{ data: NamespaceInvitation[] }> {
  return request<{ data: NamespaceInvitation[] }>(
    `/namespaces/${encodeURIComponent(slug)}/invitations`,
  )
}

export function inviteToNamespace(
  slug: string,
  handle: string,
  role: string,
): Promise<NamespaceInvitation> {
  return request<NamespaceInvitation>(`/namespaces/${encodeURIComponent(slug)}/invitations`, {
    method: 'POST',
    body: JSON.stringify({ handle, role }),
  })
}

export function myInvitations(): Promise<{ data: NamespaceInvitation[] }> {
  return request<{ data: NamespaceInvitation[] }>('/invitations')
}

export function respondToInvitation(id: string, action: 'accept' | 'decline'): Promise<{ message: string }> {
  return request<{ message: string }>(`/invitations/${id}/${action}`, { method: 'POST' })
}

// ─────────────────────────────────────────────────────────────────────────────
// Tokens
// ─────────────────────────────────────────────────────────────────────────────

export function listTokens(): Promise<{ data: APIToken[] }> {
  return request<{ data: APIToken[] }>('/tokens')
}

export function createToken(input: {
  label?: string
  scope?: string
  expiresIn?: string
}): Promise<{ token: string; metadata: APIToken }> {
  return request<{ token: string; metadata: APIToken }>('/tokens', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function revokeToken(id: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/tokens/${id}`, { method: 'DELETE' })
}

export function listNamespaceTokens(
  slug: string,
): Promise<{ data: APIToken[]; nextCursor?: string }> {
  return request<{ data: APIToken[]; nextCursor?: string }>(
    `/namespaces/${encodeURIComponent(slug)}/tokens`,
  )
}

export function createNamespaceToken(
  slug: string,
  input: { label?: string; scope?: string; expiresIn: string },
): Promise<{ token: string; metadata: APIToken }> {
  return request<{ token: string; metadata: APIToken }>(
    `/namespaces/${encodeURIComponent(slug)}/tokens`,
    { method: 'POST', body: JSON.stringify(input) },
  )
}

export function revokeNamespaceToken(slug: string, id: string): Promise<{ message: string }> {
  return request<{ message: string }>(
    `/namespaces/${encodeURIComponent(slug)}/tokens/${id}`,
    { method: 'DELETE' },
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Social
// ─────────────────────────────────────────────────────────────────────────────

export function starSkill(ref: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/stars/${encodeURI(ref)}`, { method: 'POST' })
}

export function unstarSkill(ref: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/stars/${encodeURI(ref)}`, { method: 'DELETE' })
}

export function listRatings(ref: string): Promise<{ data: RatingWithUser[]; nextCursor: string }> {
  return request(`/skills/${encodeURI(ref)}/ratings`)
}

export function rateSkill(ref: string, score: number, comment?: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/skills/${encodeURI(ref)}/ratings`, {
    method: 'POST',
    body: JSON.stringify({ score, comment }),
  })
}

export function listComments(ref: string): Promise<{ data: CommentWithUser[]; nextCursor: string }> {
  return request(`/skills/${encodeURI(ref)}/comments`)
}

export function createComment(ref: string, body: string): Promise<unknown> {
  return request(`/skills/${encodeURI(ref)}/comments`, {
    method: 'POST',
    body: JSON.stringify({ body }),
  })
}

export function deleteComment(id: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/comments/${id}`, { method: 'DELETE' })
}

// ─────────────────────────────────────────────────────────────────────────────
// Notifications & admin
// ─────────────────────────────────────────────────────────────────────────────

export function listNotifications(): Promise<{ data: Notification[]; nextCursor: string }> {
  return request('/notifications')
}

export function unreadCount(): Promise<{ unread: number }> {
  return request<{ unread: number }>('/notifications/unread')
}

export function markAllRead(): Promise<{ message: string }> {
  return request<{ message: string }>('/notifications/read-all', { method: 'POST' })
}

export function adminListUsers(cursor = ''): Promise<{ data: User[]; nextCursor: string }> {
  return request(`/admin/users${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`)
}

export function adminCreateUser(input: {
  handle: string
  displayName?: string
  email?: string
  role?: string
}): Promise<User> {
  return request<User>('/admin/users', { method: 'POST', body: JSON.stringify(input) })
}

export function adminSetRole(userId: string, role: string): Promise<{ message: string }> {
  return request<{ message: string }>('/admin/users/role', {
    method: 'POST',
    body: JSON.stringify({ userId, role }),
  })
}

export function adminBanUser(userId: string, reason: string): Promise<{ message: string }> {
  return request<{ message: string }>('/admin/users/ban', {
    method: 'POST',
    body: JSON.stringify({ userId, reason }),
  })
}

export function adminCreateToken(input: {
  userId: string
  label?: string
  scope?: string
}): Promise<{ token: string; metadata: APIToken }> {
  return request<{ token: string; metadata: APIToken }>('/admin/tokens', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function adminListSkills(
  visibility = '',
  cursor = '',
  limit = 20,
): Promise<{ data: SkillWithOwner[]; nextCursor: string }> {
  const qs = new URLSearchParams()
  if (visibility) qs.set('visibility', visibility)
  if (cursor) qs.set('cursor', cursor)
  if (limit) qs.set('limit', String(limit))
  const suffix = qs.toString()
  return request(`/admin/skills${suffix ? `?${suffix}` : ''}`)
}

export function adminListFeatures(): Promise<{ data: SkillWithOwner[] }> {
  return request('/admin/features')
}

export function adminReplaceFeatures(skillIds: string[]): Promise<{ message: string }> {
  return request('/admin/features', { method: 'PUT', body: JSON.stringify({ skillIds }) })
}

export type AdminPlugin = Plugin & {
  ownerHandle?: string
  namespaceSlug?: string
}

export function adminListPlugins(
  visibility = '',
  cursor = '',
  limit = 20,
): Promise<{ data: AdminPlugin[]; nextCursor: string }> {
  const qs = new URLSearchParams()
  if (visibility) qs.set('visibility', visibility)
  if (cursor) qs.set('cursor', cursor)
  if (limit) qs.set('limit', String(limit))
  const suffix = qs.toString()
  return request(`/admin/plugins${suffix ? `?${suffix}` : ''}`)
}

export function adminReviewSkill(ref: string, action: 'approve' | 'reject'): Promise<{ message: string }> {
  return request<{ message: string }>(`/admin/skills/${encodeURI(ref)}/review`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  })
}

export function adminReviewPlugin(ref: string, action: 'approve' | 'reject'): Promise<{ message: string }> {
  return request<{ message: string }>(`/admin/plugins/${encodeURI(ref)}/review`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  })
}

export function adminSetSkillVisibility(ref: string, visibility: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/admin/skills/${encodeURI(ref)}/visibility`, {
    method: 'POST',
    body: JSON.stringify({ visibility }),
  })
}

export function adminSetPluginVisibility(ref: string, visibility: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/admin/plugins/${encodeURI(ref)}/visibility`, {
    method: 'POST',
    body: JSON.stringify({ visibility }),
  })
}

export function adminListApiKeys(): Promise<{ data: AdminApiKey[] }> {
  return request<{ data: AdminApiKey[] }>('/admin/api-keys')
}

export function adminCreateApiKey(input: {
  name: string
  scopes: string[]
  namespaceSlug?: string
  expiresIn?: string
}): Promise<{ key: string; metadata: AdminApiKey }> {
  return request<{ key: string; metadata: AdminApiKey }>('/admin/api-keys', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function adminRevokeApiKey(id: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/admin/api-keys/${id}`, { method: 'DELETE' })
}

export function adminAuditLogs(options: {
  limit?: number
  cursor?: string
  action?: string
  resourceType?: string
} = {}): Promise<{ data: AuditLog[]; nextCursor: string }> {
  const qs = new URLSearchParams({ limit: String(options.limit ?? 50) })
  if (options.cursor) qs.set('cursor', options.cursor)
  if (options.action) qs.set('action', options.action)
  if (options.resourceType) qs.set('resource_type', options.resourceType)
  return request(`/admin/audit-logs?${qs}`)
}
