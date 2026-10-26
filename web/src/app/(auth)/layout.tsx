import type { ReactNode } from "react";
import { SiteHeader } from "@/components/layout/site-header";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      {/* Same header as the landing site, so the auth pages do not feel
          like a separate shell. */}
      <SiteHeader />
      {/* Top-aligned with a reserved gap: the tall register form keeps its
          headroom instead of being clipped by vertical centring; the short
          login card centres itself via `sm:my-auto`. */}
      <main className="relative flex flex-1 items-start justify-center overflow-hidden px-4 pb-16 pt-10 sm:pt-14">
        {/* Brand glow behind the card, echoing the landing surface. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-80 w-[42rem] max-w-full -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,var(--primary),transparent_70%)] opacity-[0.14] blur-2xl dark:opacity-[0.18]"
        />
        {children}
      </main>
    </div>
  );
}
