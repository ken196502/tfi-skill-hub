import type { NextConfig } from "next";

// 同源 API 转发：浏览器以相对路径 /skillhubservice/... 请求本服务，由 Next 在
// 服务端转发到真实后端，避开浏览器 CORS（后端对带凭证请求返回 ACAO:*，规范上
// 必被拦截）以及跨站 cookie 问题。仅在设置了 API_PROXY_TARGET 时生效
// （本地配在 .env.development；生产由 Ingress 反代同名前缀，不设此变量）。
const apiProxyTarget = (process.env.API_PROXY_TARGET ?? "").trim().replace(/\/+$/, "");

// 子路径部署（如挂在 https://host/tfi-skillHub）时由构建命令注入
// NEXT_PUBLIC_BASE_PATH=/tfi-skillHub；根路径部署与本地 dev 留空。
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").trim().replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // K8s/Docker 部署：build 产出 .next/standalone（server.js + 最小依赖），
  // 由 scripts/build-standalone.mjs 组装为 tfi-skillHub/ 目录。
  output: "standalone",
  basePath: basePath || undefined,
  async rewrites() {
    // 探针 /healthz 的根路径兼容已改由 src/middleware.ts 直接应答（零回环）。
    if (!apiProxyTarget) return [];
    return [
      {
        // The browser requests `/skillhubservice/api/...`; the backend serves
        // `/api/...` (no prefix), so the prefix is stripped here.
        source: "/skillhubservice/:path*",
        destination: `${apiProxyTarget}/:path*`,
      },
    ];
  },
  // Dev-only: allow LAN devices to load dev assets and the HMR websocket.
  // Entries match the request Origin hostname (no scheme, no port), and `*`
  // stands for one hostname label — the exact IP covers the current DHCP
  // lease, the wildcard covers the whole subnet when the lease changes.
  allowedDevOrigins: ["172.20.10.222", "172.20.10.*"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
