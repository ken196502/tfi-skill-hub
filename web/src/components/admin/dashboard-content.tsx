"use client";

import {
  KeyRound,
  ScrollText,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAdminApiKeys,
  useAdminFeatures,
  useAdminSkills,
  useAdminUsers,
  useAuditLogs,
} from "@/hooks/use-admin";
import { useI18n } from "@/i18n";
import { apiKeyStatus } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

export function DashboardContent() {
  const { t, locale } = useI18n();

  // Only the counters are shown here, so one row is enough.
  const users = useAdminUsers({ pageSize: 1 });
  const skills = useAdminSkills({ page: 1, limit: 1 });
  const publishedSkills = useAdminSkills({ page: 1, limit: 1, visibility: "public" });
  const features = useAdminFeatures();
  const apiKeys = useAdminApiKeys();
  const audit = useAuditLogs({ limit: 8 });

  const pendingUserCount = users.data?.pendingCount ?? 0;
  const publishedSkillCount = publishedSkills.data?.total ?? 0;
  const apiKeyItems = apiKeys.data?.data ?? [];
  const activeApiKeyCount = apiKeyItems.filter((item) => apiKeyStatus(item) === "active").length;

  const stats = [
    {
      key: "users",
      label: t("admin.dashboard.users"),
      value: users.data?.total ?? users.data?.data.length ?? 0,
      sub: t("admin.dashboard.pendingUsers", { count: pendingUserCount }),
      icon: Users,
      href: "/admin/users",
    },
    {
      key: "skills",
      label: t("admin.dashboard.skills"),
      value: skills.data?.total ?? 0,
      sub: t("admin.dashboard.publishedSkills", { count: publishedSkillCount }),
      icon: ShieldCheck,
      href: "/admin/content",
    },
    {
      key: "featured",
      label: t("admin.dashboard.featured"),
      value: features.data?.data.length ?? 0,
      // Two strips, twelve slots each.
      sub: "/ 24",
      icon: Sparkles,
      href: "/admin/features",
    },
    {
      key: "apiKeys",
      label: t("admin.dashboard.apiKeys"),
      value: apiKeyItems.length,
      sub: t("admin.apiKeys.activeCount", { count: activeApiKeyCount }),
      icon: KeyRound,
      href: "/admin/api-keys",
    },
  ];

  return (
    <div className="space-y-6">
      <header className="motion-rise">
        <h1 className="text-xl font-semibold tracking-tight">{t("admin.dashboard.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("admin.dashboard.subtitle")}
        </p>
      </header>

      {/* Stats */}
      <div className="motion-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat, index) => (
          <Link key={stat.key} href={stat.href} style={{ "--stagger": index } as CSSProperties}>
            <Card className="gap-0 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-foreground/25">
              <div className="flex items-center justify-between px-4">
                <span className="text-sm text-muted-foreground">{stat.label}</span>
                <stat.icon className="size-4 text-muted-foreground" />
              </div>
              <div className="mt-2 px-4">
                <span className="text-2xl font-semibold">{stat.value}</span>
              </div>
              <p className="mt-1 px-4 text-xs text-muted-foreground">{stat.sub}</p>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent audit */}
      <Card className="motion-rise motion-delay-1 gap-0 py-4">
        <div className="flex items-center justify-between gap-2 px-4">
          <div className="flex items-center gap-2">
            <ScrollText className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">{t("admin.dashboard.recentAudit")}</h2>
          </div>
          <Link
            href="/admin/audit"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            {t("admin.dashboard.viewAll")}
          </Link>
        </div>

        <div className="mt-3 divide-y px-4">
          {audit.isLoading ? (
            <div className="space-y-3 py-3">
              {Array.from({ length: 5 }).map((_, index) => (
                <Skeleton key={index} className="h-5 w-full" />
              ))}
            </div>
          ) : (audit.data?.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t("admin.audit.empty")}
            </p>
          ) : (
            (audit.data?.data ?? []).map((log) => (
              <div
                key={log.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5 text-sm"
              >
                <KeyRound className="size-3.5 shrink-0 text-muted-foreground" />
                {/* Same display rule as the audit page: the localized
                    description with the raw action key as fallback. */}
                <span className="text-xs font-medium">
                  {log.actionDescription || log.action}
                </span>
                <span className="text-xs text-muted-foreground">
                  {log.actorHandle ? `@${log.actorHandle}` : "system"}
                </span>
                {log.details ? (
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {log.details}
                  </span>
                ) : (
                  <span className="flex-1" />
                )}
                <span className="text-xs text-muted-foreground">
                  {formatDate(log.createdAt, locale, true)}
                </span>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
