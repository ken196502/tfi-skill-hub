"use client";

import { Loader2, Pencil, PenLine, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AdminTableCard,
  AdminTablePage,
  TABLE_FILL,
  TABLE_SCROLL,
  TABLE_STICKY_HEAD,
  TablePager,
} from "@/components/admin/admin-table-page";
import { FilterButtonGroup } from "@/components/admin/filter-button-group";
import { SkillEditDialog } from "@/components/admin/skill-edit-dialog";
import { EmptyState } from "@/components/common/empty-state";
import { CategoryBadge } from "@/components/skills/category-badge";
import { ContentTypeBadge } from "@/components/skills/content-type-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ADMIN_DEFAULT_PAGE_SIZE,
  useAdminSkills,
  useRemoveSkill,
  useSetSkillVisibility,
} from "@/hooks/use-admin";
import { useI18n } from "@/i18n";
import type { ContentType, ModerationStatus, Visibility } from "@/lib/api/types";
import { localizedName } from "@/lib/display";
import { formatDate } from "@/lib/format";
import { skillRef } from "@/lib/refs";
import { cn } from "@/lib/utils";

type Filter = "all" | "public" | "private";
type TypeFilter = "all" | ContentType;
type StatusFilterOption = { value: Filter; label: string };
type TypeFilterOption = { value: TypeFilter; label: string };

/**
 * What the row's chip says. A skill that was submitted for public listing but
 * never acted on reads as its own state, so it is obvious which rows still
 * want a decision — that was the whole job the old review queue used to do.
 */
type RowStatus = "public" | "private" | "pending";

interface ContentRow {
  id: string;
  /** Display name; empty when the record has none. */
  name: string;
  /** `@namespace/slug` reference used for API operations. */
  ref: string;
  /** Bare skill identifier — the namespace prefix is not shown in the UI. */
  slug: string;
  contentType: ContentType;
  ownerHandle: string;
  category: string;
  status: RowStatus;
  updatedAt: string;
}

function rowStatus(
  visibility: Visibility,
  moderation: ModerationStatus,
): RowStatus {
  if (visibility === "public") return "public";
  return moderation === "pending_review" ? "pending" : "private";
}

