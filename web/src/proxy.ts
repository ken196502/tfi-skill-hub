import { NextResponse, type NextRequest } from "next/server";

/**
 * Probe answer on the root path.
 *
 * Deployments can mount the app under a basePath (/tfi-skillHub), which would
 * prefix every route — but platform probes (Kong → container) call the bare
 * /healthz and expect it to simply answer 200. The proxy file (Next 16's
 * rename of middleware) runs before route resolution, and returning a
 * response short-circuits the whole chain, so the probe is answered directly:
 * no redirect, no rewrite, no loopback request.
 *
 * `nextUrl.pathname` is already stripped of the basePath here, so both
 * /healthz and /tfi-skillHub/healthz land on the same check. The app's own
 * /healthz route handler (app/healthz/route.ts) stays as the canonical
 * endpoint.
 */
export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/healthz") {
    return new NextResponse('{"status":"ok"}', {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  return NextResponse.next();
}
