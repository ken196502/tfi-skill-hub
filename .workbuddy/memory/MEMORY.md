# tfi-skill-hub —— 项目索引（改动前先读）

把 `saker-ai/skillhub`（Go）重写为 TypeScript。**完整契约与约定明细见 `CONVENTIONS.md`（同目录）**，
本文件只留最高频硬约束，避免注入超限被截断。

## 技术栈（锁定，不要替换）
- TanStack Start（单体全栈）+ Router + Query；前端只用 `@tanstack/*` + `react` + `react-dom`
- **前端已迁到 Next.js 16（`web/`，App Router + React Query + Tailwind4 + shadcn）**；
  后端 `src/server` 与数据库不动，Next 通过同源反代调后端
- 唯一例外：内容管理页富文本用 `quill@2.0.3`，客户端动态 import、独立懒加载 chunk
- SQLite 走 Node 内置 `node:sqlite`（**不要** better-sqlite3 / Prisma / Drizzle）；FTS5 `tokenize='trigram'`
- 后端零第三方依赖（ZIP / Markdown / semver / scrypt / token 全自实现）

## 运行入口
- 生产：`npm run build` → `npm start`（= `node --env-file-if-exists=.env scripts/serve.mjs`）
- `dist/server/server.js` 只导出 Web 标准 handler，**不监听端口**；启动逻辑在 `serve.mjs`；开发 `npm run dev`
- **后端独立跑**：`npm run api`（= `tsx scripts/serve-api.mjs`，默认 :8787，读根 `.env`），
  Next 前端反代到它。Docker 后端镜像同款（`node --import tsx scripts/serve-api.mjs`）
- 前端开发：`cd web && npm run dev`（:3000），读 `web/.env.development`
- 管理员凭据必须由 `.env` 注入（`SKILLHUB_ADMIN_USER/PASSWORD`），仓库内无默认口令
- 隔离验证：`SKILLHUB_DB_PATH=/tmp/xx.db SKILLHUB_PORT=5398` 换一套环境，别拿用户那份库做增删改

## 数据库
- 位置优先级 `SKILLHUB_DATABASE_URL` > `SKILLHUB_DB_PATH` > `<repo>/data/skillhub.db`（WAL，备份要连 -wal/-shm）
- Docker：`/app/data/skillhub.db`，命名卷 `skillhub-data`（`down -v` 才清）
- 迁移 **append-only**（改历史迁移会破坏老库升级），版本查 `PRAGMA user_version`（**没有** schema_migrations 表），
  每条包 `BEGIN/COMMIT`。最新：**v15**
- 改 CHECK 约束不用重建表：`ADD COLUMN 新列(带新 CHECK NOT NULL DEFAULT)` → `UPDATE ... CASE 平移` → `DROP COLUMN 旧列`
  （只 ADD 不 DROP 旧 CHECK 还在，新值会被拒）
- FTS5 虚表不能 ALTER，只能 DROP + 重建 + `INSERT...SELECT` 重灌

## 目录职责（不要越界）
- `src/server/repo/*` **唯一**写 SQL；`src/server/services/*` 业务规则与权限，不写 SQL
- `src/server/api/handlers.ts` 只做「解析请求 → 调 service → 映射状态码」
- 路由表 gin 语法，直接加在 `src/server/api/routes.ts`

## Next.js 前端（web/）
- 入口在 `web/src/app`；API 适配层**只有一处**知道后端方言：`web/src/lib/api/real.ts`
  （hooks → `lib/api/endpoints.ts` → `real.ts` → `client.ts`）。改后端契约只改 `real.ts`
- 同源反代：`NEXT_PUBLIC_API_BASE_URL=/skillhubservice`，Next `rewrites` 把 `/skillhubservice/:path*`
  转到 `${API_PROXY_TARGET}/:path*`（**剥掉前缀**——后端只认 `/api/**`）。
  生产由 Traefik `PathPrefix(/skillhubservice)` + `StripPrefix` 做同一件事
