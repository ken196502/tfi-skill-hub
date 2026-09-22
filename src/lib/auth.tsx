/**
 * Session state for the UI.
 *
 * `whoami` is the single source of truth and is cached by TanStack Query, so
 * navigating between pages does not re-fetch it. Refresh is exposed so the
 * layout can re-read the session after login/logout.
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from './api'
import type { User } from './types'

export const SESSION_KEY = ['session', 'whoami'] as const

export function useSession() {
  const query = useQuery({
    queryKey: SESSION_KEY,
    queryFn: api.whoami,
    staleTime: 60_000,
    retry: false,
  })
  return {
    user: query.data ?? null,
    /** True only for the very first load, so guards can avoid premature redirects. */
    booting: query.isLoading,
    refresh: query.refetch,
  }
}

export function useLogout() {
  const queryClient = useQueryClient()
  return async () => {
    await api.logout()
    // Drop every cached query: the previous user's data must not survive.
    queryClient.clear()
    await queryClient.invalidateQueries()
  }
}

export function homeFor(user: User | null): string {
  if (!user) return '/login'
  return user.role === 'admin' ? '/admin' : '/skills'
}
