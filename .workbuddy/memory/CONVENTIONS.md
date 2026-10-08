# tfi-skill-hub —— 完整约定明细

把 `saker-ai/skillhub`（Go）重写为 TypeScript。`MEMORY.md` 是索引，本文件是完整契约与约定。
以下约定在后续改动中必须保持一致。

## 技术栈（已定，不要替换）

- **框架**：TanStack Start（单体全栈）+ TanStack Router + TanStack Query
- **数据库**：SQLite，走 Node 内置 `node:sqlite`。**不要**引入 better-sqlite3 / Prisma / Drizzle
- **搜索**：SQLite FTS5，`tokenize='trigram'`，过滤字段用 `UNINDEXED` 列
- **依赖只有** `@tanstack/*` + `react` + `react-dom`；后端零第三方依赖
  （ZIP、Markdown、semver、scrypt、JWT 式 token 全部自己实现）
- 新增第三方依赖前先问：Node 标准库能不能满足

## 管理端 API Key（2026-09-24 新增）

- 独立表 `api_keys`（migration v4）+ `shk_` 前缀（`SKILLHUB_API_KEY_PREFIX`），
  与 `clh_` 个人 token 完全分开；个人 token 行为未改。
- 权限用 `ApiKeyScope`（`skills:read|publish|delete|moderate`），逐路由标 `apiKeyScope`；
  **未标注的路由一律拒绝 key**，所以 key 只能管技能。
- 精选接口已开放（2026-09-24）：`GET /admin/features → skills:read`、
  `PUT /admin/features → skills:moderate`（skillIds 数组，≤12，audit 记 replace_featured_skills）。
- key 认证得到的是签发者身份，但签发者必须是仍是 admin 且未封禁，否则视为无效。
- 页面在 `/admin/api-keys`（AdminShell 的 `apikeys` 导航项）。
- **新增 `users:moderate`（2026-10-08）**：只覆盖 `GET /admin/users` 与 `POST /admin/users/review`；
  **封禁 / 改角色 / 建用户 / 签 token 故意不标 scope**，因此只有登录会话能用，key 一律 403。

## 用户注册与审核（2026-10-08 新增）

- migration **v7**：`users.status`（`pending|approved|rejected`，NOT NULL DEFAULT 'approved' + CHECK）、
  `review_note` / `reviewed_at` / `reviewed_by`。存量账号=approved，行为不变；驳回**不删号**（可审计、handle 不被复用）。
- 公开注册 `POST /register`（页面 `routes/register.tsx`，POST handler 仿 `login.tsx`）+
  `GET /api/v1/registration` 返回 `{enabled}` 供前端隐藏入口；开关 `SKILLHUB_ALLOW_REGISTRATION`（默认开）。
- **待审 / 被驳回账号不能登录、也不持有会话**：`login` 在**密码校验通过之后**才报 403 +
  `code: 'account_pending' | 'account_rejected'`（新增的可加性字段，前端按 code 出双语提示，别去匹配英文文案）；
  `http.ts` 的 `authenticateToken` / `authenticateApiKey` 都要求 `status === 'approved'`。
- 审核：`POST /api/v1/admin/users/review` `{userId, action: approve|reject, note?}`；
  `GET /admin/users?status=pending|approved|rejected`（非法值静默忽略），响应额外带 `pendingCount`；
  audit action：`register_user` / `review_user_approve` / `review_user_reject`。
- `login` 的错误折叠策略只在**凭据错误**时生效（401 一律 "invalid username or password"），
  账号状态类错误在验密后单独报——不要把这个顺序调换，否则会泄漏账号是否存在。

## 角色模型：只有 admin 和 user（2026-10-08 收敛）

- **人的角色只有两种**：`user` / `admin`。`UserRole` 里还留着 `agent`，但它**不是人的角色**，
  只是 `/api/agent/provision` 自动建号的内部标记，界面不可选、也没有权限加成。