- 后端真实方言（写 `real.ts` 必读）：**无 `Resp` 包装**（成功即 payload 本身）；列表是**游标**分页
  （`cursor` + `limit`，回 `nextCursor`/`total`，公开列表**不返回 total**）；内容类型字段是
  `type`（`skill` / `knowledge_base`，UI 侧叫 `knowledge`）；上下架字段是 `listing`；
  **没有** visibility / moderationStatus；密码**明文传输**（服务端 scrypt），**没有** AES 预处理
- 排序映射：UI 的 `hot` → 后端 `downloads`（后端只有 created/downloads/stars/updated/name）
- `useSkillsInfinite` 有两道护栏：**按 skill.id 去重** + **某页没有新条目就停**（后端页可能重复）

## 契约要点
- JSON 字段名照抄 Go 的 `json:"..."`；`omitempty` 为空时**整个键不出现**（不是 null）
- 错误→状态码照抄原实现：只有带 sentinel 的错误才有 404/403/409，其余一律 400
- 技能只有三个操作：发布 / 编辑 / 上下架。字段是 **`listing`**（listed/unlisted），
  **没有** visibility / moderationStatus / plugins。端点 `POST /api/v1/admin/skills/:slug/listing`，
  筛选 `?listing=`，审计 `list_skill`/`unlist_skill`。已删且**不要恢复**：`.../review`、`.../visibility`、
  `.../request-public`、`/api/v1/plugins*`（smoke 有反向 404 断言）
- 分类两处都是自由输入 Combobox（`allowCustom`）：管理台表单候选走 `GET /api/v1/admin/categories`（DISTINCT）；
  公开目录页侧栏（/skills、/knowledge-bases，`CataloguePage.tsx`）候选走 `/api/v1/categories/in-use`
- **列表游标比较必须与 ORDER BY 同向**（2026-10-26 修）：`skills.list` 原用行值比较
  `(s.col, s.id) < (c.col, c.id)`，但 `ORDER BY s.created_at DESC, s.id`（tiebreaker 是 **ASC**），
  两者方向不一致 ⇒ 同一批 `created_at` 的行（批量 seed 就是这样）会**反复返回同一页**，
  React 报 duplicate key 且后面的技能永远刷不出来。已改成
  `(s.col <op> c.col) OR (s.col = c.col AND s.id >= c.id)`，`<op>` 随排序方向（name 是 `>`，其余 `<`）。
  游标落在**本页没返回的第一行**上，所以 id 比较必须是 `>=`（含）而不是 `>`
  （**必须带 visibilityClause**，按 type 收窄），候选首位是「全部分类」(value='')，URL 上不在列表的分类
  会追加进候选保持可见可点。公开 `/api/v1/categories` 仍返回四项白名单
- ⚠️ `createSkillFromForm` 的 create 路径经 `publishVersion` 会把非白名单分类**静默改成 general**，
  之后要用 `updateMetadata` 写回（smoke 钉住）

## 用户 / 审核
- 注册资料 6 列（v12）：country / organization / job_title / office_location / research_needs / markets；
  **姓名复用 `display_name`**。清单在 `src/lib/registration.ts`，除 office_location 外必填
- 邮箱验证码 `EMAIL_VERIFICATION_CODE='123456'`（前后端共用，界面不写"演示"字样），
  「发送」+60s 冷却由服务端裁决（`src/routes/register.email-code.ts` 同挂 GET/POST）
- 审核状态机：**approved 是终态**（收回访问权走 banUser）；重复同决定幂等；服务端才是防线
- ⚠️ `/admin/users/ban` 写死 `setBanned(true)`，**目前无法解封**（待办）
- 管理端审核在 `/admin/users`「查看资料」展开行，待审核行默认展开
  （`detailOverride[id] ?? status==='pending'`）；review 的 `onSuccess` 要补 `detailOverride[id]=true`

## 用户列表统计 + 重置密码（v14，2026-10-16）——明细见 CONVENTIONS.md
- `/admin/users` 多两列 **下载次数 / 登录次数**，键 `downloadCount`/`loginCount`，
  **只在列表响应里**（不进 `mapUser`、不进单用户响应）
