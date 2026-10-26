import type { Metadata } from "next";
import { SkillDetailContent } from "@/components/skills/skill-detail";
import { safeSkillsReturnTo } from "@/lib/list-filters";

/**
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
  const slug = segments[segments.length - 1] ?? "Skill";
  return { title: slug };
}

export default async function SkillDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ ref: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ref } = await params;
  const fullRef = decodeRefSegments(ref).join("/");
  // The list the visitor came from (its filters included) — the back link uses
  // it so the browsing view and the scroll position survive the round trip.
  // Without one, the detail page picks the correct catalogue from the content
  // type once the record has loaded.
  const rawReturnTo = (await searchParams).returnTo;
  const returnTo = rawReturnTo ? safeSkillsReturnTo(rawReturnTo) : undefined;

  return <SkillDetailContent skillRef={fullRef} returnTo={returnTo} />;
}
