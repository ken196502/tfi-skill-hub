import type { QueryClient } from "@tanstack/react-query";
import { skillRef } from "@/lib/refs";
import type { SkillWithOwner } from "@/lib/api/types";

type PagedSkills = { data: SkillWithOwner[] };
/** Infinite queries cache `{ pages, pageParams }`; plain queries cache the page itself. */
type SkillsCacheShape = PagedSkills | { pages: PagedSkills[] };

/**
 * Rewrites every cached entry matching `ref` across all skill-list caches —
 * `["skills", params]` (both paged and infinite), `["features"]`, `["stars"]`.
 *
 * Mutations call this on success so listings show the new counters the instant
 * the user navigates back, without waiting for the invalidation refetch;
 * that refetch still runs afterwards and recalibrates with server truth.
 */
export function patchCachedSkill(
  queryClient: QueryClient,
  ref: string,
  patch: (skill: SkillWithOwner) => SkillWithOwner,
) {
  const updatePage = (page: PagedSkills): PagedSkills => {
    if (!Array.isArray(page.data)) return page;
    return {
      ...page,
      data: page.data.map((skill) => (skillRef(skill) === ref ? patch(skill) : skill)),
    };
  };

  for (const key of [["skills"], ["features"], ["stars"]] as const) {
    queryClient.setQueriesData<SkillsCacheShape>({ queryKey: key }, (cached) => {
      if (!cached) return undefined;
      if ("pages" in cached && Array.isArray(cached.pages)) {
        return { ...cached, pages: cached.pages.map(updatePage) };
      }
      return updatePage(cached as PagedSkills);
    });
  }
}
