/**
 * The single choke point for outbound API calls.
 *
 * Requests hit `NEXT_PUBLIC_API_BASE_URL` (empty string = same-origin) and
 * speak the live backend dialect (Resp envelope + pageNum paging); the
 * `./real` adapter translates responses back into the internal shapes.
 */

import { apiLangHeader } from "../../i18n/config";
import { ApiError } from "./errors";

const BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "").replace(/\/+$/, "");

export { ApiError };

/** Raw variant for binary payloads (the ZIP download). */
export async function apiFetchRaw(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("lang", apiLangHeader());
  const res = await fetch(`${BASE_URL}${path}`, { credentials: "include", ...init, headers });
  if (!res.ok) throw new ApiError(res.status, {});
  return res;
}
