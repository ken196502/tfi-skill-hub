"use client";

import { Star } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-auth";
import { useStarToggle } from "@/hooks/use-stars";
import { useI18n } from "@/i18n";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Favourite toggle used on cards and the detail page.
 *
 * Signed-out visitors are sent to the sign-in page (remembering where they
 * were); the request carries the `@namespace/slug` ref verbatim.
 */
export function StarButton({
  skillRef,
  starred,
  withLabel = false,
  count,
  className,
}: {
  skillRef: string;
  starred?: boolean;
  withLabel?: boolean;
  /** Renders the compact `star + count` chip (card meta row) when set. */
  count?: number;
  className?: string;
}) {
  const { isAuthenticated } = useCurrentUser();
  const toggle = useStarToggle();
  const router = useRouter();
  const pathname = usePathname();
  const { t, locale } = useI18n();

  const active = Boolean(starred);
  const compact = !withLabel && count !== undefined;

  const handleClick = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isAuthenticated) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    toggle.mutate(
      { ref: skillRef, starred: active },
      {
        onSuccess: () => {
          toast.success(active ? t("skillDetail.starRemoved") : t("skillDetail.starAdded"));
        },
      },
    );
  };

  const label = active ? t("skillDetail.unstar") : t("skillDetail.star");

  return (
    <Button
      type="button"
      variant={withLabel ? "outline" : "ghost"}
      size={withLabel ? "default" : compact ? "xs" : "icon"}
      onClick={handleClick}
      disabled={toggle.isPending}
      aria-label={label}
      title={label}
      className={cn(
        withLabel
          ? "gap-2"
          : compact
            ? "-my-1 gap-1 px-1.5 font-normal text-muted-foreground hover:text-foreground"
            : "size-8 rounded-full",
        className,
      )}
    >
      <Star
        className={cn(
          "transition-colors",
          compact ? "size-3" : "size-4",
          active && "fill-amber-400 text-amber-400",
        )}
      />
      {withLabel ? <span>{active ? t("skillDetail.starred") : t("skillDetail.star")}</span> : null}
      {compact ? <span>{formatNumber(count, locale)}</span> : null}
    </Button>
  );
}
