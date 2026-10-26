import type { Metadata } from "next";
import { SearchContent } from "@/components/search/search-content";

export const metadata: Metadata = {
  title: "搜索",
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  const query = (first(params.q) ?? "").trim();
  const rawType = first(params.type);
  const type = rawType === "skill" || rawType === "knowledge" ? rawType : "all";

  return <SearchContent initialQuery={query} initialType={type} />;
}
