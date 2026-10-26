"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useI18n } from "@/i18n";
import {
  adminAuditActions,
  adminAuditLogs,
  adminBanUser,
  adminCreateApiKey,
  adminCreateSkill,
  adminCreateUser,
  adminListApiKeys,
  adminListFeatures,
  adminListSkills,
  adminListUsers,
  adminRemoveSkill,
  adminReplaceFeatures,
  adminResetUserPassword,
  adminReviewSkill,
  adminReviewUser,
  adminRevokeApiKey,
  adminSetRole,
  adminSetSkillVisibility,
  adminUpdateSkill,
  type AdminListSkillsOptions,
} from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/query-keys";
import type { AdminAuditQuery, AdminSkillInput, ContentType, CreateApiKeyInput, CreateUserInput, UserRole } from "@/lib/api/types";

// ─────────────────────────────────────────────────────────────────────────────
// Shared list paging
// ─────────────────────────────────────────────────────────────────────────────

/** Default rows per page for the console's list tables, and the sizes they offer. */
export const ADMIN_DEFAULT_PAGE_SIZE = 30;
export const ADMIN_PAGE_SIZE_OPTIONS = [30, 50, 100] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Users
// ─────────────────────────────────────────────────────────────────────────────

export function useAdminUsers(
  params: {
    page?: number;
    pageSize?: number;
    status?: string;
    keyword?: string;
    banned?: boolean;
  } = {},
) {
  // Admin rows carry backend-localized fields (orgName), so the locale is
  // part of the cache key: a language switch refetches without touching the
  // caller's page or page size.
  const { locale } = useI18n();
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? ADMIN_DEFAULT_PAGE_SIZE;
  const status = params.status ?? "";
  const keyword = params.keyword ?? "";
  // null = "no ban filtering": the cache key stays explicit while the request
  // omits the parameter entirely (the API's tri-state `banned` contract).
  const banned = params.banned ?? null;
  return useQuery({
    queryKey: queryKeys.admin.users(status, page, keyword, banned, pageSize, locale),
    queryFn: () =>
      adminListUsers({
        page,
        status,
        keyword,
        banned: banned ?? undefined,
        pageSize,
      }),
    placeholderData: (previous) => previous,
  });
}

/**
 * Pending-review counter behind the users toolbar badge. The list response
 * only carries `pendingCount` on the unfiltered first page, so the badge gets
 * its own query and survives every list filter.
 */
export function usePendingUserCount() {
  return useQuery({
    queryKey: queryKeys.admin.pendingUserCount,
    queryFn: () => adminListUsers({ status: "pending", page: 1, pageSize: 1 }),
    select: (data) => data.total ?? 0,
  });
}

export function useReviewUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      action,
      note,
    }: {
      userId: string;
      action: "approve" | "reject";
      note?: string;
    }) => adminReviewUser(userId, action, note ?? ""),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateUserInput) => adminCreateUser(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

export function useBanUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, reason }: { userId: string; reason: string }) =>
      adminBanUser(userId, reason),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

/** Lifts a ban — the same endpoint, called without a reason. */
export function useUnbanUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => adminBanUser(userId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

export function useSetRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: UserRole }) =>
      adminSetRole(userId, role),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin", "users"] }),
  });
}

/** Overwrites a user's password — no list state changes, so no invalidation. */
export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ userId, newPassword }: { userId: string; newPassword: string }) =>
      adminResetUserPassword(userId, newPassword),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// API keys
// ─────────────────────────────────────────────────────────────────────────────

export function useAdminApiKeys() {
  return useQuery({
    queryKey: queryKeys.admin.apiKeys,
    queryFn: adminListApiKeys,
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateApiKeyInput) => adminCreateApiKey(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.apiKeys }),
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminRevokeApiKey(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.admin.apiKeys }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Content management
// ─────────────────────────────────────────────────────────────────────────────

export function useAdminSkills(options: AdminListSkillsOptions) {
  return useQuery({
    queryKey: queryKeys.admin.skills(options),
    queryFn: () => adminListSkills(options),
    placeholderData: (previous) => previous,
  });
}

export function useReviewSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      ref,
      action,
    }: {
      ref: string;
      action: "approve" | "reject";
    }) => adminReviewSkill(ref, action),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "skills"] });
      void queryClient.invalidateQueries({ queryKey: ["skills"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.features });
      // The detail page renders the moderation badge from this cache.
      void queryClient.invalidateQueries({ queryKey: queryKeys.skill(variables.ref) });
    },
  });
}

export function useSetSkillVisibility() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      ref,
      visibility,
    }: {
      ref: string;
      visibility: "public" | "private";
    }) => adminSetSkillVisibility(ref, visibility),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "skills"] });
      void queryClient.invalidateQueries({ queryKey: ["skills"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.features });
      // The console's featured editor reads the same server state: skills that
      // go private drop out of it, so it has to refetch as well. The key
      // prefix covers both per-strip caches.
      void queryClient.invalidateQueries({ queryKey: ["admin", "features"] });
      // The detail page renders the visibility badge from this cache.
      void queryClient.invalidateQueries({ queryKey: queryKeys.skill(variables.ref) });
    },
  });
}

export function useUpdateSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      ref,
      input,
      files,
    }: {
      ref: string;
      input: AdminSkillInput;
      files?: File[];
    }) => adminUpdateSkill(ref, input, files),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "skills"] });
      void queryClient.invalidateQueries({ queryKey: ["skills"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.skill(variables.ref) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.features });
      void queryClient.invalidateQueries({ queryKey: ["admin", "features"] });
    },
  });
}

export function useCreateSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, files }: { input: AdminSkillInput; files?: File[] }) =>
      adminCreateSkill(input, files),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "skills"] });
      void queryClient.invalidateQueries({ queryKey: ["skills"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.features });
    },
  });
}

export function useRemoveSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ref: string) => adminRemoveSkill(ref),
    onSuccess: (_data, ref) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "skills"] });
      void queryClient.invalidateQueries({ queryKey: ["skills"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.skill(ref) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.features });
      void queryClient.invalidateQueries({ queryKey: ["admin", "features"] });
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Featured & audit
// ─────────────────────────────────────────────────────────────────────────────

/** Scoped to one strip by `type`; without it the unscoped list is fetched. */
export function useAdminFeatures(type?: ContentType) {
  return useQuery({
    queryKey: queryKeys.admin.features(type ?? "all"),
    queryFn: () => adminListFeatures(type),
  });
}

export function useReplaceFeatures() {
  const queryClient = useQueryClient();
  return useMutation({
    // Each call rewrites exactly one strip (the API scopes it by `type`).
    mutationFn: ({ type, ids }: { type: ContentType; ids: string[] }) =>
      adminReplaceFeatures(type, ids),
    onSuccess: () => {
      // Prefix invalidation refreshes both strips' caches.
      void queryClient.invalidateQueries({ queryKey: ["admin", "features"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.features });
    },
  });
}

export function useAuditLogs(params: AdminAuditQuery = {}) {
  // Descriptions ride the `lang` header, so the locale is part of the key:
  // a language switch refetches instead of keeping stale-language rows.
  const { locale } = useI18n();
  return useQuery({
    queryKey: queryKeys.admin.audit(params, locale),
    queryFn: () => adminAuditLogs(params),
    placeholderData: (previous) => previous,
  });
}

/** Action dictionary behind the audit page's filter options and labels. */
export function useAuditActions() {
  const { locale } = useI18n();
  return useQuery({
    queryKey: queryKeys.admin.auditActions(locale),
    queryFn: adminAuditActions,
  });
}
