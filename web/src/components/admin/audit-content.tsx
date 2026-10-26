"use client";

import { ScrollText } from "lucide-react";
import { useState } from "react";
import {
  AdminTableCard,
  AdminTablePage,
  TABLE_FILL,
  TABLE_SCROLL,
  TABLE_STICKY_HEAD,
  TablePager,
} from "@/components/admin/admin-table-page";
import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ADMIN_DEFAULT_PAGE_SIZE, useAuditActions, useAuditLogs } from "@/hooks/use-admin";
import { useI18n } from "@/i18n";
import { pickLocalized, type LocalizedText } from "@/i18n/config";
import type { AuditAction, ContentType } from "@/lib/api/types";
import { formatDate } from "@/lib/format";

/**
 * The action dictionary (filter options + localized descriptions) comes from
 * `GET /api/v1/admin/audit-actions`; only the resource-kind display names
 * stay a client-side convention (unknown values fall back to the raw key).
 */

const RESOURCE_LABELS: Record<string, LocalizedText> = {
  user: { zh: "用户", en: "User" },
  skill: { zh: "技能", en: "Skill" },
  knowledge: { zh: "知识库", en: "Knowledge base" },
  featured_skills: { zh: "首页精选", en: "Featured skills" },
  api_key: { zh: "API Key", en: "API key" },
};

/**
 * The same `action` can be listed once per resource kind (`admin.replace_featured`
 * covers both the skill and the knowledge strip), so a select value carries the
 * pair and the query sends both halves back as filters.
 */
const ACTION_KEY_SEP = "::";

const actionKeyOf = (item: AuditAction) =>
  `${item.action}${ACTION_KEY_SEP}${item.resourceType}`;

/** Select value → filter halves; `"all"` means no action filter. */
function splitActionKey(key: string): { action?: string; resourceType?: string } {
  if (key === "all") return {};
  const [action, resourceType] = key.split(ACTION_KEY_SEP);
  return { action, resourceType: resourceType || undefined };
}

export function AuditContent() {
  const { t, locale } = useI18n();
  const [actionKey, setActionKey] = useState("all");
  const [resource, setResource] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(ADMIN_DEFAULT_PAGE_SIZE);

  const actions = useAuditActions();
  // Filter options are derived from the dictionary so a newly audited
  // resource kind shows up without a frontend change. Keying by the pair keeps
  // actions that share a name apart and drops exact duplicates.
  const actionOptions = [
    ...new Map(
      (actions.data?.data ?? []).map(
        (item): [string, AuditAction] => [actionKeyOf(item), item],
      ),
    ).values(),
  ];
  const resourceOptions = Array.from(
    new Set(actionOptions.map((item) => item.resourceType).filter(Boolean)),
  );

  const actionFilter = splitActionKey(actionKey);
  const logs = useAuditLogs({
    page,
    limit: pageSize,
    action: actionFilter.action,
    // A picked option already names its resource kind; an explicit resource
    // filter stays authoritative because it is the same axis.
    resourceType: resource === "all" ? actionFilter.resourceType : resource,
  });

  /**
   * Trigger label follows the resource filter: the featured actions share one
   * `action`, so the pair picks the description matching the current narrowing.
   */
  const selectedActionValue = (() => {
    if (!actionFilter.action) return "all";
    const variant = actionOptions.find(
      (item) => item.action === actionFilter.action && item.resourceType === resource,
    );
    return variant ? actionKeyOf(variant) : actionKey;
  })();

  const items = logs.data?.data ?? [];
  const total = logs.data?.total ?? 0;

  /**
   * Resource kind label. Content rows carry `contentType` next to
   * `resourceType`; when the kind itself is unknown the content type is the
   * fallback, so knowledge entries never render a raw key.
   */
  const resourceLabel = (value: string, contentType?: ContentType): string => {
    const text = RESOURCE_LABELS[value] ?? (contentType ? RESOURCE_LABELS[contentType] : undefined);
    return text ? pickLocalized(text, locale) : value;
  };

  // Paging controls sit in a toolbar above the table, so pagination stays
  // reachable without scrolling past the rows.
  const pagingControls =
    !logs.isLoading && total > 0 ? (
      <TablePager
        total={total}
        page={page}
        pageSize={pageSize}
        fetching={logs.isFetching}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    ) : null;

  return (
    <AdminTablePage>
      {/* Title on the left, filters on the right, bottom-aligned with the
          title block so the whole strip reads as one row. */}
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("admin.audit.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("admin.audit.subtitle")}</p>
        </div>

        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <Select
            value={selectedActionValue}
            onValueChange={(value) => {
              setActionKey(value);
              // Mirror the option's resource kind into the resource filter so
              // both selects show the same narrowing the query sends.
              const { resourceType } = splitActionKey(value);
              if (resourceType) setResource(resourceType);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="all">{t("admin.audit.allActions")}</SelectItem>
              {actionOptions.map((item) => (
                <SelectItem key={actionKeyOf(item)} value={actionKeyOf(item)}>
                  {item.description || item.action}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={resource}
            onValueChange={(value) => {
              setResource(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              <SelectItem value="all">{t("admin.audit.allResources")}</SelectItem>
              {resourceOptions.map((item) => (
                <SelectItem key={item} value={item}>
                  {resourceLabel(item)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {/* Table */}
      <AdminTableCard>
        {/* Paging toolbar above the table, so pagination stays reachable
            without scrolling past the rows. */}
        {pagingControls ? (
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3 text-sm text-muted-foreground">
            {pagingControls}
          </div>
        ) : null}

        {logs.isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={ScrollText}
            title={t("admin.audit.empty")}
            className="rounded-none border-0 md:flex-1"
          />
        ) : (
          // Keyed by page and size so a new page starts at the top-left of the
          // scroll box instead of wherever the last one was left.
          <div key={`${page}-${pageSize}`} className={TABLE_FILL}>
            <Table containerClassName={TABLE_SCROLL}>
              <TableHeader className={TABLE_STICKY_HEAD}>
                <TableRow>
                  <TableHead>{t("admin.audit.time")}</TableHead>
                  <TableHead>{t("admin.audit.actor")}</TableHead>
                  <TableHead>{t("admin.audit.action")}</TableHead>
                  <TableHead>{t("admin.audit.resource")}</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    {t("admin.audit.details")}
                  </TableHead>
                  <TableHead className="hidden md:table-cell">{t("admin.audit.ip")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDate(log.createdAt, locale, true)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {log.actorHandle ? `@${log.actorHandle}` : "system"}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-medium">
                          {log.actionDescription || log.action}
                        </span>
                        {/* Raw key stays underneath for traceability; hidden
                            when the description already is the raw key. */}
                        {log.actionDescription && log.actionDescription !== log.action ? (
                          <code className="font-mono text-xs text-muted-foreground">
                            {log.action}
                          </code>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-0.5">
                        <Badge variant="secondary" className="w-fit text-xs font-normal">
                          {resourceLabel(log.resourceType, log.contentType)}
                        </Badge>
                        {log.resourceId ? (
                          <span className="max-w-40 truncate font-mono text-xs text-muted-foreground">
                            {log.resourceId}
                          </span>
                        ) : null}
                      </div>
                    </TableCell>
                    <TableCell className="hidden max-w-72 truncate text-xs text-muted-foreground lg:table-cell">
                      {log.details || "—"}
                    </TableCell>
                    <TableCell className="hidden whitespace-nowrap font-mono text-xs text-muted-foreground md:table-cell">
                      {log.ipAddress || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

      </AdminTableCard>
    </AdminTablePage>
  );
}
