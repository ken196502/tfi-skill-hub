"use client";

import { ArrowRight, Search, Sparkles, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { LaunchOverlay } from "@/components/home/launch-overlay";
import { ContentTypeBadge } from "@/components/skills/content-type-badge";
import { SkillGrid } from "@/components/skills/skill-card";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useFeatures, usePopularSkills } from "@/hooks/use-skills";
import { useI18n } from "@/i18n";
import type { ContentType, SkillWithOwner } from "@/lib/api/types";

// 湖北产业知识库 demo —— 打包进来的独立静态站（`public/hubei-knowledge`），
// 不是 Next 路由，用普通 `<a>` 触发整页跳转；和 site-header 同入口。
const DEMO_PATH = "/hubei-knowledge/index.html";
const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").trim().replace(/\/+$/, "");
const HUBEI_KB_HREF = `${BASE_PATH}${DEMO_PATH}`;

export function HomeContent() {
  const { t } = useI18n();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const features = useFeatures();
  // The curated list is one sequence; the home shows the skill strip from it.
  const featuredSkills = (features.data?.data ?? []).filter(
    (skill) => skill.contentType === "skill",
  );
  const popularSkills = usePopularSkills(6, "skill");

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    // Global search: the results page covers both skills and knowledge bases.
    router.push(value ? `/search?q=${encodeURIComponent(value)}` : "/search");
  }

  return (
    // -mt-14 / pt-14: pull the surface up behind the transparent landing
    // header (h-14) so the ambient layers start at the very top of the page;
    // the padding pushes the content back to its original position.
    <div className="home-surface relative -mt-14 flex flex-col overflow-hidden pt-14">
      {/* Drifting brand-glow layer, then the texture overlay on top */}
      <div aria-hidden className="home-aurora absolute inset-0" />
      <div aria-hidden className="home-backdrop absolute inset-0" />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="relative mx-auto w-full max-w-6xl px-4 py-16 text-center sm:py-24">
          <h1 className="home-title text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
            {t("home.heroTitle")}
          </h1>
          <p className="motion-rise motion-delay-1 mx-auto mt-4 max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
            {t("home.heroSubtitle")}
          </p>

          {/* Search */}
          <form
            role="search"
            onSubmit={handleSearch}
            className="motion-rise motion-delay-2 mx-auto mt-9 flex w-full max-w-xl items-center gap-1.5 rounded-full border bg-card/90 p-1.5 shadow-sm backdrop-blur transition-all focus-within:border-ring focus-within:shadow-md"
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("home.searchPlaceholder")}
              aria-label={t("common.search")}
              className="h-10 min-w-0 flex-1 bg-transparent pl-4 pr-2 text-sm outline-none placeholder:text-muted-foreground"
            />
            <Button
              type="submit"
              size="icon"
              aria-label={t("common.search")}
              className="size-10 shrink-0 rounded-full"
            >
              <Search className="size-4" />
            </Button>
          </form>
        </div>
      </section>

      {/* Featured skills */}
      <HomeSection
        type="skill"
        title={t("home.featuredSkillsTitle")}
        subtitle={t("home.featuredSkillsSubtitle")}
        browseLabel={t("home.browseAllSkills")}
        href="/skills"
        returnTo="/skills"
        loading={features.isLoading}
        skills={featuredSkills}
        emptyIcon={Sparkles}
        emptyTitle={t("home.noFeaturedSkills")}
        emptyDesc={t("home.noFeaturedSkillsDesc")}
      />

      {/* Hardcoded featured knowledge base — 湖北产业知识库 demo entry.
          Sits right under featured skills; clicking opens the same static
          bundle the header "湖北产业知识库" link points to. */}
      <section className="relative mx-auto w-full max-w-6xl px-4 pb-16">
        <div className="motion-rise mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              {t("home.hubeiKbTitle")}
              <ContentTypeBadge type="knowledge" />
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("home.hubeiKbDesc")}</p>
          </div>
        </div>
        <a href={HUBEI_KB_HREF} className="group block">
          <Card className="gap-0 py-0 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-foreground/25">
            <div className="flex h-full flex-col gap-2.5 p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="line-clamp-1 min-w-0 font-medium leading-snug transition-colors group-hover:text-primary">
                  {t("nav.hubeiDemo")}
                </h3>
                <ContentTypeBadge type="knowledge" className="shrink-0" />
              </div>
              <p className="line-clamp-2 flex-1 text-sm text-muted-foreground">
                {t("home.hubeiKbDesc")}
              </p>
              <div className="flex items-center gap-1 pt-1 text-sm font-medium text-primary">
                {t("home.hubeiKbEnter")}
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </div>
            </div>
          </Card>
        </a>
      </section>

      {/* Popular skills — top downloads */}
      <HomeSection
        type="skill"
        title={t("home.popularSkillsTitle")}
        subtitle={t("home.popularSkillsSubtitle")}
        browseLabel={t("home.browseAllSkills")}
        href="/skills?sort=downloads"
        returnTo="/skills?sort=downloads"
        loading={popularSkills.isLoading}
        skills={popularSkills.data?.data ?? []}
        emptyIcon={TrendingUp}
        emptyTitle={t("home.noPopularSkills")}
        emptyDesc={t("home.noPopularSkillsDesc")}
      />

      {/* Fixed-position launch curtain, shown by default only on the landing
          page. */}
      <LaunchOverlay />
    </div>
  );
}

/** One home strip — shared by the two skill sections. */
function HomeSection({
  type,
  title,
  subtitle,
  browseLabel,
  href,
  returnTo,
  loading,
  skills,
  emptyIcon,
  emptyTitle,
  emptyDesc,
}: {
  /** Which content type this strip lists — also rendered as a header chip. */
  type: ContentType;
  title: string;
  subtitle: string;
  browseLabel: string;
  href: string;
  /** Listing the card links return to; keeps knowledge out of the skills list. */
  returnTo: string;
  loading: boolean;
  skills: SkillWithOwner[];
  emptyIcon: LucideIcon;
  emptyTitle: string;
  emptyDesc: string;
}) {
  return (
    <section className="relative mx-auto w-full max-w-6xl px-4 pb-16">
      <div className="motion-rise mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            {title}
            <ContentTypeBadge type={type} />
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <Button asChild variant="ghost" size="sm" className="gap-1 text-muted-foreground">
          <Link href={href}>
            {browseLabel}
            <ArrowRight className="size-3.5 transition-transform group-hover/button:translate-x-0.5" />
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : skills.length > 0 ? (
        <SkillGrid skills={skills} returnTo={returnTo} />
      ) : (
        <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDesc} />
      )}
    </section>
  );
}
