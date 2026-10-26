"use client";

import {
  AlertCircle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Library,
  Loader2,
  Plus,
  Save,
  Search,
  SearchX,
  Sparkles,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminTablePage } from "@/components/admin/admin-table-page";
import { FilterButtonGroup } from "@/components/admin/filter-button-group";
import { ContentTypeBadge } from "@/components/skills/content-type-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useAdminFeatures,
  useAdminSkills,
  useReplaceFeatures,
} from "@/hooks/use-admin";
import { useI18n, type TranslationKey } from "@/i18n";
import type { ContentType, SkillWithOwner } from "@/lib/api/types";
import { localizedName } from "@/lib/display";
import { cn } from "@/lib/utils";

/** Each strip (skills / knowledge bases) is curated on its own column. */
const MAX_PER_STRIP = 12;

/**
 * Per-strip identity, reduced to what carries meaning: the type hue on the
 * header glyph and on the checked state of library rows, plus a faint wash
 * for featured rows. No decorative stripes or meters — the count is text.
 */
const BOARD_THEMES: Record<
  ContentType,
  {
    icon: typeof Sparkles;
    iconTone: string;
    picked: string;
    check: string;
    checkHover: string;
  }
> = {
  skill: {
    icon: Sparkles,
    iconTone: "text-primary",
    picked: "bg-primary/5",
    check: "border-primary bg-primary text-primary-foreground",
    checkHover: "group-hover:border-primary/60 group-hover:text-primary",
  },
  knowledge: {
    icon: BookOpen,
    iconTone: "text-knowledge",
    picked: "bg-knowledge/5",
    check: "border-knowledge bg-knowledge text-card",
    checkHover: "group-hover:border-knowledge/60 group-hover:text-knowledge",
  },
};

