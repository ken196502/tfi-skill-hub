"use client";

import { useQuery } from "@tanstack/react-query";
import { Download, FileText, Loader2 } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { FileDropzone } from "@/components/admin/file-dropzone";
import { CategoryCombobox } from "@/components/admin/category-combobox";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateSkill, useUpdateSkill } from "@/hooks/use-admin";
import { useCategories, useSkillVersions } from "@/hooks/use-skills";
import { useI18n } from "@/i18n";
import { downloadSkill, downloadSkillFile, getSkill } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/errors";
import { queryKeys } from "@/lib/api/query-keys";
import type {
  ContentType,
  SkillWithOwner,
  VersionFile,
  Visibility,
} from "@/lib/api/types";
import { categoryLabel } from "@/lib/category-label";
import { formatBytes } from "@/lib/format";

/**
 * The edit form's own shape. Both languages live in one draft while the tab
 * switches which pair is on screen — the alternative, a Chinese field sitting
 * next to its English twin, reads as one field split in half. Tags are edited
 * as comma-separated text and only split on save.
 */
type Draft = {
  slug: string;
  /** Skill or knowledge base; switchable when editing an existing record. */
  contentType: ContentType;
  displayName: string;
  summary: string;
  displayNameEn: string;
  summaryEn: string;
  category: string;
  visibility: Visibility;
  html: string;
  htmlEn: string;
};

const EMPTY_DRAFT: Draft = {
  slug: "",
  contentType: "skill",
  displayName: "",
  summary: "",
  displayNameEn: "",
  summaryEn: "",
  category: "general",
  visibility: "private",
  html: "",
  htmlEn: "",
};

/** One version's files — the row unit of the uploads list in the dialog. */
type VersionRow = {
  version: string;
  files: VersionFile[];
  totalSize: number;
};

const SLUG_PATTERN = /^[a-z0-9][a-z0-9.-]*$/;

function draftFromSkill(skill: SkillWithOwner): Draft {
  return {
    slug: skill.slug,
    contentType: skill.contentType,
    displayName: skill.displayName ?? "",
    summary: skill.summary ?? "",
    displayNameEn: skill.displayNameEn ?? "",
    summaryEn: skill.summaryEn ?? "",
    category: skill.category || "general",
    visibility: skill.visibility,
    html: skill.detailHtml ?? "",
    htmlEn: skill.detailHtmlEn ?? "",
  };
}

function parseTags(text: string): string[] {
  return [...new Set(text.split(",").map((tag) => tag.trim()).filter((tag) => tag !== ""))];
}

/** `.md` for `SKILL.md`; empty when the path carries no extension. */
function fileExtension(path: string): string {
  const match = path.match(/\.[A-Za-z0-9]+$/);
  return match ? match[0] : "";
}

function hasSkillMd(files: File[]): boolean {
  return files.some(
    (file) => file.name === "SKILL.md" || file.webkitRelativePath.endsWith("SKILL.md"),
  );
}

/**
 * Suggestions for the category combobox.
 *
 * `/categories` advertises a short taxonomy, but the loaded records are the
 * truth about what this catalogue actually uses. Offering only the advertised
 * set would leave the field showing a category the record does not have —
 * and then write that wrong value on save.
 */
function categoryOptions(declared: string[], inUse: string[], current: string): string[] {
  const seen = new Set<string>();
  const options: string[] = [];
  for (const value of [...declared, ...[...inUse].sort(), current]) {
    const label = value.trim();
    if (label === "" || seen.has(label)) continue;
    seen.add(label);
    options.push(label);
  }
  return options;
}

