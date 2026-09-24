/**
 * The HTTP route table.
 *
 * Kept as one explicit list so it can be diffed against the original
 * `pkg/server/routes.go` by eye. Patterns use the same syntax gin did, including
 * the `@:namespace` segment: a path segment beginning with `@` followed by a
 * capture.
 *
 * Ordering is handled by specificity (static segments beat parameters), so
 * `/api/v1/plugins/by-id/:id` is tried before `/api/v1/plugins/:slug` without
 * relying on declaration order here.
 */

import { compileRoutes, dispatch, type RouteDef } from '../http'
import * as h from './handlers'
import type { ApiKeyScope } from '../../lib/types'

// Shorthands for the three middleware postures used across the table.
const pub = { auth: 'public', bucket: 'read' } as const
const opt = { auth: 'optional', bucket: 'read' } as const
const authed = { auth: 'required', bucket: 'write' } as const

/**
 * Capability an admin API key needs to call a route. Routes left unannotated
 * reject every key, so a key issued to drive the skill catalogue cannot drift
 * into user, plugin or namespace administration.
 */
const K_READ = { apiKeyScope: 'skills:read' } as const satisfies { apiKeyScope: ApiKeyScope }
const K_PUBLISH = { apiKeyScope: 'skills:publish' } as const satisfies { apiKeyScope: ApiKeyScope }
const K_DELETE = { apiKeyScope: 'skills:delete' } as const satisfies { apiKeyScope: ApiKeyScope }
const K_MODERATE = { apiKeyScope: 'skills:moderate' } as const satisfies { apiKeyScope: ApiKeyScope }

/** Response headers marking the legacy slug-addressed skill routes as deprecated. */
const SUNSET = '2026-12-31'

