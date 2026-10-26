# tfi-skill-hub —— 项目索引（改动前先读）

把 `saker-ai/skillhub`（Go）重写为 TypeScript。**完整契约与约定明细见 `CONVENTIONS.md`（同目录）**，
本文件只留最高频硬约束。

## 技术栈（锁定，不要替换）
- 前端：Next.js 16（`web/`，App Router + React Query + Tailwind4 + shadcn）；后端 `src/server` 与数据库不动，Next 同源反代调后端
- 内容管理页富文本用 `quill@2.0.3`，客户端动态 import、独立懒加载 chunk
- SQLite 走 Node 内置 `node:sqlite`（**不要** better-sqlite3 / Prisma / Drizzle）；FTS5 `tokenize='trigram'`
- 后端零第三方依赖（ZIP / Markdown / semver / scrypt / token 全自实现）

## 运行入口
- 后端独立跑：`npm run api`（= `tsx scripts/serve-api.mjs`，默认 :8787，读根 `.env`）；前端 `cd web && npm run dev`（:3000，读 `web/.env.development`）
- 管理员凭据由 `.env` 注入（`SKILLHUB_ADMIN_USER/PASSWORD`），仓库内无默认口令
- 隔离验证：`SKILLHUB_DB_PATH=/tmp/xx.db SKILLHUB_PORT=5398` 换一套环境，别动用户那份库

## 数据库
- 位置优先级 `SKILLHUB_DATABASE_URL` > `SKILLHUB_DB_PATH` > `<repo>/data/skillhub.db`（WAL，备份连 -wal/-shm）
- 迁移 **append-only**，版本查 `PRAGMA user_version`（无 schema_migrations 表），每条 `BEGIN/COMMIT`。最新 **v15**
- 改 CHECK 约束：`ADD COLUMN 新列(带新 CHECK NOT NULL DEFAULT)` → `UPDATE...CASE 平移` → `DROP COLUMN 旧列`
- FTS5 虚表不能 ALTER，只能 DROP + 重建 + `INSERT...SELECT`

## 目录职责（不要越界）
- `src/server/repo/*` **唯一**写 SQL；`src/server/services/*` 业务/权限不写 SQL
- `src/server/api/handlers.ts` 只做「解析→调 service→映射状态码」；路由表加在 `src/server/api/routes.ts`
- 前端 API 适配层**只有一处** `web/src/lib/api/real.ts` 知道后端方言（hooks→`endpoints.ts`→`real.ts`→`client.ts`）

## 后端方言（写 real.ts 必读）
- 无 `Resp` 包装（成功即 payload）；列表是**游标**分页（`cursor`+`limit`，回 `nextCursor`/`total`，公开列表**不返回 total**）
- 内容类型字段 `type`（`skill`/`knowledge_base`，UI 侧叫 `knowledge`）；上下架字段 `listing`（listed/unlisted）；**无** visibility / moderationStatus / plugins
- 密码**明文传输**（服务端 scrypt），无 AES 预处理；排序 UI `hot` → 后端 `downloads`
- `useSkillsInfinite` 两道护栏：按 id 去重 + 某页无新条目就停
- 列表游标比较必须与 ORDER BY 同向：`(s.col <op> c.col) OR (s.col=c.col AND s.id>=c.id)`（name 用 `>`，其余 `<`），带 visibilityClause，游标落在本页未返回首行故 id 用 `>=`

## 契约要点
- JSON 字段名照抄 Go `json:"..."`；`omitempty` 空时**整个键不出现**
- 错误→状态码照抄：仅带 sentinel 错误才 404/403/409，其余一律 400
- 技能仅三操作：发布/编辑/上下架；端点 `POST /api/v1/admin/skills/:slug/listing`，筛选 `?listing=`，审计 `list_skill`/`unlist_skill`
- 已删且**不要恢复**：`.../review`、`.../visibility`、`.../request-public`、`/api/v1/plugins*`（smoke 反向 404 断言）
- 分类两处自由输入 Combobox：`/api/v1/admin/categories`（DISTINCT）给管理台；`/api/v1/categories/in-use` 给公开侧栏；公开 `/api/v1/categories` 仍返回四项白名单
- ⚠️ `createSkillFromForm` create 路径经 `publishVersion` 会把非白名单分类**静默改 general**，之后要 `updateMetadata` 写回（smoke 钉住）

## 用户 / 审核
- 注册 6 列（v12）：country / organization / job_title / office_location / research_needs / markets；**姓名复用 `display_name`**（除 office_location 外必填，清单 `src/lib/registration.ts`）
- 邮箱验证码 `EMAIL_VERIFICATION_CODE='123456'`（界面不写"演示"）；「发送」+60s 冷却由服务端裁决
- 审核状态机：**approved 是终态**（收回访问走 banUser）；重复同决定幂等
- ⚠️ `/admin/users/ban` 写死 `setBanned(true)`，**目前无法解封**（待办）
- 管理端审核在 `/admin/users`「查看资料」展开行，待审核行默认展开（`detailOverride[id] ?? status==='pending'`）；review 的 `onSuccess` 补 `detailOverride[id]=true`

