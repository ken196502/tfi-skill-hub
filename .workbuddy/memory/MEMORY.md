# tfi-skill-hub —— 项目索引（改动前先读）

把 `saker-ai/skillhub`（Go）重写为 TypeScript。**完整契约见同目录 `CONVENTIONS.md`**，本文件只留硬约束。

## 技术栈（锁定）
- 前端 Next.js 16（`web/`，App Router + React Query + Tailwind4 + shadcn）；后端 `src/server` 与 DB 不动，Next 同源反代
- 富文本 quill@2.0.3（客户端动态 import）· SQLite 走 `node:sqlite`（**不用** better-sqlite3/Prisma/Drizzle）· FTS5 `tokenize='trigram'`
- 后端零第三方依赖（ZIP / Markdown / semver / scrypt / token 自实现）

## 运行
- 后端 `npm run api`（:8787，读根 `.env`）；前端 `cd web && npm run dev`（:3000，读 `web/.env.development`）
- 管理员凭据由 `.env` 注入，仓库无默认口令；隔离验证 `SKILLHUB_DB_PATH=/tmp/xx.db SKILLHUB_PORT=5398`

## 数据库
- 位置 `SKILLHUB_DATABASE_URL` > `SKILLHUB_DB_PATH` > `<repo>/data/skillhub.db`（WAL，备份连 `-wal/-shm`）
- 迁移 append-only，版本查 `PRAGMA user_version`（无 schema_migrations 表），每条 `BEGIN/COMMIT`；最新 **v15**
- 改 CHECK：ADD 新列(新 CHECK NOT NULL DEFAULT) → `UPDATE...CASE` 平移 → DROP 旧列；FTS5 虚表只能 DROP + 重建 + `INSERT...SELECT`

## 目录职责
- `src/server/repo/*` 唯一写 SQL；`services/*` 不写 SQL；`api/handlers.ts` 只「解析→调 service→映射状态码」；路由在 `api/routes.ts`
- 前端只有 `web/src/lib/api/real.ts` 懂后端方言（hooks→`endpoints.ts`→`real.ts`→`client.ts`）

## 后端方言
- 无 `Resp` 包装（成功即 payload）；列表游标分页（`cursor`+`limit` → `nextCursor`/`total`，公开列表**无** total）
- `type`=skill|knowledge_base（UI 叫 knowledge）；`listing`=listed/unlisted；**无** visibility / moderationStatus / plugins
- 密码明文传输（服务端 scrypt）；排序 UI `hot` → 后端 `downloads`
- `useSkillsInfinite` 两道护栏：按 id 去重 + 空页停
- 游标比较必须与 ORDER BY 同向：`(s.col <op> c.col) OR (s.col=c.col AND s.id>=c.id)`（name 用 `>`），带 visibilityClause

## 契约
- 字段名照抄 Go json tag；`omitempty` 空时整个键不出现；错误仅 sentinel 才 404/403/409，其余 400
- 技能三操作：发布/编辑/上下架（`POST /admin/skills/:slug/listing`，`?listing=`，审计 `list_skill`/`unlist_skill`）
- 已删且不要恢复：`.../review`、`.../visibility`、`.../request-public`、`/api/v1/plugins*`（smoke 反向 404 断言）
- 分类自由输入 Combobox：`/admin/categories`（管理台）、`/categories/in-use`（公开侧栏）；公开 `/categories` 仍四项白名单
- ⚠️ `createSkillFromForm` create 路径会把非白名单分类**静默改 general** ⇒ 之后要 `updateMetadata` 写回

## 用户 / 审核
- 注册 6 列（v12）：country / organization / job_title / office_location / research_needs / markets；**姓名复用 `display_name`**（除 office_location 外必填，清单 `src/lib/registration.ts`）
- 验证码 `EMAIL_VERIFICATION_CODE='123456'`（界面不写“演示”）；+60s 冷却由服务端裁决
- **approved 是终态**（收回访问走 banUser）；重复同决定幂等；⚠️ `/admin/users/ban` 写死 `setBanned(true)`，**目前无法解封**
- 审核在 `/admin/users`「查看资料」展开行，待审核默认展开（`detailOverride[id] ?? status==='pending'`）；review `onSuccess` 要补 `detailOverride[id]=true`
- 列表多两列 下载次数/登录次数：`downloadCount`（技能）、`knowledgeBaseDownloadCount`（知识库）、`loginCount`（取 `users.login_count` 列），只在列表响应里
- ⚠️ smoke 造下载夹具后 `purge` 该条目会级联清 `user_downloads` ⇒ purge 放计数断言之后
- 重置密码 `POST /admin/users/password`，**不带 apiKeyScope**（只认 Cookie），审计不记密码；加列别忘同步 colSpan

## 技能 / 知识库（v15）
- `skills.type` NOT NULL DEFAULT 'skill'，存量回落 skill；FTS5 索引没动
- 读接口 `?type=`（不传=两种都返回）：`/skills`、`/namespaces/:slug/skills`、`/features`、`/categories/in-use`、`/admin/skills`
- 写接口缺省 skill、非法 400；发布 API 空串=不改已有条目
- SKILL.md：skill 必须带；knowledge_base 不必（下载包=上传附件本身）；仅零文件才合成 manifest；三处都用 `isSynthesizedStub()` 挡存根
- 导航「知识库」→ `/knowledge-bases` 只列知识库，`/skills` 只列技能；首页只保留技能两段
- ⚠️ runtime API **排除知识库**（`type='skill'`）；agent API 的 `type` 字段是 `kind` 小写，别动
- 审计 `resource_type`：知识库 `knowledge_base`、版本 `knowledge_base_version`，收口在 `auditResourceType()`；前端标签按 resourceType 显示