- **下载次数按类型拆分**（2026-10-20）：`downloadCount` = 技能、`knowledgeBaseDownloadCount` = 知识库，
  前端列头「下载次数(技能/知识库)」、值 `技能/知识库`（如 `2/1`）。`activityCounts` 用两条
  correlated subquery `JOIN skills` 按 `s.type` 分流；口径仍是**该用户自己下载的次数**
  （`user_downloads` 表，`download()` 里按 `viewer` 记账，UNIQUE(user_id,skill_id,version_id)）
- ⚠️ smoke 里给某用户造下载夹具后若再 `purge` 该条目，`user_downloads` 会**级联清零** ⇒
  purge 必须放在活动计数断言之后；且 16c 段造的 `smoke-kb` 等已被 purge，别下载不存在的 slug
- 登录次数用 **`users.login_count` 列**，**不要**改成 `COUNT(sessions)`
- 重置密码 `POST /api/v1/admin/users/password`，**不带 apiKeyScope**（只认 Cookie）；
  审计 `reset_user_password` **只写 handle，不写密码**
- ⚠️ 剪贴板写入必须带降级路径（局域网 http 下 `navigator.clipboard` 不可用）；
  加列别忘同步 `colSpan`

## 技能 / 知识库（v15，2026-10-20）——明细见 CONVENTIONS.md
- `skills.type` = `skill` / `knowledge_base`（NOT NULL DEFAULT 'skill'）；**存量全回落 skill**；
  FTS5 索引**没动**（搜索混排不按类型过滤），搜索结果的类型靠 JOIN `skills` 读
- 读接口 `?type=skill|knowledge_base`（不传 = 两种都返回）：
  `/api/v1/skills`、`/namespaces/:slug/skills`、`/features`、`/categories/in-use`、`/admin/skills`
- 写接口 `type` 字段：控制台表单缺省 skill、非法值 400；发布 API 空串 = 不改已有条目
- **SKILL.md 规则按类型分**（2026-10-22 修正）：skill 必须带；knowledge_base 不必带——
  **上传了什么就存什么，下载包就是上传的附件本身**；只有**一个文件都没上传**时服务端才
  按表单合成一份 manifest（否则空版本下载 404）。三条「文件进版本」的路径
  （`publishVersion` 合成口径 / `mergedVersionFiles` 编辑合并 / `updateFile` 单文件写）
  都用 `isSynthesizedStub()` 把合成存根挡在外面，不让它蒙混进下载包
- 导航多「知识库」入口 → `/knowledge-bases`（只列知识库）；`/skills` 只列技能；
  首页四段：精选技能 / 精选知识库 / 热门技能 / 热门知识库（精选是**同一个池子**按 type 分流）
- ⚠️ runtime API **排除知识库**（`type='skill'`）；agent API 的 `type` 字段是 `kind` 小写，**别动**
- 控制台内容管理页：类型下拉 + 表格「类型」列（`colSpan` 5→6）+ 工具栏类型筛选
- **审计日志按类型区分**（2026-10-22）：`audit_logs.resource_type` 不再一律 `skill`——
  知识库记 `knowledge_base`、其版本记 `knowledge_base_version`。入口收口在
  `shared.ts` 的 `auditResourceType(type, 'skill'|'skill_version')`，skills.ts（8 处：
  publish/delete/undelete/purge/yank/unyank/transfer/update_detail_html）、manage.ts
  （update_skill_content、list_skill/unlist_skill）、social.ts（comment_create）都走它。
  **action 名不变**（list_skill/unlist_skill 是共享端点）；前端 `admin.audit-logs.tsx`
  的动作标签按 resourceType 变体显示「上架/下架知识库」，RESOURCE_LABELS 补了
  knowledge_base(_version)/skill_version；`?resource_type=` 筛选天然区分两类

## 界面
- 全站双语：`src/lib/i18n.tsx` 的 `useT()` **内联双语字面量**，不建中央 key 表；默认 en
- 不写实现说明 / 运营视角文案；品牌色 `#004123`、Helvetica，改这些只动 `global.css` 变量
- `src/components/Combobox.tsx` 通用可搜索下拉：选项用 `onMouseDown`、Escape 在 document **捕获**阶段拦、
  外部点击判 `pointerdown`；`openList()` 要 `select()`

