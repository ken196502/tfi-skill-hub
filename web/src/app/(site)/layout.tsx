import type { ReactNode } from "react";
import { BackToTop } from "@/components/layout/back-to-top";
import { SiteFooter } from "@/components/layout/site-footer";
import { SiteHeader } from "@/components/layout/site-header";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SiteHeader />
      {/* Column flex so the surface pages (home/skills/favorites) can grow to
          fill the viewport height when their content is short. */}
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter />
      <BackToTop />
    </>
  );
}
