import type { AdminListSkillsOptions, ListSkillsParams } from "./endpoints";
import type { AdminAuditQuery, ContentType } from "./types";

/** Central query-key registry — every hook reads from here. */
export const queryKeys = {
  whoami: ["whoami"] as const,
  skills: (params: ListSkillsParams) => ["skills", params] as const,
  skill: (ref: string) => ["skill", ref] as const,
  skillVersions: (ref: string) => ["skill", ref, "versions"] as const,
  categories: ["categories"] as const,
  brands: ["brands"] as const,
  features: ["features"] as const,
  stars: ["stars"] as const,
  admin: {
    // User rows carry backend-localized fields (orgName rides the `lang`
    // header), so `locale` sits in the key: switching language refetches.
    users: (
      status: string,
      page: number,
      keyword: string,
      banned: boolean | null,
      pageSize: number,
      locale: string,
    ) => ["admin", "users", locale, status, page, keyword, banned, pageSize] as const,
    // Shares the `admin/users` prefix so review mutations invalidate it too.
    pendingUserCount: ["admin", "users", "pending-count"] as const,
    skills: (options: AdminListSkillsOptions) => ["admin", "skills", options] as const,
    apiKeys: ["admin", "api-keys"] as const,
    // One cache entry per strip: each column loads `?type=` separately;
    // the dashboard's unscoped counter keeps its own `all` entry.
    features: (type: ContentType | "all") => ["admin", "features", type] as const,
    audit: (params: AdminAuditQuery, locale: string) =>
      ["admin", "audit", locale, params] as const,
    // Audit responses carry backend-localized descriptions (they ride the
    // `lang` header), so `locale` sits in the key: switching language refetches.
    auditActions: (locale: string) => ["admin", "audit-actions", locale] as const,
  },
};
