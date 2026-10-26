import type { Metadata } from "next";
import { SkillsBrowser } from "@/components/skills/skills-browser";
import { readListFilters } from "@/lib/list-filters";

export const metadata: Metadata = {
  title: "技能库",
};

export default async function SkillsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // The URL is the entry point for the browsing context: the list seeds its
  // filters from it, then keeps it in step (see skills-browser).
  const filters = readListFilters(await searchParams);

  return (
    <SkillsBrowser
      initialCategory={filters.category}
      initialQuery={filters.q}
      initialSort={filters.sort}
    />
  );
}
