"use client";

import { BrandLogo } from "@/components/common/brand-logo";
import { useI18n } from "@/i18n";

export function SiteFooter() {
  const { t } = useI18n();

  return (
    <footer className="mt-auto border-t py-4">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4">
        <BrandLogo className="h-8" />
        <p className="text-xs text-muted-foreground">
          © 2026 TFI. {t("footer.rights")}
        </p>
      </div>
    </footer>
  );
}
