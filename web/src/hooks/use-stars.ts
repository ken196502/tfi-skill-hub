"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listStarredSkills, starSkill, unstarSkill } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/query-keys";
import { patchCachedSkill } from "@/lib/list-cache";
import type { SkillWithOwner } from "@/lib/api/types";

export function useStarredSkills(enabled = true) {
  return useQuery({
    queryKey: queryKeys.stars,
    queryFn: () => listStarredSkills({ limit: 100 }),
    enabled,
  });
}

/**
 * Toggles a favourite. Optimistically flips the `starred` flag on the detail
 * cache so the button responds instantly; lists revalidate in the background.
 */
export function useStarToggle() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ ref, starred }: { ref: string; starred: boolean }) =>
      starred ? unstarSkill(ref) : starSkill(ref),
    onMutate: async ({ ref, starred }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.skill(ref) });
      const previous = queryClient.getQueryData<SkillWithOwner>(queryKeys.skill(ref));
      if (previous) {
        queryClient.setQueryData<SkillWithOwner>(queryKeys.skill(ref), {
          ...previous,
          starred: !starred,
          starsCount: Math.max(0, previous.starsCount + (starred ? -1 : 1)),
        });
      }
      return { previous };
    },
    onError: (_error, variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.skill(variables.ref), context.previous);
      }
    },
    onSuccess: (_data, variables) => {
      const starred = !variables.starred;
      // Mirror the optimistic detail update onto every cached list (home
      // featured/popular strips, the catalogue, favourites) so navigating
      // back shows the new count instantly; the invalidations below refetch
      // server truth afterwards.
      patchCachedSkill(queryClient, variables.ref, (skill) => ({
        ...skill,
        starred,
        starsCount: Math.max(0, skill.starsCount + (starred ? 1 : -1)),
      }));
      void queryClient.invalidateQueries({ queryKey: queryKeys.stars });
      void queryClient.invalidateQueries({ queryKey: ["skills"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.features });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.skill(variables.ref),
      });
    },
  });
}
