import type { Metadata } from "next";
import { SkillDetailContent } from "@/components/skills/skill-detail";
import { safeSkillsReturnTo } from "@/lib/list-filters";

/**
 * Knowledge bases share the skill record, endpoints and detail component; only
 * the path prefix differs. The site header derives the active section from the
 * URL, so `/knowledge/<ref>` keeps the "knowledge" entry highlighted. Older
 * `/skills/<ref>` links stay valid — they just show the skill section as active.
 *
 * Next.js keeps percent-encoding in catch-all params (e.g. `%40admin` for
 * `@admin`), while the API layer expects the decoded ref and encodes it once
 * itself. Decoding each segment here is idempotent for plain segments, so it
 * is safe for both server-rendered and client-side navigations.
 */
function decodeRefSegments(ref: string[] | undefined): string[] {
  return (ref ?? []).map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
}

/** The catch-all segment supports both `slug` and `@namespace/slug` URLs. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ ref: string[] }>;
}): Promise<Metadata> {
  const { ref } = await params;
  const segments = decodeRefSegments(ref);
  const slug = segments[segments.length - 1] ?? "Knowledge";
  return { title: slug };
}

export default async function KnowledgeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ref } = await params;
  const fullRef = decodeRefSegments(ref).join("/");
  // Same browsing contract as the skills detail page: the list the visitor came
  // from travels in `returnTo`; without it the detail page falls back to the
  // catalogue matching the record's content type.
  const rawReturnTo = (await searchParams).returnTo;
  const returnTo = rawReturnTo ? safeSkillsReturnTo(rawReturnTo) : undefined;

  return <SkillDetailContent skillRef={fullRef} returnTo={returnTo} />;
}