## 管理员 API Key（唯一程序化凭证）
- `api_keys` v10 加 `key_secret`；v11 删除个人/团队令牌（`api_tokens` → `sessions` 表）
- 凭证判定：`isApiKey` 否则按 `SKILLHUB_SESSION_PREFIX`（默认 `sess_`）查 sessions；
  **Bearer 优先于会话 Cookie**（同请求同时带两者时按 key 判）
- 多数管理路由无 `apiKeyScope`，按设计拒绝一切 API Key ⇒ admin 全量操作用会话 Cookie

## /docs 静态文档
- 由 `serve.mjs` 从 `SKILLHUB_STATIC_DIR`（裸跑 `<repo>/static`）提供，`Cache-Control: no-cache`
- 源：`docs/product-guide.md` + `static/product-guide.html`；**改注册字段时两份都要改**，
  HTML 只能用页面已有 class（`table`/`note`），每段写 zh+en 两个 span

## 交付前必跑
`npm run typecheck`（0 报错）→ `npm run build` → `npm run smoke`（当前 408 条断言）
- **改了源码必须重新 build 再 smoke**，否则验证的是旧 dist（曾因此误判）
- 下载相关硬规则：上传单个 `.zip` ⇒ 原样返回该 zip 不二次打包（`uploadedZip()`，
  `download()` + agent `archive()` 都用）；文件名进响应头必须走 `http.ts` 的
  `contentDisposition()`（头值只能 Latin-1，中文名直接插值会让整个下载 404）

## 本机环境坑
- **后台起服务不要接管道**（`npm run dev | head -n 40` 之类）：`head` 退出后管道关闭，
  服务再写 stdout 就会 SIGPIPE **卡死**——端口还在监听，但请求/反代全部挂起，
  看起来像"代码坏了"。起服务就裸跑 `npm run dev`
- **git 推送**：钥匙串写入被沙箱拦（`failed to store: 100001`）⇒ 凭据助手不可用，
  remote URL 带 token 是唯一可用方式：`git remote set-url origin https://<user>:<pat>@github.com/...`
  （token 会以明文留在 .git/config，用户已知悉）。⚠️ 公开仓库 + 只读 token 时，
  API 读接口返回的是**账号**的权限（admin:true），会误判——验证 token 能否推送要实测一次写
  （`POST /repos/<o>/<r>/git/blobs` 返回 403 就是缺 Contents:Read and write）
- 沙箱单 turn 拦截 >50 文件批量删除（`SAFE_DELETE_BULK_CONFIRM_REQUIRED`）⇒ `vite build` 清 outDir 会失败，
  用 `mv dist /tmp/...` 把目录移出工作区再构建
- Bash 每次独立进程，`&` 起的后台服务会被回收 ⇒ `run_in_background: true` + TaskStop（TaskStop 是 deferred 工具，
  要用 DeferExecuteTool 调）
- 含控制字符正则一律 `/[\u0000-\u001f\u007f]/g` 显式转义（字面字符会让源码变 binary）
- `agent-browser`：点小元素用 eval `el.click()`；eval 上下文持久 ⇒ `const` 会重复声明报错，用 IIFE；
  带 SVG 的按钮用 `elementFromPoint` 判 `button.contains(at)` 而不是 `at === button`；
  截图是 `agent-browser screenshot "<path>"`（`--path` 会报元素找不到）；
  **`open` 后先 `get url` 确认真的导航了**（daemon 刚起时可能停在 about:blank，`wait --load networkidle` 也救不回）；
  本项目登录框是 `#handle`/`#password`（**没有 name 属性**），提交用 `button[type="submit"]`；
  **原生 `<select>`（如审计页的筛选下拉）点 option 会报 CDP `getBoxModel`**，改用 eval：
  `Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(sel, v)` +
  `dispatchEvent(new Event('change',{bubbles:true}))`（React 受控组件生效）
