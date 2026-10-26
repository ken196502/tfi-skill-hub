import type { ApiKeyScope } from "./api/types";
import { pickLocalized, type Locale } from "../i18n/config";

/**
 * Plain-text usage sheet builder.
 *
 * Every example declares the scope it needs, so a key's own sheet only
 * contains the calls it is actually allowed to make — against the live
 * backend's real routes (pageNum/pageSize paging, multipart publishing,
 * `Authorization: Bearer shk_…`). `<namespace>`/`<slug>` are placeholders —
 * the point is the shape of the request, not a real target.
 *
 * Knowledge bases share the skill record, endpoints and scopes, so they appear
 * here as `type=knowledge` variants of the same calls — one key covers both.
 */

/**
 * The API base shown in samples.
 *
 * NEXT_PUBLIC_API_BASE_URL is inlined at build time and carries the
 * environment: absolute for SIT/prod builds (https://<env-host>/skillhubservice),
 * a relative prefix in dev. The relative form is resolved against the current
 * origin so local samples keep working through the next.config proxy.
 */
export function apiBaseForDisplay(): string {
  const base = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "/skillhubservice").replace(/\/+$/, "");
  if (/^https?:\/\//i.test(base)) return base;
  if (typeof window !== "undefined" && window.location.origin) {
    return `${window.location.origin}${base}`;
  }
  return `https://<your-host>${base}`;
}

interface UsageExample {
  scope: ApiKeyScope;
  label: { zh: string; en: string };
  command: (base: string, token: string) => string;
}

const EXAMPLES: UsageExample[] = [
  {
    scope: "skills:read",
    label: { zh: "列出技能", en: "List skills" },
    command: (b, k) =>
      `curl -H "Authorization: Bearer ${k}" "${b}/api/v1/skills?pageNum=1&pageSize=20"`,
  },
  {
    scope: "skills:read",
    label: { zh: "列出知识库", en: "List knowledge bases" },
    command: (b, k) =>
      `curl -H "Authorization: Bearer ${k}" "${b}/api/v1/skills?type=knowledge&pageNum=1&pageSize=20"`,
  },
  {
    scope: "skills:read",
    label: { zh: "搜索技能", en: "Search skills" },
    command: (b, k) =>
      `curl -H "Authorization: Bearer ${k}" "${b}/api/v1/search?q=deploy&pageNum=1&pageSize=10"`,
  },
  {
    scope: "skills:read",
    label: { zh: "搜索知识库", en: "Search knowledge bases" },
    command: (b, k) =>
      `curl -H "Authorization: Bearer ${k}" "${b}/api/v1/search?q=report&type=knowledge&pageNum=1&pageSize=10"`,
  },
  {
    scope: "skills:read",
    label: { zh: "查看技能或知识库详情", en: "Get a skill or knowledge base" },
    command: (b, k) =>
      `curl -H "Authorization: Bearer ${k}" "${b}/api/v1/skills/@<namespace>/<slug>"`,
  },
  {
    scope: "skills:read",
    label: { zh: "读取技能文件", en: "Read a skill file" },
    command: (b, k) =>
      `curl -H "Authorization: Bearer ${k}" "${b}/api/v1/skills/@<namespace>/<slug>/file?version=latest&path=SKILL.md"`,
  },
  {
    scope: "skills:read",
    label: { zh: "读取知识库文件", en: "Read a knowledge base file" },
    command: (b, k) =>
      `curl -H "Authorization: Bearer ${k}" "${b}/api/v1/skills/@<namespace>/<slug>/file?version=latest&path=<file-path>"`,
  },
  {
    scope: "skills:publish",
    label: { zh: "发布技能新版本", en: "Publish a new version" },
    command: (b, k) =>
      `curl -X POST -H "Authorization: Bearer ${k}" \\\n  -F slug=<slug> -F version=1.0.0 -F "files=@SKILL.md" \\\n  ${b}/api/v1/skills`,
  },
  {
    scope: "skills:publish",
    label: { zh: "更新技能或知识库详情内容", en: "Update the detail body" },
    command: (b, k) =>
      `curl -X PUT -H "Authorization: Bearer ${k}" -H 'Content-Type: application/json' \\\n  -d '{"html":"<h2>使用说明</h2>"}' \\\n  ${b}/api/v1/skills/@<namespace>/<slug>/detail-html`,
  },
  {
    scope: "skills:delete",
    label: { zh: "删除技能或知识库", en: "Delete a skill or knowledge base" },
    command: (b, k) =>
      `curl -X DELETE -H "Authorization: Bearer ${k}" ${b}/api/v1/skills/@<namespace>/<slug>`,
  },
  {
    scope: "skills:delete",
    label: { zh: "恢复已删除的内容", en: "Restore deleted content" },
    command: (b, k) =>
      `curl -X POST -H "Authorization: Bearer ${k}" ${b}/api/v1/skills/@<namespace>/<slug>/undelete`,
  },
  {
    scope: "skills:moderate",
    label: { zh: "设置技能或知识库公开/私有", en: "Set visibility" },
    command: (b, k) =>
      `curl -X POST -H "Authorization: Bearer ${k}" -H 'Content-Type: application/json' \\\n  -d '{"visibility":"public"}' \\\n  ${b}/api/v1/admin/skills/@<namespace>/<slug>/visibility`,
  },
  {
    scope: "users:moderate",
    label: { zh: "查看待审核用户", en: "List accounts awaiting review" },
    command: (b, k) =>
      `curl -H "Authorization: Bearer ${k}" "${b}/api/v1/admin/users?status=pending"`,
  },
  {
    scope: "users:moderate",
    label: { zh: "通过或驳回注册用户", en: "Approve or reject a sign-up" },
    command: (b, k) =>
      `curl -X POST -H "Authorization: Bearer ${k}" -H 'Content-Type: application/json' \\\n  -d '{"userId":123,"action":"approve"}' \\\n  ${b}/api/v1/admin/users/review`,
  },
];

/** The examples whose scope the key holds — also used by the page guide. */
export function examplesFor(scopes: ApiKeyScope[]): UsageExample[] {
  return EXAMPLES.filter((item) => scopes.includes(item.scope));
}

/** Locale-specific sheet headers. */
const SHEET_HEADERS: Record<Locale, { title: string; base: string; hint: string }> = {
  zh: {
    title: "SkillHub 接口调用示例",
    base: "接口地址",
    hint: "示例已带上这把密钥，复制后可直接执行",
  },
  en: {
    title: "SkillHub API examples",
    base: "API base",
    hint: "Each example already carries this key — run it as is",
  },
};

/**
 * Builds the plain-text usage sheet for one key. `token` is the key's own
 * full value, so the sheet is ready to run the moment it is copied.
 */
export function buildUsageText(input: {
  name: string;
  token: string;
  scopes: ApiKeyScope[];
  apiBase: string;
  locale: Locale;
}): string {
  const head = SHEET_HEADERS[input.locale];
  const lines: string[] = [
    `# ${head.title} — ${input.name}`,
    `# ${head.base}: ${input.apiBase}`,
    `# ${head.hint}`,
    "",
  ];
  for (const example of examplesFor(input.scopes)) {
    lines.push(`# ${pickLocalized(example.label, input.locale)}`);
    lines.push(example.command(input.apiBase, input.token));
    lines.push("");
  }
  return lines.join("\n").trim();
}
