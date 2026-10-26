"use client";

import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ADMIN_PAGE_SIZE_OPTIONS } from "@/hooks/use-admin";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Console list pages own exactly one viewport: the card below the toolbar
 * takes whatever height is left. That keeps the table's horizontal scrollbar
 * at the bottom edge of the screen instead of below the fold, so reaching the
 * right-hand columns no longer means scrolling down, dragging the bar and
 * scrolling back up.
 *
 * The offsets mirror the console chrome: the top bar (`h-14`) plus the main
 * padding (`sm:p-6`). Mobile keeps normal page scrolling.
 */
export function AdminTablePage({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 md:h-[calc(100svh_-_6.5rem)] md:min-h-0",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Card that hands its remaining height to the table's own scroll container. */
export function AdminTableCard({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card
      className={cn(
        "gap-0 overflow-hidden py-0 md:min-h-0 md:flex-1",
        className,
      )}
    >
      {children}
    </Card>
  );
}

/** Card child that takes whatever height the toolbar left over. */
export const TABLE_FILL = "md:min-h-0 md:flex-1";

/**
 * The table's own viewport inside that wrapper: rows and columns both scroll
 * here, so the horizontal bar stays at the bottom of the card (and therefore
 * on screen) instead of sitting below the last row.
 */
export const TABLE_SCROLL = "md:h-full md:overflow-auto";

/**
 * Pinned header cells: the titles stay in view while the rows scroll under
 * them. The bottom rule is an inset shadow rather than a border — borders on
 * a collapsed-border table scroll away with the rows.
 */
export const TABLE_STICKY_HEAD =
  "[&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-card [&_th]:shadow-[inset_0_-1px_0_var(--border)]";

/**
 * Paging row shared by the console tables: running total and rows-per-page on
 * the left, prev/next on the right. Changing the page size resets to page 1 —
 * the current page may not exist under a larger size.
 */
export function TablePager({
  total,
  page,
  pageSize,
  fetching = false,
  onPageChange,
  onPageSizeChange,
}: {
  total: number;
  page: number;
  pageSize: number;
  fetching?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const { t } = useI18n();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex items-center gap-2 whitespace-nowrap">
          {fetching ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {t("common.total", { count: total })}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          ‹
        </Button>
        <span className="text-xs whitespace-nowrap">
          {page} / {totalPages}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          ›
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-xs whitespace-nowrap text-muted-foreground">
            {t("common.pageSize")}
          </span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPageSizeChange(Number(value))}
          >
            <SelectTrigger
              size="sm"
              className="w-28"
              aria-label={t("common.pageSize")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {ADMIN_PAGE_SIZE_OPTIONS.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {t("common.pageSizeOption", { count: size })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </>
  );
}
