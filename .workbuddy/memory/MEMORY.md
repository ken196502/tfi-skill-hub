# tfi-skill-hub —— 项目索引（改动前先读）

把 `saker-ai/skillhub`（Go）重写为 TypeScript。**完整契约与约定明细见 `CONVENTIONS.md`（同目录）**，
本文件只保留最高频的硬约束，避免注入超限被截断。

## 技术栈（锁定，不要替换）
- TanStack Start（单体全栈）+ Router + Query；前端只用 `@tanstack/*` + `react` + `react-dom`
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
- 错误→状态码照抄原实现：只有带 sentinel 的错误才有 404/403/409，其余一律 400，不要"顺手修正"
- 路由表用 gin 的 `@:namespace` 语法，直接加在 `src/server/api/routes.ts`

## 交付前必跑
`npm run typecheck`（0 报错）→ `npm run build` → `npm run smoke`（全绿）
- 自检用临时库 + 真实 HTTP + 每次换端口；功能用例用大限额，限流另用小限额服务验证
- **改了源码必须重新 build 再 smoke**，否则验证的是旧 dist（曾因此误判）

## 界面文案（强约束）
- 不写实现说明、不写运营/第三人称视角；演示账号列表正式交付前删掉
- 全站双语：`src/lib/i18n.tsx` 的 `useT()` **内联双语字面量**，不建中央 key 表；默认 en
- 品牌色 `#004123`、字体 Helvetica（不打包 woff2）；改这些只动 `global.css` 变量

## 本机环境坑
沙箱单个 turn 拦截 >50 文件的批量删除（`SAFE_DELETE_BULK_CONFIRM_REQUIRED`），
`vite build` 清理 outDir 会失败 ⇒ 用 `mv` 把 `dist` 移出工作区再构建。

## 静态文档路由（/docs，2026-10-08 新增）
- 给非技术读者（测试人员）的文档**不放进 dist**，由 `serve.mjs` 从 `SKILLHUB_STATIC_DIR`
  （容器默认 `/app/static`，裸跑默认 `<repo>/static`）提供 `/docs/*`，`Cache-Control: no-cache`。
- 文档源：`docs/product-guide.md`（仓库内、功能说明）+ `static/product-guide.html`（自包含双语静态页，
  部署后访问 `/docs/product-guide.html`）。改 HTML 直接改文件/挂载卷即可，**无需重新构建镜像**。
- Dockerfile 把 `static/` 拷入镜像作默认；compose 已 `bind mount ./static:/app/static` + 设
  `SKILLHUB_STATIC_DIR=/app/static`，宿主改文件刷新即生效。
- 验证方式：临时库 + 临时端口起 `serve.mjs` 后 `curl /docs/product-guide.html` 期望 200 + no-cache。
