import type { I18nContextValue, TranslationKey } from "@/i18n";
import { VALID_CATEGORIES } from "@/lib/api/types";

/**
 * Localised label for a category code.
 *
 * Only the values in `VALID_CATEGORIES` have dictionary entries; anything a
 * backend adds later falls back to the raw code instead of leaking an
 * untranslated `skills.categories.*` key into the UI.
 */
export function categoryLabel(category: string, t: I18nContextValue["t"]): string {
  const known = (VALID_CATEGORIES as readonly string[]).includes(category);
  return known ? t(`skills.categories.${category}` as TranslationKey) : category;
}
