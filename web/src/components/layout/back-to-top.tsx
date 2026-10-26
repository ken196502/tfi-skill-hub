"use client";

import { ArrowUp } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";

const VISIBLE_AFTER = 480;

function subscribe(onStoreChange: () => void) {
  window.addEventListener("scroll", onStoreChange, { passive: true });
  window.addEventListener("resize", onStoreChange);
  return () => {
    window.removeEventListener("scroll", onStoreChange);
    window.removeEventListener("resize", onStoreChange);
  };
}

function getSnapshot() {
  return window.scrollY > VISIBLE_AFTER;
}

function getServerSnapshot() {
  return false;
}

/**
 * Floating back-to-top control for the public site. The visibility flag is an
 * external-store subscription rather than state inside a scroll effect, which
 * keeps the render tree free of scroll-driven state updates.
 */
export function BackToTop() {
  const { t } = useI18n();
  const visible = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!visible) return null;

  const scrollToTop = () => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
  };

  return (
    <Button
      type="button"
      size="icon"
      aria-label={t("common.backToTop")}
      title={t("common.backToTop")}
      onClick={scrollToTop}
      className="fixed bottom-5 right-4 z-30 size-10 rounded-full border border-border bg-card/95 text-foreground shadow-lg backdrop-blur transition-transform hover:-translate-y-0.5 sm:bottom-8 sm:right-8"
    >
      <ArrowUp className="size-4" />
    </Button>
  );
}
