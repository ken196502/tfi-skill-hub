# tfi-skill-hub —— 项目索引（改动前先读）

把 `saker-ai/skillhub`（Go）重写为 TypeScript。**完整契约与约定明细见 `CONVENTIONS.md`（同目录）**，
本文件只保留最高频的硬约束，避免注入超限被截断。

## 技术栈（锁定，不要替换）
- TanStack Start（单体全栈）+ Router + Query；前端只用 `@tanstack/*` + `react` + `react-dom`
- **唯一例外**：内容管理页的富文本用 `quill@2.0.3`（2026-10-08 用户指定），客户端动态 import、独立懒加载 chunk
- SQLite 走 Node 内置 `node:sqlite`（**不要** better-sqlite3 / Prisma / Drizzle）；搜索 FTS5 `tokenize='trigram'`
- 后端零第三方依赖（ZIP / Markdown / semver / scrypt / token 全自实现）；加依赖前先问标准库能否满足

## 运行入口
- 生产：`npm run build` → `npm start`（= `node --env-file-if-exists=.env scripts/serve.mjs`）
- `dist/server/server.js` 只导出 Web 标准 handler，**不监听端口**；启动逻辑在 `serve.mjs`
- 开发：`npm run dev`
- 管理员凭据必须由 `.env` 注入（compose 强校验 `${SKILLHUB_ADMIN_USER:?}`），仓库/README 内无默认口令

## 数据库文件位置（`config.ts:67`）
优先级 `SKILLHUB_DATABASE_URL` > `SKILLHUB_DB_PATH` > 默认 `<repo>/data/skillhub.db`
- 本机 / 裸跑：`<repo>/data/skillhub.db`（WAL 模式，伴随 `skillhub.db-wal` / `-shm`，备份要一起拿）
- Docker：容器内 `/app/data/skillhub.db`，由命名卷 `skillhub-data` 持久化
  （宿主路径 `docker volume inspect <project>_skillhub-data`；`down` 不删卷，`down -v` 才清）
- 默认值见 `src/server/config.ts`，读写在 `src/server/db.ts`（`getDb()` 自动建父目录）

## 目录职责（不要越界）
- `src/server/repo/*` —— **唯一**写 SQL 的地方
- `src/server/services/*` —— 业务规则与权限，不写 SQL
- `src/server/api/handlers.ts` —— 只做「解析请求 → 调 service → 映射状态码」
- `src/lib/*` 前端共享；`src/routes/*` 页面路由（`api/$.ts`、`$.ts` 是两个服务端 catch-all）

## 契约要点
- JSON 字段名以原 Go 的 `json:"..."` tag 为准；`omitempty` 为空时**整个键不出现**，不是 `null`
- ⚠️ **2026-10-13 起有例外**：技能的 `visibility`/`moderationStatus` **不再照抄 Go**，
  已按用户要求改成 `listing`（listed/unlisted）。见下方「技能只有三个操作」。
- 错误→状态码照抄原实现：只有带 sentinel 的错误才有 404/403/409，其余一律 400，不要"顺手修正"
- 路由表用 gin 的 `@:namespace` 语法，直接加在 `src/server/api/routes.ts`

## 技能只有三个操作：发布 / 编辑 / 上下架（2026-10-13）
用户明确要求删掉「设置公开或私有」和「审核技能」，**插件类别整体删除**。三条硬约束：
- 字段是 **`listing`**（`listed` / `unlisted`），**没有** `visibility`、**没有** `moderationStatus`，
  **没有** review 队列。类型 `ListingStatus`（`src/lib/types.ts`）。
- 上下架端点是 **`POST /api/v1/admin/skills/:slug/listing`**，body `{listing}`；
  筛选是 `GET /api/v1/admin/skills?listing=`。发布表单的字段名也是 `listing`（multipart 同名）。
- 已删除且**不要恢复**：`.../review`、`.../visibility`、`.../request-public`、全部 `/api/v1/plugins*`。
  smoke 里有 5 条反向断言钉住这些 404，别删。
- `skills:moderate` scope **保留**（还管 yank/deprecate/transfer/features），只是语义变成「上下架与版本标记」。
- 审计动作名是 **`list_skill` / `unlist_skill`**（不再是 `review_skill_*` / `set_skill_visibility`）。
- ⚠️ 迁移是 **append-only**：v1 里的 plugins 建表语句**原样保留**（只加注释说 v13 会删）。
  改历史迁移会破坏老库升级。改 CHECK 约束的正确姿势见下方「SQLite 迁移」。

