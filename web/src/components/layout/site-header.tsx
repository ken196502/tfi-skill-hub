"use client";

import { LogOut, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BrandLogo } from "@/components/common/brand-logo";
import { LocaleSwitcher } from "@/components/layout/locale-switcher";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useCurrentUser, useLogout } from "@/hooks/use-auth";
import { useI18n } from "@/i18n";
import type { TranslationKey } from "@/i18n";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "nav.home" },
  { href: "/skills", label: "nav.skills" },
  { href: "/favorites", label: "nav.favorites" },
] as const;

/**
 * 湖北产业知识库 demo —— 打包进来的独立静态站（`web/public/hubei-knowledge`），
 * 不是 Next 路由，所以用普通 `<a>` 触发整页跳转而不是客户端导航。
 * 部署在子路径下时 public 资源同样带前缀，这里补上 basePath。
 */
const DEMO_PATH = "/hubei-knowledge/index.html";
const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").trim().replace(/\/+$/, "");

type NavItem = {
  href: string;
  label: TranslationKey;
  /** Static bundle outside the router: plain anchor + full page load. */
  static?: boolean;
};

export function SiteHeader() {
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const { user, isAuthenticated, isLoading } = useCurrentUser();
  const logout = useLogout();
  const [menuOpen, setMenuOpen] = useState(false);

  // Pages that paint the brand surface behind the sticky header (see their
  // page wrappers) keep the bar transparent at the very top so the surface
  // reads as one piece; scrolled past, it turns solid again like the landing
  // page.
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const surfacePage =
    pathname === "/" ||
    pathname === "/skills" ||
    pathname === "/knowledge" ||
    pathname === "/search" ||
    pathname === "/favorites";
  const immersive = surfacePage && !scrolled;

  // The auth pages keep the solid blurred chrome but drop its bottom hairline.
  const borderlessHeader = pathname === "/login" || pathname === "/register";

  // The admin console is a first-class nav entry for admins, not tucked
  // into the avatar menu.
  const navItems: NavItem[] = [
    ...NAV_ITEMS.slice(0, 2),
    { href: `${BASE_PATH}${DEMO_PATH}`, label: "nav.hubeiDemo", static: true },
    ...NAV_ITEMS.slice(2),
    ...(user?.role === "admin" ? [{ href: "/admin", label: "nav.admin" as const }] : []),
  ];

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const handleLogout = () => {
    setMenuOpen(false);
    logout.mutate(undefined, {
      onSuccess: () => {
        toast.success(t("auth.logoutSuccess"));
        router.push("/");
      },
    });
  };

  return (
    <header
      className={cn(
        "sticky top-0 z-40 border-b transition-colors duration-300",
        immersive
          ? "border-transparent bg-transparent"
          : "bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60",
        borderlessHeader && "border-transparent",
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-1.5 px-4">
        {/* Mobile navigation */}
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-9 md:hidden"
              aria-label={t("nav.menu")}
            >
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <BrandLogo className="h-5" />
                {t("common.appName")}
              </SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-1 px-2">
              {navItems.map((item) =>
                item.static ? (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  >
                    {t(item.label)}
                  </a>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "rounded-md px-3 py-2 text-sm transition-colors",
                      isActive(item.href)
                        ? "bg-accent font-medium text-accent-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    {t(item.label)}
                  </Link>
                ),
              )}
            </nav>
            <div className="mt-auto flex flex-col gap-1 px-2 pb-4">
              {isAuthenticated && user ? (
                <>
                  <div className="px-3 py-2 text-sm">
                    <p className="font-medium">{user.displayName || user.handle}</p>
                    <p className="text-xs text-muted-foreground">@{user.handle}</p>
                  </div>
                  <Button
                    variant="ghost"
                    className="justify-start gap-2 text-destructive hover:text-destructive"
                    onClick={handleLogout}
                  >
                    <LogOut className="size-4" />
                    {t("nav.logout")}
                  </Button>
                </>
              ) : (
                <Button
                  variant="outline"
                  className="mt-2"
                  onClick={() => {
                    setMenuOpen(false);
                    router.push("/login");
                  }}
                >
                  {t("nav.login")}
                </Button>
              )}
            </div>
          </SheetContent>
        </Sheet>

        {/* Brand */}
        <Link
          href="/"
          className="flex items-center gap-2 transition-transform duration-200 hover:scale-[1.02] active:scale-[0.99]"
        >
          <BrandLogo className="h-6 sm:h-7" />
          <span className="hidden text-sm font-semibold sm:inline">{t("common.appName")}</span>
        </Link>

        {/* Desktop navigation */}
        <nav className="ml-4 hidden items-center gap-1 md:flex">
          {navItems.map((item) =>
            item.static ? (
              <a
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                {t(item.label)}
              </a>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  isActive(item.href)
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {t(item.label)}
              </Link>
            ),
          )}
        </nav>

        <div className="flex-1" />

        <LocaleSwitcher />
        <ThemeToggle />

        {isLoading ? (
          <div className="size-9" />
        ) : isAuthenticated ? (
          <UserMenu />
        ) : (
          <Button asChild variant="outline" size="sm" className="ml-1">
            <Link href="/login">{t("nav.login")}</Link>
          </Button>
        )}
      </div>
    </header>
  );
}
