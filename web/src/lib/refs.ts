/** `@namespace/slug` when a namespace exists, bare `slug` otherwise. */
export function skillRef(skill: { slug: string; namespaceSlug?: string }): string {
  return skill.namespaceSlug ? `@${skill.namespaceSlug}/${skill.slug}` : skill.slug;
}
