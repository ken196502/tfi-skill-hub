# SkillHub (TypeScript)

自托管的 Agent 技能与插件注册中心 —— **[saker-ai/skillhub](https://github.com/saker-ai/skillhub) 的 TypeScript 重写版**，
技术栈为 **TanStack Start + TanStack Router + TanStack Query**，数据库使用 **SQLite**（Node 内置 `node:sqlite`，零第三方数据库依赖）。

原项目是 Go（Gin + GORM + Bleve + go-git，约 1.8 万行实现代码）。本版本保留了它的领域模型、REST 契约与
中文界面文案，并把外部依赖收敛到运行时自带能力。

---

## 快速开始

```bash
npm install
npm run build

# 管理员账号从项目根目录的 .env 读取（模板见 .env.example），仓库内不含任何默认口令
cp .env.example .env    # 填写 SKILLHUB_ADMIN_USER / SKILLHUB_ADMIN_PASSWORD（≥ 8 位）
npm start               # → http://localhost:10070
```

浏览器打开 <http://localhost:10070>，用 `.env` 中设置的管理员账号登录。
数据默认落在 `./data/skillhub.db`。

每个新实例首次启动时还会自动创建 `@builtin` 命名空间，并幂等灌入 38 个内置技能（设计、研究、文档、写作四类）。其中日文元数据已统一翻译为中文；每个技能都带有可下载的 `SKILL.md` 和原始 SkillHub 来源链接。

### 开发模式

```bash
npm run dev            # Vite + TanStack Start 热更新，默认 :10070
npm run typecheck      # tsc --noEmit
```

### 其他管理员账号

```bash
node scripts/create-admin.mjs --handle alice --password secret123 --role admin
node scripts/create-admin.mjs --handle alice --password newsecret --set-password
```

---

## 验证

```bash
npm run smoke          # 端到端自检：临时库 + 真实 HTTP
```

自检脚本会自己拉起一份服务（独立临时数据库、独立端口），走真实 HTTP 覆盖 **185 项断言**，
逐项输出 ✓/✗，并以退出码 0/1 表示结果。最近一次运行：**185 passed, 0 failed**。

覆盖范围包括：发现类接口、登录/会话/Token 鉴权、发布与版本管理、文件读取、ZIP 下载与 ETag/304、
指纹反查、全文搜索（含中文）、收藏/评分/评论、命名空间与成员/邀请/团队 Token、
可见性与权限边界（401/403/404/409）、插件全流程、Agent Skill API、Runtime API、
管理端审核与审计、管理端 API Key（签发、按用途放行/拒绝、命名空间绑定、有效期、撤销、审计）、
详情 HTML（写入与回读、XSS 负载被清洗、列表不带正文、清空回退、权限边界、审计）、
限流（独立起一份小限额服务验证 429 与 `RateLimit-*` 头）、
以及**重启后数据与搜索索引仍在、且不会重复灌种子**。

自检脚本刻意做了两件容易踩坑的事：就绪判定匹配服务自己回显的 `x-run-id`（而不是"端口能连上"，
否则上一次遗留的进程会让断言全部落在旧进程上、跑出假绿）；每次启动换新端口并在 `EADDRINUSE` 时重试。

---

## 架构

```
src/
├── router.tsx                  # TanStack Router 实例（含 QueryClient）
├── routeTree.gen.ts            # 由 TanStack Router 自动生成
├── routes/                     # 页面路由 + 少量服务端路由
│   ├── __root.tsx              # 根布局（QueryClientProvider + Layout）
│   ├── index.tsx               # 首页
│   ├── skills.index.tsx        # 技能列表
│   ├── skills/$.tsx            # 技能详情（splat：同时支持 slug 与 @namespace/slug）
│   ├── search.tsx  publish.tsx  login.tsx  logout.ts
│   ├── plugins.index.tsx  plugins/$.tsx
│   ├── namespaces.index.tsx  namespaces.$slug.tsx
│   ├── api/$.ts                # 全部 /api/** 的入口，按路由表分发
│   └── $.ts                    # 根级服务端点（/healthz、/readyz、/metrics、/.well-known/*、/skills.md）
├── components/                 # Layout、LoginPage、UI 组件（卡片/代码块/Markdown 渲染）
├── lib/                        # 前端：类型、API 客户端、会话、Markdown 渲染
└── server/                     # 后端
    ├── config.ts               # 环境变量配置
    ├── db.ts                   # node:sqlite 连接、PRAGMA、迁移、可重入事务、bindable
    ├── schema.ts               # 建表 DDL（含 FTS5 索引）
    ├── bootstrap.ts            # 首启管理员
    ├── password.ts auth.ts     # scrypt 口令 + HMAC/Token 会话
    ├── http.ts                 # 路由编译与匹配、身份解析、限流、安全响应头
    ├── errors.ts               # 错误 → HTTP 状态映射
    ├── content.ts zip.ts semver.ts markdown 相关工具
    ├── repo/                   # 唯一写 SQL 的地方：core / skills / plugins / search
    ├── services/               # 业务逻辑：skills / plugins / namespaces / social / manage / runtime / agentSkills
    └── api/                    # HTTP 处理器与路由表
scripts/
├── serve.mjs                   # 生产启动器（Node ↔ Web 标准请求/响应 桥接 + 静态资源）
├── smoke-api.mjs               # 端到端自检
└── create-admin.mjs            # 管理员账号维护
```

### Go 模块 → TypeScript 模块

| 原 Go | 本实现 | 说明 |
|---|---|---|
| `pkg/model/*.go` | `src/lib/types.ts` + `src/server/repo/*.ts` | 领域类型与行映射（保留 `omitempty` 语义） |
| `pkg/repository/*.go` | `src/server/repo/{core,skills,plugins,search}.ts` | SQL 只出现在这一层 |
| `pkg/service/*.go` | `src/server/services/*.ts` | 业务规则与权限 |
| `pkg/handler/*.go` + `pkg/server/routes.go` | `src/server/api/{routes,handlers}.ts` | 路由表与处理器 |
| `pkg/middleware/*.go` | `src/server/http.ts` | 身份解析、限流、安全头、请求 ID |
| `pkg/auth/*.go` | `src/server/{auth,password}.ts` | 口令与 Token |
| `pkg/search/bleve.go` | `src/server/repo/search.ts` | Bleve → SQLite FTS5 |
| `gitstore`（每版本一个 git commit） | `skill_version_files` 表 | 版本内容直接落 SQLite |
| `web/` + `web-pages/`（React + react-router） | `src/routes/` + `src/components/` | 迁移到 TanStack Router + Query |

---

## 与 Go 版本的有意差异

这些都是刻意为之，不是遗漏：

1. **版本内容存进 SQLite**，不再用 git 仓库。原实现每个版本对应一个 git commit；
   本实现把文件字节存进 `skill_version_files` / `plugin_version_files`，下载时现场打包 ZIP
   （自研 ZIP 写入器，`node:zlib` + CRC32，零依赖）。`gitCommitHash` 字段保留但不再写入。
2. **搜索用 SQLite FTS5**，替代内嵌 Bleve。分词器选 `trigram`（而非默认 `unicode61`），
   因为原实现用了 CJK 感知的分析器，而 `unicode61` 对中文只能整词匹配。
   trigram 要求查询 ≥ 3 字符，因此 2 字以内的查询（如「数据」）会退化为 `LIKE` 扫描 —— 
   这两条路径都在自检里覆盖。
3. **口令哈希用 scrypt**（`node:crypto`），原实现用 bcrypt。存储格式为
   `scrypt:<saltHex>:<hashHex>`，算法写在值里便于将来原地升级。
   **哈希不可与原 Go 库互通**，迁移数据需要重新设置口令。
4. **时间戳统一为 ISO-8601 UTC**（`2026-09-22T05:16:00.123Z`）。
   原实现输出 Go 的 RFC3339 本地时区带纳秒格式。两者都是合法 RFC3339，但字符串不逐字相同。
5. **`POST /login` 兼容 JSON 请求体**（原实现只读表单编码）。这是严格超集：
   传表单编码仍与原实现完全一致。
6. **插件发布支持可选的 `visibility` 字段**（原实现没有）。原实现下插件只能继承命名空间默认可见性，
   用户无法自行把插件设为公开、必须找管理员改；这里补上了这个字段，不传时行为与原实现一致。
7. **`/metrics` 是精简版**。原实现用 Prometheus 客户端库暴露一整套 collector；
   这里只输出能从 SQL 廉价得到的几个 gauge，保持相同的 exposition 文本格式，抓取端无需改动。
8. **接口文档端点未实现**（`/openapi.json`、`/docs`、`/schemas`）。原实现由 Huma 生成，
   而仓库里手写的 `web/openapi.yaml` 与真实运行时有多处不符（字段名、必填性）。
   与其复制一份不准确的规范，不如不提供。完整契约见 `src/server/api/routes.ts` 的路由表。
9. **管理端 API Key 是本重写新增的能力**，原 Go 版没有对应功能。原实现里「用接口管理技能」
   只能靠个人 Token（`clh_`），而个人 Token 等同于账号本体、能调用该用户能调用的一切。
   这里另建 `api_keys` 表并给路由表加 `apiKeyScope` 标注，让一把 key 只覆盖技能管理，
   且可绑定命名空间、可设有效期、可单独撤销。个人 Token 的行为未作任何改动。
10. **技能详情页支持富文本**，原 Go 版只渲染 SKILL.md。`PUT /api/v1/skills/:slug/detail-html`
    写入一段 HTML，详情页优先展示它，没有则回退到最新版本的 SKILL.md；传空串即清除。
    由于它绕开了「先转义再排版」的 Markdown 渲染器，入库前会过一遍自研白名单消毒器
    （`src/lib/sanitizeHtml.ts`，零依赖：标签与属性白名单、剔除 script/iframe/svg 及其内容、
    拦 `javascript:` 及其实体与空白变体、自动补齐未闭合标签），页面渲染前再过一遍。
    详情 HTML 只随详情接口返回，列表接口不含该字段，避免一页技能把整段正文都带出去。

## 本版本未覆盖的功能

按「核心功能优先」的范围约定，以下功能未实现。它们在原项目中都依赖外部服务或额外基础设施：

| 功能 | 原实现依赖 | 现状 |
|---|---|---|
| OAuth 登录（`/auth/:provider`、`/callback`） | GitHub / GitLab OAuth 应用 | 未实现；`oauth_identities` 表已就位，便于后续接入 |
| Webhook 自动导入（`/api/v1/webhooks/*`） | GitHub/GitLab/Gitea 回调 + 签名校验 | 未实现，路由未挂载 |
| Git 镜像推送 | 远端裸仓库 + 凭据 | 未实现 |
| 直传（`direct-upload`）与预签名 URL | S3 / 阿里云 OSS | 路由已实现，但返回原实现定义的「仅对象存储后端可用」错误 |
| 对象存储后端（S3 / OSS） | 云存储 | 未实现，仅 SQLite 存储 |
| Sigstore/cosign 签名校验 | Fulcio + Rekor | 签名 bundle 会原样存储并标记 `unverified`，不做密码学校验 |
| PostgreSQL | 外部数据库 | 仅 SQLite |
| 服务端渲染的 Go 模板兜底（`web/templates/`） | Go `html/template` | 未实现，由 SPA 路由承接 |

---

## API 一览

完整路由表见 `src/server/api/routes.ts`（约 140 条，含 `@:namespace` 限定形式）。
按分组概览：

| 分组 | 前缀 | 鉴权 |
|---|---|---|
| 发现 | `/healthz`、`/readyz`、`/metrics`、`/.well-known/clawhub.json`、`/skills.md` | 公开 |
| 浏览与搜索 | `/api/v1/{search,categories,skills,resolve,plugins}`、单文件读取 `.../file` | 公开（可选身份用于可见性过滤） |
| **打包下载** | `/api/v1/download`、`/api/v1/plugins/download`、`/api/runtime/skills/bundle` | **需登录** |
| 会话 | `POST /login`、`POST /logout`、`POST /register`、`GET /api/v1/registration`、`/auth/device/*` | 公开 / 需登录 |
| 身份 | `GET /api/v1/whoami` | 需登录 |
| 技能写入 | `POST /api/v1/skills`、版本 yank/deprecate、软删除/恢复、转移、改单文件、`PUT .../detail-html` | 需登录 |
| 个人 Token | `/api/v1/tokens` | 需登录 |
| 管理端 API Key | `GET/POST /api/v1/admin/api-keys`、`DELETE /api/v1/admin/api-keys/:id` | 仅 `admin` |
| 用户审核 | `GET /api/v1/admin/users`、`POST /api/v1/admin/users/review` | 仅 `admin`（可用 `users:moderate` key） |
| 命名空间 | `/api/v1/namespaces/*`、`/api/v1/invitations/*` | 需登录（按命名空间角色授权） |
| 社交 | `/api/v1/stars/*`、`.../ratings`、`.../comments`、`/api/v1/notifications/*` | 需登录 |
| 管理端 | `/api/v1/admin/*` | 仅 `admin` |
| Agent 发布 | `/api/agent/skills*` | 需登录（`publish` 作用域可用） |
| Runtime 加载 | `/api/runtime/*`（`bundle` 除外，需登录） | 公开（可选身份） |

错误响应沿用原实现的两套约定：注册中心接口用 `{"error": "<message>"}`（歧义 slug 额外带 `candidates`），
Agent/Runtime 接口用 `{"error":{"code","message"}}`。

### 作用域与角色

* Token 作用域：`full`（全部）、`read`（仅 GET/HEAD）、`publish`（仅 `POST /api/v1/skills`、`/api/agent/skills`、`/api/v1/stars/:slug`）。
* 用户角色：`user` / `moderator` / `admin`（另有 `agent` 用于自动注册）。
* 命名空间角色：`owner` / `admin` / `member` / `reader`（`reader` 可读不可发布）。
* 团队 Token 绑定到命名空间，只能向其绑定的命名空间发布；成员退出或命名空间删除时会级联吊销。
* 管理端 API Key（`shk_` 前缀，在 `/admin/api-keys` 页面签发）按用途授权，与签发者的角色无关：
  `skills:read`（搜索、列表、详情、文件、下载）、`skills:publish`（发布新版本、改单文件）、
  `skills:delete`（删除、恢复、彻底清除）、`skills:moderate`（yank/deprecate、审核、可见性）、
  `users:moderate`（查看待审核注册用户、通过或驳回）。
  路由表未标注能力的端点一律拒绝 API Key 调用，因此一把钥匙只能做它被授权的那件事；
  `users:moderate` 只覆盖审核队列与 `.../users/review`，**封禁与改角色仍只认登录会话**。
  可额外绑定一个命名空间（此后只能向它发布）并设定有效期；
  撤销、过期、或签发者被降级/封禁都会让 key 立即失效。

### 注册与审核

* 公开注册页 `/register`，默认开放；`SKILLHUB_ALLOW_REGISTRATION=0` 可关闭（关闭后入口隐藏、提交被拒）。
* 注册成功的账号状态为 `pending`：**不能登录**（登录返回 403 + `code: "account_pending"`），
  也不持有任何会话。审核通过（`approved`）后才能登录，驳回为 `rejected`（登录 403 + `code: "account_rejected"`）。
* 审核在管理页「用户管理」完成：可按状态筛选（全部 / 待审核 / 已通过 / 已驳回），逐行「通过 / 驳回」，
  驳回可填写理由。也可用 `POST /api/v1/admin/users/review`（`{ userId, action: approve|reject, note? }`）。
* 存量账号在迁移时统一记为 `approved`，行为不变；驳回的账号保留在库中（不删除），决策可审计、handle 不会被重复注册。

---

## 配置

全部通过环境变量覆盖，默认值与原项目一致：

| 变量 | 说明 | 默认值 |
|---|---|---|
| `SKILLHUB_PORT` | 监听端口 | `10070` |
| `SKILLHUB_HOST` | 绑定地址 | `0.0.0.0` |
| `SKILLHUB_BASE_URL` | 公开访问 URL（用于设备码校验地址） | `""` |
| `SKILLHUB_DATABASE_URL` | SQLite 文件路径 | `./data/skillhub.db` |
| `SKILLHUB_ADMIN_USER` | 首启创建的管理员用户名 | 空 |
| `SKILLHUB_ADMIN_PASSWORD` | 管理员密码（≥ 8 位） | 空 |
| `SKILLHUB_ALLOW_REGISTRATION` | 是否开放公开注册（`0`/`false`/`no`/`off` 关闭） | `1`（开放） |
| `SKILLHUB_TOKEN_PREFIX` | API Token 前缀 | `clh_` |
| `SKILLHUB_API_KEY_PREFIX` | 管理端 API Key 前缀（须与上一项不同） | `shk_` |
| `SKILLHUB_RATE_READ_LIMIT` / `_WINDOW` | 读接口限流（次数 / 秒） | `120` / `600` |
| `SKILLHUB_RATE_WRITE_LIMIT` / `_WINDOW` | 写接口限流 | `30` / `120` |
| `SKILLHUB_RATE_DOWNLOAD_LIMIT` / `_WINDOW` | 下载限流 | `20` / `120` |
| `SKILLHUB_AGENT_SECRET` | 启用 `/api/v1/agent/provision`（未设置则返回 404） | 空 |

服务器入口另支持 `SKILLHUB_SERVER_ENTRY` / `SKILLHUB_CLIENT_DIR`，用于把构建产物放在 `dist/` 之外的目录。

`SKILLHUB_ADMIN_USER` / `SKILLHUB_ADMIN_PASSWORD` 在 docker compose 部署时是**必填项**：compose 从项目根目录的
`.env` 读取（模板见 `.env.example`），未设置或为空会直接报错退出，不会退回到任何默认口令。已有数据库的实例
不受影响——首启创建是幂等的，改口令请用 `node scripts/create-admin.mjs --handle <账号> --password <新口令> --set-password`。

---

## 已知限制

* 限流按客户端 IP 计数，IP 取自 `X-Forwarded-For` / `X-Real-IP`。反向代理后部署时若未设置这些头，
  所有请求会共用一个桶。原实现读的是 socket 地址。
* 限流状态在进程内存中，多副本部署时各自计数（与原实现一致）。
* 访问 `/publish`、`/namespaces` 等需要登录的页面时，会话恢复是异步的，
  首次渲染会先显示加载态再切到实际内容。
* 详情 HTML 的消毒器是白名单式的，不是完整的 HTML5 解析器：它按标签流重建输出，
  不做完整的上下文嵌套纠错（例如 `<table>` 里直接放 `<div>` 不会被重排），
  也不支持 CSS（`style` 属性一律丢弃）。够用于正文排版，不等于 DOMPurify。
* 表格内的 Markdown 不支持单元格内换行；`renderMarkdown` 覆盖的是 SKILL.md 实际使用的子集。

## 许可证

MIT —— 与原项目一致。
