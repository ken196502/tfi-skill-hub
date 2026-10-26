"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { forgetAuthHint, rememberAuthHint } from "@/lib/auth-hint";
import { login, logout, register, sendEmailCode, whoami } from "@/lib/api/endpoints";
import { queryKeys } from "@/lib/api/query-keys";
import type { RegisterInput } from "@/lib/api/types";

/** The signed-in user, or `null`. */
export function useCurrentUser() {
  const query = useQuery({
    queryKey: queryKeys.whoami,
    queryFn: whoami,
    staleTime: 60_000,
  });

  return {
    ...query,
    user: query.data ?? null,
    isAuthenticated: Boolean(query.data),
    isAdmin: query.data?.role === "admin",
  };
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ handle, password }: { handle: string; password: string }) =>
      login(handle, password),
    onSuccess: async () => {
      // Arm the session probe before the refreshed whoami query runs.
      rememberAuthHint();
      await queryClient.invalidateQueries();
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      // No session left to probe — drop the hint before queries refetch.
      forgetAuthHint();
      queryClient.clear();
      await queryClient.invalidateQueries();
    },
  });
}

export function useRegister() {
  return useMutation({
    mutationFn: (input: RegisterInput) => register(input),
  });
}

/** Sends (or re-sends) the six-digit sign-up verification code. */
export function useSendEmailCode() {
  return useMutation({
    mutationFn: (email: string) => sendEmailCode(email),
  });
}
