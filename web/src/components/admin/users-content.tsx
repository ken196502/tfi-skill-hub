"use client";

import {
  Ban,
  Check,
  KeyRound,
  Search,
  SearchX,
  ShieldCheck,
  Unlock,
  UserCheck,
  UserPlus,
  UserX,
  Users,
} from "lucide-react";
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
import {
  BanUserDialog,
  CreateUserDialog,
  RejectUserDialog,
  ResetPasswordDialog,
  UnbanUserDialog,
  UserRoleDialog,
} from "@/components/admin/user-dialogs";
import { EmptyState } from "@/components/common/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ADMIN_DEFAULT_PAGE_SIZE,
  useAdminUsers,
  usePendingUserCount,
  useReviewUser,
} from "@/hooks/use-admin";
import { useCurrentUser } from "@/hooks/use-auth";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useI18n } from "@/i18n";
import { pickLocalized, type Locale } from "@/i18n/config";
import type { User } from "@/lib/api/types";
import { formatDate, formatNumber } from "@/lib/format";
import { COUNTRIES, MARKETS } from "@/lib/registration";
import { cn } from "@/lib/utils";

type ReviewFilter = "all" | "pending" | "approved" | "rejected";
type BanFilter = "all" | "banned" | "normal";

/**
 * Row action fills — one hue per operation, always paired with a text label.
 * Light theme uses pastel 50-level fills with a hairline border; dark theme
 * switches to deep 950-level tints with a 300-level label, so the chips stay
 * crisp against the card in both themes instead of washing out.
 */
const ACTION_TONES = {
  approve:
    "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 dark:hover:bg-emerald-900/60",
  reject:
    "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300 dark:hover:bg-rose-900/60",
  unban:
    "border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-300 dark:hover:bg-teal-900/60",
  resetPassword:
    "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-300 dark:hover:bg-sky-900/60",
  changeRole:
    "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900/60",
  ban:
    "border-red-200 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300 dark:hover:bg-red-900/60",
} as const;

/**
 * Pinned actions column. An opaque card background keeps the scrolling
 * columns from showing through; the left shadow marks the frozen edge, and
 * the hover overlay reproduces the row's `hover:bg-muted/50` tint so the
 * pinned cell brightens together with the rest of the row.
 */
const PINNED_ACTIONS_HEAD =
  "sticky right-0 z-10 w-[270px] bg-card text-right shadow-[-12px_0_12px_-12px_rgba(0,0,0,0.18)] dark:shadow-[-12px_0_12px_-12px_rgba(0,0,0,0.6)]";

const PINNED_ACTIONS_CELL =
  "sticky right-0 z-10 bg-card text-right shadow-[-12px_0_12px_-12px_rgba(0,0,0,0.18)] dark:shadow-[-12px_0_12px_-12px_rgba(0,0,0,0.6)] transition-colors group-hover/row:bg-[color-mix(in_oklch,var(--card),var(--muted)_50%)]";

/** Resolves an enum code (country / focus market) to its locale label; unknown codes pass through. */
function optionLabel(
  options: { code: string; zh: string; en: string }[],
  code: string,
  locale: Locale,
): string {
  const option = options.find((item) => item.code === code);
  if (!option) return code;
  return pickLocalized(option, locale);
}

/**
 * Focus-market chips — every market the user picked stays on screen: the chips
 * wrap inside the column instead of truncating into a tooltip. The fill is
 * deliberately neutral, because colour is already spent on the review and
 * account badges; `muted`/`border` keep the same contrast in both themes.
 */
function MarketTags({
  codes,
  locale,
  className,
}: {
  codes: string[];
  locale: Locale;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {codes.map((code) => (
        <span
          key={code}
          className="inline-flex max-w-full items-center truncate rounded-md border border-border bg-muted/70 px-1.5 py-0.5 text-[11px] leading-none"
        >
          {optionLabel(MARKETS, code, locale)}
        </span>
      ))}
    </div>
  );
}

