/**
 * Favourite ("star") toggling, shared by the catalogue cards and the skill
 * detail page.
 *
 * The star itself lives in the existing `stars` API; this hook only owns the
 * interaction rules — card clicks must not navigate, anonymous visitors are
 * sent to sign in, and the affected queries are refreshed afterwards.
 */

import { useState, type MouseEvent } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { starSkill, unstarSkill } from './api'
import { useSession } from './auth'

/** Minimum shape the toggle needs: identity plus the viewer's current state. */
export interface FavoriteTarget {
  slug: string
  namespaceSlug?: string
  starred?: boolean
}

/** `@namespace/slug` when namespaced, else the bare slug — the API's ref grammar. */
export function skillRefOf(skill: { slug: string; namespaceSlug?: string }): string {
  return skill.namespaceSlug ? `@${skill.namespaceSlug}/${skill.slug}` : skill.slug
}

function loginHref(): string {
  const here = window.location.pathname + window.location.search
  return `/login?redirect=${encodeURIComponent(here)}`
}

export interface FavoriteToggle {
  /** Whether the viewer has this skill favourited right now. */
  starred: boolean
  /** True while a request is in flight; the button disables itself. */
  pending: boolean
  /** Attach to `onClick`; safe to drop straight onto a button inside a link. */
  toggle: (event: MouseEvent) => void
}

export function useFavoriteToggle(skill: FavoriteTarget): FavoriteToggle {
  const { user } = useSession()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState(false)
  const starred = skill.starred === true

  const toggle = (event: MouseEvent) => {
    // Cards are wrapped in a `<Link>`, so the star must swallow the click.
    event.preventDefault()
    event.stopPropagation()

    if (!user) {
      window.location.href = loginHref()
      return
    }
    if (pending) return

    const ref = skillRefOf(skill)
    setPending(true)
    void (async () => {
      try {
        if (starred) await unstarSkill(ref)
        else await starSkill(ref)
      } catch {
        /* leave the state as-is; the next fetch reconciles it */
      } finally {
        setPending(false)
      }
      // Refresh every surface that renders the flag. The detail key is matched
      // by prefix on purpose: a request for a legacy slug alias caches under the
      // alias, not under the skill's canonical ref.
      await queryClient.invalidateQueries({ queryKey: ['favorites'] })
      await queryClient.invalidateQueries({ queryKey: ['skills'] })
      await queryClient.invalidateQueries({ queryKey: ['features'] })
      await queryClient.invalidateQueries({ queryKey: ['skill'] })
    })()
  }

  return { starred, pending, toggle }
}