## 用户列表统计 + 重置密码（v14）
- `/admin/users` 多两列 **下载次数 / 登录次数**（`downloadCount`/`loginCount`），**只在列表响应**里
- 下载次数按类型拆分：`downloadCount`=技能、`knowledgeBaseDownloadCount`=知识库（前端列头「下载次数(技能/知识库)」）；口径=该用户自己下载次数
- ⚠️ smoke 造下载夹具后若 `purge` 该条目，`user_downloads` 会级联清零 ⇒ purge 放活动计数断言之后
- 登录次数用 `users.login_count` 列（非 `COUNT(sessions)`）
- 重置密码 `POST /api/v1/admin/users/password`，**不带 apiKeyScope**（只认 Cookie），审计只写 handle 不写密码
- ⚠️ 剪贴板写入必须带降级路径；加列别忘同步 `colSpan`

## 技能 / 知识库（v15）
- `skills.type` = `skill`/`knowledge_base`（NOT NULL DEFAULT 'skill'）；存量全回落 skill；FTS5 索引没动
- 读接口 `?type=skill|knowledge_base`（不传=两种都返回）：`/skills`、`/namespaces/:slug/skills`、`/features`、`/categories/in-use`、`/admin/skills`
- 写接口 `type`：表单缺省 skill、非法值 400；发布 API 空串=不改已有条目
- SKILL.md 规则按类型分：skill 必须带；knowledge_base 不必带——上传什么存什么，下载包=上传附件本身；仅零文件时才合成 manifest。三条文件进版本路径都用 `isSynthesizedStub()` 挡存根
- 导航「知识库」→ `/knowledge-bases`（只列知识库），`/skills` 只列技能；**首页只保留技能两段**（精选技能 / 热门技能），知识库两段已移除
- ⚠️ runtime API **排除知识库**（`type='skill'`）；agent API 的 `type` 字段是 `kind` 小写，**别动**
- 审计日志按类型区分：`audit_logs.resource_type` 知识库记 `knowledge_base`、其版本记 `knowledge_base_version`，收口在 `shared.ts` 的 `auditResourceType(type,'skill'|'skill_version')`；前端 `admin.audit-logs.tsx` 动作标签按 resourceType 显示「上架/下架知识库」

## 导航 tab：湖北产业知识库（2026-10-26）
- 顶部导航「知识库」已换成「湖北产业知识库」（en: `Hubei Industry KB Demo`），i18n key `nav.hubeiDemo`
- demo 是**打包的独立静态站**，放在 `web/public/hubei-knowledge/`（36 文件 / 6.6MB），由 Next public 托管，**零后端改动**
  - 只含运行必需文件：index.html / *.css / *.js / assets / 品牌图；**不含** admin.html、content-archive(10MB)、scripts
  - demo 内 hash 路由（`#home` / `#company/xxx`）是纯前端行为，不受托管方式影响
- 导航项在**路由外** ⇒ `site-header.tsx` 的 `NavItem` 加 `static?: boolean`，
  桌面 nav 与移动端 Sheet 两处都按 `item.static` 分支渲染 `<a>`（整页跳转）而不是 `next/link`；
  href 手工拼 `NEXT_PUBLIC_BASE_PATH` 前缀（部署在子路径时 public 资源同样带前缀）
- demo 内部站点链接已全部改**相对路径**（`../` `../skills` `../favorites` `../login`），本地/子路径部署都成立
- ⚠️ `web/scripts/build-standalone.mjs`（package.json 引用）**仓库里不存在**，生产打包需按 Dockerfile 手工组装
  standalone（`.next/standalone` + `.next/static` → `.next/static` + `public` → 与 server.js 同级）

## 首页问答打字机演示（chat-demo，2026-10-26）
- 入口**只在首页 `#home`**：hero「示例问题」区的**第一个**预设「湖北光通信产业的上游主要涉及哪些核心环节？」（带 `data-chat-demo`）
  ⇒ `#assistant` 路由**没有**该按钮，去了那边看不到动画；其余 3 个预设仍走旧 `answerFor` 静态回复
- 流程：`thinking`（三步逐字 + ✓/· 标记 + 呼吸点）→ 第二轮自动往输入框**逐字敲字** → `answering`（段末光标流式吐字）
  文件：`chat-demo.js`（脚本+状态机）/ `chat-demo.css`（动效）/ `prototype.js`（6 个钩子）/ `index.html`（挂载）
- 播放中输入框 `readOnly`、发送按钮 disabled；Esc 可中断；`render()`/`renderAnswer()`/切导览都会 `stopChatDemo()`
- ⚠️ 工作树曾回退成**旧快照**（无 chat-demo、`prototype.js?v=20261026-5`）而 git status 不报错 ⇒ 改完必须
  `git diff HEAD -- web/public/hubei-knowledge` 核对，别只信 git status

