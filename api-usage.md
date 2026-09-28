# Skill Hub 技能管理 API 使用说明

- **Base URL**: `https://skills.subx.fun`
- **认证**: 所有请求带 `Authorization: Bearer <API_KEY>`
- **API Key**: `shk_Dc8r_AffkQsAluKZJu2OTTBXJqkimubuHGlBvUytLmE`
  （scopes: `skills:read` / `skills:publish` / `skills:delete` / `skills:moderate`；
  明文仅此一份，创建行之外的界面只显示 16 位前缀掩码）

---

## 1. 列出技能

```bash
curl -H "Authorization: Bearer shk_Dc8r_AffkQsAluKZJu2OTTBXJqkimubuHGlBvUytLmE" \
  "https://skills.subx.fun/api/v1/skills?limit=20"

# 只看某命名空间（生产技能都在 admin）
curl -H "Authorization: Bearer shk_Dc8r_AffkQsAluKZJu2OTTBXJqkimubuHGlBvUytLmE" \
  "https://skills.subx.fun/api/v1/skills?namespace=admin&limit=100"
```

> 不带 namespace 时是游标分页：返回 `nextCursor`，翻页加 `&cursor=<nextCursor>`。

## 2. 搜索技能

```bash
curl -H "Authorization: Bearer shk_Dc8r_AffkQsAluKZJu2OTTBXJqkimubuHGlBvUytLmE" \
  "https://skills.subx.fun/api/v1/search?q=deploy&limit=10"
```

## 3. 查看单个技能（含版本、文件列表）

```bash
curl -H "Authorization: Bearer shk_Dc8r_AffkQsAluKZJu2OTTBXJqkimubuHGlBvUytLmE" \
  "https://skills.subx.fun/api/v1/skills/@admin/<slug>"
```

## 4. 发布 / 更新一个技能（新增版本）

```bash
# 首次发布或发新版本；本地路径的文件名会原样成为包内路径
curl -X POST -H "Authorization: Bearer shk_Dc8r_AffkQsAluKZJu2OTTBXJqkimubuHGlBvUytLmE" \
  -F slug=<slug> \
  -F version=1.0.0 \
  -F category=finance \
  -F displayName=显示名 \
  -F summary=一句话简介 \
  -F displayNameEn=Display\ Name \
  -F summaryEn=One-line\ intro \
  -F "files=@/path/to/SKILL.md" \
  "https://skills.subx.fun/api/v1/skills"
```

要点：

- **双语字段**：`displayNameEn` / `summaryEn` 为英文名与英文简介（可选）；
  站点切到英文时优先生效，缺省回退中文字段。中文走 `displayName` / `summary`。

- **包内路径由 `;filename=` 决定**。要保证存进去的叫 `SKILL.md`、或带子目录（如 `references/cli.md`），
  必须显式指定：
  ```bash
  -F "files=@/tmp/SKILLDEMO.md;filename=SKILL.md"
  -F "files=@./references/cli.md;filename=references/cli.md"
  ```
- **版本号重复会 409**（`version already exists`）。软删的技能重发会自动恢复，
  所以更新内容只需把 version 升一位（1.0.0 → 1.0.1）。
- `displayName` / `summary` 等元数据只有传了非空值才会覆盖；只改分类时传 `category` 即可，
  不会清空名称简介。
- 分类只能取：`finance` / `personal` / `workspace` / `general`，未知值会被静默落回 `general`。

## 5. 更新详情页富文本（HTML）

```bash
curl -X PUT -H "Authorization: Bearer shk_Dc8r_AffkQsAluKZJu2OTTBXJqkimubuHGlBvUytLmE" \
  -H 'Content-Type: application/json' \
  -d '{"html":"<h2>使用说明</h2><p>…</p>"}' \
  "https://skills.subx.fun/api/v1/skills/@admin/<slug>/detail-html"
```

- **双语正文**：`html` 是中文正文、`htmlEn` 是英文正文，可只传其一（只更新对应语言），
  传空串 `""` 清除该语言。页面按站点语言渲染对应列：英文缺失时回退中文正文，
  两者都没有时回退 SKILL.md；两个都不传返回 400。
  ```bash
  -d '{"html":"<h2>简介</h2>…","htmlEn":"<h2>Overview</h2>…"}'
  ```