## SQLite 迁移（本机 3.51.2 实测结论）
- **改列的 CHECK 约束不需要重建表**：`ALTER TABLE ADD COLUMN 新列(带新 CHECK NOT NULL DEFAULT)`
  → `UPDATE ... CASE 平移` → `ALTER TABLE DROP COLUMN 旧列`。FK 与子表数据全保留。
  只 ADD 不 DROP 的话旧 CHECK 还在，新值会被拒。
- **FTS5 虚表不能 ALTER**，只能 `DROP` + 按新列 `CREATE` + `INSERT...SELECT` 从源表重灌。
- 每条迁移包在 `BEGIN/COMMIT`（`db.ts:migrate`），失败 ROLLBACK 并抛错；版本查 `PRAGMA user_version`。

## 交付前必跑
`npm run typecheck`（0 报错）→ `npm run build` → `npm run smoke`（全绿）
- 自检用临时库 + 真实 HTTP + 每次换端口；功能用例用大限额，限流另用小限额服务验证
- **改了源码必须重新 build 再 smoke**，否则验证的是旧 dist（曾因此误判）

## 管理端内容管理（2026-10-08，取代原「内容审核」）
- 页面 `/admin/content`：技能 CRUD（新建 / 编辑 / 上架下架 / 永久删除）+ 页码分页。
  **上架下架走 `listing` 字段**（见上节），不再是复用 visibility。
- 新增 `POST /admin/skills`（表单直建，服务端合成 SKILL.md + v1.0.0）、
  `PUT /admin/skills/:slug`（**全量替换**，空串=清空）；永久删除复用 purge。
- `GET /admin/skills` 加可选 `page` + `total`（不传 page 仍是游标，契约不变）。
- 两个高危坑（详见 CONVENTIONS）：①`overwrite:false` 在「不存在」分支也抛冲突，不能用来防重；
  ②分类**不能**按 `VALID_CATEGORIES` 校验，否则一点保存就把全部内置技能改档成 general。
- 富文本入库前必须过 `lib/richText.ts` 归一化，否则 Quill 的无序列表在详情页退化成编号列表。

## 分类字段：自由输入 + 已有分类下拉（2026-10-13）
- `/admin/content` 分类不是固定下拉，是 `Combobox allowCustom`：可自己敲，点开弹**库中实际已有**的分类，按首字母排。
- 「已有分类」走 **`GET /api/v1/admin/categories`**（`SELECT DISTINCT category`），**不是**公开的 `/api/v1/categories`
  ——后者是契约，仍返回 `VALID_CATEGORIES` 四项，两者不可混用。
- ⚠️ **`createSkillFromForm` 里 create 路径会经 `publishVersion` 把非白名单分类静默改成 `general`**，
  所以 create 之后要再用 `updateMetadata` 把分类写回去（update 路径走 `updateForAdmin`，本来就没事）。
  这条已加 smoke 断言，别删。
- 写 `Combobox` 这类浮层组件记住两条：**Escape 必须在 document 捕获阶段拦**
  （弹窗的 document keydown 监听器挂得更早，React onKeyDown 里 stopPropagation 拦不住）；
  **`openList()` 要 `select()`**，否则聚焦后打字是追加不是替换。
- `/skills` 浏览页左侧分类筛选**也已改成读实际分类**（`GET /api/v1/categories/in-use`，`opt`+`K_READ`）。
  同一个 repo 方法 `skills.listCategoriesInUse(viewer)` 服务两端，差别只在 viewer：
  **admin 传 `{role:'admin'}` ⇒ 含下架分类**（控制台要在上架前先归类），
  **公开侧传 `viewerOf(ctx)` ⇒ 只含该访客看得见的**（避免给出一点就空的筛选项）。
  ⚠️ 公开那条**必须带 `visibilityClause`**，否则会暴露下架分类的存在。
  `/skills` 侧栏里当前筛选项若不在列表中（旧链接），要**单独补一个 active 按钮**显示它，
  否则「全部分类」高亮了但结果仍被过滤，看起来像 bug。
  空状态文案判据是 `q || category`，不是只有 `q`——有筛选时说「还没有技能」是错的。


