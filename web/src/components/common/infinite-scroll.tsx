"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Bottom sentinel for cursor-paged lists. `rootMargin` starts the request
 * before the sentinel reaches the viewport, so the next cards are usually
 * ready by the time the visitor scrolls to the end. The callback is kept in a
 * ref so re-renders with a fresh inline handler do not churn the observer.
 */
export function InfiniteScroll({
  hasMore,
  loading,
  onLoadMore,
  className,
}: {
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onLoadMoreRef = useRef(onLoadMore);
  const requestedRef = useRef(false);

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    requestedRef.current = false;
    if (!hasMore || loading) return;

    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting) || requestedRef.current) return;
        requestedRef.current = true;
        onLoadMoreRef.current();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading]);

  if (!hasMore) {
    return (
      <p className={cn("py-8 text-center text-xs text-muted-foreground", className)}>
        {t("common.endOfList")}
      </p>
    );
  }

  return (
    <div
      ref={sentinelRef}
      role="status"
      aria-live="polite"
      className={cn(
        "flex min-h-16 items-center justify-center gap-2 py-6 text-xs text-muted-foreground",
        className,
      )}
    >
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {t("common.loadingMore")}
        </>
      ) : (
        t("common.scrollForMore")
      )}
    </div>
  );
}
