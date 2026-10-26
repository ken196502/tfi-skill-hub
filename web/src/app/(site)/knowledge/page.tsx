import type { Metadata } from "next";
import { SkillsBrowser } from "@/components/skills/skills-browser";
import { readListFilters } from "@/lib/list-filters";

export const metadata: Metadata = {
  title: "知识库",
};

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Same browsing contract as /skills: the URL carries the filters so a
  // reload, a shared link and the detail page's back link all agree.
  const filters = readListFilters(await searchParams);

  return (
    <SkillsBrowser
      contentType="knowledge"
      initialCategory={filters.category}
      initialQuery={filters.q}
      initialSort={filters.sort}
    />
  );
}