function buildRoutes(): RouteDef[] {
  return [
    // ── Discovery ────────────────────────────────────────────────────────────
    { method: 'GET', path: '/healthz', handler: h.discovery.healthz, auth: 'public', bucket: 'none' },
    { method: 'GET', path: '/readyz', handler: h.discovery.readyz, auth: 'public', bucket: 'none' },
    { method: 'GET', path: '/metrics', handler: h.discovery.metrics, auth: 'public', bucket: 'none' },
    { method: 'GET', path: '/.well-known/clawhub.json', handler: h.discovery.clawhubJson, auth: 'public', bucket: 'none' },
    { method: 'GET', path: '/skills.md', handler: h.discovery.skillsMd, auth: 'public', bucket: 'none' },

    // ── Session ──────────────────────────────────────────────────────────────
    { method: 'POST', path: '/login', handler: h.auth.login, auth: 'optional', bucket: 'write' },
    { method: 'POST', path: '/logout', handler: h.auth.logout, auth: 'optional', bucket: 'none' },

    // ── Device flow (both mount points; the CLI expects the /api/v1 alias) ───
    { method: 'POST', path: '/auth/device/code', handler: h.auth.deviceCode, auth: 'public', bucket: 'write' },
    { method: 'GET', path: '/auth/device/verify', handler: h.auth.deviceVerifyPage, auth: 'optional', bucket: 'write' },
    { method: 'POST', path: '/auth/device/verify', handler: h.auth.deviceVerifySubmit, auth: 'required', bucket: 'write' },
    { method: 'POST', path: '/auth/device/token', handler: h.auth.deviceToken, auth: 'public', bucket: 'write' },
    { method: 'POST', path: '/api/v1/auth/device/code', handler: h.auth.deviceCode, auth: 'public', bucket: 'write' },
    { method: 'POST', path: '/api/v1/auth/device/verify', handler: h.auth.deviceVerifySubmit, auth: 'required', bucket: 'write' },
    { method: 'POST', path: '/api/v1/auth/device/token', handler: h.auth.deviceToken, auth: 'public', bucket: 'write' },

    // ── Search & browsing ────────────────────────────────────────────────────
    { method: 'GET', path: '/api/v1/search', handler: h.skillRead.search, ...opt, ...K_READ },
    { method: 'GET', path: '/api/v1/categories', handler: h.skillRead.categories, ...opt, ...K_READ },
    { method: 'GET', path: '/api/v1/features', handler: h.skillRead.listFeatures, ...opt, ...K_READ },
    { method: 'GET', path: '/api/v1/skills', handler: h.skillRead.listSkills, ...opt, ...K_READ },
    { method: 'GET', path: '/api/v1/resolve', handler: h.skillRead.resolve, ...opt, ...K_READ },
    { method: 'GET', path: '/api/v1/namespaces/:slug/skills', handler: h.skillRead.listByNamespace, ...opt, ...K_READ },

    // Legacy slug-only skill reads (deprecated) and their namespace-qualified twins.
    { method: 'GET', path: '/api/v1/skills/:slug', handler: h.skillRead.getSkill, ...opt, ...K_READ, deprecate: SUNSET },
    { method: 'GET', path: '/api/v1/skills/:slug/versions', handler: h.skillRead.getVersions, ...opt, ...K_READ, deprecate: SUNSET },
    { method: 'GET', path: '/api/v1/skills/:slug/versions/:version', handler: h.skillRead.getVersion, ...opt, ...K_READ, deprecate: SUNSET },
    { method: 'GET', path: '/api/v1/skills/:slug/file', handler: h.skillRead.getFile, ...opt, ...K_READ, deprecate: SUNSET },
    { method: 'GET', path: '/api/v1/skills/:slug/ratings', handler: h.social.listRatings, ...opt },
    { method: 'GET', path: '/api/v1/skills/:slug/comments', handler: h.social.listComments, ...opt },

    { method: 'GET', path: '/api/v1/skills/@:namespace/:slug', handler: h.skillRead.getSkill, ...opt, ...K_READ },
    { method: 'GET', path: '/api/v1/skills/@:namespace/:slug/versions', handler: h.skillRead.getVersions, ...opt, ...K_READ },
    { method: 'GET', path: '/api/v1/skills/@:namespace/:slug/versions/:version', handler: h.skillRead.getVersion, ...opt, ...K_READ },
    { method: 'GET', path: '/api/v1/skills/@:namespace/:slug/file', handler: h.skillRead.getFile, ...opt, ...K_READ },
    { method: 'GET', path: '/api/v1/skills/@:namespace/:slug/ratings', handler: h.social.listRatings, ...opt },
    { method: 'GET', path: '/api/v1/skills/@:namespace/:slug/comments', handler: h.social.listComments, ...opt },

    // ── Download ─────────────────────────────────────────────────────────────
    { method: 'GET', path: '/api/v1/download', handler: h.skillRead.download, auth: 'optional', bucket: 'download', ...K_READ },

    // ── Plugins (reads) ──────────────────────────────────────────────────────
    { method: 'GET', path: '/api/v1/plugins', handler: h.pluginRead.listPlugins, ...opt },
    { method: 'GET', path: '/api/v1/plugins/by-id/:id', handler: h.pluginRead.getPluginById, ...opt },
    { method: 'GET', path: '/api/v1/plugins/file', handler: h.pluginRead.pluginFile, ...opt },
    { method: 'GET', path: '/api/v1/plugins/download', handler: h.pluginRead.pluginDownload, ...opt },
    { method: 'GET', path: '/api/v1/plugins/:slug', handler: h.pluginRead.getPlugin, ...opt },
    { method: 'GET', path: '/api/v1/plugins/:slug/versions', handler: h.pluginRead.pluginVersions, ...opt },
    { method: 'GET', path: '/api/v1/plugins/@:namespace/:slug', handler: h.pluginRead.getPlugin, ...opt },
    { method: 'GET', path: '/api/v1/plugins/@:namespace/:slug/versions', handler: h.pluginRead.pluginVersions, ...opt },

    // ── Identity & personal tokens ───────────────────────────────────────────
    { method: 'GET', path: '/api/v1/whoami', handler: h.auth.whoami, ...authed, ...K_READ },
    { method: 'GET', path: '/api/v1/tokens', handler: h.personalTokens.list, ...authed },
    { method: 'POST', path: '/api/v1/tokens', handler: h.personalTokens.create, ...authed },
    { method: 'DELETE', path: '/api/v1/tokens/:id', handler: h.personalTokens.revoke, ...authed },

    // ── Skill publishing & lifecycle ─────────────────────────────────────────
    { method: 'POST', path: '/api/v1/skills', handler: h.skillWrite.publish, ...authed, ...K_PUBLISH },
    { method: 'POST', path: '/api/v1/skills/direct-upload', handler: h.skillWrite.directUploadPlan, ...authed },
    { method: 'POST', path: '/api/v1/skills/direct-upload/complete', handler: h.skillWrite.directUploadComplete, ...authed },

    { method: 'DELETE', path: '/api/v1/skills/:slug', handler: h.skillWrite.remove, ...authed, ...K_DELETE },
    { method: 'DELETE', path: '/api/v1/skills/:slug/purge', handler: h.skillWrite.purge, ...authed, ...K_DELETE },
    { method: 'POST', path: '/api/v1/skills/:slug/undelete', handler: h.skillWrite.undelete, ...authed, ...K_DELETE },
    { method: 'POST', path: '/api/v1/skills/:slug/request-public', handler: h.skillWrite.requestPublic, ...authed, ...K_PUBLISH },
    { method: 'PUT', path: '/api/v1/skills/:slug/detail-html', handler: h.skillWrite.updateDetailHtml, ...authed, ...K_PUBLISH },
    { method: 'PUT', path: '/api/v1/skills/:slug/file', handler: h.skillWrite.updateFile, ...authed, ...K_PUBLISH },
    { method: 'POST', path: '/api/v1/skills/:slug/transfer', handler: h.skillWrite.transfer, ...authed, ...K_MODERATE },
    { method: 'POST', path: '/api/v1/skills/:slug/versions/:version/yank', handler: h.skillWrite.yank, ...authed, ...K_MODERATE },
    { method: 'DELETE', path: '/api/v1/skills/:slug/versions/:version/yank', handler: h.skillWrite.unyank, ...authed, ...K_MODERATE },
    { method: 'POST', path: '/api/v1/skills/:slug/versions/:version/deprecate', handler: h.skillWrite.deprecate, ...authed, ...K_MODERATE },
    { method: 'DELETE', path: '/api/v1/skills/:slug/versions/:version/deprecate', handler: h.skillWrite.undeprecate, ...authed, ...K_MODERATE },

    { method: 'DELETE', path: '/api/v1/skills/@:namespace/:slug', handler: h.skillWrite.remove, ...authed, ...K_DELETE },
    { method: 'DELETE', path: '/api/v1/skills/@:namespace/:slug/purge', handler: h.skillWrite.purge, ...authed, ...K_DELETE },
    { method: 'POST', path: '/api/v1/skills/@:namespace/:slug/undelete', handler: h.skillWrite.undelete, ...authed, ...K_DELETE },
    { method: 'POST', path: '/api/v1/skills/@:namespace/:slug/request-public', handler: h.skillWrite.requestPublic, ...authed, ...K_PUBLISH },
    { method: 'PUT', path: '/api/v1/skills/@:namespace/:slug/detail-html', handler: h.skillWrite.updateDetailHtml, ...authed, ...K_PUBLISH },
    { method: 'PUT', path: '/api/v1/skills/@:namespace/:slug/file', handler: h.skillWrite.updateFile, ...authed, ...K_PUBLISH },
    { method: 'POST', path: '/api/v1/skills/@:namespace/:slug/transfer', handler: h.skillWrite.transfer, ...authed, ...K_MODERATE },
    { method: 'POST', path: '/api/v1/skills/@:namespace/:slug/versions/:version/yank', handler: h.skillWrite.yank, ...authed, ...K_MODERATE },
    { method: 'DELETE', path: '/api/v1/skills/@:namespace/:slug/versions/:version/yank', handler: h.skillWrite.unyank, ...authed, ...K_MODERATE },
    { method: 'POST', path: '/api/v1/skills/@:namespace/:slug/versions/:version/deprecate', handler: h.skillWrite.deprecate, ...authed, ...K_MODERATE },
    { method: 'DELETE', path: '/api/v1/skills/@:namespace/:slug/versions/:version/deprecate', handler: h.skillWrite.undeprecate, ...authed, ...K_MODERATE },

    // ── Stars / ratings / comments ───────────────────────────────────────────
    { method: 'POST', path: '/api/v1/stars/:slug', handler: h.social.star, ...authed },
    { method: 'DELETE', path: '/api/v1/stars/:slug', handler: h.social.unstar, ...authed },
    { method: 'POST', path: '/api/v1/stars/@:namespace/:slug', handler: h.social.star, ...authed },
    { method: 'DELETE', path: '/api/v1/stars/@:namespace/:slug', handler: h.social.unstar, ...authed },
    { method: 'POST', path: '/api/v1/skills/:slug/ratings', handler: h.social.rate, ...authed },
    { method: 'DELETE', path: '/api/v1/skills/:slug/ratings', handler: h.social.deleteRating, ...authed },
    { method: 'POST', path: '/api/v1/skills/@:namespace/:slug/ratings', handler: h.social.rate, ...authed },
    { method: 'DELETE', path: '/api/v1/skills/@:namespace/:slug/ratings', handler: h.social.deleteRating, ...authed },
    { method: 'POST', path: '/api/v1/skills/:slug/comments', handler: h.social.createComment, ...authed },
    { method: 'POST', path: '/api/v1/skills/@:namespace/:slug/comments', handler: h.social.createComment, ...authed },
    { method: 'DELETE', path: '/api/v1/comments/:id', handler: h.social.deleteComment, ...authed },

    // ── Notifications ────────────────────────────────────────────────────────
    { method: 'GET', path: '/api/v1/notifications', handler: h.social.listNotifications, ...authed },
    { method: 'GET', path: '/api/v1/notifications/unread', handler: h.social.unread, ...authed },
    { method: 'POST', path: '/api/v1/notifications/read-all', handler: h.social.markAllRead, ...authed },
    { method: 'POST', path: '/api/v1/notifications/:id/read', handler: h.social.markRead, ...authed },

    // ── Namespaces ───────────────────────────────────────────────────────────
    { method: 'POST', path: '/api/v1/namespaces', handler: h.namespaceHandlers.create, ...authed },
    { method: 'GET', path: '/api/v1/namespaces', handler: h.namespaceHandlers.list, ...authed },
    { method: 'GET', path: '/api/v1/namespaces/:slug', handler: h.namespaceHandlers.get, ...authed },
    { method: 'PUT', path: '/api/v1/namespaces/:slug', handler: h.namespaceHandlers.update, ...authed },
    { method: 'DELETE', path: '/api/v1/namespaces/:slug', handler: h.namespaceHandlers.remove, ...authed },
    { method: 'GET', path: '/api/v1/namespaces/:slug/members', handler: h.namespaceHandlers.listMembers, ...authed },
    { method: 'POST', path: '/api/v1/namespaces/:slug/members', handler: h.namespaceHandlers.addMember, ...authed },
    { method: 'DELETE', path: '/api/v1/namespaces/:slug/members/:handle', handler: h.namespaceHandlers.removeMember, ...authed },
    { method: 'POST', path: '/api/v1/namespaces/:slug/leave', handler: h.namespaceHandlers.leave, ...authed },
    { method: 'POST', path: '/api/v1/namespaces/:slug/transfer', handler: h.namespaceHandlers.transfer, ...authed },
    { method: 'POST', path: '/api/v1/namespaces/:slug/invitations', handler: h.namespaceHandlers.invite, ...authed },
    { method: 'GET', path: '/api/v1/namespaces/:slug/invitations', handler: h.namespaceHandlers.listInvitations, ...authed },
    { method: 'DELETE', path: '/api/v1/namespaces/:slug/invitations/:id', handler: h.namespaceHandlers.revokeInvitation, ...authed },
    { method: 'GET', path: '/api/v1/namespaces/:slug/tokens', handler: h.namespaceHandlers.listTeamTokens, ...authed },
    { method: 'POST', path: '/api/v1/namespaces/:slug/tokens', handler: h.namespaceHandlers.createTeamToken, ...authed },
    { method: 'DELETE', path: '/api/v1/namespaces/:slug/tokens/:id', handler: h.namespaceHandlers.revokeTeamToken, ...authed },
    { method: 'GET', path: '/api/v1/invitations', handler: h.namespaceHandlers.myInvitations, ...authed },
    { method: 'POST', path: '/api/v1/invitations/:id/accept', handler: h.namespaceHandlers.acceptInvitation, ...authed },
    { method: 'POST', path: '/api/v1/invitations/:id/decline', handler: h.namespaceHandlers.declineInvitation, ...authed },

    // ── Plugin writes ────────────────────────────────────────────────────────
    { method: 'POST', path: '/api/v1/plugins', handler: h.pluginWrite.publish, ...authed },
    { method: 'DELETE', path: '/api/v1/plugins/:slug', handler: h.pluginWrite.remove, ...authed },
    { method: 'POST', path: '/api/v1/plugins/:slug/undelete', handler: h.pluginWrite.undelete, ...authed },
    { method: 'POST', path: '/api/v1/plugins/:slug/versions/:version/yank', handler: h.pluginWrite.yank, ...authed },
    { method: 'DELETE', path: '/api/v1/plugins/:slug/versions/:version/yank', handler: h.pluginWrite.unyank, ...authed },
    { method: 'DELETE', path: '/api/v1/plugins/@:namespace/:slug', handler: h.pluginWrite.remove, ...authed },
    { method: 'POST', path: '/api/v1/plugins/@:namespace/:slug/undelete', handler: h.pluginWrite.undelete, ...authed },
    { method: 'POST', path: '/api/v1/plugins/@:namespace/:slug/versions/:version/yank', handler: h.pluginWrite.yank, ...authed },
    { method: 'DELETE', path: '/api/v1/plugins/@:namespace/:slug/versions/:version/yank', handler: h.pluginWrite.unyank, ...authed },

    // ── Admin ────────────────────────────────────────────────────────────────
    { method: 'POST', path: '/api/v1/admin/users/ban', handler: h.admin.banUser, auth: 'admin' },
    { method: 'POST', path: '/api/v1/admin/users/role', handler: h.admin.setRole, auth: 'admin' },
    { method: 'GET', path: '/api/v1/admin/users', handler: h.admin.listUsers, auth: 'admin' },
    { method: 'POST', path: '/api/v1/admin/users', handler: h.admin.createUser, auth: 'admin' },
    { method: 'POST', path: '/api/v1/admin/tokens', handler: h.admin.createToken, auth: 'admin' },
    { method: 'GET', path: '/api/v1/admin/api-keys', handler: h.admin.listApiKeys, auth: 'admin', bucket: 'write' },
    { method: 'POST', path: '/api/v1/admin/api-keys', handler: h.admin.createApiKey, auth: 'admin', bucket: 'write' },
    { method: 'DELETE', path: '/api/v1/admin/api-keys/:id', handler: h.admin.revokeApiKey, auth: 'admin', bucket: 'write' },
    { method: 'GET', path: '/api/v1/admin/skills', handler: h.admin.listSkills, auth: 'admin', ...K_MODERATE },
    { method: 'GET', path: '/api/v1/admin/features', handler: h.admin.listFeaturedSkills, auth: 'admin' },
    { method: 'PUT', path: '/api/v1/admin/features', handler: h.admin.replaceFeaturedSkills, auth: 'admin' },
    { method: 'POST', path: '/api/v1/admin/skills/:slug/review', handler: h.admin.reviewSkill, auth: 'admin', ...K_MODERATE },
    { method: 'POST', path: '/api/v1/admin/skills/:slug/visibility', handler: h.admin.setSkillVisibility, auth: 'admin', ...K_MODERATE },
    { method: 'POST', path: '/api/v1/admin/skills/@:namespace/:slug/review', handler: h.admin.reviewSkill, auth: 'admin', ...K_MODERATE },
    { method: 'POST', path: '/api/v1/admin/skills/@:namespace/:slug/visibility', handler: h.admin.setSkillVisibility, auth: 'admin', ...K_MODERATE },
    { method: 'GET', path: '/api/v1/admin/plugins', handler: h.admin.listPlugins, auth: 'admin' },
    { method: 'POST', path: '/api/v1/admin/plugins/:slug/review', handler: h.admin.reviewPlugin, auth: 'admin' },
    { method: 'POST', path: '/api/v1/admin/plugins/:slug/visibility', handler: h.admin.setPluginVisibility, auth: 'admin' },
    { method: 'GET', path: '/api/v1/admin/audit-logs', handler: h.admin.auditLogs, auth: 'admin' },

    // ── Agent provisioning & agent skill API ─────────────────────────────────
    { method: 'POST', path: '/api/v1/agent/provision', handler: h.agentProvision.provision, auth: 'public', bucket: 'write' },
    { method: 'POST', path: '/api/agent/skills', handler: h.agent.publish, auth: 'required', bucket: 'write' },
    { method: 'GET', path: '/api/agent/skills', handler: h.agent.list, auth: 'required', bucket: 'read' },
    { method: 'GET', path: '/api/agent/skills/:id', handler: h.agent.detail, auth: 'required', bucket: 'read' },
    { method: 'GET', path: '/api/agent/skills/:id/download', handler: h.agent.download, auth: 'required', bucket: 'download' },
    { method: 'GET', path: '/api/agent/skills/:id/archive', handler: h.agent.archive, auth: 'required', bucket: 'download' },

    // ── Runtime skill API ────────────────────────────────────────────────────
    { method: 'GET', path: '/api/runtime/capabilities', handler: h.runtime.capabilities, ...opt },
    { method: 'POST', path: '/api/runtime/skills/resolve', handler: h.runtime.resolve, ...opt },
    { method: 'GET', path: '/api/runtime/skills', handler: h.runtime.list, ...opt },
    { method: 'GET', path: '/api/runtime/skills/by-id/:id', handler: h.runtime.byId, ...opt },
    { method: 'GET', path: '/api/runtime/skills/by-slug', handler: h.runtime.bySlug, ...opt },
    { method: 'GET', path: '/api/runtime/skills/files', handler: h.runtime.file, ...opt },
    { method: 'GET', path: '/api/runtime/skills/bundle', handler: h.runtime.bundle, ...opt },
  ]
}

// Compiled once per process; matching is a linear scan over a sorted list, which
// is abundantly fast for ~140 routes.
let compiled: ReturnType<typeof compileRoutes> | null = null

function routes() {
  compiled ??= compileRoutes(buildRoutes())
  return compiled
}

/** Entry point used by the `/api/$` server route. */
export async function dispatchApi(request: Request): Promise<Response> {
  const result = await dispatch(routes(), request)
  return result.response
}

/** Exposed for the smoke test and for route-table introspection. */
export function routeTable(): Array<{ method: string; path: string; auth: string }> {
  return buildRoutes().map((r) => ({ method: r.method, path: r.path, auth: r.auth ?? 'public' }))
}

export { dispatch, pub, opt, authed }