- 有对应语言的 HTML 时详情页渲染 HTML、隐藏 SKILL.md 正文；清空后回退。
- 服务端会做白名单消毒：`<script>`、`on*` 事件、`javascript:` 链接等会被剔除。
- **在详情页里放截图（推荐 base64 内嵌）**：消毒器放行 `<img src="data:image/png|jpeg|webp|gif;base64,…">`，
  图片直接嵌进 HTML，不占技能包、不发新版本，更新图片只需重 PUT 一次 detail-html：
  ```bash
  # 注意：接口虽接受 1MB，但消毒器会把输出截断到 512K 字符（超出部分静默丢弃、
  # 图片必然损坏），单语言正文（含 base64）实际必须 < 512KB；纯图片的正文不会被判为空内容
  python3 scripts/update-detail-html.py            # 按清单重刷全部详情页（双语一次写入）
  python3 scripts/update-detail-html.py <slug>…    # 只刷指定技能
  ```
- 也可以引用外链 `https://` 图片或包内文件
  （`/api/runtime/skills/files?slug=%40admin%2F<slug>&path=assets%2F<file>`，已带正确 Content-Type），
  但包内文件要随版本发布，改图就得发新版——展示类素材优先用 base64。
- 消毒后只剩语义标签与 `class`/`title` 等属性（`<style>` 标签、内联 `style` 均被剔除；
  SVG 的 data URI 也被禁），详情 HTML 渲染在 `.markdown-body` 容器里，
  写语义标签（h2/p/ul/table/figure）即可自动套用主题样式。
- 详情页 URL 格式：`https://skills.subx.fun/skills/@admin/<slug>`（必须带 `@命名空间`）。

## 6. 删除 / 恢复

```bash
# 删除（软删）
curl -X DELETE -H "Authorization: Bearer shk_Dc8r_AffkQsAluKZJu2OTTBXJqkimubuHGlBvUytLmE" \
  "https://skills.subx.fun/api/v1/skills/@admin/<slug>"

# 恢复
curl -X POST -H "Authorization: Bearer shk_Dc8r_AffkQsAluKZJu2OTTBXJqkimubuHGlBvUytLmE" \
  "https://skills.subx.fun/api/v1/skills/@admin/<slug>/undelete"
```

> 旧式写法 `DELETE /api/v1/skills/<slug>`（不带 @namespace）也可用，且实测更稳。

## 7. 审核（通过 / 拒绝）

```bash
curl -X POST -H "Authorization: Bearer shk_Dc8r_AffkQsAluKZJu2OTTBXJqkimubuHGlBvUytLmE" \
  -H 'Content-Type: application/json' \
  -d '{"action":"approve"}' \
  "https://skills.subx.fun/api/v1/admin/skills/@admin/<slug>/review"
# action 取 approve | reject
```

## 8. 设置可见性

```bash
curl -X POST -H "Authorization: Bearer shk_Dc8r_AffkQsAluKZJu2OTTBXJqkimubuHGlBvUytLmE" \
  -H 'Content-Type: application/json' \
  -d '{"visibility":"public"}' \
  "https://skills.subx.fun/api/v1/admin/skills/@admin/<slug>"
# visibility 取 public | unlisted | private
```

## 9. 首页精选（读 / 整体替换）

```bash
# 读当前精选（带技能详情，可拿到 skill id）
curl -H "Authorization: Bearer shk_Dc8r_AffkQsAluKZJu2OTTBXJqkimubuHGlBvUytLmE" \
  "https://skills.subx.fun/api/v1/admin/features"

# 整体替换（最多 12 个；数组顺序 = 首页展示顺序；传空数组即清空）
curl -X PUT -H "Authorization: Bearer shk_Dc8r_AffkQsAluKZJu2OTTBXJqkimubuHGlBvUytLmE" \
  -H 'Content-Type: application/json' \
  -d '{"skillIds":["<skill-id-1>","<skill-id-2>"]}' \
  "https://skills.subx.fun/api/v1/admin/features"
```

> `skillIds` 用技能的 `id`（UUID），不是 slug；可以从第 1 条「列出技能」或本接口的返回里拿。
> 首页公开接口 `GET /api/v1/features` 无需认证，改完立即可见。

## 10. 管理这条 key 自己

```bash
# 看所有 key
curl -H "Authorization: Bearer <admin会话或另一把key>" \
  "https://skills.subx.fun/api/v1/admin/api-keys"
```

---

## 限制与注意

| 事项 | 说明 |
|---|---|
| 限流 | 批量发布约 85 次后会 429，带 `Retry-After`；实测连发 ~20 次也可能触发，脚本里加退避（等 ~70s 重试）即可 |
| 单文件大小 | ≤ 5MB；单次上传文件数 ≤ 500 |
| key 边界 | 只能管技能（含精选）。建命名空间、管用户/插件/审计日志等接口一律 403 |
| 身份绑定 | key 的所有操作记在签发者（admin）名下；签发者被降权/封禁后 key 立即失效 |
| 错误格式 | 本组接口返回 `{"error":"…"}`；403 = key 无此接口权限，404 = 技能不存在，409 = 版本冲突 |
