"use client";

import { ArrowLeft, Loader2, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useCurrentUser } from "@/hooks/use-auth";
import { useI18n } from "@/i18n";

/**
 * Admin chrome: a fixed sidebar on desktop, a sheet on mobile, and a role
 * gate that bounces non-admins (including signed-out visitors) away.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const { user, isAdmin, isLoading } = useCurrentUser();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    } else if (!isAdmin) {
      router.replace("/");
    }
  }, [isLoading, user, isAdmin, router, pathname]);

  if (isLoading || !isAdmin) {
    return (
      <div className="flex min-h-svh items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex min-h-svh">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r bg-muted/30 lg:block">
        <div className="sticky top-0 h-svh">
          <AdminSidebar />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-9 lg:hidden"
                aria-label={t("nav.menu")}
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 gap-0 p-0">
              <SheetTitle className="sr-only">{t("admin.console")}</SheetTitle>
              <AdminSidebar onNavigate={() => setMobileOpen(false)} withBackToSite />
            </SheetContent>
          </Sheet>

          <span className="text-sm font-medium lg:hidden">{t("admin.console")}</span>

          <div className="flex-1" />

          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden gap-1.5 text-muted-foreground sm:inline-flex"
          >
            <Link href="/">
              <ArrowLeft className="size-3.5" />
              {t("nav.backToSite")}
            </Link>
          </Button>
          <LocaleSwitcher />
          <ThemeToggle />
          <UserMenu />
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