## 首页（`web/src/components/home/*`）
- **彩蛋 `launch-overlay.tsx`**：`0` 播放（黑幕「即将发布」+ 手印，Enter 5→1 倒计时后爆炸淡出）；`1` 进布局编辑（拖动 / 滚轮 / 角柄 / ±按钮 / 方向键，Shift×5 微调；Esc 退，Enter 或「播放」直接倒计时）
- 布局存 localStorage **`tfi.launch.layout.v1`**：`{title:{x,y,scale}, hands:{x,y,scale}}`——x/y 是**块中心占视口的比例**，scale 是相对基线倍率（0.25–3.5）
  - 两块 `.launch-block` 绝对定位 + `translate(-50%,-50%) scale()`；编辑态标签/角柄用 `--block-inverse` 反向缩放保持恒定大小
  - 未编辑过不写 localStorage（与初始 layout 对象身份比较，StrictMode 双跑也不会误写）
- ⚠️ Chrome 会把 wheel 事件重定向到最近滚动容器（`.launch-stage` 有 overflow:hidden）⇒ 不能用 `event.target` 判块，要用 hovered ref / `elementFromPoint`
- 手印素材 `handprint.tsx`（单 path，viewBox `88 90 1070 1100`），左 3 右手 / 右 3 左手（`scaleX(-1)`），`--hand-base: clamp(9px,1.56vw,19px)`
- **问答打字机 chat-demo**：入口只在 `#home` hero（`#assistant` 没有）；第 1 个预设走脚本（`data-chat-demo`），另 3 个通用（`data-chat-demo="generic"` + `data-demo-question`）
- ⚠️ 通用演示的原始问题必须放 `data-demo-question`（`data-question` 会被 `applyLanguage()` 翻译掉）

## 导航 tab：湖北产业知识库
- 顶部「知识库」已换成「湖北产业知识库」（key `nav.hubeiDemo`）；demo 是打包静态站 `web/public/hubei-knowledge/`（36 文件 / 6.6MB，**不含** admin.html、content-archive、scripts），Next public 托管，零后端改动
- 导航项在路由外 ⇒ `site-header.tsx` 的 `NavItem` 加 `static?: boolean`，桌面 nav 与移动 Sheet 都按 `item.static` 渲染 `<a>`（href 手工拼 `NEXT_PUBLIC_BASE_PATH`）；demo 内部链接全相对路径
- ⚠️ `web/scripts/build-standalone.mjs`（package.json 引用）**仓库里不存在**，生产打包按 Dockerfile 手工组装 standalone
- ⚠️ 工作树曾回退成旧快照而 git status 不报错 ⇒ 改完 `git diff HEAD -- web/public/hubei-knowledge` 核对

## 界面约定
- 全站双语：`src/lib/i18n/messages/{zh,en}.ts`，`zh` 是唯一 key 源（`TranslationKey` 由它推导），`t()` 取用；不写实现说明/运营视角文案
- 品牌色 `#004123`、Helvetica（只动 `global.css` 变量）
- `Combobox.tsx`：选项 `onMouseDown`、Escape 在 document 捕获阶段拦、外部点击判 `pointerdown`、`openList()` 要 `select()`

## 管理员 API Key
- 凭证：`isApiKey` 否则按 `SKILLHUB_SESSION_PREFIX`（默认 `sess_`）查 sessions；**Bearer 优先于 Cookie**
- 多数管理路由无 `apiKeyScope` ⇒ 按设计拒绝一切 API Key，admin 全量操作用会话 Cookie

## /docs 静态文档
- `serve.mjs` 从 `SKILLHUB_STATIC_DIR`（裸跑 `<repo>/static`）提供，`Cache-Control: no-cache`
- 源 `docs/product-guide.md` + `static/product-guide.html`；改注册字段两份都要改（HTML 只用 `table`/`note` class，每段 zh+en）

## 交付前必跑
- 前端：`cd web && npx tsc --noEmit`（web **没有** typecheck 脚本）→ `npm run build`
- 后端：根 `npm run typecheck` → `npm run build` → `npm run smoke`（408 条断言）；改源码必须重新 build 再 smoke
- 下载硬规则：上传单个 `.zip` 原样返回（`uploadedZip()`）；文件名走 `contentDisposition()`（头值只能 Latin-1，中文名直插会 404）

## 本机环境坑
- 后台起服务**不要接管道**（SIGPIPE 卡死）；`&` 起的后台会被回收 ⇒ `run_in_background: true` + TaskStop
- ⚠️ 本机有 `http_proxy=127.0.0.1:62627` ⇒ 验本机服务必须清空 `http_proxy/https_proxy/HTTP_PROXY/HTTPS_PROXY/ALL_PROXY`（curl 再加 `--noproxy '*'`）
- dev 占 `.next/dev`、build 占 `.next` 根 ⇒ 先 build 必须先停 dev（**dev 运行时 mv `.next` 会让 Turbopack panic**）；`output: standalone` 不能用 `next start`
- Turbopack **不热更新 globals.css**：改 CSS 要停 dev → `mv .next /tmp/...` → 重启
- 沙箱单 turn 拦 >50 文件删除 ⇒ 清 outDir 用 `mv` 到 `/tmp`
- agent-browser：点小元素用 eval `el.click()`（IIFE 防 const 重声明）；截图 `screenshot <path>`；原生 `<select>` 用 descriptor set + dispatchEvent；**`mouse move/click` 是 CSS px，截图可能带缩放比**；wheel 事件的 clientX/Y 在自动化里是 0（真浏览器正常）；Chrome 无头模式访问不了 127.0.0.1
- git 推送：remote URL 带 token（钥匙串写入被沙箱拦）；只读 token 也会返回 admin 权限，推送权限要实测
