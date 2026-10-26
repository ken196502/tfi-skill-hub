"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Tag chip in the brand colour — a soft primary tint keeps the label readable
 * in both themes without turning a card full of tags into solid green blocks.
 */
export function TagBadge({ tag, className }: { tag: string; className?: string }) {
  return (
    <Badge
      className={cn(
        "border-primary/15 bg-primary/10 font-normal text-primary dark:border-primary/25 dark:bg-primary/15",
        className,
      )}
    >
      {tag}
    </Badge>
  );
}
