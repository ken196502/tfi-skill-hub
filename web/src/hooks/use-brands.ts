"use client";

import { useQuery } from "@tanstack/react-query";
import { listBrands } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/query-keys";

/**
 * Organisation directory for the affiliation picker. Both language variants
 * travel in the payload and the list changes rarely, so one cached fetch
 * serves every form on the page.
 */
export function useBrands() {
  return useQuery({
    queryKey: queryKeys.brands,
    queryFn: listBrands,
    select: (result) => result.data,
    staleTime: 10 * 60_000,
  });
}