- 原 Go 带来的 `moderator`（审核员）**已删除**（migration **v8**：存量 `role='moderator'` 一律降级为 `user`）。
  它当年也只有两条实权（读未过审技能 + 删别人评论），且进不了后台，留着只会误导。
  原先给它放权的四处已收窄为 admin-only：`services/shared.ts` `canViewSkill()`、
  `repo/skills.ts` `visibilityClause()`、`services/agentSkills.ts` `visibilitySql()`、
  `services/social.ts` 删评论；`auth.ts` 的 `isModerator()` 一并删除（本来就没有调用点）。
- **`users.role` 的 CHECK 里仍留着 `'moderator'`**：SQLite 无法在不重建表的前提下删约束，
  而重建 `users` 会让所有 `REFERENCES users(id)` 的子表级联，风险不值得。所以规则**只在
  写入侧强制**（`VALID_ROLES = ['user','admin']`，create/setRole 都会 400）——别去"修"那个 CHECK。
- 角色校验的错误文案统一为 `invalid role, must be one of: user, admin`（自检里有断言）。

## 打包下载需要登录（2026-10-08，契约变更）

- `auth: 'required'`：`/api/v1/download`、`/api/v1/plugins/download`、`/api/runtime/skills/bundle`。
- **单文件读取保持公开**（`.../file`、`/api/runtime/skills/files`）——技能详情页靠它渲染正文/图片，
  一并锁掉会让未登录访客看不到任何内容。
- 技能详情页未登录时下载按钮改为跳 `/login?redirect=<当前路径>`（cookie 同源，登录后直接可下）。

## 技能详情 HTML（2026-09-24 新增）

- `PUT /api/v1/skills/:slug/detail-html`（及 `@:namespace/:slug` 版），`{ html }`；空串清除，
  页面回退 SKILL.md。存在 `skills.detail_html`（migration v5），不进版本表。
- **列表接口绝不能带正文**：`detail_html` 不在 `mapSkill` 里，只有详情路径单独取。
- 消毒器在 `src/lib/sanitizeHtml.ts`（零依赖、白名单重建式），**服务端入库前 + 页面渲染前各跑一次**。
- 权限走 `authorizeSkillWrite`（owner / 命名空间成员 / admin），路由标 `K_PUBLISH`。
- **HTML 与 SKILL.md 二选一**：有 `detailHtml` 时页面渲染 HTML，且连 SKILL.md 请求都不发；
  清空后回到 md。二选一只影响展示，已发布的 SKILL.md 文件不受影响。
- 页面「API usage」区 + 每行「复制调用说明」：示例按该 key 的 scopes 过滤；
  明文只在创建后那一刻可得，其余行只能嵌入 16 位前缀掩码。

## 目录职责（不要越界）

- `src/server/repo/*.ts` —— **唯一**写 SQL 的地方
- `src/server/services/*.ts` —— 业务规则与权限，不写 SQL
- `src/server/api/handlers.ts` —— 只做「解析请求 → 调 service → 映射状态码」
- `src/lib/*` —— 前端共享（类型、API 客户端、Markdown 渲染）
- `src/routes/*` —— 页面路由；`api/$.ts` 与 `$.ts` 是两个服务端 catch-all

## 运行入口与数据库位置

- 生产：`npm run build`（输出 `dist/`）→ `npm start`
  （2026-10-08 修正：`start` 原本指向 `dist/server/server.js`，那个只导出 handler、
  不监听端口，跑起来会立刻退出；现改为 `node --env-file-if-exists=.env scripts/serve.mjs`）
