"use client";

import {
  ArrowLeft,
  KeyRound,
  LayoutDashboard,
  PenLine,
  ScrollText,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BrandLogo } from "@/components/common/brand-logo";
import { useI18n } from "@/i18n";
import type { TranslationKey } from "@/i18n";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: TranslationKey;
  icon: LucideIcon;
  exact?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "admin.dashboard.title", icon: LayoutDashboard, exact: true },
  { href: "/admin/users", label: "admin.users.title", icon: Users },
  { href: "/admin/content", label: "admin.content.title", icon: PenLine },
  { href: "/admin/features", label: "admin.features.title", icon: Sparkles },
  { href: "/admin/api-keys", label: "admin.apiKeys.title", icon: KeyRound },
  { href: "/admin/audit", label: "admin.audit.title", icon: ScrollText },
] as const;

export function AdminSidebar({
  onNavigate,
  withBackToSite = false,
}: {
  onNavigate?: () => void;
  /** Shows a "back to site" link pinned to the bottom (used in the mobile sheet). */
  withBackToSite?: boolean;
}) {
  const { t } = useI18n();
  const pathname = usePathname();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b px-4">
        <BrandLogo className="h-5" />
        <span className="text-sm font-semibold">{t("admin.console")}</span>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {NAV_ITEMS.map((item) => {
          const active = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {t(item.label)}
            </Link>
          );
        })}
      </nav>

      {withBackToSite ? (
        <div className="border-t p-2">
          <Link
            href="/"
            onClick={onNavigate}
            className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            <ArrowLeft className="size-4 shrink-0" />
            {t("nav.backToSite")}
          </Link>
        </div>
      ) : null}
    </div>
  );
}