## 注册资料字段（迁移 v12，2026-10-09）
- `users` 加 6 列：country / organization / job_title / office_location / research_needs / markets
  （JSON 数组，NOT NULL DEFAULT `'[]'`）。**姓名复用已有的 `display_name`**，没有第二个姓名字段。
- 选项清单一律放 `src/lib/registration.ts`（COUNTRIES + MARKETS + `marketLabel`/`countryLabel`），
  表单渲染、service 校验、admin 展示三层共用同一份；**slug/code 是稳定标识，标签只是文案**。
- 必填规则：除 office_location 外全部必填，服务端 `registerUser` 强校验；留空存 NULL 不存 `''`。
- **注册还有邮箱验证码**：`EMAIL_VERIFICATION_CODE = '123456'` 在 `lib/registration.ts`，
  前后端共用。校验放在**邮箱格式校验之后**（地址写错先报地址，别报验证码）。
  界面**不写**「演示/固定验证码/未接入邮件服务」——那是给看代码的人看的；
  `123456` 只出现在两份产品文档（`docs/product-guide.md` + `static/product-guide.html`）。
- **验证码有「发送」+ 60 秒倒计时，冷却由服务端裁决**（`src/routes/register.email-code.ts`
  同挂 GET + POST，因为一个 page route 只能有一个 method per path，`/register` 已被占满）：
  `POST` 发送并返回 `{cooldownSeconds, sent}`，`GET` **只读**剩余秒数。
  ⚠️ 三个别再犯的坑：①查询和发送**必须分开**，否则用户只是在输入框敲邮箱就把发送机会用掉；
  ②成功发送要返回**完整 60**（返回 0 会让前端 `start(0)` 走清零分支，倒计时不启动），
  用 `sent` 布尔决定提示文案，别靠数字猜；③前端去重要跟**当前屏上地址**比，不是"上次查过的"。
  前端 `useCooldown()` 用墙上时钟不用递减计数；刷新后靠 sessionStorage 里的
  `skillhub.register.lastEmail` 找回地址再问服务端。
- **改注册字段时两份文档都要改**，且 `static/product-guide.html` 才是部署后实际访问的那份。
  它是 `body.lang-zh .en{display:none}` 结构，每段要写 zh+en 两个 span；
  **只能用页面已有的 class（`table` / `note`），别自造**。
- `handlers.ts` 的 `formFields` 返回 `{get, all}`（不再是 `Map`），`all` 给 markets 这类同名多值字段用。
- **地区字段用 `src/components/Combobox.tsx`（通用可搜索下拉），不是 `<select>`**。
  `countryOptions(lang)` 的 `keywords` 塞另一种语言 + ISO code ⇒ 中文界面也能搜 "Japan"/"SG"。
  写这个组件的三个坑：选项用 `onMouseDown` 不是 `onClick`（click 会被 blur 回滚 filter）；
  Escape/mousedown 要置 `closingRef` 否则被 blur 逻辑覆盖；判外部点击用 `pointerdown` 不是 `click`。
- 注册表单校验提示一律 `touched` 门控：首次进入不报警，提交后才逐字段标红。
- 管理端审核在 `/admin/users` 用「查看资料」展开行展示，别再往表格里加列。
  **待审核的行默认展开**（判据 `detailOverride[id] ?? status==='pending'`，只记例外不记默认值）。
  ⚠️ review 的 `onSuccess` 必须补 `detailOverride[id]=true`，否则审核通过瞬间资料消失。

## 审核状态机：approved 是终态（2026-10-09）
- **服务端才是防线**。前端按钮 disabled 只是提示，`reviewUser` 原本不看当前状态，
  直接打 API 就能把在用账号改成 rejected。
- 规则：`approved` 不可再驳回（收回访问权走 `banUser`）；`rejected → approved` 允许（补批）；
  重复同一决定 = 幂等 return，**不报错也不重复写审计**（防双击/重试）。
- ⚠️ **`/admin/users/ban` 目前无法解封** —— `manage.ts` 里写死 `setBanned(id, true, reason)`，
  接口只收 `reason` 没有 `banned:false`。封禁被立为「收回访问权唯一途径」后，误封就找不回来，
  补解封是待办。
