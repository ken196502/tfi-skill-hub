import type { Locale } from "@/i18n/config";

const dateLocales: Record<Locale, string> = { zh: "zh-CN", en: "en-US" };

/** `2026-10-08T03:00:00.000Z` → `2026/10/08` (or `10/08/2026` in English). */
export function formatDate(iso: string, locale: Locale, withTime = false): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(dateLocales[locale], {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

export function formatNumber(value: number, locale: Locale): string {
  if (!Number.isFinite(value)) return "0";
  return new Intl.NumberFormat(dateLocales[locale]).format(value);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[index]}`;
}
