"use client";

import { Download, Loader2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/use-auth";
import { useDownloadSkill } from "@/hooks/use-skills";
import { useI18n } from "@/i18n";
import type { SkillWithOwner } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export function DownloadButton({
  skill,
  className,
  label,
}: {
  skill: Pick<SkillWithOwner, "slug" | "namespaceSlug">;
  className?: string;
  /** Overrides the signed-in button text (e.g. "Install" on the detail page). */
  label?: string;
}) {
  const { isAuthenticated } = useCurrentUser();
  const download = useDownloadSkill();
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useI18n();

  const handleClick = () => {
    if (!isAuthenticated) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    download.mutate(
      { slug: skill.slug, namespaceSlug: skill.namespaceSlug || undefined },
      {
        onSuccess: () => toast.success(t("skillDetail.downloadStarted")),
      },
    );
  };

  return (
    <Button onClick={handleClick} disabled={download.isPending} className={cn("gap-2", className)}>
      {download.isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <Download className="size-4" />
      )}
      {download.isPending
        ? t("skillDetail.downloading")
        : isAuthenticated
          ? (label ?? t("skillDetail.download"))
          : t("skillDetail.loginToDownload")}
    </Button>
  );
}
