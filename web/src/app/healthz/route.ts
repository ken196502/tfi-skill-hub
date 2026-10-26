/**
 * K8s 存活/就绪探针用的轻量健康检查端点。
 *
 * 不触碰数据层与渲染层，保证探针只反映进程本身是否可用，
 * 同时避免像探到 `/` 那样触发整页 SSR 消耗资源。
 */
export function GET() {
  return Response.json({ status: "ok" });
}