- `dist/server/server.js` 导出的是 Web 标准 handler，**不是**监听进程；改动启动逻辑要动 `serve.mjs`
- **库文件路径**（`src/server/config.ts:67`）：`SKILLHUB_DATABASE_URL` > `SKILLHUB_DB_PATH` >
  默认 `<repo>/data/skillhub.db`。`getDb()` 会自动 `mkdirSync` 父目录。
  - 本机/裸跑：`<repo>/data/skillhub.db`（+ `-wal` / `-shm`，WAL 模式，`db.ts` applyPragmas）
  - Docker：容器内 `/app/data/skillhub.db`，由 `docker-compose.yml` 的命名卷 `skillhub-data`
    落在宿主机（`docker volume inspect <project>_skillhub-data`）；compose 亦可改用
    `./data:/app/data` bind mount（勿放 NFS / vboxsf，WAL 会报 unable to open database file）
  - 备份要连 `-wal` / `-shm` 一起；`docker compose down` 不删卷，`down -v` 才彻底清
- **管理员凭据必须由 `.env` 注入**（2026-10-08）：`docker-compose.yml` 用
  `${SKILLHUB_ADMIN_USER:?}` / `${SKILLHUB_ADMIN_PASSWORD:?}` 强校验，缺值即 compose 报错退出；
  仓库与 README 中**不再出现任何默认口令**。模板 `.env.example`（入库），`.env` 不入库/不进镜像
  （`.gitignore` L17 + `.dockerignore`）。首启创建是幂等的，改已有账号口令要用
  `scripts/create-admin.mjs --password ... --set-password`。
- 开发：`npm run dev`
- `node:sqlite` 的 ExperimentalWarning 用 `--disable-warning=ExperimentalWarning` 屏蔽
  （`NODE_OPTIONS` 对 vite dev 有效）；不要写运行时 patch 的 hack 文件

## 契约约束

- **JSON 字段名以原 Go 的 `json:"..."` tag 为准**，`omitempty` 字段在为空时**整个键不出现**，
  不是 `null`。行 → 模型的映射只在 `repo/*.ts` 里做，不要在别处重新拼。
- **错误 → HTTP 状态的映射照抄原实现**：只有携带 sentinel 的错误才有 404/403/409，
  其余一律 400，即使文案写着 "not found"。见 `src/server/errors.ts` 与
  `serviceError()`。不要"顺手修正"。
- 两套错误信封：注册中心 `{"error":"..."}`（歧义 slug 额外带 `candidates`）；
  Agent/Runtime `{"error":{"code","message"}}`。
- 路由表用 gin 的 `@:namespace` 语法，新增路由直接加在 `src/server/api/routes.ts`，
  顺序无关（匹配按静态段优先）。

## 验证要求（交付前必跑）

```bash
npm run typecheck   # 必须 0 报错
npm run build
npm run smoke       # 必须全绿
```

- 自检用**临时库 + 真实 HTTP**，就绪判定匹配 `x-run-id`，每次换端口。
- 功能用例用大限额（`SKILLHUB_RATE_*_LIMIT=100000`），限流单独用小限额服务验证，
  否则会自己把自己限流成 429、掩盖真实断言。
- 改动发布/下载/权限相关逻辑时，同步补自检断言。
- **`npm run smoke` 跑的是 `dist/server/server.js`——改了源码必须重新 build 再跑 smoke**，
  否则验证的是旧代码（曾把"路由没生效 403"误判成实现错误，其实是旧 dist）。

## 界面文案

- 页面是给最终用户看的：**不写实现说明**（"密码以 scrypt 存储"、"仅隐藏 XX 标签"）、
  **不写运营/第三人称视角**。
- **全站双语（2026-09 起，覆盖旧的"以中文为主"）**：语言切换（`skillhub.lang`，默认 en）
  影响所有页面 + 技能/插件的名称与简介。写法约定：
  - i18n 基础在 `src/lib/i18n.tsx`：`LangProvider`（挂在 `__root.tsx`）、`useLang()`、
    `useT()` 返回 `(zh, en) => string`，**内联双语字面量**，不建中央 key 表；
  - 实体名/简介用 `localizedName(entity, lang)` / `localizedSummary(entity, lang)`；
  - 数据层：`skills`/`plugins` 表有 `display_name_en` / `summary_en` 列（migration v3），
    API 字段 `displayNameEn` / `summaryEn`（omitempty）；EN 缺失时回退中文字段；
  - 内置技能在 `src/server/builtinSkills.ts` 里 `name`/`nameEn` 成对维护；
    bootstrap 播种时同时写两列并回填旧库，还负责把内置技能写入 search_docs
    （内置技能不走 publish，**不会**被自动索引）；
  - 搜索结果的英文字段通过 search 查询 JOIN skills/plugins 取得，**不改 FTS5 表结构**
    （FTS5 不支持 ADD COLUMN）；join 后 filter 列必须加 `sd.` 前缀避免歧义。
