"use client";

import { Search, SearchX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { InfiniteScroll } from "@/components/common/infinite-scroll";
import { SkillGrid } from "@/components/skills/skill-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useSkillsInfinite } from "@/hooks/use-skills";
import { useI18n } from "@/i18n";
import type { ContentType } from "@/lib/api/types";
import { cn } from "@/lib/utils";

type TypeFilter = "all" | ContentType;

const TYPE_FILTERS: TypeFilter[] = ["all", "skill", "knowledge"];

/** Canonical `/search` href — empty values and the default type are dropped. */
function buildSearchHref(query: string, type: TypeFilter): string {
  const params = new URLSearchParams();
  const value = query.trim();
  if (value) params.set("q", value);
  if (type !== "all") params.set("type", type);
  // `%20` instead of `+`, so a term containing a plus sign stays unambiguous.
  const search = params.toString().replace(/\+/g, "%20");
  return search ? `/search?${search}` : "/search";
}

function typeLabelKey(type: TypeFilter) {
  return type === "skill"
    ? "contentType.skill"
    : type === "knowledge"
      ? "contentType.knowledge"
      : "search.typeAll";
}

/**
 * Global search: one backend query across both content types, rendered as a
 * single mixed grid. The type chips only narrow the query — they never split
 * the results into separate skills / knowledge sections.
 */
export function SearchContent({
  initialQuery = "",
  initialType = "all",
}: {
  initialQuery?: string;
  initialType?: TypeFilter;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const [type, setType] = useState<TypeFilter>(initialType);
  const debouncedQuery = useDebouncedValue(query, 300);
  const q = debouncedQuery.trim();

  const results = useSkillsInfinite({
    q: q || undefined,
    type: type === "all" ? undefined : type,
    limit: 12,
  });

  const items = results.data?.pages.flatMap((page) => page.data) ?? [];
  const total = results.data?.pages[0]?.total ?? items.length;
  const isEmpty = !results.isLoading && items.length === 0;

  // The filters live in the URL, so a reload or a shared link renders the same
  // results and the detail page's back link can return to them.
  const href = buildSearchHref(q, type);
  useEffect(() => {
    // Compare only the known keys (and ignore the base path), so a clean URL
    // on first mount does not trigger a redundant replace.
    const current = new URLSearchParams(window.location.search);
    const next = new URLSearchParams(href.split("?")[1] ?? "");
    const same = ["q", "type"].every(
      (key) => (current.get(key) ?? "") === (next.get(key) ?? ""),
    );
    if (same) return;
    router.replace(href, { scroll: false });
  }, [href, router]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(buildSearchHref(query, type));
  }

  return (
    <div className="home-surface relative -mt-14 grow pt-14">
      <div aria-hidden className="home-backdrop absolute inset-0" />
      <div className="relative mx-auto w-full max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="motion-rise text-2xl font-semibold tracking-tight">
            {t("search.title")}
          </h1>
          <p className="motion-rise motion-delay-1 mt-1 text-sm text-muted-foreground">
            {results.isLoading || isEmpty
              ? t("search.subtitle")
              : t("search.resultCount", { count: total })}
          </p>
        </header>

        <form role="search" onSubmit={handleSubmit} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("search.inputPlaceholder")}
              aria-label={t("common.search")}
              className="pl-9 dark:bg-card"
            />
          </div>
          <Button type="submit" className="gap-1.5">
            <Search className="size-4" />
            {t("common.search")}
          </Button>
        </form>

        {/* Content-type chips — global search covers both types by default. */}
        <div className="mt-4 flex flex-wrap gap-2">
          {TYPE_FILTERS.map((value) => (
            <Button
              key={value}
              type="button"
              size="sm"
              variant={type === value ? "default" : "outline"}
              aria-pressed={type === value}
              onClick={() => setType(value)}
            >
              {t(typeLabelKey(value))}
            </Button>
          ))}
        </div>

        <div className={cn("mt-6", results.isLoading && "space-y-4")}>
          {results.isLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton key={index} className="h-36 rounded-xl" />
              ))}
            </div>
          ) : isEmpty ? (
            <EmptyState
              icon={SearchX}
              title={t("search.empty")}
              description={t("search.emptyDesc")}
            />
          ) : (
            <>
              {/* One flat grid: type chips only narrow the query; they never
                  split the result into separate skills / knowledge sections. */}
              <SkillGrid skills={items} returnTo={href} />
              <InfiniteScroll
                hasMore={results.hasNextPage}
                loading={results.isFetchingNextPage}
                onLoadMore={() => void results.fetchNextPage()}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