export function SkillEditDialog({
  skillRef,
  categoriesInUse,
  onClose,
}: {
  /** `@namespace/slug` (or bare slug) of the skill; `null` opens create mode. */
  skillRef: string | null;
  categoriesInUse: string[];
  onClose: () => void;
}) {
  const { t } = useI18n();
  const isEdit = skillRef !== null;
  const ref = skillRef ?? "";
  const update = useUpdateSkill();
  const create = useCreateSkill();
  const pending = isEdit ? update.isPending : create.isPending;

  const [draftChoice, setDraftChoice] = useState<Draft | null>(null);
  const [tagsChoice, setTagsChoice] = useState<string | null>(null);
  const [editLang, setEditLang] = useState<"zh" | "en">("zh");
  const [files, setFiles] = useState<File[]>([]);
  const [downloadingVersion, setDownloadingVersion] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // The list never carries the body; only the detail fetch does — so editing
  // starts by fetching the one record.
  const detail = useQuery({
    queryKey: queryKeys.skill(ref),
    queryFn: () => getSkill(ref),
    enabled: isEdit,
    staleTime: 0,
  });

  // One row per version, newest first — the version number identifies the
  // record; its files are listed by path and download together.
  const versions = useSkillVersions(isEdit ? ref : undefined);
  const versionRows: VersionRow[] = (versions.data?.versions ?? [])
    .filter((entry) => entry.files.length > 0)
    .map((entry) => ({
      version: entry.version,
      files: entry.files,
      totalSize: entry.files.reduce((sum, file) => sum + file.size, 0),
    }));

  // Both the row labels and the downloaded file names read `slug@version`;
  // the slug only arrives with the detail fetch, so fall back to the ref.
  const skillSlug = detail.data?.slug ?? ref;

  const categories = useCategories();

  // Derived until the first keystroke, so no effect is needed to seed the form
  // when the fetch lands.
  const draft =
    draftChoice ?? (isEdit ? (detail.data ? draftFromSkill(detail.data) : null) : { ...EMPTY_DRAFT });
  const tagsText = tagsChoice ?? (detail.data?.tags ?? []).join(", ");
  // Dictionary categories first, then whatever the loaded records already use,
  // then the current value — so switching never drops an existing category.
  const categorySuggestions = categoryOptions(
    categories.data?.categories ?? [],
    categoriesInUse,
    draft?.category ?? "",
  );

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    if (!draft) return;
    setDraftChoice({ ...draft, [key]: value });
  };

  const slugValue = draft?.slug.trim() ?? "";
  const slugInvalid = !isEdit && slugValue !== "" && !SLUG_PATTERN.test(slugValue);
  const missingSlug = !isEdit && slugValue === "";
  // A new skill needs a SKILL.md to be usable, so an upload without one cannot
  // be saved. Knowledge bases carry no such convention, and editing never
  // requires it: the record already has its files.
  const needsSkillMd = !isEdit && draft?.contentType === "skill";
  const uploadsWithoutSkillMd = needsSkillMd && files.length > 0 && !hasSkillMd(files);
  const canSave = Boolean(draft) && !missingSlug && !slugInvalid && !uploadsWithoutSkillMd;
  // Any form edit (fields, tags or chosen files) counts as unsaved input;
  // while it exists, a stray click on the overlay must not dismiss the dialog.
  const hasUnsavedInput = draftChoice !== null || tagsChoice !== null || files.length > 0;

  const save = () => {
    if (!draft || !canSave || pending) return;
    const input = {
      ...draft,
      slug: slugValue,
      // An emptied category field falls back to the default bucket instead of
      // writing a blank value into the catalogue.
      category: draft.category.trim() || "general",
      tags: parseTags(tagsText),
    };
    const callbacks = {
      onSuccess: () => {
        toast.success(isEdit ? t("admin.content.saved") : t("admin.content.created"));
        onClose();
      },
      onError: (error: unknown) => {
        if (error instanceof ApiError && error.status === 409) {
          toast.error(t("admin.content.slugTaken"));
          return;
        }
        toast.error(isEdit ? t("admin.content.saveFailed") : t("admin.content.createFailed"));
      },
    };
    if (isEdit) update.mutate({ ref, input, files }, callbacks);
    else create.mutate({ input, files }, callbacks);
  };

  const handleDownloadVersion = (row: VersionRow) => {
    if (downloadingVersion || !detail.data) return;
    setDownloadingVersion(row.version);
    const downloadName = `${skillSlug}@${row.version}`;
    // One file keeps its own extension; several files come back as one archive.
    const single = row.files.length === 1 ? row.files[0] : null;
    const task = single
      ? downloadSkillFile(
          ref,
          single.path,
          row.version,
          `${downloadName}${fileExtension(single.path)}`,
        )
      : downloadSkill(detail.data, row.version, `${downloadName}.zip`);
    task
      .catch(() => toast.error(t("admin.content.downloadFailed")))
      .finally(() => setDownloadingVersion(null));
  };

  const handleFilesChange = (next: File[]) => {
    const grew = next.length > files.length;
    setFiles(next);
    // The picker sits at the very bottom of the dialog: after files are added,
    // bring the freshly appended rows into view once they have rendered.
    if (grew) {
      requestAnimationFrame(() => {
        const container = scrollRef.current;
        if (container) {
          container.scrollTo({ top: container.scrollHeight, behavior: "smooth" });
        }
      });
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[85vh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-2xl"
        onInteractOutside={(event) => {
          // The category combobox portals its suggestion list to the body, so
          // an option click reads as "outside" this dialog. Keep the dialog
          // open for those interactions as well as for unsaved form input.
          const target = event.target as HTMLElement | null;
          if (target?.closest('[data-slot="popover-content"]')) {
            event.preventDefault();
            return;
          }
          if (hasUnsavedInput) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {isEdit ? t("admin.content.editTitle") : t("admin.content.createTitle")}
          </DialogTitle>
        </DialogHeader>

        {isEdit && detail.isError ? (
          <p className="py-8 text-center text-sm text-destructive">
            {t("admin.content.loadFailed")}
          </p>
        ) : !draft ? (
          <div className="space-y-3 py-2">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        ) : (
          <div ref={scrollRef} className="min-h-0 space-y-4 overflow-y-auto pr-1">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="skill-edit-slug">{t("admin.content.fieldSlug")}</Label>
                <Input
                  id="skill-edit-slug"
                  value={draft.slug}
                  readOnly={isEdit}
                  aria-invalid={slugInvalid}
                  placeholder="code-review"
                  className="font-mono"
                  onChange={(event) =>
                    // Underscores are not accepted in skill identifiers.
                    set("slug", event.target.value.replace(/_/g, ""))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  {isEdit ? t("admin.content.slugHint") : t("admin.content.slugHintCreate")}
                </p>
              </div>
              <div className="space-y-2">
                <Label>{t("admin.content.fieldType")}</Label>
                <Select
                  value={draft.contentType}
                  onValueChange={(value) => set("contentType", value as ContentType)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="skill">{t("contentType.skill")}</SelectItem>
                    <SelectItem value="knowledge">{t("contentType.knowledge")}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {isEdit ? t("admin.content.typeHint") : t("admin.content.typeHintCreate")}
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("admin.content.fieldCategory")}</Label>
                <CategoryCombobox
                  value={draft.category}
                  options={categorySuggestions}
                  onChange={(value) => set("category", value)}
                  labelFor={(category) => categoryLabel(category, t)}
                  placeholder={t("admin.content.categoryPlaceholder")}
                />
                <p className="text-xs text-muted-foreground">{t("admin.content.categoryHint")}</p>
              </div>
              <div className="space-y-2">
                <Label>{t("admin.content.fieldVisibility")}</Label>
                <Select
                  value={draft.visibility}
                  onValueChange={(value) => set("visibility", value as Visibility)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">{t("admin.content.visibilityPrivate")}</SelectItem>
                    <SelectItem value="public">{t("admin.content.visibilityPublic")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="skill-edit-tags">{t("admin.content.fieldTags")}</Label>
              <Input
                id="skill-edit-tags"
                value={tagsText}
                onChange={(event) => setTagsChoice(event.target.value)}
                placeholder={t("admin.content.tagsPlaceholder")}
              />
              <p className="text-xs text-muted-foreground">{t("admin.content.tagsHint")}</p>
            </div>

            {/* Everything below belongs to one language, so the switch scopes
                the name, the summary and the body together. Both languages
                stay in `draft`, so switching tabs never drops what was typed. */}
            <div className="space-y-3 rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>{t("admin.content.editLang")}</Label>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="xs"
                    variant={editLang === "zh" ? "default" : "outline"}
                    onClick={() => setEditLang("zh")}
                  >
                    {t("admin.content.langZh")}
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant={editLang === "en" ? "default" : "outline"}
                    onClick={() => setEditLang("en")}
                  >
                    {t("admin.content.langEn")}
                  </Button>
                </div>
              </div>

              {editLang === "zh" ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="skill-edit-name-zh">
                      {t("admin.content.fieldDisplayName")}
                    </Label>
                    <Input
                      id="skill-edit-name-zh"
                      value={draft.displayName}
                      placeholder={t("admin.content.displayNamePlaceholderZh")}
                      onChange={(event) => set("displayName", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="skill-edit-summary-zh">{t("admin.content.fieldSummary")}</Label>
                    <Input
                      id="skill-edit-summary-zh"
                      value={draft.summary}
                      placeholder={t("admin.content.summaryPlaceholderZh")}
                      onChange={(event) => set("summary", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("admin.content.fieldHtml")}</Label>
                    <p className="text-xs text-muted-foreground">{t("admin.content.htmlHint")}</p>
                    <RichTextEditor
                      value={draft.html}
                      onChange={(html) => set("html", html)}
                      placeholder={
                        draft.contentType === "knowledge"
                          ? t("admin.content.htmlKnowledgePlaceholder")
                          : t("admin.content.htmlPlaceholder")
                      }
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="skill-edit-name-en">
                      {t("admin.content.fieldDisplayName")}
                    </Label>
                    <Input
                      id="skill-edit-name-en"
                      value={draft.displayNameEn}
                      placeholder={t("admin.content.displayNamePlaceholderEn")}
                      onChange={(event) => set("displayNameEn", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="skill-edit-summary-en">{t("admin.content.fieldSummary")}</Label>
                    <Input
                      id="skill-edit-summary-en"
                      value={draft.summaryEn}
                      placeholder={t("admin.content.summaryPlaceholderEn")}
                      onChange={(event) => set("summaryEn", event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("admin.content.fieldHtml")}</Label>
                    <p className="text-xs text-muted-foreground">{t("admin.content.htmlHintEn")}</p>
                    <RichTextEditor
                      value={draft.htmlEn}
                      onChange={(html) => set("htmlEn", html)}
                      placeholder={
                        draft.contentType === "knowledge"
                          ? t("admin.content.htmlKnowledgePlaceholderEn")
                          : t("admin.content.htmlPlaceholderEn")
                      }
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-lg border p-3">
              <Label>{t("admin.content.files")}</Label>
              <p className="text-xs text-muted-foreground">
                {isEdit
                  ? t("admin.content.filesHint")
                  : draft.contentType === "knowledge"
                    ? t("admin.content.filesHintCreateKnowledge")
                    : t("admin.content.filesHintCreate")}
              </p>
              {isEdit ? (
                <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                  <span className="text-xs font-medium text-muted-foreground">
                    {t("admin.content.uploadedFiles")}
                  </span>
                  {versions.isLoading ? (
                    <div className="space-y-1.5">
                      {Array.from({ length: 2 }).map((_, index) => (
                        <Skeleton key={index} className="h-5 w-full" />
                      ))}
                    </div>
                  ) : versionRows.length === 0 ? (
                    <p className="text-xs text-muted-foreground">—</p>
                  ) : (
                    <ul className="space-y-1">
                      {versionRows.map((row) => {
                        const singleFile = row.files.length === 1;
                        const actionLabel = t(
                          singleFile
                            ? "admin.content.downloadFile"
                            : "admin.content.downloadArchive",
                        );
                        return (
                          <li key={row.version} className="flex items-center gap-2 text-xs">
                            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="min-w-0 flex-1 truncate font-mono">
                              {skillSlug}@{row.version}
                            </span>
                            <span className="shrink-0 text-muted-foreground">
                              {formatBytes(row.totalSize)}
                            </span>
                            <Button
                              type="button"
                              size="icon-xs"
                              variant="ghost"
                              aria-label={actionLabel}
                              title={actionLabel}
                              disabled={downloadingVersion !== null || !detail.data}
                              onClick={() => handleDownloadVersion(row)}
                            >
                              {downloadingVersion === row.version ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Download className="size-3.5" />
                              )}
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              ) : null}
              <FileDropzone files={files} onChange={handleFilesChange} requireSkillMd={needsSkillMd} />
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button className="gap-2" disabled={pending || !canSave} onClick={save}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : null}
            {pending
              ? isEdit
                ? t("admin.content.saving")
                : t("admin.content.creating")
              : isEdit
                ? t("admin.content.save")
                : t("admin.content.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
