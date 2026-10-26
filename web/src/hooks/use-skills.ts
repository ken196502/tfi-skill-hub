"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  downloadSkill,
  getSkill,
  getSkillFile,
  getSkillVersions,
  listCategories,
  listFeatures,
  listSkills,
  type ListSkillsParams,
} from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/query-keys";
import type { ContentType } from "@/lib/api/types";
import { patchCachedSkill } from "@/lib/list-cache";
import { skillRef } from "@/lib/refs";

/** Cursor-paged catalogue list; the UI auto-loads pages at the scroll sentinel. */
export function useSkillsInfinite(params: Omit<ListSkillsParams, "cursor">) {
  return useInfiniteQuery({
    queryKey: queryKeys.skills(params),
    queryFn: ({ pageParam }) => listSkills({ ...params, cursor: pageParam }),
    initialPageParam: "",
    getNextPageParam: (lastPage, allPages) => {
      const cursor = lastPage.nextCursor;
      if (!cursor) return undefined;
      // The catalogue cursor is a row id, so a row can land on both sides of
      // it and a page may repeat rows the previous page already sent. When a
      // page brings nothing new, stop instead of walking the same cursor
      // forever.
      const seen = new Set(
        allPages
          .slice(0, -1)
          .flatMap((page) => page.data.map((skill) => skill.id)),
      );
      const fresh = lastPage.data.some((skill) => !seen.has(skill.id));
      return fresh ? cursor : undefined;
    },
    select: (data) => {
      // Keep the first occurrence of every skill: a repeated row would
      // otherwise be rendered twice and trip React's duplicate-key warning.
      const seen = new Set<string>();
      return {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          data: page.data.filter((skill) => {
            if (seen.has(skill.id)) return false;
            seen.add(skill.id);
            return true;
          }),
        })),
      };
    },
    // Opening a skill detail unmounts the list, and this cache is not for
    // freshness — every mount revalidates. It only holds the loaded pages so
    // the return trip paints instantly (no skeleton flash) and
    // useScrollMemory has a list of the old height to scroll back into.
    // Explicit invalidation (star, download) still refreshes immediately.
    gcTime: 30 * 60_000,
  });
}

export function useSkill(ref: string | undefined) {
  return useQuery({
    queryKey: queryKeys.skill(ref ?? ""),
    queryFn: () => getSkill(ref as string),
    enabled: Boolean(ref),
  });
}

export function useSkillVersions(ref: string | undefined) {
  return useQuery({
    queryKey: queryKeys.skillVersions(ref ?? ""),
    queryFn: () => getSkillVersions(ref as string),
    enabled: Boolean(ref),
  });
}

/** Raw text of one file (used to render SKILL.md when no detail HTML exists). */
export function useSkillFile(
  ref: string | undefined,
  version: string | undefined,
  path: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: [...queryKeys.skill(ref ?? ""), "file", version, path],
    queryFn: () => getSkillFile(ref as string, version as string, path),
    enabled: Boolean(ref && version) && enabled,
  });
}

/** Skill categories for the catalogue sidebar; refetched on every mount. */
export function useCategories() {
  return useQuery({
    queryKey: queryKeys.categories,
    queryFn: listCategories,
  });
}

/** Curated skills for the home "Featured" strip; refetched on every mount. */
export function useFeatures() {
  return useQuery({
    queryKey: queryKeys.features,
    queryFn: listFeatures,
  });
}

/** Hottest entries (the backend `hot` ranking) — powers the home "Popular"
 * sections. Always refetched on mount so a fresh download reorders it. The
 * content type narrows the ranking to skills or knowledge bases. */
export function usePopularSkills(limit = 6, type?: ContentType) {
  return useQuery({
    queryKey: queryKeys.skills({ sort: "hot", limit, type }),
    queryFn: async () => {
      const page = await listSkills({ limit, sort: "hot", type });
      // Older backends ignore `type`; filtering here keeps the wrong content
      // type out of the section either way.
      return type
        ? { ...page, data: page.data.filter((skill) => skill.contentType === type) }
        : page;
    },
  });
}

export function useDownloadSkill() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ref: { slug: string; namespaceSlug?: string }) => downloadSkill(ref),
    onSuccess: (_data, variables) => {
      // A download bumps the counter — refresh the detail so its download
      // stats update right away.
      void queryClient.invalidateQueries({ queryKey: queryKeys.skill(skillRef(variables)) });
      void queryClient.invalidateQueries({ queryKey: ["skills"] });
      // The featured strip and the favourites page also render download
      // counters — invalidate them too so mounted copies refetch right away
      // instead of waiting for their next mount.
      void queryClient.invalidateQueries({ queryKey: queryKeys.features });
      void queryClient.invalidateQueries({ queryKey: queryKeys.stars });
      // Write the bump into every cached list right away: navigating back to
      // the home page (or any listing) must show it immediately, while the
      // invalidation refetch above recalibrates with server truth.
      patchCachedSkill(queryClient, skillRef(variables), (skill) => ({
        ...skill,
        downloads: skill.downloads + 1,
      }));
    },
  });
}
