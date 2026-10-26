"use client";

import { HeartOff, Star } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { SkillGrid } from "@/components/skills/skill-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/hooks/use-auth";
import { useStarredSkills } from "@/hooks/use-stars";
import { useI18n } from "@/i18n";

export function FavoritesContent() {
  const { t } = useI18n();
  const { isAuthenticated, isLoading: userLoading } = useCurrentUser();
  const starred = useStarredSkills(isAuthenticated);

  const items = starred.data?.data ?? [];

  return (
    // Landing-page parity: same brand glow + texture surface as the home page,
    // pulled up behind the sticky header (-mt-14/pt-14 compensate a 3.5rem
    // header). `grow` keeps the surface reaching the footer for the short
    // empty/login states (see the site layout's column flex main).
    <div className="home-surface relative -mt-14 grow pt-14">
      <div aria-hidden className="home-backdrop absolute inset-0" />
      <div className="relative mx-auto w-full max-w-6xl px-4 py-8">
        <header>
          <h1 className="motion-rise text-2xl font-semibold tracking-tight">
            {t("favorites.title")}
          </h1>
          <p className="motion-rise motion-delay-1 mt-1 text-sm text-muted-foreground">
            {t("favorites.subtitle")}
          </p>
        </header>

        <div className="mt-6">
          {userLoading || (isAuthenticated && starred.isLoading) ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-36 rounded-xl" />
              ))}
            </div>
          ) : !isAuthenticated ? (
            <EmptyState
              icon={Star}
              title={t("favorites.loginRequiredTitle")}
              description={t("favorites.loginRequiredDesc")}
              action={
                <Button asChild>
                  <Link href="/login?next=%2Ffavorites">{t("favorites.goLogin")}</Link>
                </Button>
              }
            />
          ) : items.length === 0 ? (
            <EmptyState
              icon={HeartOff}
              title={t("favorites.empty")}
              description={t("favorites.emptyDesc")}
              action={
                <Button asChild variant="outline">
                  <Link href="/skills">{t("favorites.browse")}</Link>
                </Button>
              }
            />
          ) : (
            <SkillGrid skills={items} returnTo="/favorites" />
          )}
        </div>
      </div>
    </div>
  );
}
