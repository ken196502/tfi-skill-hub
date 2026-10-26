"use client";

import { Download } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import { CategoryBadge } from "@/components/skills/category-badge";
import { ContentTypeBadge } from "@/components/skills/content-type-badge";
import { StarButton } from "@/components/skills/star-button";
import { TagBadge } from "@/components/skills/tag-badge";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useI18n } from "@/i18n";
import type { SkillWithOwner } from "@/lib/api/types";
import { localizedName, localizedSummary } from "@/lib/display";
import { formatNumber } from "@/lib/format";
import { skillRef } from "@/lib/refs";

export function SkillCard({
  skill,
  delayIndex = 0,
  returnTo,
}: {
  skill: SkillWithOwner;
  /** Position inside the entrance stagger; callers keep it small (index % 6). */
  delayIndex?: number;
  /** Listing href (filters included); the detail page offers a way back to it. */
  returnTo?: string;
}) {
  const { t, locale } = useI18n();
  const ref = skillRef(skill);
  // Knowledge bases keep their own path prefix: the site header derives the
  // active section from the URL, so a shared /skills/<ref> detail page would
  // light up "skills" while browsing a knowledge base.
  const detailBase = skill.contentType === "knowledge" ? "/knowledge" : "/skills";
  const href = returnTo
    ? `${detailBase}/${ref}?returnTo=${encodeURIComponent(returnTo)}`
    : `${detailBase}/${ref}`;

  return (
    <Card
      className="group gap-0 py-0 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:ring-foreground/25"
      style={{ "--stagger": delayIndex } as CSSProperties}
    >
      <Link href={href} className="flex h-full flex-col gap-2.5 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 min-w-0 font-medium leading-snug transition-colors group-hover:text-primary">
            {localizedName(skill, locale)}
          </h3>
          {/* Top-right marker: skill or knowledge base. */}
          <ContentTypeBadge type={skill.contentType} className="shrink-0" />
        </div>
        {/* Tag chips — both content types advertise their tags. */}
        {skill.tags.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1">
            {skill.tags.map((tag) => (
              <TagBadge key={tag} tag={tag} />
            ))}
          </div>
        ) : null}
        <p className="line-clamp-2 flex-1 text-sm text-muted-foreground">
          {localizedSummary(skill, locale)}
        </p>
        <div className="flex items-end justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted-foreground">
            <CategoryBadge category={skill.category} />
            <span className="flex items-center gap-1">
              <Download className="size-3" />
              {formatNumber(skill.downloads, locale)}
            </span>
            {/* The star doubles as the favourite toggle: click the icon or
                the count to star / unstar. */}
            <StarButton skillRef={ref} starred={skill.starred} count={skill.starsCount} />
            {skill.visibility !== "public" ? (
              <Badge variant="outline" className="font-normal">
                {t("skills.visibilityPrivate")}
              </Badge>
            ) : null}
          </div>
          <span
            className="max-w-[45%] shrink-0 truncate text-xs text-muted-foreground"
            title={`@${skill.ownerHandle}`}
          >
            @{skill.ownerHandle}
          </span>
        </div>
      </Link>
    </Card>
  );
}

export function SkillGrid({
  skills,
  returnTo,
}: {
  skills: SkillWithOwner[];
  returnTo?: string;
}) {
  return (
    <div className="motion-stagger grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {skills.map((skill, index) => (
        <SkillCard key={skill.id} skill={skill} delayIndex={index % 6} returnTo={returnTo} />
      ))}
    </div>
  );
}
