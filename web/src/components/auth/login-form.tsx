"use client";

import { Eye, EyeOff, Loader2, Lock, LogIn, User } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { AuthHero } from "@/components/auth/auth-hero";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin } from "@/hooks/use-auth";
import { useI18n } from "@/i18n";
import { ApiError } from "@/lib/api/errors";

/** Only same-origin relative paths may be used as redirect targets. */
function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

/** Live-backend business code for bad credentials (Resp envelope). */
const CODE_INVALID_CREDENTIALS = 542002;

/** localStorage slot for the "remember password" preference. */
const REMEMBER_KEY = "tfi-skillhub:login-remember";

const subscribeNoop = () => () => {};

function readRememberedRaw(): string | null {
  try {
    return window.localStorage.getItem(REMEMBER_KEY);
  } catch {
    return null;
  }
}

function parseRemembered(raw: string | null): { handle: string; password: string } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { handle?: unknown; password?: unknown };
    const handle = typeof parsed.handle === "string" ? parsed.handle : "";
    const password = typeof parsed.password === "string" ? parsed.password : "";
    return handle && password ? { handle, password } : null;
  } catch {
    return null;
  }
}

export function LoginForm({ next = "/" }: { next?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const login = useLogin();
  // Read via useSyncExternalStore so SSR renders an empty form and the
  // browser fills remembered credentials in after hydration, without a
  // mismatch. `edited` wins as soon as the user starts typing.
  const remembered = parseRemembered(
    useSyncExternalStore(subscribeNoop, readRememberedRaw, () => null),
  );
  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [edited, setEdited] = useState(false);
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleValue = edited ? handle : (remembered?.handle ?? "");
  const passwordValue = edited ? password : (remembered?.password ?? "");

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    login.mutate(
      { handle: handleValue.trim(), password: passwordValue },
      {
        onSuccess: () => {
          // Persist or drop the remembered credentials after sign-in.
          try {
            if (remember) {
              window.localStorage.setItem(
                REMEMBER_KEY,
                JSON.stringify({ handle: handleValue.trim(), password: passwordValue }),
              );
            } else {
              window.localStorage.removeItem(REMEMBER_KEY);
            }
          } catch {
            // Storage may be unavailable (private mode) — remembering is optional.
          }
          toast.success(t("auth.loginSuccess"));
          router.push(safeNext(next));
        },
        onError: (err) => {
          let message = t("auth.invalidCredentials");
          if (err instanceof ApiError) {
            // The live backend answers with a numeric business code plus a
            // human-readable message.
            if (err.body.code === CODE_INVALID_CREDENTIALS) {
              message = t("auth.invalidCredentials");
            } else if (typeof err.body.message === "string" && err.body.message !== "") {
              message = err.body.message;
            }
          }
          setError(message);
        },
      },
    );
  };

  return (
    <div className="w-full max-w-sm sm:my-auto">
      <AuthHero
        icon={<LogIn className="size-7 text-primary" />}
        title={t("auth.loginTitle")}
        subtitle={t("auth.loginSubtitle")}
      />

      <Card className="gap-0 py-6">
        <form onSubmit={handleSubmit} className="space-y-4 px-6">
          <div className="space-y-2">
            <Label htmlFor="handle">{t("auth.handle")}</Label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="handle"
                value={handleValue}
                onChange={(event) => {
                  setHandle(event.target.value);
                  setEdited(true);
                }}
                placeholder={t("auth.handlePlaceholder")}
                autoComplete="username"
                className="pl-9"
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={passwordValue}
                onChange={(event) => {
                  setPassword(event.target.value);
                  setEdited(true);
                }}
                placeholder={t("auth.passwordPlaceholder")}
                autoComplete="current-password"
                className="pr-9 pl-9"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
              >
                {showPassword ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="remember-password"
              checked={remember}
              onCheckedChange={(checked) => setRemember(checked === true)}
            />
            <Label htmlFor="remember-password" className="cursor-pointer font-normal">
              {t("auth.rememberPassword")}
            </Label>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button
            type="submit"
            className="w-full gap-2"
            disabled={login.isPending || !handleValue.trim() || !passwordValue}
          >
            {login.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <LogIn className="size-4" />
            )}
            {login.isPending ? t("auth.loggingIn") : t("auth.login")}
          </Button>
        </form>
      </Card>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        <Link
          href="/register"
          className="text-primary underline-offset-4 hover:underline"
        >
          {t("auth.toRegister")}
        </Link>
      </p>
    </div>
  );
}
