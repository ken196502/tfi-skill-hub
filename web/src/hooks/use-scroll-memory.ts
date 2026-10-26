"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * Remembers the window scroll offset together with how many list rows were
 * loaded, and restores the offset when the list mounts again (e.g. the user
 * returns from a detail page).
 *
 * Snapshots are keyed by list route so the skills and knowledge catalogues do
 * not restore each other's offsets. The snapshot lives in module memory only:
 * a full page load starts fresh, and a restore is skipped whenever fewer rows
 * are available than before (i.e. the query cache no longer holds the pages
 * the user had loaded).
 */
type ScrollSnapshot = {
  items: number;
  scrollY: number;
};

const snapshots = new Map<string, ScrollSnapshot>();

/** Writers stay quiet while a restore is settling, see below. */
let restorePending = false;

/**
 * How long a fresh mount keeps re-asserting the restored offset. The router
 * reveals the incoming segment across several commits (the server payload is
 * swapped in), and one of those late commits can run the router's own
 * scroll-to-top — after this component has already mounted.
 */
const RESTORE_WINDOW_MS = 2500;

export function useScrollMemory(itemsLoaded: number, key = "default") {
  const itemsRef = useRef(itemsLoaded);

  // Keep the latest row count readable from event listeners.
  useLayoutEffect(() => {
    itemsRef.current = itemsLoaded;
  });

  // Restore once, right after the navigation that mounted this list.
  useLayoutEffect(() => {
    const saved = snapshots.get(key);
    if (!saved || saved.items <= 0 || saved.scrollY <= 0) return;
    if (itemsRef.current < saved.items) return;

    let finished = false;

    const apply = () => {
      const root = document.documentElement;
      const previous = root.style.scrollBehavior;
      // `html` opts into `scroll-behavior: smooth`; a restore must not animate.
      root.style.scrollBehavior = "auto";
      window.scrollTo(0, saved.scrollY);
      root.style.scrollBehavior = previous;
    };

    const finish = () => {
      if (finished) return;
      finished = true;
      restorePending = false;
      clearTimeout(timer);
      window.removeEventListener("scroll", guard);
      window.removeEventListener("wheel", onUserInput);
      window.removeEventListener("touchstart", onUserInput);
      window.removeEventListener("keydown", onUserInput);
      window.removeEventListener("mousedown", onUserInput);
    };

    // The router may hide and reveal this segment while the navigation
    // settles; the effect then cleans up and arms again, which is fine.
    restorePending = true;

    const guard = () => {
      if (!finished && Math.abs(window.scrollY - saved.scrollY) > 2) apply();
    };

    const onUserInput = () => {
      finish();
    };

    const timer = setTimeout(finish, RESTORE_WINDOW_MS);

    // A microtask runs after every layout effect of this commit — including
    // the router's own scroll handling — but still before the browser paints,
    // so the saved offset wins without a visible jump.
    queueMicrotask(() => {
      if (finished) return;
      apply();
      window.addEventListener("scroll", guard, { passive: true });
      window.addEventListener("wheel", onUserInput, { passive: true });
      window.addEventListener("touchstart", onUserInput, { passive: true });
      window.addEventListener("keydown", onUserInput);
      window.addEventListener("mousedown", onUserInput);
    });

    return finish;
  }, [key]);

  // While browsing, mirror the live position (and row count) into the snapshot.
  useEffect(() => {
    const remember = () => {
      if (restorePending || itemsRef.current <= 0) return;
      snapshots.set(key, { items: itemsRef.current, scrollY: window.scrollY });
    };
    window.addEventListener("scroll", remember, { passive: true });
    return () => window.removeEventListener("scroll", remember);
  }, [key]);

  // Row count changes without a scroll event (load more, filters). Stamping
  // the offset on mount is skipped on purpose: a fresh navigation starts at
  // 0, which must not overwrite the position that is about to be restored.
  const lastItemsRef = useRef<number | null>(null);
  useEffect(() => {
    const lastItems = lastItemsRef.current;
    lastItemsRef.current = itemsLoaded;
    if (lastItems === null || lastItems === itemsLoaded) return;
    if (restorePending || !snapshots.has(key) || itemsLoaded <= 0) return;
    snapshots.set(key, { items: itemsLoaded, scrollY: window.scrollY });
  }, [itemsLoaded, key]);
}