/** Order comparison without building throwaway JSON strings. */
function sameSequence(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * Home-page curation console. The shared content library owns the left 30%
 * at full height; the two strip sequences (skills / knowledge) are spliced
 * edge to edge into a single card on the right 70%, each half editing its
 * own strip with its own capacity. Strips are configured independently: the
 * admin featured endpoint is scoped by `type`, so each strip loads and saves
 * on its own and saving one never rewrites the other.
 *
 * Responsive shape: the 30/70 split starts at md; below that everything
 * stacks with the library first and the page scrolls normally. The spliced
 * card keeps the strips side by side from sm up and stacks them below.
 */
export function FeaturesContent() {
  const { t } = useI18n();
  // Each strip reads its own scoped featured list (`?type=`), so the two
  // columns load, fail and refetch independently.
  const skillFeatures = useAdminFeatures("skill");
  const knowledgeFeatures = useAdminFeatures("knowledge");
  // The catalog lists every item once; the library panel shows them all.
  const skillsQuery = useAdminSkills({ page: 1, limit: 100 });
  const replace = useReplaceFeatures();

  // Per-strip `null` means "untouched" — the draft seeds from the server
  // sequence only once the admin edits that strip, which avoids effects that
  // would race the featured payload.
  const [skillDraft, setSkillDraft] = useState<string[] | null>(null);
  const [knowledgeDraft, setKnowledgeDraft] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);

  const serverSkills = useMemo(
    () => skillFeatures.data?.data.map((item) => item.id) ?? [],
    [skillFeatures.data],
  );
  const serverKnowledge = useMemo(
    () => knowledgeFeatures.data?.data.map((item) => item.id) ?? [],
    [knowledgeFeatures.data],
  );
  const selectedSkills = skillDraft ?? serverSkills;
  const selectedKnowledge = knowledgeDraft ?? serverKnowledge;

  const allContent = useMemo(
    () => skillsQuery.data?.data ?? [],
    [skillsQuery.data],
  );
  const byId = useMemo(
    () => new Map(allContent.map((item) => [item.id, item])),
    [allContent],
  );
  // Featured rows can sit beyond the first 100 catalog rows, so names resolve
  // from the two featured payloads first.
  const featuredById = useMemo(
    () =>
      new Map(
        [
          ...(skillFeatures.data?.data ?? []),
          ...(knowledgeFeatures.data?.data ?? []),
        ].map((item) => [item.id, item]),
      ),
    [skillFeatures.data, knowledgeFeatures.data],
  );
  const resolveItem = (id: string) => featuredById.get(id) ?? byId.get(id);

  const selected: Record<ContentType, string[]> = {
    skill: selectedSkills,
    knowledge: selectedKnowledge,
  };

  const skillsDirty = !sameSequence(selectedSkills, serverSkills);
  const knowledgeDirty = !sameSequence(selectedKnowledge, serverKnowledge);
  const dirty = skillsDirty || knowledgeDirty;
  // The library gates picking until both sequences are known: seeding an add
  // before the server sequence arrives would silently drop existing picks.
  const stripsReady =
    !skillFeatures.isLoading &&
    !skillFeatures.isError &&
    !knowledgeFeatures.isLoading &&
    !knowledgeFeatures.isError;

  /** Adds/removes one library row in the strip its content type owns. */
  const toggle = (item: SkillWithOwner) => {
    const strip = item.contentType;
    const current = strip === "skill" ? selectedSkills : selectedKnowledge;
    const isFeatured = current.includes(item.id);
    if (!isFeatured && current.length >= MAX_PER_STRIP) {
      toast.warning(t("admin.features.maxReached"));
      return;
    }
    const next = isFeatured
      ? current.filter((id) => id !== item.id)
      : [...current, item.id];
    if (strip === "skill") setSkillDraft(next);
    else setKnowledgeDraft(next);
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    try {
      // Only the dirty strips are sent; the untouched one is never rewritten.
      if (skillsDirty) {
        await replace.mutateAsync({ type: "skill", ids: selectedSkills });
      }
      if (knowledgeDirty) {
        await replace.mutateAsync({ type: "knowledge", ids: selectedKnowledge });
      }
      toast.success(t("admin.features.saved"));
    } catch {
      toast.error(t("admin.features.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminTablePage>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">
            {t("admin.features.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("admin.features.subtitle")}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {dirty ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
              <span className="size-1.5 rounded-full bg-amber-500" />
              {t("admin.features.unsavedChanges")}
            </span>
          ) : null}

          <Button
            className="gap-2"
            onClick={() => void handleSave()}
            disabled={
              !dirty ||
              saving ||
              skillFeatures.isError ||
              knowledgeFeatures.isError
            }
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            {t("admin.features.save")}
          </Button>
        </div>
      </header>

      {/* The board: the shared library owns the left 30% at full height; the
          two strip sequences are spliced edge to edge into one card on the
          right 70%, each backed by its own scoped featured query. */}
      <div className="grid gap-4 md:min-h-0 md:flex-1 md:grid-cols-[minmax(0,3fr)_minmax(0,7fr)]">
        <LibraryPanel
          className="motion-rise"
          content={allContent}
          selected={selected}
          ready={stripsReady}
          loading={skillsQuery.isLoading}
          error={skillsQuery.isError}
          onRetry={() => void skillsQuery.refetch()}
          onToggle={toggle}
        />

        {/* One card, two sequence panels: no gutter between them, just a
            hairline divider, so the pair reads as a single surface. */}
        <Card className="motion-rise motion-delay-1 grid grid-cols-1 divide-y divide-border gap-0 overflow-hidden py-0 sm:grid-cols-2 sm:divide-x sm:divide-y-0 md:min-h-0">
          <CurationColumn
            type="skill"
            value={selectedSkills}
            dirty={skillsDirty}
            ready={!skillFeatures.isLoading && !skillFeatures.isError}
            resolveItem={resolveItem}
            onChange={setSkillDraft}
            loading={skillFeatures.isLoading}
            error={skillFeatures.isError}
            onRetry={() => void skillFeatures.refetch()}
          />
          <CurationColumn
            type="knowledge"
            value={selectedKnowledge}
            dirty={knowledgeDirty}
            ready={!knowledgeFeatures.isLoading && !knowledgeFeatures.isError}
            resolveItem={resolveItem}
            onChange={setKnowledgeDraft}
            loading={knowledgeFeatures.isLoading}
            error={knowledgeFeatures.isError}
            onRetry={() => void knowledgeFeatures.refetch()}
          />
        </Card>
      </div>
    </AdminTablePage>
  );
}

interface CurationColumnProps {
  type: ContentType;
  /** Draft sequence for this strip; edits replace it wholesale. */
  value: string[];
  dirty: boolean;
  /** Featured payload loaded — gates drag reordering. */
  ready: boolean;
  resolveItem: (id: string) => SkillWithOwner | undefined;
  onChange: (next: string[]) => void;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
}

/**
 * One strip's sequence panel inside the spliced card: a quiet header with
 * the count, then the ordered rows. Rows drag to reorder; up/down buttons
 * stay in flow at every breakpoint.
 */
function CurationColumn({
  type,
  value,
  dirty,
  ready,
  resolveItem,
  onChange,
  loading,
  error,
  onRetry,
}: CurationColumnProps) {
  const { t, locale } = useI18n();
  const theme = BOARD_THEMES[type];
  const Icon = theme.icon;
  const titleKey: TranslationKey =
    type === "skill"
      ? "admin.features.skillsTitle"
      : "admin.features.knowledgeTitle";

  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const remove = (id: string) => {
    onChange(value.filter((item) => item !== id));
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <section className="flex min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
        <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
          <Icon aria-hidden className={cn("size-3.5 shrink-0", theme.iconTone)} />
          <span className="truncate">{t(titleKey)}</span>
        </h2>
        {dirty ? (
          <span
            title={t("admin.features.unsavedChanges")}
            aria-label={t("admin.features.unsavedChanges")}
            className="size-1.5 shrink-0 rounded-full bg-amber-500"
          />
        ) : null}
        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
          {value.length}/{MAX_PER_STRIP}
        </span>
      </div>

      {loading ? (
        <ColumnSkeleton />
      ) : error ? (
        <PanelError message={t("admin.features.loadFailed")} onRetry={onRetry} />
      ) : value.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-center">
          <Icon aria-hidden className="size-4 text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">
            {t("admin.features.selectedEmpty")}
          </p>
        </div>
      ) : (
        <ul className="max-h-[18rem] min-h-0 flex-1 overflow-y-auto md:max-h-none">
          {value.map((id, index) => {
            const item = resolveItem(id);
            const name = item ? localizedName(item, locale) : id;
            const meta = item
              ? [item.slug, item.ownerHandle ? `@${item.ownerHandle}` : null]
                  .filter(Boolean)
                  .join(" · ")
              : "";
            return (
              <li
                key={id}
                draggable={ready}
                onDragStart={(event) => {
                  setDragIndex(index);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", String(index));
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  if (dragIndex === null || dragIndex === index) return;
                  const next = [...value];
                  const [moved] = next.splice(dragIndex, 1);
                  next.splice(index, 0, moved);
                  onChange(next);
                  setDragIndex(index);
                }}
                onDragEnd={() => setDragIndex(null)}
                className={cn(
                  "group relative flex items-center gap-2 border-b px-3 py-1.5 transition-colors last:border-b-0 hover:bg-accent/30",
                  dragIndex === index && "opacity-40",
                )}
              >
                <span className="w-4 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
                  {index + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium leading-5" title={name}>
                    {name}
                  </p>
                  {meta ? (
                    <p className="truncate text-[11px] leading-4 text-muted-foreground">
                      {meta}
                    </p>
                  ) : null}
                </div>

                {/* Row controls stay in flow: each spliced panel is wide
                    enough to keep them visible at every breakpoint. */}
                <div className="flex shrink-0 items-center gap-0.5">
                  <GripVertical
                    aria-hidden
                    className="size-3.5 shrink-0 cursor-grab text-border"
                  />
                  <button
                    type="button"
                    aria-label={t("admin.features.moveUp")}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ChevronUp className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("admin.features.moveDown")}
                    disabled={index === value.length - 1}
                    onClick={() => move(index, 1)}
                    className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-30"
                  >
                    <ChevronDown className="size-3.5" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("admin.features.remove")}
                    onClick={() => remove(id)}
                    className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-destructive focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

interface LibraryPanelProps {
  className?: string;
  /** Every catalog row, both content types. */
  content: SkillWithOwner[];
  /** Draft sequences, so picked rows can show their strip position. */
  selected: Record<ContentType, string[]>;
  ready: boolean;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  /** Toggles the row in the strip its content type owns. */
  onToggle: (item: SkillWithOwner) => void;
}

/**
 * The shared content library: one full-height list feeding both strips.
 * Picked rows carry the strip they belong to in their badge and show their
 * sequence position, so "add to skills" vs "add to knowledge" is decided by
 * the content type itself — never by a mode switch.
 */
function LibraryPanel({
  className,
  content,
  selected,
  ready,
  loading,
  error,
  onRetry,
  onToggle,
}: LibraryPanelProps) {
  const { t, locale } = useI18n();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ContentType>("all");

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    return content.filter((item) => {
      if (typeFilter !== "all" && item.contentType !== typeFilter) return false;
      if (!query) return true;
      return [item.slug, item.displayName, item.displayNameEn]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(query);
    });
  }, [content, typeFilter, query]);

  const filtersActive = query.length > 0 || typeFilter !== "all";

  const typeOptions: { value: "all" | ContentType; label: string }[] = [
    { value: "all", label: t("common.all") },
    { value: "skill", label: t("contentType.skill") },
    { value: "knowledge", label: t("contentType.knowledge") },
  ];

  const resetFilters = () => {
    setSearch("");
    setTypeFilter("all");
  };

  return (
    <Card
      className={cn(
        "flex flex-col gap-0 overflow-hidden py-0 md:min-h-0",
        className,
      )}
    >
      <div className="shrink-0 border-b px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex min-w-0 items-center gap-2 text-sm font-semibold">
            <Library aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{t("admin.features.availableTitle")}</span>
          </h2>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {t("common.total", { count: filtered.length })}
          </span>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <FilterButtonGroup
            value={typeFilter}
            options={typeOptions}
            onChange={setTypeFilter}
          />
          <div className="relative min-w-40 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("admin.features.searchPlaceholder")}
              aria-label={t("admin.features.searchPlaceholder")}
              className="h-8 pr-8 pl-8 text-sm"
            />
            {search ? (
              <button
                type="button"
                aria-label={t("admin.features.clearSearch")}
                onClick={() => setSearch("")}
                className="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {loading ? (
        <LibrarySkeleton />
      ) : error ? (
        <PanelError
          message={t("admin.features.catalogLoadFailed")}
          onRetry={onRetry}
        />
      ) : filtered.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
          {filtersActive ? (
            <SearchX className="size-5 text-muted-foreground/70" />
          ) : (
            <Library className="size-5 text-muted-foreground/70" />
          )}
          <p className="text-sm text-muted-foreground">
            {filtersActive
              ? t("admin.features.noMatches")
              : t("admin.features.availableEmpty")}
          </p>
          {filtersActive ? (
            <Button size="xs" variant="outline" onClick={resetFilters}>
              {t("admin.features.clearFilters")}
            </Button>
          ) : null}
        </div>
      ) : (
        <ul className="max-h-[26rem] min-h-0 flex-1 divide-y overflow-y-auto md:max-h-none">
          {filtered.map((item) => {
            const type = item.contentType;
            const theme = BOARD_THEMES[type];
            const strip = selected[type];
            const isSelected = strip.includes(item.id);
            const position = strip.indexOf(item.id) + 1;
            const isPublished = item.visibility === "public";
            // Unpublished content stays visible but cannot be picked; rows
            // already featured remain removable. Until the featured payload
            // has loaded, every row is read-only.
            const clickable = ready && (isSelected || isPublished);
            return (
              <li key={item.id}>
                <button
                  type="button"
                  disabled={!clickable}
                  aria-pressed={isSelected}
                  onClick={() => onToggle(item)}
                  className={cn(
                    "group flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors",
                    clickable ? "hover:bg-accent/40" : "cursor-not-allowed",
                    isSelected && theme.picked,
                    !ready && "opacity-60",
                    !isPublished && !isSelected && "opacity-60",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
                      isSelected
                        ? theme.check
                        : "border-input bg-card text-muted-foreground",
                      !isSelected && theme.checkHover,
                    )}
                  >
                    {isSelected ? (
                      <Check className="size-3" />
                    ) : (
                      <Plus className="size-3" />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm">
                        {localizedName(item, locale)}
                      </span>
                      <ContentTypeBadge type={type} className="shrink-0" />
                      {!isPublished ? (
                        <Badge variant="outline" className="shrink-0 font-normal">
                          {t("admin.features.unpublished")}
                        </Badge>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {item.slug ? (
                        <span className="font-mono">{item.slug}</span>
                      ) : null}
                      {item.slug && item.ownerHandle ? (
                        <span className="mx-1.5 text-border">·</span>
                      ) : null}
                      {item.ownerHandle ? `@${item.ownerHandle}` : null}
                    </span>
                  </span>

                  {isSelected ? (
                    <span
                      title={t("admin.features.pickedAt", { position })}
                      className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
                    >
                      #{position}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function PanelError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <AlertCircle className="size-5 text-destructive/70" />
      <p className="text-sm text-muted-foreground">{message}</p>
      <Button size="xs" variant="outline" onClick={onRetry}>
        {t("common.retry")}
      </Button>
    </div>
  );
}

function ColumnSkeleton() {
  return (
    <div className="flex-1">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-center gap-2 px-3 py-2">
          <Skeleton className="size-5 shrink-0 rounded-full" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function LibrarySkeleton() {
  return (
    <div className="flex-1">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="flex items-center gap-2.5 px-4 py-2.5">
          <Skeleton className="size-[18px] shrink-0 rounded-[5px]" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
