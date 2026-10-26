"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";
import { categoryLabel } from "@/lib/category-label";
import { cn } from "@/lib/utils";

/** Category chip with a translation lookup and a graceful fallback. */
export function CategoryBadge({ category, className }: { category: string; className?: string }) {
  const { t } = useI18n();
  const label = categoryLabel(category, t);

  return (
    <Badge variant="secondary" className={cn("font-normal", className)}>
      {label}
    </Badge>
  );
}
