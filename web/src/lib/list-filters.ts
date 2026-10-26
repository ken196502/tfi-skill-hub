/**
 * Skills-list browsing context carried in the URL.
 *
 * The list mirrors its filters into the query string so that:
 * - returning from a detail page can target the exact view the user left
 *   (that href travels to the detail page as `returnTo`, which is what the
 *   "back to skills" link points at);
 * - a reload / shared link renders the same view;
 * - the list mounts with the same query key, which is what lets the scroll
 *   position be restored: the pages the user had loaded are still cached.
 */

/** Filter keys of the skills list, in the canonical order they are written in. */
const FILTER_KEYS = ["category", "sort", "q"] as const;

/** The list route, and the fallback for any return target we do not accept. */
export const DEFAULT_LIST_HREF = "/skills";

/** Values the UI starts with. Keeping them out of the URL leaves it clean and,
 * more importantly, avoids a rewrite on the first mount of the list. */
const DEFAULT_FILTERS: Required<ListFilters> = { category: "", sort: "created", q: "" };

/** Sort options the list offers; anything else in a URL falls back to default. */
export const LIST_SORT_VALUES = ["created", "updated", "downloads", "stars", "name"] as const;

export type ListFilters = Partial<Record<(typeof FILTER_KEYS)[number], string>>;

/** Shape of a Next.js `searchParams` object. */
type SearchParamsLike = Record<string, string | string[] | undefined>;

function toParams(source: string | SearchParamsLike): URLSearchParams {
  if (typeof source === "string") {
    return new URLSearchParams(source.startsWith("?") ? source.slice(1) : source);
  }
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = source[key];
    const first = Array.isArray(value) ? value[0] : value;
    if (first) params.set(key, first);
  }
  return params;
}

/** Filters read from a query string or a Next `searchParams` object. */
export function readListFilters(source: string | SearchParamsLike): Required<ListFilters> {
  const params = toParams(source);
  const sort = (params.get("sort") ?? "").trim();
  return {
    category: (params.get("category") ?? "").trim(),
    sort: (LIST_SORT_VALUES as readonly string[]).includes(sort) ? sort : DEFAULT_FILTERS.sort,
    q: (params.get("q") ?? "").trim(),
  };
}

/**
 * Canonical query string for the given filters: empty values and defaults are
 * dropped and the key order is fixed, so equal filters always give the same
 * string. Spaces are written as `%20` (`URLSearchParams` would emit `+`, which
 * is ambiguous once a search term itself contains a plus sign).
 */
export function buildListSearch(filters: ListFilters): string {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
    const value = (filters[key] ?? "").trim();
    if (value && value !== DEFAULT_FILTERS[key]) params.set(key, value);
  }
  return params.toString().replace(/\+/g, "%20");
}

/** Canonical form of a query string: key order, defaults and `+` vs `%20`
 * encodings of the same filters all compare equal. */
export function normalizeListSearch(search: string): string {
  return buildListSearch(readListFilters(search));
}

/** Full list href (`/skills` or `/skills?category=finance&sort=stars`). */
export function buildListHref(pathname: string, search: string): string {
  return search ? `${pathname}?${search}` : pathname;
}

/**
 * Validates a `returnTo` value. Only the skills catalogue, the knowledge
 * catalogue, the favourites page and the global search page are accepted, so a
 * crafted parameter can neither leave the app nor reach an unexpected page;
 * anything else falls back to the plain skills list. The search parameters are
 * rebuilt from the known keys only.
 */
export function safeSkillsReturnTo(value: string | string[] | undefined): string {
  if (typeof value !== "string" || !value) return DEFAULT_LIST_HREF;
  const [path, search = ""] = value.split("?");
  if (path === "/favorites") return "/favorites";
  if (path === DEFAULT_LIST_HREF || path === "/knowledge") {
    return buildListHref(path, normalizeListSearch(search));
  }
  if (path === "/search") {
    const params = new URLSearchParams(search);
    const next = new URLSearchParams();
    const query = (params.get("q") ?? "").trim();
    const type = params.get("type") ?? "";
    if (query) next.set("q", query);
    if (type === "skill" || type === "knowledge") next.set("type", type);
    const canonical = next.toString().replace(/\+/g, "%20");
    return canonical ? `/search?${canonical}` : "/search";
  }
  return DEFAULT_LIST_HREF;
}
