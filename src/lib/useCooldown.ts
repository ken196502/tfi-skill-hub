/**
 * A countdown that follows the server's clock.
 *
 * The sign-up form's "send code" action is throttled per address on the server,
 * which returns how many seconds remain. The number here is only a mirror for
 * the label — it is driven by wall-clock timestamps rather than a tick
 * counter, so a throttled background tab does not drift and end up showing a
 * different number than the one the server would report.
 *
 * `start(seconds)` begins one from the server's answer; there is no default
 * duration here on purpose — the wait belongs to whoever throttles it, and this
 * only mirrors the number they report.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export function useCooldown() {
  /** Seconds left; 0 when the action is available. */
  const [remaining, setRemaining] = useState(0)
  /** Wall-clock instant the countdown ends; the only source of truth. */
  const endsAtRef = useRef(0)
  const running = remaining > 0

  // `start` and `clear` keep a stable identity for the whole life of the hook,
  // so a caller can list them in a `useCallback` / `useEffect` without the
  // callback being rebuilt on every tick.
  const start = useCallback((from: number) => {
    if (from <= 0) {
      endsAtRef.current = 0
      setRemaining(0)
      return
    }
    endsAtRef.current = Date.now() + from * 1000
    setRemaining(from)
  }, [])

  const clear = useCallback(() => {
    endsAtRef.current = 0
    setRemaining(0)
  }, [])

  const isActive = useCallback(() => endsAtRef.current > Date.now(), [])

  useEffect(() => {
    if (endsAtRef.current === 0) return
    const tick = () => {
      const left = Math.max(0, Math.ceil((endsAtRef.current - Date.now()) / 1000))
      setRemaining(left)
    }
    const timer = window.setInterval(tick, 250)
    // Recomputed against the stored instant rather than decremented, so a
    // throttled background tab resumes on the right second.
    tick()
    return () => window.clearInterval(timer)
  }, [running])

  return { remaining, start, clear, isActive, active: running }
}