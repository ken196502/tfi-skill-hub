"use client";

import type { ReactNode } from "react";
import { I18nProvider } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryProvider } from "./query-provider";
import { ThemeProvider } from "./theme-provider";

export function AppProviders({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  return (
    <ThemeProvider>
      <I18nProvider initialLocale={initialLocale}>
        <QueryProvider>
          <TooltipProvider>
            {children}
            {/*
              Toast UX: keep dwell time short (2.5s vs sonner's 4s default) and
              always dismissible — a close button plus swipe-up/right on touch —
              so a toast never blocks the UI underneath it for long.
            */}
            <Toaster
              richColors
              position="top-center"
              duration={2500}
              swipeDirections={["top", "right"]}
            />
          </TooltipProvider>
        </QueryProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
