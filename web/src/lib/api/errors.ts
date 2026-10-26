import type { I18nContextValue } from "@/i18n";

/** Error thrown for any non-2xx API response, carrying status and body. */
export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;

  constructor(status: number, body: Record<string, unknown>) {
    super(
      typeof body.error === "string"
        ? body.error
        : typeof body.message === "string"
          ? body.message
          : `HTTP ${status}`,
    );
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** Resp-envelope business codes that have a dedicated dictionary prompt. */
const CODE_HANDLE_TAKEN = 542008;
const CODE_EMAIL_TAKEN = 542009;

/**
 * User-facing text for a failed request.
 *
 * Account-conflict codes show the dictionary prompt; every other failure
 * surfaces the backend's message, and only a message-less error falls back
 * to the generic copy.
 */
export function apiErrorMessage(error: unknown, t: I18nContextValue["t"]): string {
  if (error instanceof ApiError) {
    if (error.body.code === CODE_HANDLE_TAKEN) return t("auth.handleTaken");
    if (error.body.code === CODE_EMAIL_TAKEN) return t("auth.emailTaken");
    const message = error.body.message;
    if (typeof message === "string" && message !== "") return message;
  }
  return t("common.error");
}