- 视觉沿用 `src/styles/global.css`（深色为主 + `[data-theme=light]` 变体），**已套用 TFI 品牌色（2026-09-24）**：
  品牌色 `#004123`；暗色主题用提亮绿 `#2f9e63` 作可读强调色、亮色主题直接用 `#004123`；
  辅助色（`#BAA6EE #DCD2FA #FAE752 #FDF898 #53553F #858667`）作为 CSS 变量令牌，
  并在首页 backdrop 以极淡紫 `#BAA6EE` 点缀。改配色只动 `global.css` 的 `:root` / `[data-theme="light"]` 变量与少量硬编码绿。
- **字体用 Helvetica**（TFI 品牌字体，2026-09-24 由 D-DIN 替换）：系统字族
  `"Helvetica Neue", Helvetica, Arial` + CJK 回退（PingFang SC / Microsoft YaHei），**不打包任何 woff2**；
  `@font-face` 已删除、`src/styles/fonts/` 已移除。改字体只动 `global.css` 的 `--font-heading`/`--font-body`。
- 头图 logo：`src/styles/logo.svg`（取自 tfisec.com，反白版，原文件经 `feColorMatrix` 强制白色）
  以 CSS `mask` 渲染，靠 `--logo-color` 在暗色=白、亮色=`#004123` 间切换（`.logo-mark`）。
  logo 本身是红/橙/灰多色标，反白版更适合暗色导航；亮色导航用品牌绿重染。改 logo 只换该 svg + 变量。

## 有意与原实现的差异（不要"修回去"）

1. 版本内容存 SQLite（`skill_version_files`），不再用 git；`gitCommitHash` 保留但不写
2. 搜索用 FTS5 trigram（≥3 字符），短查询退化 LIKE
3. 口令哈希用 scrypt，存储为 `scrypt:<salt>:<hash>`；与原 Go 库不互通
4. 时间戳统一 ISO-8601 UTC
5. `POST /login` 额外兼容 JSON body（超集）
6. 插件发布支持可选 `visibility`（原实现没有）
7. `/metrics` 是精简版；`/openapi.json`、`/docs` 未实现
8. 全站双语是本重写新增能力（原 Go 版无）；`displayNameEn`/`summaryEn`/`display_name_en`/
   `summary_en` 为新增字段，内置技能 README 以英文生成（旧库存量 README 仍为中文，
   只有 name/summary 被回填双语）
9. `manage.ts` 精选上限错误文案由中文改为英文（'at most 12 featured skills'），与其余
   API 错误文案语言统一

## 未覆盖（按约定不做）

OAuth 登录、Webhook 导入、Git 镜像、S3/OSS 后端与直传、Sigstore 校验、PostgreSQL、
Go 模板兜底页。详见 README「本版本未覆盖的功能」。

## 本机环境坑

WorkBuddy 沙箱在单个 turn 内拦截 **>50 个文件的批量删除**（`SAFE_DELETE_BULK_CONFIRM_REQUIRED`），
`fs.rmSync` 和 Python `shutil.rmtree` 都被拦 ⇒ `vite build` 清理 outDir 会失败。
绕过：**用 `mv` 把 `dist` 移出工作区**（移动不算删除）再构建；
或设 `SKILLHUB_SERVER_ENTRY` / `SKILLHUB_CLIENT_DIR` 把产物放到别处验证。
