# syntax=docker/dockerfile:1

# ───────────────────────────────────────────────────────────────────────────
# tfi-skill-hub — TanStack Start + node:sqlite
#
# 说明：
# - 生产监听进程是 scripts/serve.mjs（npm start 里的 dist/server/server.js 只导出
#   Web 标准 handler，并不绑定端口，启动逻辑都在这）。
# - 数据库走 Node 24 内置的 node:sqlite，无需第三方驱动；运行期仍依赖 node_modules
#   里的 @tanstack/* / h3-v2 / react 等裸模块，所以 runner 阶段要带上生产依赖。
# - SQLite 默认 WAL 模式，会产生 -wal / -shm 伴随文件，必须和主库放在同一个
#   持久化卷里（见 docker-compose.yml 的 skillhub-data 卷）。
# ───────────────────────────────────────────────────────────────────────────

# ---------- 生产依赖（仅运行时需要的包，用于精简 runner 镜像） ----------
FROM node:24-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# ---------- 构建 ----------
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

# ---------- 运行 ----------
FROM node:24-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV SKILLHUB_HOST=0.0.0.0
ENV SKILLHUB_PORT=10070
ENV SKILLHUB_DB_PATH=/app/data/skillhub.db

# 运行期依赖（不含 vite / typescript 等构建工具）
COPY --from=deps /app/node_modules ./node_modules
# 构建产物：服务端 handler + 客户端 bundle
COPY --from=build /app/dist ./dist
# 生产启动器（桥接 Node ↔ Web 标准请求/响应 + 静态资源）
COPY scripts/serve.mjs ./scripts/serve.mjs

# 非 root 运行用户；数据目录在 entrypoint 里改成该用户可写
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs --home-dir /app appuser \
  && mkdir -p /app/data \
  && chown -R appuser:nodejs /app

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 10070

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.SKILLHUB_PORT||10070)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
