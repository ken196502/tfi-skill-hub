"use client";

import { ArrowLeft, FolderOpen } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { ContentTypeBadge } from "@/components/skills/content-type-badge";
import { DownloadButton } from "@/components/skills/download-button";
import { StarButton } from "@/components/skills/star-button";
import { TagBadge } from "@/components/skills/tag-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useSkill, useSkillFile, useSkillVersions } from "@/hooks/use-skills";
import { useI18n } from "@/i18n";
import { ApiError } from "@/lib/api/errors";
import { localizedDetailHtml, localizedName, localizedSummary } from "@/lib/display";
import { formatDate, formatNumber } from "@/lib/format";
import { DEFAULT_LIST_HREF } from "@/lib/list-filters";

export function SkillDetailContent({
  skillRef,
  returnTo,
}: {
  skillRef: string;
  /** Listing the visitor came from; omitted on direct links so the type decides. */
  returnTo?: string;
}) {
  const { t, locale } = useI18n();
  const skill = useSkill(skillRef);
  const versions = useSkillVersions(skillRef);

  const detailHtml = skill.data ? localizedDetailHtml(skill.data, locale) : undefined;
  const versionList = versions.data?.versions ?? [];
  const latestVersion = versionList[0];
  // SKILL.md is only fetched when there is no rich detail body to render.
  const skillMd = useSkillFile(
    skillRef,
    latestVersion?.version,
    "SKILL.md",
    !detailHtml && Boolean(skill.data),
  );

  const notFound = skill.error instanceof ApiError && skill.error.status === 404;

  // Attachment links in the backend-rendered readme point at
  // /api/v1/skills/<ref>/file?path=<file name>. That endpoint answers without
  // Content-Disposition and with a generic content type, so the browser names
  // the download after the URL itself — the path segment `file`, plus `.zip`
  // sniffed from the bytes (a .docx is a ZIP container). The links are
  // same-origin, so stating the name from `path` restores the real file name.
  const readmeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = readmeRef.current;
    if (!root) return;
    const anchors = root.querySelectorAll<HTMLAnchorElement>('a[href*="/file?path="]');
    for (const anchor of anchors) {
      try {
        const url = new URL(anchor.getAttribute("href") ?? "", window.location.href);
        if (url.origin !== window.location.origin) continue;
        const name = url.searchParams.get("path")?.split("/").pop();
        if (name) anchor.download = name;
      } catch {
        // A malformed href keeps the plain browser behaviour.
      }
    }
  }, [detailHtml]);

  if (notFound) {
    return (
      <div className="mx-auto w-full max-w-6xl px-4 py-16">
        <EmptyState
          icon={FolderOpen}
          title={t("skillDetail.notFound")}
          description={t("skillDetail.notFoundDesc")}
          action={
            <Button asChild variant="outline">
              <Link href={returnTo ?? DEFAULT_LIST_HREF}>{t("skillDetail.backToList")}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  if (skill.isLoading || !skill.data) {
    return (
      <div className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-5 w-full max-w-2xl" />
        <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </div>
    );
  }

  const data = skill.data;
  // Direct links carry no returnTo: send knowledge bases to their own
  // catalogue instead of the skills list.
  const backHref =
    returnTo ?? (data.contentType === "knowledge" ? "/knowledge" : DEFAULT_LIST_HREF);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <Button
        asChild
        variant="ghost"
        size="sm"
        className="-ml-2 mb-4 gap-1 text-muted-foreground"
      >
        <Link href={backHref}>
          <ArrowLeft className="size-4 transition-transform group-hover/button:-translate-x-0.5" />
          {t("skillDetail.backToList")}
        </Link>
      </Button>

      {/* Header — name, summary, headline stats */}
      <header className="motion-rise">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {localizedName(data, locale)}
          </h1>
          <ContentTypeBadge type={data.contentType} />
          {data.visibility !== "public" ? (
            <Badge variant="outline" className="font-normal">
              {t("skills.visibilityPrivate")}
            </Badge>
          ) : null}
        </div>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          {localizedSummary(data, locale)}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-x-10 gap-y-3">
          <div className="flex items-center gap-10">
            <div>
              <div className="text-lg font-semibold leading-tight">
                {formatNumber(data.downloads, locale)}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {t("skillDetail.downloads")}
              </div>
            </div>
            <div>
              <div className="text-lg font-semibold leading-tight">
                {formatNumber(data.versionsCount, locale)}
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {t("skillDetail.versionUpdates")}
              </div>
            </div>
          </div>

          {/* Mobile — quick actions beside the stats (desktop has them in the card) */}
          <div className="flex items-center gap-2 lg:hidden">
            <StarButton skillRef={skillRef} starred={data.starred} withLabel />
            <DownloadButton skill={data} label={t("skillDetail.install")} />
          </div>
        </div>
      </header>

      <Separator className="my-6" />

      <div className="motion-rise motion-delay-1 grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        {/* Left — readme */}
        <section className="min-w-0">
          <h2 className="mb-3 text-base font-semibold">{t("skillDetail.aboutTitle")}</h2>
          {detailHtml ? (
            // Server-sanitised rich text (whitelist pass on write and on read).
            <div
              ref={readmeRef}
              className="skill-prose"
              dangerouslySetInnerHTML={{ __html: detailHtml }}
            />
          ) : skillMd.isLoading ? (
            <Skeleton className="h-48 rounded-xl" />
          ) : skillMd.data ? (
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-4 font-mono text-xs leading-relaxed">
              {skillMd.data}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">{t("skillDetail.noContent")}</p>
          )}
        </section>

        {/* Right — favorite / install / meta / version history */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <Card className="gap-0 py-0">
            <div className="hidden space-y-2 border-b p-4 lg:block">
              <StarButton
                skillRef={skillRef}
                starred={data.starred}
                withLabel
                className="w-full"
              />
              <p className="text-center text-xs text-muted-foreground">
                {t("skillDetail.favoritedBy", {
                  count: formatNumber(data.starsCount, locale),
                })}
              </p>
              <DownloadButton
                skill={data}
                label={t("skillDetail.install")}
                className="w-full"
              />
            </div>

            <dl className="space-y-2.5 border-b p-4 text-sm">
              <MetaRow
                label={t("skillDetail.latestVersion")}
                value={latestVersion ? `v${latestVersion.version}` : "—"}
              />
              <MetaRow label={t("skillDetail.owner")} value={`@${data.ownerHandle}`} />
              <MetaRow
                label={t("skillDetail.createdAt")}
                value={formatDate(data.createdAt, locale)}
              />
              <MetaRow
                label={t("skillDetail.updatedAt")}
                value={formatDate(data.updatedAt, locale)}
              />
              {/* Tag chips; the row disappears entirely when the record has none. */}
              {data.tags.length > 0 ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="shrink-0 text-muted-foreground">
                    {data.contentType === "knowledge"
                      ? t("skillDetail.knowledgeTags")
                      : t("skillDetail.tags")}
                  </dt>
                  <dd className="flex flex-wrap justify-end gap-1">
                    {data.tags.map((tag) => (
                      <TagBadge key={tag} tag={tag} />
                    ))}
                  </dd>
                </div>
              ) : null}
            </dl>

            <div className="p-4">
              <h3 className="mb-2.5 text-sm font-semibold">
                {t("skillDetail.versionHistory")}
              </h3>
              {versions.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={index} className="h-5 w-full" />
                  ))}
                </div>
              ) : versionList.length === 0 ? (
                <p className="text-xs text-muted-foreground">—</p>
              ) : (
                <ul className="space-y-1.5 text-xs">
                  {versionList.slice(0, 8).map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between gap-2">
                      <span className="font-mono font-medium">v{entry.version}</span>
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        {entry.yankedAt ? (
                          <span className="text-destructive">{t("skillDetail.yanked")}</span>
                        ) : null}
                        {formatDate(entry.createdAt, locale)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}
