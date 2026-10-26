# syntax=docker/dockerfile:1

# ───────────────────────────────────────────────────────────────────────────
# tfi-skill-hub — 单体镜像（前端 Next.js + 后端 API，同一容器）
#
# 设计：
# - 前端 web/ 是 Next.js（output: standalone）；构建期注入 API_PROXY_TARGET
#   指向容器内后端，Next 在服务端把同源前缀 /skillhubservice/* 反代到 api 进程。
# - 后端 src/server 零第三方依赖，仅用 Node 内置模块（node:sqlite 等），
#   运行期只需 tsx（与 npm run api 一致）转译 .ts。
# - 一个镜像内同时跑 api(:8787，内部) 与 web(:3000，对外)，由 scripts/run-all.mjs
#   拉起并统一转发信号；对外只暴露 3000，Traefik 只需一条 Host 规则。
# - SQLite 默认 WAL 模式，会产生 -wal / -shm，必须和主库放在同一个持久化卷里
#   （见 docker-compose.yml 的 skillhub-data 卷）。
# ───────────────────────────────────────────────────────────────────────────

# ---------- 后端运行依赖：仅需 tsx 转译 .ts ----------
FROM node:24-slim AS api-deps
WORKDIR /api
RUN npm init -y >/dev/null 2>&1 \
  && npm pkg set type=module >/dev/null 2>&1 \
  && npm install --no-save tsx@4 --omit=dev --no-audit --no-fund \
  && npm cache clean --force

# ---------- 前端构建 ----------
FROM node:24-slim AS web-builder
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./

# 构建期固化的环境变量
# 1) API_PROXY_TARGET：让 Next 在容器内把 /skillhubservice/* 反代到 127.0.0.1:8787
#    （复用 next.config.ts 已有的重写，无需改前端代码）
ARG API_PROXY_TARGET=http://127.0.0.1:8787
ENV API_PROXY_TARGET=$API_PROXY_TARGET
# 2) NEXT_PUBLIC_*：同源接口前缀与子路径（内联进客户端 bundle）
ARG NEXT_PUBLIC_API_BASE_URL=/skillhubservice
ARG NEXT_PUBLIC_BASE_PATH=
ENV NEXT_PUBLIC_API_BASE_URL=$NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH

RUN npm run build

# ---------- 运行 ----------
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV SKILLHUB_API_HOST=0.0.0.0
ENV SKILLHUB_API_PORT=8787
ENV SKILLHUB_DB_PATH=/app/data/skillhub.db
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# 后端：tsx 运行依赖 + 源码 + 入口
COPY --from=api-deps /api/node_modules /app/backend/node_modules
COPY src /app/backend/src
COPY scripts /app/backend/scripts
COPY package.json tsconfig.json /app/backend/

# 前端：Next.js standalone（server.js + 追踪到的最小依赖）
COPY --from=web-builder /web/.next/standalone /app/frontend
COPY --from=web-builder /web/.next/static /app/frontend/.next/static
COPY --from=web-builder /web/public /app/frontend/public

# 单体启动器：同时拉起 api 与 web 并转发信号
COPY scripts/run-all.mjs /app/run-all.mjs
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# 非 root 运行用户；数据目录在 entrypoint 里改成该用户可写
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs --home-dir /app appuser \
  && mkdir -p /app/data \
  && chown -R appuser:nodejs /app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
