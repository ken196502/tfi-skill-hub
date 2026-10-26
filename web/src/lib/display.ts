import type { Locale } from "@/i18n/config";

/**
 * Bilingual field selection.
 *
 * The API carries both languages on the same record (`displayName` /
 * `displayNameEn`); which one wins is a client-side decision based on the
 * active locale, with a graceful fallback when the translation is missing.
 */

interface Bilingual {
  displayName?: string;
  displayNameEn?: string;
  summary?: string;
  summaryEn?: string;
}

export function localizedName(item: Bilingual & { slug?: string }, locale: Locale): string {
  if (locale === "en") return item.displayNameEn || item.displayName || item.slug || "—";
  return item.displayName || item.displayNameEn || item.slug || "—";
}

export function localizedSummary(item: Bilingual, locale: Locale): string {
  if (locale === "en") return item.summaryEn || item.summary || "";
  return item.summary || item.summaryEn || "";
}

/**
 * Folds entities that the write path escaped more than once.
 *
 * Stored detail HTML escapes every `&`, and records that went through the
 * approval pass more than once keep the extra layers: `<15mm` is stored as
 * `&amp;amp;lt;15mm`, so the page shows the literal `&lt;15mm`. Meeting this
 * data halfway at render time is the only client-side option — the markup
 * boundary itself must not move.
 *
 * Only runs of two or more `&amp;` are folded, which keeps two cases intact:
 * a deliberately single-escaped `&lt;` (someone documenting HTML entities)
 * survives untouched, and the output can never contain a bare `<`, so nothing
 * here can turn text back into markup. Each pass removes one layer, and the
 * loop is bounded.
 */
const NESTED_ENTITY = /&(?:amp;){2,}(amp;|lt;|gt;|quot;|apos;|nbsp;|#\d+;|#x[0-9a-fA-F]+;)/gi;

export function collapseNestedEntities(html: string): string {
  let out = html;
  for (let pass = 0; pass < 5; pass += 1) {
    const next = out.replace(NESTED_ENTITY, "&$1");
    if (next === out) break;
    out = next;
  }
  return out;
}

/** Picks the rich detail body for the locale, falling back to Chinese. */
export function localizedDetailHtml(
  skill: { detailHtml?: string; detailHtmlEn?: string },
  locale: Locale,
): string | undefined {
  const html =
    locale === "en"
      ? skill.detailHtmlEn || skill.detailHtml
      : skill.detailHtml || skill.detailHtmlEn;
  return html ? collapseNestedEntities(html) : html;
}
