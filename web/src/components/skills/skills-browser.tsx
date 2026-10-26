"use client";

import { Search, SearchX } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { InfiniteScroll } from "@/components/common/infinite-scroll";
import { SkillGrid } from "@/components/skills/skill-card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useScrollMemory } from "@/hooks/use-scroll-memory";
import { useCategories, useSkillsInfinite } from "@/hooks/use-skills";
import { useI18n } from "@/i18n";
import type { ContentType } from "@/lib/api/types";
import { VALID_CATEGORIES } from "@/lib/api/types";
import { categoryLabel } from "@/lib/category-label";
import { buildListHref, buildListSearch, normalizeListSearch } from "@/lib/list-filters";
import { cn } from "@/lib/utils";

export function SkillsBrowser({
  contentType = "skill",
  initialCategory = "",
  initialQuery = "",
  initialSort = "created",
}: {
  /** Which catalogue this browser lists; `/skills` and `/knowledge` share it. */
  contentType?: ContentType;
  initialCategory?: string;
  initialQuery?: string;
  initialSort?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const isKnowledge = contentType === "knowledge";
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState(initialCategory);
  const [sort, setSort] = useState(initialSort);
  const debouncedQuery = useDebouncedValue(query, 300);

  const categories = useCategories();
  const categoryList = categories.data?.categories ?? [...VALID_CATEGORIES];

  const skills = useSkillsInfinite({
    q: debouncedQuery.trim() || undefined,
    category: category || undefined,
    sort,
    // Each browser owns one content type: `/skills` lists skills and
    // `/knowledge` lists knowledge bases, with the same browsing UI.
    type: contentType,
    limit: 12,
  });

  const items = skills.data?.pages.flatMap((page) => page.data) ?? [];
  // Backend-reported overall match count; `items.length` only reflects the
  // pages loaded so far and would understate the header total.
  const total = skills.data?.pages[0]?.total ?? items.length;
  // Landing back here from a detail page should keep the browsing spot; the
  // pathname keys the snapshot so skills and knowledge stay independent.
  useScrollMemory(items.length, pathname);
  const isEmpty = !skills.isLoading && items.length === 0;

  // The filters are mirrored into the URL (replace, so the back button still
  // leaves the list). That is what makes "back from a detail page" land on this
  // same view: the card links carry this href as `returnTo`, the list then
  // mounts with the same query key, the already loaded pages are still cached,
  // and `useScrollMemory` has a list of the old height to scroll back into.
  const listSearch = useMemo(
    () => buildListSearch({ category, sort, q: debouncedQuery }),
    [category, sort, debouncedQuery],
  );
  const listHref = buildListHref(pathname, listSearch);

  useEffect(() => {
    // `window.location` rather than a search-params hook: the URL is only read
    // to decide whether a replace is due, so SSR never depends on it.
    if (normalizeListSearch(window.location.search) === listSearch) return;
    router.replace(listHref, { scroll: false });
  }, [listSearch, listHref, router]);

  const categoryOptions = [
    { value: "", label: t("common.all") },
    ...categoryList.map((item) => ({
      value: item,
      label: categoryLabel(item, t),
    })),
  ];

  return (
    // Landing-page parity: same brand glow + texture surface as the home page,
    // pulled up behind the sticky header (-mt-14/pt-14 compensate a 3.5rem
    // header). `grow` keeps the surface reaching the footer when the results
    // are shorter than the viewport (see the site layout's column flex main).
    <div className="home-surface relative -mt-14 grow pt-14">
      <div aria-hidden className="home-backdrop absolute inset-0" />
      <div className="relative mx-auto w-full max-w-6xl px-4 py-8">
        <header className="mb-6">
          <h1 className="motion-rise text-2xl font-semibold tracking-tight">
            {t(isKnowledge ? "knowledge.title" : "skills.title")}
          </h1>
          <p className="motion-rise motion-delay-1 mt-1 text-sm text-muted-foreground">
            {t(isKnowledge ? "knowledge.subtitle" : "skills.subtitle", { count: total })}
          </p>
        </header>

        <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
          {/* Sidebar — categories */}
          <aside className="lg:w-52 lg:shrink-0">
            <h2 className="mb-3 hidden text-sm font-medium text-muted-foreground lg:block">
              {t("skills.categoryFilter")}
            </h2>
            <nav className="flex flex-wrap gap-2 lg:flex-col lg:gap-0.5">
              {categoryOptions.map((option) => {
                const active = category === option.value;
                return (
                  <button
                    key={option.value || "all"}
                    type="button"
                    onClick={() => setCategory(option.value)}
                    aria-pressed={active}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-left text-sm transition-colors lg:w-full lg:py-2",
                      active
                        ? "bg-primary font-medium text-primary-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {option.label}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* Main — search, sort, results */}
          <div className="min-w-0 flex-1">
            {/* Toolbar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t(
                    isKnowledge ? "knowledge.searchPlaceholder" : "skills.searchPlaceholder",
                  )}
                  className="pl-9 dark:bg-card"
                />
              </div>
              <Select value={sort} onValueChange={setSort}>
                <SelectTrigger className="w-full sm:w-44 dark:bg-card dark:hover:bg-secondary">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="created">{t("skills.sortCreated")}</SelectItem>
                  <SelectItem value="updated">{t("skills.sortUpdated")}</SelectItem>
                  <SelectItem value="downloads">{t("skills.sortDownloads")}</SelectItem>
                  <SelectItem value="stars">{t("skills.sortStars")}</SelectItem>
                  <SelectItem value="name">{t("skills.sortName")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Results */}
            <div className="mt-6">
              {skills.isLoading ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <Skeleton key={index} className="h-36 rounded-xl" />
                  ))}
                </div>
              ) : isEmpty ? (
                <EmptyState
                  icon={SearchX}
                  title={t(isKnowledge ? "knowledge.empty" : "skills.empty")}
                  description={t(
                    isKnowledge ? "knowledge.emptyDesc" : "skills.emptyDesc",
                  )}
                />
              ) : (
                <>
                  <SkillGrid skills={items} returnTo={listHref} />
                  <InfiniteScroll
                    hasMore={skills.hasNextPage}
                    loading={skills.isFetchingNextPage}
                    onLoadMore={() => void skills.fetchNextPage()}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
