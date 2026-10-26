"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Copy, Eye, EyeOff, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { OrganizationSelect } from "@/components/common/organization-select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  useBanUser,
  useCreateUser,
  useResetUserPassword,
  useReviewUser,
  useSetRole,
  useUnbanUser,
} from "@/hooks/use-admin";
import { useI18n } from "@/i18n";
import { pickLocalized } from "@/i18n/config";
import { apiErrorMessage } from "@/lib/api/errors";
import type { User, UserRole } from "@/lib/api/types";
import {
  COUNTRIES,
  HANDLE_PATTERN,
  MARKETS,
  MIN_PASSWORD_LENGTH,
  PROFILE_FIELD_MAX,
  RESEARCH_NEED_MAX,
} from "@/lib/registration";

/** Approve or reject a pending registration. */
export function RejectUserDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { t } = useI18n();
  const review = useReviewUser();
  const [note, setNote] = useState("");

  const close = () => {
    setNote("");
    onClose();
  };

  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("admin.users.rejectTitle")}</DialogTitle>
          <DialogDescription>
            {t("admin.users.rejectDesc")}
            {user ? ` (@${user.handle})` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="reject-note">
            {t("admin.users.rejectReason")}
            <span className="ml-0.5 text-destructive">*</span>
          </Label>
          <Textarea
            id="reject-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("admin.users.rejectReasonPlaceholder")}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={review.isPending || !note.trim()}
            onClick={() => {
              if (!user) return;
              review.mutate(
                { userId: user.id, action: "reject", note: note.trim() },
                {
                  onSuccess: () => {
                    toast.success(t("admin.users.rejected"));
                    close();
                  },
                  onError: (error) => toast.error(apiErrorMessage(error, t)),
                },
              );
            }}
          >
            {review.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("admin.users.reject")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Ban an account with a mandatory reason. */
export function BanUserDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { t } = useI18n();
  const ban = useBanUser();
  const [reason, setReason] = useState("");

  const close = () => {
    setReason("");
    onClose();
  };

  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("admin.users.banTitle")}</DialogTitle>
          <DialogDescription>
            {t("admin.users.banDesc")}
            {user ? ` (@${user.handle})` : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="ban-reason">
            {t("admin.users.banReason")}
            <span className="ml-0.5 text-destructive">*</span>
          </Label>
          <Textarea
            id="ban-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("admin.users.banReasonPlaceholder")}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="destructive"
            disabled={ban.isPending || !reason.trim()}
            onClick={() => {
              if (!user) return;
              ban.mutate(
                { userId: user.id, reason: reason.trim() },
                {
                  onSuccess: () => {
                    toast.success(t("admin.users.banned_success"));
                    close();
                  },
                  onError: (error) => toast.error(apiErrorMessage(error, t)),
                },
              );
            }}
          >
            {ban.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("admin.users.ban")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Lift a ban — no reason to collect, so a plain confirmation suffices. */
export function UnbanUserDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { t } = useI18n();
  const unban = useUnbanUser();

  return (
    <AlertDialog open={Boolean(user)} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("admin.users.unbanTitle")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("admin.users.unbanDesc")}
            {user ? ` (@${user.handle})` : ""}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="success"
            disabled={unban.isPending}
            onClick={() => {
              if (!user) return;
              unban.mutate(user.id, {
                onSuccess: () => {
                  toast.success(t("admin.users.unbanned"));
                  onClose();
                },
                onError: (error) => toast.error(apiErrorMessage(error, t)),
              });
            }}
          >
            {unban.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("admin.users.unban")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Switch user/admin roles. */
export function UserRoleDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { t } = useI18n();
  const setRoleMutation = useSetRole();
  const [roleChoice, setRoleChoice] = useState<UserRole | null>(null);

  // Derive from the prop until the admin picks something, so no effect is
  // needed to sync state when a different user opens the dialog.
  const role = roleChoice ?? user?.role ?? "user";

  const close = () => {
    setRoleChoice(null);
    onClose();
  };

  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("admin.users.roleDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("admin.users.roleDialogDesc", { handle: user ? `@${user.handle}` : "" })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>{t("admin.users.role")}</Label>
          <Select value={role} onValueChange={(value) => setRoleChoice(value as UserRole)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="user">{t("admin.users.roleUser")}</SelectItem>
              <SelectItem value="admin">{t("admin.users.roleAdmin")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button
            disabled={setRoleMutation.isPending || !user || role === user.role}
            onClick={() => {
              if (!user) return;
              setRoleMutation.mutate(
                { userId: user.id, role },
                {
                  onSuccess: () => {
                    toast.success(t("admin.users.roleUpdated"));
                    close();
                  },
                  onError: (error) => toast.error(apiErrorMessage(error, t)),
                },
              );
            }}
          >
            {setRoleMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("common.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** No-op subscription — the sign-in URL is only knowable in the browser. */
const subscribeNoop = () => () => {};

/**
 * Deployment prefix (e.g. `/tfi-skillHub`), inlined at build time from
 * NEXT_PUBLIC_BASE_PATH. `window.location.origin` alone drops it, so the
 * copied sign-in link pointed at the host root instead of the app.
 */
const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").trim().replace(/\/+$/, "");

/** Absolute sign-in page of the current deployment. */
function signInUrlForDisplay(): string {
  return `${window.location.origin}${BASE_PATH}/login`;
}

/** Server snapshot: a path without the origin, so pre-hydration rendering stays deterministic. */
const signInUrlFallback = () => `${BASE_PATH}/login`;

/**
 * Clipboard helper with a two-second "copied" flag. The reset timer dies with
 * the consuming dialog, so a closed dialog never flips state afterwards.
 */
function useCopyFeedback() {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("common.copied"));
      setCopied(true);
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("common.error"));
    }
  };

  return { copied, copy };
}

/** Icon-only copy button for a single field. */
function CopyValueButton({ value }: { value: string }) {
  const { t } = useI18n();
  const { copied, copy } = useCopyFeedback();

  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      className="shrink-0"
      aria-label={t("common.copy")}
      onClick={() => copy(value)}
    >
      {copied ? (
        <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <Copy className="size-3.5" />
      )}
    </Button>
  );
}

/** Overwrite an account's password; the admin hands the new one over directly. */
export function ResetPasswordDialog({
  user,
  onClose,
}: {
  user: User | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const reset = useResetUserPassword();
  const [showPassword, setShowPassword] = useState(false);
  /** The new password lives here until the dialog closes — never persisted. */
  const [result, setResult] = useState<{ password: string } | null>(null);
  // Resolves after hydration; the server snapshot keeps rendering deterministic.
  const signInUrl = useSyncExternalStore(subscribeNoop, signInUrlForDisplay, signInUrlFallback);
  // One-click copy of all three fields (footer), independent of the per-field buttons.
  const copyAll = useCopyFeedback();

  const schema = useMemo(
    () =>
      z
        .object({
          newPassword: z.string().min(MIN_PASSWORD_LENGTH, t("auth.passwordHint")),
          confirmPassword: z.string().min(1, t("auth.passwordMismatch")),
        })
        .refine((values) => values.newPassword === values.confirmPassword, {
          path: ["confirmPassword"],
          message: t("auth.passwordMismatch"),
        }),
    [t],
  );

  const form = useForm<{ newPassword: string; confirmPassword: string }>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  const errors = form.formState.errors;

  const errorText = (name: "newPassword" | "confirmPassword"): string | undefined => {
    const message = errors[name]?.message;
    return typeof message === "string" ? message : undefined;
  };

  const close = () => {
    setResult(null);
    form.reset();
    setShowPassword(false);
    onClose();
  };

  const onSubmit = form.handleSubmit((values) => {
    if (!user) return;
    reset.mutate(
      { userId: user.id, newPassword: values.newPassword },
      {
        // Stay open: the credentials still have to be handed over, and this is
        // the only time the new password can be read.
        onSuccess: () => {
          setResult({ password: values.newPassword });
          setShowPassword(false);
        },
        onError: (error) => toast.error(apiErrorMessage(error, t)),
      },
    );
  });

  // Success state — the dialog stays open with a copy-ready credential sheet.
  if (result && user) {
    return (
      <Dialog open onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Check className="size-3.5" />
              </span>
              {t("admin.users.resetDoneTitle")}
            </DialogTitle>
            <DialogDescription>{t("admin.users.resetDoneDesc")}</DialogDescription>
          </DialogHeader>

          {/* Credential sheet — the password stays masked until revealed, and
              every row copies its raw value (no @ prefix, no mask). */}
          <dl className="divide-y overflow-hidden rounded-lg border bg-muted/40">
            <div className="flex items-center gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <dt className="text-xs text-muted-foreground">
                  {t("admin.users.loginAddress")}
                </dt>
                <dd className="mt-0.5 break-all font-mono text-xs">{signInUrl}</dd>
              </div>
              <CopyValueButton value={signInUrl} />
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <dt className="text-xs text-muted-foreground">
                  {t("admin.users.account")}
                </dt>
                <dd className="mt-0.5 break-all font-mono text-xs">{user.handle}</dd>
              </div>
              <CopyValueButton value={user.handle} />
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <dt className="text-xs text-muted-foreground">{t("auth.password")}</dt>
                <dd className="mt-0.5 break-all font-mono text-xs tracking-wide">
                  {showPassword ? result.password : "•".repeat(10)}
                </dd>
              </div>
              <div className="flex shrink-0 items-center">
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={
                    showPassword
                      ? t("admin.users.hidePassword")
                      : t("admin.users.showPassword")
                  }
                  onClick={() => setShowPassword((value) => !value)}
                >
                  {showPassword ? (
                    <Eye className="size-3.5" />
                  ) : (
                    <EyeOff className="size-3.5" />
                  )}
                </Button>
                <CopyValueButton value={result.password} />
              </div>
            </div>
          </dl>

          <DialogFooter>
            <Button
              variant="outline"
              className="gap-1.5"
              onClick={() =>
                copyAll.copy(
                  t("admin.users.credentialsText", {
                    url: signInUrl,
                    account: user.handle,
                    password: result.password,
                  }),
                )
              }
            >
              {copyAll.copied ? (
                <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <Copy className="size-3.5" />
              )}
              {copyAll.copied ? t("common.copied") : t("admin.users.copyAll")}
            </Button>
            <Button onClick={close}>{t("common.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={Boolean(user)} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("admin.users.resetPasswordTitle")}</DialogTitle>
          <DialogDescription>
            {t("admin.users.resetPasswordDesc", { handle: user ? `@${user.handle}` : "" })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-2">
            <Label htmlFor="reset-new-password">{t("admin.users.newPassword")}</Label>
            <div className="relative">
              <Input
                id="reset-new-password"
                type={showPassword ? "text" : "password"}
                {...form.register("newPassword", {
                  // RHF refreshes only the edited field's own error, so the
                  // mismatch flagged under the confirm field would linger after
                  // this one is corrected — re-run it whenever the compared
                  // value changes.
                  onChange: () => {
                    if (form.getFieldState("confirmPassword").invalid) {
                      void form.trigger("confirmPassword");
                    }
                  },
                })}
                placeholder={t("auth.passwordPlaceholder")}
                autoComplete="new-password"
                aria-invalid={Boolean(errors.newPassword)}
                className="pr-9"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={
                  showPassword ? t("admin.users.hidePassword") : t("admin.users.showPassword")
                }
              >
                {showPassword ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              </button>
            </div>
            <p
              className={
                errors.newPassword ? "text-xs text-destructive" : "text-xs text-muted-foreground"
              }
            >
              {errorText("newPassword") ?? t("auth.passwordHint")}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reset-confirm-password">{t("auth.confirmPassword")}</Label>
            <Input
              id="reset-confirm-password"
              type={showPassword ? "text" : "password"}
              {...form.register("confirmPassword")}
              placeholder={t("auth.confirmPasswordPlaceholder")}
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirmPassword)}
            />
            {errorText("confirmPassword") ? (
              <p className="text-xs text-destructive">{errorText("confirmPassword")}</p>
            ) : null}
          </div>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button disabled={reset.isPending} onClick={onSubmit}>
            {reset.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("common.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Values collected by the create-account form — the same profile the public
 *  sign-up gathers, plus the role the admin assigns. */
interface CreateUserFormValues {
  handle: string;
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
  country: string;
  officeLocation: string;
  /** Brand ID of the affiliation (`orgCode` on the wire). */
  organization: string;
  jobTitle: string;
  researchNeeds: string;
  markets: string[];
  role: UserRole;
}

/** Mirrors the server's rule so the common case is caught before posting. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Create a pre-approved account — the same profile the public sign-up collects. */
export function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, locale } = useI18n();
  const create = useCreateUser();
  const [showPassword, setShowPassword] = useState(false);

  const schema = useMemo(
    () =>
      z
        .object({
          handle: z.string().regex(HANDLE_PATTERN, t("auth.handleHint")),
          displayName: z.string().min(1, t("auth.displayNameHint")),
          email: z.string().regex(EMAIL_PATTERN, t("auth.emailInvalid")),
          password: z.string().min(MIN_PASSWORD_LENGTH, t("auth.passwordHint")),
          confirmPassword: z.string().min(1, t("auth.passwordMismatch")),
          country: z.string().min(1, t("auth.countryHint")),
          officeLocation: z.string(),
          organization: z.string().min(1, t("auth.organizationHint")),
          jobTitle: z.string().min(1, t("auth.jobTitleHint")),
          researchNeeds: z.string().min(1, t("auth.researchNeedsHint")),
          markets: z.array(z.string()).min(1, t("auth.marketsHint")),
          role: z.enum(["user", "admin"]),
        })
        .refine((values) => values.password === values.confirmPassword, {
          path: ["confirmPassword"],
          message: t("auth.passwordMismatch"),
        }),
    [t],
  );

  const form = useForm<CreateUserFormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      handle: "",
      displayName: "",
      email: "",
      password: "",
      confirmPassword: "",
      country: "",
      officeLocation: "",
      organization: "",
      jobTitle: "",
      researchNeeds: "",
      markets: [],
      role: "user",
    },
  });

  const errors = form.formState.errors;
  // `useWatch` rather than `form.watch` — the latter returns an unmemoizable
  // function that React Compiler cannot work with.
  const marketsValue = useWatch({ control: form.control, name: "markets" });
  const researchNeedsValue = useWatch({ control: form.control, name: "researchNeeds" });
  const countryValue = useWatch({ control: form.control, name: "country" });
  const organizationValue = useWatch({ control: form.control, name: "organization" });
  const roleValue = useWatch({ control: form.control, name: "role" });
  /** Set once a submit has been attempted, so toggles re-run validation then. */
  const validateOnChange = form.formState.submitCount > 0;

  const errorText = (name: keyof CreateUserFormValues): string | undefined => {
    const message = errors[name]?.message;
    return typeof message === "string" ? message : undefined;
  };

  const wrongField = (name: keyof CreateUserFormValues) => {
    const message = errorText(name);
    return message ? <p className="text-xs text-destructive">{message}</p> : null;
  };

  const toggleMarket = (code: string) => {
    const current = form.getValues("markets");
    const next = current.includes(code)
      ? current.filter((item) => item !== code)
      : [...current, code];
    form.setValue("markets", next, { shouldValidate: validateOnChange });
  };

  const close = () => {
    form.reset();
    onClose();
  };

  const onSubmit = form.handleSubmit((values) => {
    create.mutate(
      {
        handle: values.handle.trim(),
        displayName: values.displayName.trim(),
        email: values.email.trim(),
        password: values.password,
        confirmPassword: values.confirmPassword,
        country: values.country,
        officeLocation: values.officeLocation.trim(),
        organization: values.organization.trim(),
        jobTitle: values.jobTitle.trim(),
        researchNeeds: values.researchNeeds.trim(),
        markets: values.markets,
        role: values.role,
      },
      {
        onSuccess: (data) => {
          if (data.initialPassword) {
            toast.success(
              t("admin.users.createUserSuccess", {
                handle: data.handle,
                password: data.initialPassword,
              }),
              { duration: 8_000 },
            );
          } else {
            toast.success(t("admin.users.userCreated"));
          }
          close();
        },
        onError: (error) => toast.error(apiErrorMessage(error, t)),
      },
    );
  });

  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("admin.users.createUserTitle")}</DialogTitle>
          {/* <DialogDescription>{t("admin.users.createUserDesc")}</DialogDescription> */}
        </DialogHeader>

        <form onSubmit={onSubmit} className="max-h-[58vh] space-y-5 overflow-y-auto pr-1" noValidate>
          {/* ── Account ─────────────────────────────────────────────── */}
          <section className="space-y-4 border-t border-border/60 pt-5 first:border-t-0 first:pt-0">
            <h2 className="text-sm font-semibold">{t("auth.sectionAccount")}</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="create-handle">{t("auth.handle")}</Label>
                <Input
                  id="create-handle"
                  {...form.register("handle")}
                  placeholder={t("auth.handlePlaceholder")}
                  autoComplete="off"
                  aria-invalid={Boolean(errors.handle)}
                />
                <p
                  className={
                    errors.handle ? "text-xs text-destructive" : "text-xs text-muted-foreground"
                  }
                >
                  {errors.handle?.message ?? t("auth.handleHint")}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-display-name">{t("auth.displayName")}</Label>
                <Input
                  id="create-display-name"
                  {...form.register("displayName")}
                  placeholder={t("auth.displayNamePlaceholder")}
                  aria-invalid={Boolean(errors.displayName)}
                />
                {wrongField("displayName")}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-email">{t("auth.email")}</Label>
              <Input
                id="create-email"
                type="email"
                {...form.register("email")}
                placeholder={t("auth.emailPlaceholder")}
                autoComplete="off"
                aria-invalid={Boolean(errors.email)}
              />
              {wrongField("email")}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="create-password">{t("auth.password")}</Label>
                <div className="relative">
                  <Input
                    id="create-password"
                    type={showPassword ? "text" : "password"}
                    {...form.register("password")}
                    placeholder={t("auth.passwordPlaceholder")}
                    autoComplete="new-password"
                    aria-invalid={Boolean(errors.password)}
                    className="pr-9"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={showPassword ? "hide" : "show"}
                  >
                    {showPassword ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
                  </button>
                </div>
                <p
                  className={
                    errors.password ? "text-xs text-destructive" : "text-xs text-muted-foreground"
                  }
                >
                  {errors.password?.message ?? t("auth.passwordHint")}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-confirm-password">{t("auth.confirmPassword")}</Label>
                <Input
                  id="create-confirm-password"
                  type={showPassword ? "text" : "password"}
                  {...form.register("confirmPassword")}
                  placeholder={t("auth.confirmPasswordPlaceholder")}
                  autoComplete="new-password"
                  aria-invalid={Boolean(errors.confirmPassword)}
                />
                {wrongField("confirmPassword")}
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("admin.users.role")}</Label>
              <Select
                value={roleValue}
                onValueChange={(value) =>
                  form.setValue("role", value as UserRole, { shouldValidate: validateOnChange })
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">{t("admin.users.roleUser")}</SelectItem>
                  <SelectItem value="admin">{t("admin.users.roleAdmin")}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("auth.country")}</Label>
                <Select
                  value={countryValue || undefined}
                  onValueChange={(value) =>
                    form.setValue("country", value, { shouldValidate: validateOnChange })
                  }
                >
                  <SelectTrigger className="w-full" aria-invalid={Boolean(errors.country)}>
                    <SelectValue placeholder={t("auth.countryPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((country) => (
                      <SelectItem key={country.code} value={country.code}>
                        {pickLocalized(country, locale)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {wrongField("country")}
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-office-location">
                  {t("auth.officeLocation")}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    ({t("auth.optional")})
                  </span>
                </Label>
                <Input
                  id="create-office-location"
                  {...form.register("officeLocation")}
                  maxLength={PROFILE_FIELD_MAX}
                  placeholder={t("auth.officeLocationPlaceholder")}
                />
              </div>
            </div>
          </section>

          {/* ── Affiliation ─────────────────────────────────────────── */}
          <section className="space-y-4 border-t border-border/60 pt-5 first:border-t-0 first:pt-0">
            <h2 className="text-sm font-semibold">{t("auth.sectionAffiliation")}</h2>

            {/* Organisation and job title stack — a long organisation name
                would otherwise stretch the select beside the job title field. */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="create-organization">{t("auth.organization")}</Label>
                <OrganizationSelect
                  id="create-organization"
                  value={organizationValue}
                  onValueChange={(value) =>
                    form.setValue("organization", value, { shouldValidate: validateOnChange })
                  }
                  placeholder={t("auth.organizationPlaceholder")}
                  invalid={Boolean(errors.organization)}
                />
                {wrongField("organization")}
              </div>

              <div className="space-y-2">
                <Label htmlFor="create-job-title">{t("auth.jobTitle")}</Label>
                <Input
                  id="create-job-title"
                  {...form.register("jobTitle")}
                  maxLength={PROFILE_FIELD_MAX}
                  placeholder={t("auth.jobTitlePlaceholder")}
                  aria-invalid={Boolean(errors.jobTitle)}
                />
                {wrongField("jobTitle")}
              </div>
            </div>
          </section>

          {/* ── Research needs ──────────────────────────────────────── */}
          <section className="space-y-4 border-t border-border/60 pt-5 first:border-t-0 first:pt-0">
            <h2 className="text-sm font-semibold">{t("auth.sectionResearch")}</h2>

            <div className="space-y-2">
              <Label htmlFor="create-research-needs">{t("auth.researchNeeds")}</Label>
              <Textarea
                id="create-research-needs"
                {...form.register("researchNeeds")}
                rows={4}
                maxLength={RESEARCH_NEED_MAX}
                placeholder={t("auth.researchNeedsPlaceholder")}
                aria-invalid={Boolean(errors.researchNeeds)}
              />
              <div className="flex items-baseline justify-between gap-2">
                {wrongField("researchNeeds") ?? <span />}
                <p className="text-xs text-muted-foreground tabular-nums">
                  {researchNeedsValue.length} / {RESEARCH_NEED_MAX}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("auth.markets")}</Label>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {MARKETS.map((market) => (
                  <label
                    key={market.code}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <Checkbox
                      checked={marketsValue.includes(market.code)}
                      onCheckedChange={() => toggleMarket(market.code)}
                    />
                    {pickLocalized(market, locale)}
                  </label>
                ))}
              </div>
              {wrongField("markets")}
            </div>
          </section>
        </form>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button className="gap-2" disabled={create.isPending} onClick={onSubmit}>
            {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t("admin.users.createUser")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