## 界面
- 全站双语：`src/lib/i18n.tsx` 的 `useT()` **内联双语字面量**，不建中央 key 表；默认 en
- 不写实现说明 / 运营视角文案；品牌色 `#004123`、Helvetica，改这些只动 `global.css` 变量
- `src/components/Combobox.tsx`：选项 `onMouseDown`、Escape 在 document **捕获**阶段拦、外部点击判 `pointerdown`；`openList()` 要 `select()`
- 首页彩蛋 `components/home/launch-overlay.tsx`：按 `0` 出黑幕「即将发布」+ 手印（滚轮缩放 / ↑↓平移），
  回车 5→1 倒计时后爆炸淡出漏出首页；样式集中在 globals.css 的 `Home teaser curtain` 段
- 手印是**真实掌印剪影**（素材 `~/Downloads/leftpalm.svg` → `components/home/handprint.tsx`，
  单 path + 收紧 viewBox `88 90 1070 1100`）；左 3 右手 / 右 3 左手（左半 `scaleX(-1)`），
  默认 `--hand-base: clamp(9px,1.56vw,19px)`（≈旧版的 30%）；动画挂在外层 span、倾斜镜像在内层 svg

## 管理员 API Key（唯一程序化凭证）
- 凭证判定：`isApiKey` 否则按 `SKILLHUB_SESSION_PREFIX`（默认 `sess_`）查 sessions；**Bearer 优先于会话 Cookie**
- 多数管理路由无 `apiKeyScope`，按设计拒绝一切 API Key ⇒ admin 全量操作用会话 Cookie

## /docs 静态文档
- 由 `serve.mjs` 从 `SKILLHUB_STATIC_DIR`（裸跑 `<repo>/static`）提供，`Cache-Control: no-cache`
- 源：`docs/product-guide.md` + `static/product-guide.html`；改注册字段两份都要改（HTML 只用 `table`/`note` class，每段 zh+en）

## 交付前必跑
`npm run typecheck`（0 报错）→ `npm run build` → `npm run smoke`（当前 408 条断言）；改源码必须重新 build 再 smoke
- 下载硬规则：上传单个 `.zip` 原样返回不二次打包（`uploadedZip()`）；文件名进响应头走 `http.ts` 的 `contentDisposition()`（头值只能 Latin-1，中文名直插会让下载 404）

## 本机环境坑
- 后台起服务**不要接管道**（`npm run dev | head` 之类会 SIGPIPE 卡死）——裸跑
- git 推送：钥匙串写入被沙箱拦 ⇒ remote URL 带 token（`git remote set-url origin https://<user>:<pat>@github.com/...`，明文留 .git/config 用户已知悉）；只读 token 返回的是 admin 权限会误判，推送权限要实测写一次
- 沙箱单 turn 拦截 >50 文件批量删除 ⇒ `vite build` 清 outDir 失败，用 `mv dist /tmp/...` 移出再构建
- Bash 每次独立进程，`&` 起的后台会被回收 ⇒ `run_in_background: true` + TaskStop
- 含控制字符正则一律 `/[\u0000-\u001f\u007f]/g` 显式转义
- `agent-browser`：点小元素用 eval `el.click()`（const 重复声明报错用 IIFE）；带 SVG 按钮用 `elementFromPoint` 判 `button.contains(at)`；截图 `screenshot "<path>"`（非 `--path`）；`open` 后先 `get url` 确认导航；登录框 `#handle`/`#password`（无 name），提交 `button[type="submit"]`；原生 `<select>` 用 descriptor set + dispatchEvent 改值（React 受控生效）；`scroll` 不走 wheel 事件，验滚轮要 dispatch `WheelEvent`；daemon 偶发回 `about:blank`（截图变纯白、eval 全空），先 `get url`；`pkill -f agent-browser` 后要等 3s 再开
- ⚠️ **本机有 `http_proxy=127.0.0.1:62627`**，agent-browser/curl 走代理会访问不到本机 127.0.0.1（502 / about:blank）⇒ 验证本机服务必须 `export http_proxy= https_proxy= HTTP_PROXY= HTTPS_PROXY= ALL_PROXY=`（curl 再加 `--noproxy '*'`）
- ⚠️ `next dev` 占 `.next/dev`、生产构建占 `.next` 根 ⇒ 同一目录先 dev 后 build 会互相抢产物（`next start` 报 `ENOENT build-manifest.json`）；`output: standalone` 的项目**不能用 `next start`**，要 `node .next/standalone/server.js`（且需手工拷 `.next/static` 与 `public` 到 standalone 目录内）
- Chrome 无头模式（`--headless=new --screenshot`）在本沙箱内**访问不了 127.0.0.1**（ERR_CONNECTION_REFUSED），验证本机页面只能用 agent-browser
- **Turbopack 不热更新 `globals.css`**（Next 16 dev 实测）：改 CSS 后浏览器一直用旧样式，必须 `pkill -f "next dev"` → `mv .next /tmp/next-cache-$(date +%s)` → 重启；`.next` 留在原地会让下次 `next dev`/`next build` 收尾 unlink 撞上批量删除拦截直接退出