function StatusBadge({ status }: { status: RowStatus }) {
  const { t } = useI18n();
  if (status === "public") {
    return (
      <Badge className="border-transparent bg-emerald-500/15 font-normal text-emerald-700 dark:text-emerald-400">
        {t("admin.content.statusPublic")}
      </Badge>
    );
  }
  if (status === "pending") {
    return (
      <Badge className="border-transparent bg-amber-500/15 font-normal text-amber-700 dark:text-amber-400">
        {t("admin.content.statusPending")}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="font-normal">
      {t("admin.content.statusPrivate")}
    </Badge>
  );
}

/** Row actions — shared by the table (desktop) and cards (mobile). */
function RowActions({
  row,
  busy,
  onEdit,
  onToggle,
  onRemove,
}: {
  row: ContentRow;
  busy: boolean;
  onEdit: (row: ContentRow) => void;
  onToggle: (row: ContentRow) => void;
  onRemove: (row: ContentRow) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Button
        size="xs"
        variant="outline"
        className="gap-1"
        disabled={busy}
        onClick={() => onEdit(row)}
      >
        <Pencil className="size-3" />
        {t("admin.content.edit")}
      </Button>
      <Button
        size="xs"
        variant={row.status === "public" ? "warning" : "success"}
        disabled={busy}
        onClick={() => onToggle(row)}
      >
        {row.status === "public"
          ? t("admin.content.setPrivate")
          : t("admin.content.setPublic")}
      </Button>
      <Button
        size="xs"
        variant="destructive"
        disabled={busy}
        onClick={() => onRemove(row)}
      >
        {t("admin.content.delete")}
      </Button>
    </div>
  );
}

/** Deletion is irreversible, so it always goes through this confirm step. */
function RemoveSkillDialog({
  row,
  onClose,
}: {
  row: ContentRow;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const remove = useRemoveSkill();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("admin.content.deleteTitle")}</DialogTitle>
          <DialogDescription>{t("admin.content.deleteDesc")}</DialogDescription>
        </DialogHeader>
        <p className="text-sm">
          <span className="font-medium">{row.name}</span>
          <span className="ml-2 font-mono text-xs text-muted-foreground">
            {row.slug}
          </span>
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            className="gap-2"
            disabled={remove.isPending}
            onClick={() => {
              remove.mutate(row.ref, {
                onSuccess: () => {
                  toast.success(t("admin.content.deleted"));
                  onClose();
                },
                onError: () => toast.error(t("admin.content.deleteFailed")),
              });
            }}
          >
            {remove.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            {remove.isPending
              ? t("admin.content.deleting")
              : t("admin.content.deleteConfirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ContentManagement() {
  const { t, locale } = useI18n();
  const [filter, setFilter] = useState<Filter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(ADMIN_DEFAULT_PAGE_SIZE);
  /** `{ ref: null }` opens the dialog in create mode. */
  const [dialog, setDialog] = useState<{ ref: string | null } | null>(null);
  const [removing, setRemoving] = useState<ContentRow | null>(null);

  const queryOptions = {
    page,
    limit: pageSize,
    ...(filter === "public" ? { visibility: "public" } : {}),
    ...(filter === "private" ? { visibility: "private" } : {}),
    ...(typeFilter === "all" ? {} : { type: typeFilter }),
  };

  const skillsQuery = useAdminSkills(queryOptions);
  const setSkillVisibility = useSetSkillVisibility();

  const rows: ContentRow[] = (skillsQuery.data?.data ?? []).map((skill) => ({
    id: skill.id,
    name: localizedName(skill, locale),
    ref: skillRef(skill),
    slug: skill.slug,
    contentType: skill.contentType,
    ownerHandle: skill.ownerHandle,
    category: skill.category,
    status: rowStatus(skill.visibility, skill.moderationStatus),
    updatedAt: skill.updatedAt,
  }));

  /** Every category the loaded page actually uses, for the dialog's select. */
  const categoriesInUse = [
    ...new Set(rows.map((row) => row.category).filter((value) => value !== "")),
  ];

  const total = skillsQuery.data?.total ?? 0;
  const isLoading = skillsQuery.isLoading;
  const busy = setSkillVisibility.isPending;

  const handleToggle = (row: ContentRow) => {
    const next: Visibility = row.status === "public" ? "private" : "public";
    setSkillVisibility.mutate(
      { ref: row.ref, visibility: next },
      {
        onSuccess: () =>
          toast.success(
            next === "public"
              ? t("admin.content.setPublicDone")
              : t("admin.content.setPrivateDone"),
          ),
        onError: () => toast.error(t("common.error")),
      },
    );
  };

  const filters: StatusFilterOption[] = [
    { value: "all", label: t("admin.content.filterAll") },
    { value: "public", label: t("admin.content.filterPublic") },
    { value: "private", label: t("admin.content.filterPrivate") },
  ];

  const typeFilters: TypeFilterOption[] = [
    { value: "all", label: t("admin.content.filterAll") },
    { value: "skill", label: t("contentType.skill") },
    { value: "knowledge", label: t("contentType.knowledge") },
  ];

  // Paging controls are shared: a toolbar above the desktop table, and the
  // footer under the mobile cards.
  const pagingControls =
    !isLoading && total > 0 ? (
      <TablePager
        total={total}
        page={page}
        pageSize={pageSize}
        fetching={busy}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    ) : null;

  return (
    <AdminTablePage>
      {/* The sidebar names the section; screen readers still get a heading. */}
      <h1 className="sr-only">{t("admin.content.title")}</h1>

      {/* Toolbar — create on the left, type and status filters on the right. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => setDialog({ ref: null })}
        >
          <Plus className="size-3.5" />
          {t("admin.content.newSkill")}
        </Button>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <FilterButtonGroup
            label={t("admin.content.typeLabel")}
            value={typeFilter}
            options={typeFilters}
            onChange={(value) => {
              setTypeFilter(value);
              setPage(1);
            }}
          />
          <FilterButtonGroup
            label={t("admin.content.status")}
            value={filter}
            options={filters}
            onChange={(value) => {
              setFilter(value);
              setPage(1);
            }}
          />
        </div>
      </div>

      <AdminTableCard>
        {isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={PenLine}
            title={t("admin.content.empty")}
            className="rounded-none border-0 md:flex-1"
          />
        ) : (
          <>
            {/* Desktop — paging toolbar above the table, so pagination stays
                reachable without scrolling past the rows. */}
            {pagingControls ? (
              <div className="hidden items-center justify-between gap-3 border-b px-4 py-3 text-sm text-muted-foreground md:flex">
                {pagingControls}
              </div>
            ) : null}

            {/* Desktop — table; keyed by page and size so a new page starts at
                the top-left of the scroll box. */}
            <div
              key={`${page}-${pageSize}`}
              className={cn("hidden md:block", TABLE_FILL)}
            >
              <Table containerClassName={TABLE_SCROLL}>
                <TableHeader className={TABLE_STICKY_HEAD}>
                  <TableRow>
                    <TableHead>{t("admin.content.name")}</TableHead>
                    <TableHead>{t("admin.content.author")}</TableHead>
                    <TableHead>{t("admin.content.status")}</TableHead>
                    <TableHead className="hidden lg:table-cell">
                      {t("admin.content.updatedAt")}
                    </TableHead>
                    <TableHead className="text-right">
                      {t("common.actions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium">{row.name}</span>
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-mono">{row.slug}</span>
                            <ContentTypeBadge type={row.contentType} />
                            <CategoryBadge category={row.category} />
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.ownerHandle}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                        {formatDate(row.updatedAt, locale)}
                      </TableCell>
                      <TableCell>
                        <RowActions
                          row={row}
                          busy={busy}
                          onEdit={(target) => setDialog({ ref: target.ref })}
                          onToggle={handleToggle}
                          onRemove={setRemoving}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile — cards */}
            <div className="divide-y md:hidden">
              {rows.map((row) => (
                <div key={row.id} className="space-y-2.5 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium">{row.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="truncate font-mono">{row.slug}</span>
                        <ContentTypeBadge type={row.contentType} />
                        <CategoryBadge category={row.category} />
                      </div>
                    </div>
                    <StatusBadge status={row.status} />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>{row.ownerHandle}</span>
                    <span>{formatDate(row.updatedAt, locale)}</span>
                  </div>
                  <RowActions
                    row={row}
                    busy={busy}
                    onEdit={(target) => setDialog({ ref: target.ref })}
                    onToggle={handleToggle}
                    onRemove={setRemoving}
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {/* Mobile — paging footer under the cards (desktop shows it on top). */}
        {pagingControls ? (
          <div className="flex items-center justify-between gap-3 border-t px-4 py-3 text-sm text-muted-foreground md:hidden">
            {pagingControls}
          </div>
        ) : null}
      </AdminTableCard>

      {dialog ? (
        <SkillEditDialog
          skillRef={dialog.ref}
          categoriesInUse={categoriesInUse}
          onClose={() => setDialog(null)}
        />
      ) : null}

      {removing ? (
        <RemoveSkillDialog row={removing} onClose={() => setRemoving(null)} />
      ) : null}
    </AdminTablePage>
  );
}