/** Registration review outcome — pending / approved / rejected. */
function ReviewStatusBadge({ status }: { status: User["status"] }) {
  const { t } = useI18n();
  switch (status) {
    case "pending":
      return (
        <Badge className="border-transparent bg-amber-500/15 font-normal text-amber-700 dark:text-amber-400">
          {t("admin.users.statusPending")}
        </Badge>
      );
    case "approved":
      return (
        <Badge className="border-transparent bg-emerald-500/15 font-normal text-emerald-700 dark:text-emerald-400">
          {t("admin.users.statusApproved")}
        </Badge>
      );
    case "rejected":
      return (
        <Badge className="border-transparent bg-rose-500/15 font-normal text-rose-700 dark:bg-rose-500/20 dark:text-rose-400">
          {t("admin.users.statusRejected")}
        </Badge>
      );
  }
}

/** Account availability — normal / banned; kept apart from the review outcome. */
function AccountStatusBadge({ user }: { user: User }) {
  const { t } = useI18n();
  if (user.isBanned) {
    return (
      <Badge className="border-transparent bg-red-500/15 font-normal text-red-700 dark:bg-red-500/20 dark:text-red-400">
        {t("admin.users.banned")}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="font-normal">
      {t("admin.users.statusNormal")}
    </Badge>
  );
}

/** Role chip — a muted accent for administrators, neutral for everyone else. */
function RoleBadge({ role }: { role: User["role"] }) {
  const { t } = useI18n();
  if (role === "admin") {
    return (
      <Badge className="border-transparent bg-indigo-500/10 font-normal text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
        {t("admin.users.roleAdmin")}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="font-normal">
      {t("admin.users.roleUser")}
    </Badge>
  );
}

/**
 * `技0 知0` — one seamless segmented counter. The two labels carry the
 * content-type tints (brand green / knowledge lilac) while the numbers stay
 * on the plain card surface, and the whole strip shares a single 4px radius.
 */
function DownloadBreakdown({ user }: { user: User }) {
  const { t, locale } = useI18n();
  return (
    <span className="inline-flex items-stretch overflow-hidden rounded-[4px] border text-[11px] leading-none">
      <span
        title={t("contentType.skill")}
        className="flex items-center bg-primary/10 px-1.5 py-1 font-medium text-primary dark:bg-primary/15"
      >
        {t("admin.users.downloadSkillShort")}
      </span>
      <span className="flex items-center px-1.5 py-1 tabular-nums text-foreground/80">
        {formatNumber(user.skillDownloadCount, locale)}
      </span>
      <span
        title={t("contentType.knowledge")}
        className="flex items-center border-l bg-knowledge-soft px-1.5 py-1 font-medium text-knowledge"
      >
        {t("admin.users.downloadKnowledgeShort")}
      </span>
      <span className="flex items-center px-1.5 py-1 tabular-nums text-foreground/80">
        {formatNumber(user.knowledgeDownloadCount, locale)}
      </span>
    </span>
  );
}

interface UserActionsProps {
  user: User;
  isSelf: boolean;
  reviewPending: boolean;
  onApprove: (user: User) => void;
  onReject: (user: User) => void;
  onChangeRole: (user: User) => void;
  onResetPassword: (user: User) => void;
  onBan: (user: User) => void;
  onUnban: (user: User) => void;
}

/**
 * Row actions — every operation stays one click away, expanded inline instead
 * of hidden behind an overflow menu. Each action wears its own tinted chip
 * (see ACTION_TONES) so the operations stay recognisable at a glance while
 * the text label keeps the meaning explicit.
 */
function UserRowActions({
  user,
  isSelf,
  reviewPending,
  onApprove,
  onReject,
  onChangeRole,
  onResetPassword,
  onBan,
  onUnban,
}: UserActionsProps) {
  const { t } = useI18n();

  // The built-in `admin` account is the highest privilege: no row actions.
  if (user.handle === "admin") {
    return (
      <div className="flex justify-end">
        <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
          <ShieldCheck className="size-3" />
          {t("admin.users.superAdmin")}
        </Badge>
      </div>
    );
  }

  // Administrators do not operate on their own account — no role change, ban
  // or review actions on the signed-in user's row.
  if (isSelf) {
    return (
      <div className="flex justify-end">
        <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
          <UserCheck className="size-3" />
          {t("admin.users.currentAccount")}
        </Badge>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {user.status === "pending" ? (
        <>
          <Button
            size="xs"
            className={cn(ACTION_TONES.approve, "gap-1")}
            disabled={reviewPending}
            onClick={() => onApprove(user)}
          >
            <Check className="size-3" />
            {t("admin.users.approve")}
          </Button>
          <Button
            size="xs"
            className={cn(ACTION_TONES.reject, "gap-1")}
            onClick={() => onReject(user)}
          >
            <UserX className="size-3" />
            {t("admin.users.reject")}
          </Button>
        </>
      ) : null}

      {user.isBanned ? (
        <Button
          size="xs"
          className={cn(ACTION_TONES.unban, "gap-1")}
          onClick={() => onUnban(user)}
        >
          <Unlock className="size-3" />
          {t("admin.users.unban")}
        </Button>
      ) : null}

      {user.status === "approved" ? (
        <Button
          size="xs"
          className={cn(ACTION_TONES.resetPassword, "gap-1")}
          onClick={() => onResetPassword(user)}
        >
          <KeyRound className="size-3" />
          {t("admin.users.resetPassword")}
        </Button>
      ) : null}

      {user.status === "approved" && !user.isBanned ? (
        <>
          <Button
            size="xs"
            className={cn(ACTION_TONES.changeRole, "gap-1")}
            onClick={() => onChangeRole(user)}
          >
            <ShieldCheck className="size-3" />
            {t("admin.users.changeRole")}
          </Button>
          <Button
            size="xs"
            className={cn(ACTION_TONES.ban, "gap-1")}
            onClick={() => onBan(user)}
          >
            <Ban className="size-3" />
            {t("admin.users.ban")}
          </Button>
        </>
      ) : null}
    </div>
  );
}

export function UsersContent() {
  const { t, locale } = useI18n();
  const { user: currentUser } = useCurrentUser();
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [banFilter, setBanFilter] = useState<BanFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(ADMIN_DEFAULT_PAGE_SIZE);
  const keyword = useDebouncedValue(search, 300).trim();
  const users = useAdminUsers({
    page,
    pageSize,
    status: reviewFilter === "all" ? "" : reviewFilter,
    keyword,
    // "all" omits the parameter entirely, matching the API's tri-state `banned`.
    banned: banFilter === "all" ? undefined : banFilter === "banned",
  });
  const review = useReviewUser();
  const pendingUsers = usePendingUserCount();

  const [createOpen, setCreateOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<User | null>(null);
  const [banTarget, setBanTarget] = useState<User | null>(null);
  const [unbanTarget, setUnbanTarget] = useState<User | null>(null);
  const [roleTarget, setRoleTarget] = useState<User | null>(null);
  const [resetTarget, setResetTarget] = useState<User | null>(null);

  const items = users.data?.data ?? [];
  // The badge query keeps the counter accurate under any filter; the list
  // response only carries it on the unfiltered first page.
  const pendingCount = pendingUsers.data ?? users.data?.pendingCount ?? 0;
  const total = users.data?.total ?? 0;

  const handleApprove = (user: User) => {
    review.mutate(
      { userId: user.id, action: "approve" },
      {
        onSuccess: () => toast.success(t("admin.users.approved")),
        onError: () => toast.error(t("common.error")),
      },
    );
  };

  const actionsProps = (user: User): UserActionsProps => ({
    user,
    // Empty ids never match, so the guard keeps two placeholder payloads apart.
    isSelf: Boolean(currentUser?.id) && currentUser?.id === user.id,
    reviewPending: review.isPending,
    onApprove: handleApprove,
    onReject: setRejectTarget,
    onChangeRole: setRoleTarget,
    onResetPassword: setResetTarget,
    onBan: setBanTarget,
    onUnban: setUnbanTarget,
  });

  // Paging controls are shared: a toolbar above the desktop table, and the
  // footer under the mobile cards.
  const pagingControls =
    !users.isLoading && total > 0 ? (
      <TablePager
        total={total}
        page={page}
        pageSize={pageSize}
        fetching={users.isFetching}
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
      <h1 className="sr-only">{t("admin.users.title")}</h1>

      {/* Toolbar — the primary action on the left, filters and search kept
          together on the right. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
            <UserPlus className="size-3.5" />
            {t("admin.users.createUser")}
          </Button>

          {/* Pending reviews ride next to the primary action: the count doubles
              as a one-click filter, and the ring marks it while active. */}
          {pendingCount > 0 || reviewFilter === "pending" ? (
            <Button
              type="button"
              size="sm"
              variant="warning"
              aria-pressed={reviewFilter === "pending"}
              title={
                reviewFilter === "pending" ? undefined : t("admin.users.pendingChipHint")
              }
              onClick={() => {
                setReviewFilter(reviewFilter === "pending" ? "all" : "pending");
                setPage(1);
              }}
              className={cn(
                "gap-1.5 tabular-nums",
                reviewFilter === "pending" &&
                  "ring-1 ring-amber-600/40 ring-inset dark:ring-amber-400/40",
              )}
            >
              <span aria-hidden className="size-1.5 rounded-full bg-current" />
              {t("admin.users.pendingChip", { count: pendingCount })}
            </Button>
          ) : null}
        </div>

        <div className="ml-auto flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
          <div className="flex items-center gap-2">
            <Label
              htmlFor="users-filter-status"
              className="whitespace-nowrap text-muted-foreground"
            >
              {t("admin.users.status")}
            </Label>
            <Select
              value={banFilter}
              onValueChange={(value) => {
                setBanFilter(value as BanFilter);
                setPage(1);
              }}
            >
              <SelectTrigger id="users-filter-status" size="sm" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin.users.filterAll")}</SelectItem>
                <SelectItem value="banned">{t("admin.users.banned")}</SelectItem>
                <SelectItem value="normal">{t("admin.users.statusNormal")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Label
              htmlFor="users-filter-review"
              className="whitespace-nowrap text-muted-foreground"
            >
              {t("admin.users.reviewStatus")}
            </Label>
            <Select
              value={reviewFilter}
              onValueChange={(value) => {
                setReviewFilter(value as ReviewFilter);
                setPage(1);
              }}
            >
              <SelectTrigger id="users-filter-review" size="sm" className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("admin.users.filterAll")}</SelectItem>
                <SelectItem value="pending">{t("admin.users.filterPending")}</SelectItem>
                <SelectItem value="approved">{t("admin.users.filterApproved")}</SelectItem>
                <SelectItem value="rejected">{t("admin.users.filterRejected")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder={t("admin.users.searchPlaceholder")}
              className="h-8 pl-9 text-sm"
            />
          </div>
        </div>
      </div>

      {/* List */}
      <AdminTableCard>
        {users.isLoading ? (
          <div className="space-y-3 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={keyword ? SearchX : Users}
            title={t("admin.users.empty")}
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

            {/* Desktop — the table keeps generous column widths and scrolls
                inside its own container (see TABLE_SCROLL); the actions column
                stays pinned to the right edge while the other columns scroll. */}
            {/* Keyed by page and size so a new page starts at the top-left of
                the scroll box instead of wherever the last one was left. */}
            <div key={`${page}-${pageSize}`} className={cn("hidden md:block", TABLE_FILL)}>
              {/* Minimum widths grow with the breakpoints so the visible columns
                  keep their intended width and the rest scroll under the pinned
                  actions column. */}
              <Table
                containerClassName={TABLE_SCROLL}
                className="min-w-[1080px] table-fixed lg:min-w-[1820px] xl:min-w-[2530px]"
              >
                <TableHeader className={TABLE_STICKY_HEAD}>
                  {/* Header rows are not interactive — no hover tint, which also
                      keeps the pinned header cell in step with its neighbours. */}
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[140px]">{t("admin.users.handle")}</TableHead>
                    <TableHead className="w-[130px]">{t("admin.users.displayName")}</TableHead>
                    <TableHead className="hidden w-[190px] lg:table-cell">
                      {t("admin.users.orgName")}
                    </TableHead>
                    <TableHead className="hidden w-[140px] lg:table-cell">
                      {t("admin.users.country")}
                    </TableHead>
                    <TableHead className="hidden w-[190px] xl:table-cell">
                      {t("admin.users.researchNeed")}
                    </TableHead>
                    <TableHead className="hidden w-[220px] xl:table-cell">
                      {t("admin.users.focusMarkets")}
                    </TableHead>
                    <TableHead className="hidden w-[200px] md:table-cell">
                      {t("admin.users.email")}
                    </TableHead>
                    <TableHead className="w-[90px]">{t("admin.users.role")}</TableHead>
                    <TableHead className="w-[120px]">{t("admin.users.reviewStatus")}</TableHead>
                    <TableHead className="w-[125px]">{t("admin.users.status")}</TableHead>
                    <TableHead className="hidden w-[150px] lg:table-cell">
                      {t("admin.users.rejectReason")}
                    </TableHead>
                    <TableHead className="hidden w-[150px] lg:table-cell">
                      {t("admin.users.banReason")}
                    </TableHead>
                    <TableHead className="hidden w-[220px] text-center xl:table-cell">
                      {t("admin.users.downloadCount")}
                    </TableHead>
                    <TableHead className="hidden w-[80px] text-center xl:table-cell">
                      {t("admin.users.loginCount")}
                    </TableHead>
                    <TableHead className="hidden w-[110px] text-center lg:table-cell">
                      {t("admin.users.createdAt")}
                    </TableHead>
                    {/* Pinned to the right — see PINNED_ACTIONS_* above. */}
                    <TableHead className={PINNED_ACTIONS_HEAD}>{t("common.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((user) => (
                    <TableRow key={user.id} className="group/row">
                      <TableCell>
                        <div className="truncate font-medium">{user.handle}</div>
                      </TableCell>
                      <TableCell>
                        <div className="truncate">{user.displayName || "—"}</div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="truncate">{user.orgName || "—"}</div>
                        {user.position ? (
                          <div className="truncate text-xs text-muted-foreground">
                            {user.position}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="truncate">
                          {user.country ? optionLabel(COUNTRIES, user.country, locale) : "—"}
                        </div>
                        {user.officeLocation ? (
                          <div className="truncate text-xs text-muted-foreground">
                            {user.officeLocation}
                          </div>
                        ) : null}
                      </TableCell>
                      {/* Research needs clamp to two lines; hover reveals the
                          full text in a theme-aware tooltip. */}
                      <TableCell className="hidden xl:table-cell">
                        {user.researchNeed ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="line-clamp-2 whitespace-pre-line">
                                {user.researchNeed}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent
                              side="top"
                              sideOffset={6}
                              className="max-w-80 whitespace-pre-line break-words py-2 leading-relaxed"
                            >
                              {user.researchNeed}
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      {/* Markets are shown in full as wrapping chips (see
                          MarketTags) — nothing is hidden behind a tooltip. */}
                      <TableCell className="hidden xl:table-cell">
                        {user.focusMarkets?.length ? (
                          <MarketTags codes={user.focusMarkets} locale={locale} />
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden truncate text-muted-foreground md:table-cell">
                        {user.email || "—"}
                      </TableCell>
                      <TableCell>
                        <RoleBadge role={user.role} />
                      </TableCell>
                      <TableCell>
                        <ReviewStatusBadge status={user.status} />
                      </TableCell>
                      <TableCell>
                        <AccountStatusBadge user={user} />
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {user.status === "rejected" && user.reviewNote ? (
                          <div className="truncate text-muted-foreground" title={user.reviewNote}>
                            {user.reviewNote}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        {user.isBanned && user.banReason ? (
                          <div className="truncate text-muted-foreground" title={user.banReason}>
                            {user.banReason}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-center xl:table-cell">
                        <DownloadBreakdown user={user} />
                      </TableCell>
                      <TableCell className="hidden text-center tabular-nums xl:table-cell">
                        {formatNumber(user.loginCount, locale)}
                      </TableCell>
                      <TableCell className="hidden text-xs text-center text-muted-foreground lg:table-cell">
                        {formatDate(user.createdAt, locale)}
                      </TableCell>
                      <TableCell className={PINNED_ACTIONS_CELL}>
                        <UserRowActions {...actionsProps(user)} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile — cards */}
            <div className="divide-y md:hidden">
              {items.map((user) => (
                <div key={user.id} className="space-y-2.5 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{user.displayName || user.handle}</span>
                      <ReviewStatusBadge status={user.status} />
                      <AccountStatusBadge user={user} />
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {user.handle}
                      {" · "}
                      {user.role === "admin"
                        ? t("admin.users.roleAdmin")
                        : t("admin.users.roleUser")}
                    </div>
                    {/* Registration profile as labelled key-value pairs — the
                        table header's counterpart on narrow screens. */}
                    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                      {user.email ? (
                        <>
                          <dt className="text-muted-foreground">{t("admin.users.email")}</dt>
                          <dd className="truncate">{user.email}</dd>
                        </>
                      ) : null}
                      {user.orgName ? (
                        <>
                          <dt className="text-muted-foreground">{t("admin.users.orgName")}</dt>
                          <dd className="truncate">{user.orgName}</dd>
                        </>
                      ) : null}
                      {user.position ? (
                        <>
                          <dt className="text-muted-foreground">{t("admin.users.position")}</dt>
                          <dd className="truncate">{user.position}</dd>
                        </>
                      ) : null}
                      {user.country ? (
                        <>
                          <dt className="text-muted-foreground">{t("admin.users.country")}</dt>
                          <dd className="truncate">
                            {optionLabel(COUNTRIES, user.country, locale)}
                          </dd>
                        </>
                      ) : null}
                      {user.officeLocation ? (
                        <>
                          <dt className="text-muted-foreground">
                            {t("admin.users.officeLocation")}
                          </dt>
                          <dd className="truncate">{user.officeLocation}</dd>
                        </>
                      ) : null}
                      <dt className="text-muted-foreground">{t("admin.users.createdAt")}</dt>
                      <dd>{formatDate(user.createdAt, locale)}</dd>
                      <dt className="text-muted-foreground">{t("admin.users.downloadCount")}</dt>
                      <dd>
                        <DownloadBreakdown user={user} />
                      </dd>
                      <dt className="text-muted-foreground">{t("admin.users.loginCount")}</dt>
                      <dd className="tabular-nums">{formatNumber(user.loginCount, locale)}</dd>
                    </dl>

                    {user.researchNeed ? (
                      <div className="mt-2 text-xs">
                        <div className="text-muted-foreground">
                          {t("admin.users.researchNeed")}
                        </div>
                        <p className="mt-0.5 whitespace-pre-line break-words">
                          {user.researchNeed}
                        </p>
                      </div>
                    ) : null}

                    {user.focusMarkets?.length ? (
                      <div className="mt-2 text-xs">
                        <div className="text-muted-foreground">
                          {t("admin.users.focusMarkets")}
                        </div>
                        <MarketTags
                          codes={user.focusMarkets}
                          locale={locale}
                          className="mt-1"
                        />
                      </div>
                    ) : null}

                    {user.status === "rejected" && user.reviewNote ? (
                      <div className="mt-1 text-xs text-destructive">
                        {t("admin.users.rejectedNote", { note: user.reviewNote })}
                      </div>
                    ) : null}
                    {user.isBanned && user.banReason ? (
                      <div className="mt-1 text-xs text-destructive">
                        {t("admin.users.bannedReason", { reason: user.banReason })}
                      </div>
                    ) : null}
                  </div>
                  <UserRowActions {...actionsProps(user)} />
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

      {/* Dialogs — portalled, so they never take space in the page column. */}
      <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <RejectUserDialog user={rejectTarget} onClose={() => setRejectTarget(null)} />
      <BanUserDialog user={banTarget} onClose={() => setBanTarget(null)} />
      <UnbanUserDialog user={unbanTarget} onClose={() => setUnbanTarget(null)} />
      <UserRoleDialog user={roleTarget} onClose={() => setRoleTarget(null)} />
      <ResetPasswordDialog user={resetTarget} onClose={() => setResetTarget(null)} />
    </AdminTablePage>
  );
}
