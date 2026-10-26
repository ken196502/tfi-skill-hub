"use client";

import { X } from "lucide-react";
import { useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Skill file picker: drag a folder or files in, or use the two buttons.
 *
 * `webkitRelativePath` is what carries a dropped folder's structure through to
 * the server as the stored file path — a plain multi-file pick has no paths and
 * lands flat.
 */
export function FileDropzone({
  files,
  onChange,
  requireSkillMd = false,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  /** Warn until a `SKILL.md` is present — required when creating a skill. */
  requireSkillMd?: boolean;
}) {
  const { t } = useI18n();
  const [dragover, setDragover] = useState(false);

  const add = (incoming: FileList | null) => {
    if (!incoming) return;
    onChange([...files, ...Array.from(incoming)]);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragover(false);
    add(event.dataTransfer.files);
  };

  const hasSkillMd = files.some(
    (file) => file.name === "SKILL.md" || file.webkitRelativePath.endsWith("SKILL.md"),
  );
  const showMissing = requireSkillMd && !hasSkillMd;

  return (
    <div className="space-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragover(true);
        }}
        onDragLeave={() => setDragover(false)}
        onDrop={onDrop}
        className={cn(
          "rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
          dragover ? "border-primary bg-accent/60" : "border-input",
        )}
      >
        <p className="text-sm text-muted-foreground">{t("admin.content.dropHint")}</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <Button asChild variant="outline" size="sm">
            <label className="cursor-pointer">
              {t("admin.content.chooseFolder")}
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(event) => add(event.target.files)}
                {...({ webkitdirectory: "true", directory: "true" } as Record<string, string>)}
              />
            </label>
          </Button>
          <Button asChild variant="outline" size="sm">
            <label className="cursor-pointer">
              {t("admin.content.chooseFiles")}
              <input
                type="file"
                multiple
                className="hidden"
                onChange={(event) => add(event.target.files)}
              />
            </label>
          </Button>
        </div>
      </div>

      {files.length > 0 ? (
        <div className="rounded-lg border">
          <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
            <span className="text-xs text-muted-foreground">
              {t("admin.content.filesSelected", { count: files.length })}
              {showMissing ? t("admin.content.missingSkillMd") : ""}
            </span>
            <Button type="button" variant="ghost" size="xs" onClick={() => onChange([])}>
              {t("admin.content.clearFiles")}
            </Button>
          </div>
          <ul className="max-h-40 divide-y overflow-y-auto">
            {files.slice(0, 12).map((file, index) => (
              <li
                key={`${file.webkitRelativePath || file.name}-${index}`}
                className="flex items-center gap-2 px-3 py-1.5 text-xs"
              >
                <span className="min-w-0 flex-1 truncate" title={file.webkitRelativePath || file.name}>
                  {file.webkitRelativePath || file.name}
                </span>
                <span className="shrink-0 text-muted-foreground">
                  {Math.max(1, Math.round(file.size / 1024))} KB
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("admin.content.removeFile")}
                  onClick={() => onChange(files.filter((_, i) => i !== index))}
                >
                  <X />
                </Button>
              </li>
            ))}
          </ul>
          {files.length > 12 ? (
            <p className="border-t px-3 py-1.5 text-xs text-muted-foreground">
              {t("admin.content.filesMore", { count: files.length - 12 })}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
