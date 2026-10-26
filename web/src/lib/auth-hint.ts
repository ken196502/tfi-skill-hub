/**
 * Browser-side hint that a sign-in happened on this browser.
 *
 * The session cookie itself is httpOnly, so the client cannot tell whether
 * one exists. Without a hint every anonymous visitor would probe
 * `/api/v1/whoami` and collect a 401; with it the probe is only sent after
 * a login was seen (and is skipped again once the session turns out stale).
 */
const AUTH_HINT_KEY = "tfi-skillhub:authed";

export function hasAuthHint(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(AUTH_HINT_KEY) === "1";
  } catch {
    // Storage unavailable — fall back to probing rather than assuming the
    // visitor is signed out.
    return true;
  }
}

export function rememberAuthHint(): void {
  try {
    window.localStorage.setItem(AUTH_HINT_KEY, "1");
  } catch {
    // Storage may be unavailable (private mode) — the probe fallback covers it.
  }
}

export function forgetAuthHint(): void {
  try {
    window.localStorage.removeItem(AUTH_HINT_KEY);
  } catch {
    // Nothing to do when storage is unavailable.
  }
}