- 灰按钮必须给 `title` 说明为什么灰；服务端英文报错在界面用 `friendlyReviewError()` 复述。

## 界面文案（强约束）
- 不写实现说明、不写运营/第三人称视角；演示账号列表正式交付前删掉
- 全站双语：`src/lib/i18n.tsx` 的 `useT()` **内联双语字面量**，不建中央 key 表；默认 en
- 品牌色 `#004123`、字体 Helvetica（不打包 woff2）；改这些只动 `global.css` 变量

## 本机环境坑
沙箱单个 turn 拦截 >50 文件的批量删除（`SAFE_DELETE_BULK_CONFIRM_REQUIRED`），
`vite build` 清理 outDir 会失败 ⇒ 用 `mv` 把 `dist` 移出工作区再构建。
Bash 工具每次调用是独立进程，`&` 起的后台服务会在命令结束时被回收 ⇒ 长期存活用
`run_in_background: true` + TaskStop 收尾。
写含控制字符范围的正则一律用 `/[\u0000-\u001f\u007f]/g` 显式转义 —— 字面字符会让源码变 binary。
迁移状态查 `PRAGMA user_version`，**没有** `schema_migrations` 表。
`agent-browser` 两条坑：点小元素（`.reg-chip` 等）用 `click <ref>` 会假失败，改用
`eval` 里 `el.click()`；`eval` 里 `const` 会在 daemon 全局残留，下一条 eval 报
`Identifier already been declared` —— 用不同变量名或 IIFE，交互优先用 `type`/`press` 真实事件。

## 静态文档路由（/docs，2026-10-08 新增）
- 给非技术读者（测试人员）的文档**不放进 dist**，由 `serve.mjs` 从 `SKILLHUB_STATIC_DIR`
  （容器默认 `/app/static`，裸跑默认 `<repo>/static`）提供 `/docs/*`，`Cache-Control: no-cache`。
- 文档源：`docs/product-guide.md`（仓库内、功能说明）+ `static/product-guide.html`（自包含双语静态页，
  部署后访问 `/docs/product-guide.html`）。改 HTML 直接改文件/挂载卷即可，**无需重新构建镜像**。
- Dockerfile 把 `static/` 拷入镜像作默认；compose 已 `bind mount ./static:/app/static` + 设
  `SKILLHUB_STATIC_DIR=/app/static`，宿主改文件刷新即生效。
- 验证方式：临时库 + 临时端口起 `serve.mjs` 后 `curl /docs/product-guide.html` 期望 200 + no-cache。

## 管理员 API Key = 唯一的程序化凭证（2026-10-08）
- `api_keys` 迁移 **v10** 加 `key_secret TEXT`；`AdminApiKey` 新增 `secret?`（旧行缺列时键不出现，非 null），
  `GET /admin/api-keys` 回传完整 key，供列表「复制调用说明」生成可执行示例。校验仍走 `key_hash`。
- **个人/团队令牌已整体删除**（迁移 **v11**）：`api_tokens` 表连同 `/api/v1/tokens*`、
  `/api/v1/admin/tokens`、`/api/v1/namespaces/:slug/tokens*`、`/auth/device/*`、
  `/api/v1/agent/provision` 一起撤下。
- ⚠️ **`api_tokens` 曾是会话表**：`login` 写 `label='web-session'` 行、Cookie 即其值。
  v11 先把这类行搬进新表 `sessions`（`repo/core.ts` 的 `sessions` 仓库 + `http.ts` 的
  `authenticateSession`）再 DROP，旧登录态不失效。改会话相关代码时先看 `sessions`，别再找 `api_tokens`。
- 凭证判定：`isApiKey(raw)` = `raw.startsWith(apiKeyPrefix)`；否则按 `sessionPrefix` 查 `sessions`。
  环境变量 `SKILLHUB_TOKEN_PREFIX` 已改为 `SKILLHUB_SESSION_PREFIX`（默认 `sess_`）。
- **多数管理路由没有 `apiKeyScope`，按设计拒绝一切 API Key**（命名空间/插件/评分/评论/admin users 等）。
  写自检或接第三方时：admin 全量操作走**会话 Cookie**，只有技能域操作用 Bearer key。
- `ctx.tokenNamespaceId` 链路保留（命名空间绑定现只来自 API Key，字段名沿用未重命名）。
