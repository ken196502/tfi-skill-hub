"use client";

import { BookOpen, Sparkles, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";
import type { TranslationKey } from "@/i18n";
import type { ContentType } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * One brand-derived hue per content type: TFI green for skills and the
 * brand's lilac (darkened for text contrast) for knowledge bases.
 */
const CONTENT_TYPE_TONES: Record<ContentType, string> = {
  skill:
    "border-primary/15 bg-primary/10 text-primary dark:border-primary/25 dark:bg-primary/15",
  knowledge:
    "border-knowledge/20 bg-knowledge-soft text-knowledge dark:border-knowledge/30",
};

/** One glyph per type makes the top-right marker readable before the label. */
const CONTENT_TYPE_ICONS: Record<ContentType, LucideIcon> = {
  skill: Sparkles,
  knowledge: BookOpen,
};

/** Skill / knowledge-base marker shown on cards, rows and detail headers. */
export function ContentTypeBadge({
  type,
  className,
}: {
  type: ContentType;
  className?: string;
}) {
  const { t } = useI18n();
  const Icon = CONTENT_TYPE_ICONS[type];
  return (
    <Badge className={cn("border font-normal", CONTENT_TYPE_TONES[type], className)}>
      <Icon aria-hidden />
      {t(`contentType.${type}` as TranslationKey)}
    </Badge>
  );
}
