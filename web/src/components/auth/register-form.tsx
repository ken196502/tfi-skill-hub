"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  Briefcase,
  CheckCircle2,
  Eye,
  EyeOff,
  IdCard,
  Loader2,
  Lock,
  LockKeyhole,
  Mail,
  MailCheck,
  MapPin,
  User,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { AuthHero } from "@/components/auth/auth-hero";
import { OrganizationSelect } from "@/components/common/organization-select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useRegister, useSendEmailCode } from "@/hooks/use-auth";
import { useI18n } from "@/i18n";
import { pickLocalized } from "@/i18n/config";
import { apiErrorMessage } from "@/lib/api/errors";
import {
  COUNTRIES,
  EMAIL_CODE_LENGTH,
  HANDLE_PATTERN,
  MARKETS,
  MIN_PASSWORD_LENGTH,
  PROFILE_FIELD_MAX,
  RESEARCH_NEED_MAX,
} from "@/lib/registration";

/** Mirrors the server's rule so the common case is caught before posting. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FormValues {
  handle: string;
  displayName: string;
  email: string;
  emailCode: string;
  password: string;
  confirmPassword: string;
  country: string;
  officeLocation: string;
  /** Brand ID of the affiliation (`orgCode` on the wire). */
  organization: string;
  jobTitle: string;
  researchNeeds: string;
  markets: string[];
}

/** How long the "send code" button stays disabled after a successful send. */
const RESEND_COOLDOWN_SECONDS = 120;

export function RegisterForm() {
  const { t, locale } = useI18n();
  const registerMutation = useRegister();
  const sendCode = useSendEmailCode();
  const [formError, setFormError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  /** Seconds left before the code can be re-sent; 0 means the button is live. */
  const [cooldown, setCooldown] = useState(0);

  useCountdown(cooldown, setCooldown);

  const schema = useMemo(
    () =>
      z
        .object({
          handle: z.string().regex(HANDLE_PATTERN, t("auth.handleHint")),
          displayName: z.string().min(1, t("auth.displayNameHint")),
          email: z.string().regex(EMAIL_PATTERN, t("auth.emailInvalid")),
          emailCode: z
            .string()
            .regex(new RegExp(`^\\d{${EMAIL_CODE_LENGTH}}$`), t("auth.emailCodeHint")),
          password: z.string().min(MIN_PASSWORD_LENGTH, t("auth.passwordHint")),
          confirmPassword: z.string().min(1, t("auth.passwordMismatch")),
          country: z.string().min(1, t("auth.countryHint")),
          officeLocation: z.string(),
          organization: z.string().min(1, t("auth.organizationHint")),
          jobTitle: z.string().min(1, t("auth.jobTitleHint")),
          researchNeeds: z.string().min(1, t("auth.researchNeedsHint")),
          markets: z.array(z.string()).min(1, t("auth.marketsHint")),
        })
        .refine((values) => values.password === values.confirmPassword, {
          path: ["confirmPassword"],
          message: t("auth.passwordMismatch"),
        }),
    [t],
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onTouched",
    defaultValues: {
      handle: "",
      displayName: "",
      email: "",
      emailCode: "",
      password: "",
      confirmPassword: "",
      country: "",
      officeLocation: "",
      organization: "",
      jobTitle: "",
      researchNeeds: "",
      markets: [],
    },
  });

  const errors = form.formState.errors;
  const emailCodeRegistration = form.register("emailCode");
  // `useWatch` rather than `form.watch` — the latter returns an unmemoizable
  // function that React Compiler cannot work with.
  const marketsValue = useWatch({ control: form.control, name: "markets" });
  const researchNeedsValue = useWatch({ control: form.control, name: "researchNeeds" });
  const countryValue = useWatch({ control: form.control, name: "country" });
  const organizationValue = useWatch({ control: form.control, name: "organization" });
  /** Set once a submit has been attempted, so toggles re-run validation then. */
  const validateOnChange = form.formState.submitCount > 0;

  const errorText = (name: keyof FormValues): string | undefined => {
    const message = errors[name]?.message;
    return typeof message === "string" ? message : undefined;
  };

  const wrongField = (name: keyof FormValues) => {
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

  const onSendCode = () => {
    const email = form.getValues("email").trim();
    if (!EMAIL_PATTERN.test(email)) {
      form.setError("email", { message: t("auth.emailInvalid") });
      return;
    }
    sendCode.mutate(email, {
      onSuccess: () => {
        setCooldown(RESEND_COOLDOWN_SECONDS);
        toast.success(t("auth.emailCodeSent"));
      },
      onError: (error) => toast.error(apiErrorMessage(error, t)),
    });
  };

  const onSubmit = form.handleSubmit((values) => {
    setFormError(null);
    registerMutation.mutate(
      {
        handle: values.handle.trim(),
        password: values.password,
        confirmPassword: values.confirmPassword,
        emailCode: values.emailCode.trim(),
        displayName: values.displayName.trim(),
        email: values.email.trim(),
        country: values.country,
        officeLocation: values.officeLocation.trim(),
        organization: values.organization.trim(),
        jobTitle: values.jobTitle.trim(),
        researchNeeds: values.researchNeeds.trim(),
        markets: values.markets,
      },
      {
        onSuccess: () => setSubmitted(true),
        onError: (error) => setFormError(apiErrorMessage(error, t)),
      },
    );
  });

  if (submitted) {
    return (
      <div className="w-full max-w-xl">
        <AuthHero
          icon={<UserPlus className="size-7 text-primary" />}
          title={t("auth.registerTitle")}
          subtitle={t("auth.registerSubtitle")}
        />

        <Card className="gap-0 px-6 py-8 text-center">
          <CheckCircle2 className="mx-auto size-10 text-emerald-500" />
          <h2 className="mt-4 text-lg font-semibold">{t("auth.registerSuccess")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("auth.registerPendingBanner")}</p>
          <Button asChild className="mt-6">
            <Link href="/login">{t("auth.toLogin")}</Link>
          </Button>
        </Card>
      </div>
    );
  }

  const formCard = (
    <Card className="w-full gap-0 py-6">
      {/* The form doubles as the desktop grid: account fields take the wider
          left column (spanning both rows), affiliation and research needs
          stack on the right — so the page does not run as tall. */}
      <form
        onSubmit={onSubmit}
        className="space-y-5 px-6 lg:grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-x-10 lg:gap-y-5 lg:space-y-0"
        noValidate
      >
        {/* ── Account ─────────────────────────────────────────────── */}
        <section className="space-y-4 border-t border-border/60 pt-5 first:border-t-0 first:pt-0 lg:row-span-2">
          <h2 className="text-sm font-semibold">
            {t("auth.sectionAccount")}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="handle">{t("auth.handle")}</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="handle"
                  {...form.register("handle")}
                  placeholder={t("auth.handlePlaceholder")}
                  autoComplete="username"
                  aria-invalid={Boolean(errors.handle)}
                  className="pl-9"
                />
              </div>
              <p
                className={
                  errors.handle ? "text-xs text-destructive" : "text-xs text-muted-foreground"
                }
              >
                {errors.handle?.message ?? t("auth.handleHint")}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">{t("auth.displayName")}</Label>
              <div className="relative">
                <IdCard className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="displayName"
                  {...form.register("displayName")}
                  placeholder={t("auth.displayNamePlaceholder")}
                  autoComplete="name"
                  aria-invalid={Boolean(errors.displayName)}
                  className="pl-9"
                />
              </div>
              {wrongField("displayName")}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="email"
                type="email"
                {...form.register("email")}
                placeholder={t("auth.emailPlaceholder")}
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
                className="pl-9"
              />
            </div>
            {wrongField("email")}
          </div>

          <div className="space-y-2">
            <Label htmlFor="emailCode">{t("auth.emailCode")}</Label>
            <div className="flex items-start gap-2">
              <div className="relative flex-1">
                <MailCheck className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="emailCode"
                  {...emailCodeRegistration}
                  onChange={(event) => {
                    // Digits only, so the code cannot carry a typo the user
                    // then has to hunt for.
                    event.target.value = event.target.value
                      .replace(/\D/g, "")
                      .slice(0, EMAIL_CODE_LENGTH);
                    void emailCodeRegistration.onChange(event);
                  }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={EMAIL_CODE_LENGTH}
                  placeholder={t("auth.emailCodePlaceholder")}
                  aria-invalid={Boolean(errors.emailCode)}
                  className="pl-9"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="shrink-0"
                disabled={sendCode.isPending || cooldown > 0}
                onClick={onSendCode}
              >
                {sendCode.isPending
                  ? t("auth.emailCodeSending")
                  : cooldown > 0
                    ? t("auth.emailCodeResend", { seconds: cooldown })
                    : t("auth.emailCodeSend")}
              </Button>
            </div>
            <p
              className={
                errors.emailCode ? "text-xs text-destructive" : "text-xs text-muted-foreground"
              }
            >
              {errors.emailCode?.message ?? t("auth.emailCodeHint")}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  {...form.register("password")}
                  placeholder={t("auth.passwordPlaceholder")}
                  autoComplete="new-password"
                  aria-invalid={Boolean(errors.password)}
                  className="pr-9 pl-9"
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
              <Label htmlFor="confirmPassword">{t("auth.confirmPassword")}</Label>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="confirmPassword"
                  type={showPassword ? "text" : "password"}
                  {...form.register("confirmPassword")}
                  placeholder={t("auth.confirmPasswordPlaceholder")}
                  autoComplete="new-password"
                  aria-invalid={Boolean(errors.confirmPassword)}
                  className="pl-9"
                />
              </div>
              {wrongField("confirmPassword")}
            </div>
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
              <Label htmlFor="officeLocation">
                {t("auth.officeLocation")}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  ({t("auth.optional")})
                </span>
              </Label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="officeLocation"
                  {...form.register("officeLocation")}
                  maxLength={PROFILE_FIELD_MAX}
                  placeholder={t("auth.officeLocationPlaceholder")}
                  className="pl-9"
                />
              </div>
            </div>
          </div>

        </section>

        {/* ── Affiliation ─────────────────────────────────────────── */}
        <section className="space-y-4 border-t border-border/60 pt-5 lg:border-t-0 lg:pt-0">
          <h2 className="text-sm font-semibold">
            {t("auth.sectionAffiliation")}
          </h2>

          {/* Organisation and job title stack: a long organisation name wraps
              onto a second line, which would stretch a side-by-side select. */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="organization">{t("auth.organization")}</Label>
              {/* The directory is long, so it searches and virtualises. */}
              <OrganizationSelect
                id="organization"
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
              <Label htmlFor="jobTitle">{t("auth.jobTitle")}</Label>
              <div className="relative">
                <Briefcase className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="jobTitle"
                  {...form.register("jobTitle")}
                  maxLength={PROFILE_FIELD_MAX}
                  placeholder={t("auth.jobTitlePlaceholder")}
                  aria-invalid={Boolean(errors.jobTitle)}
                  className="pl-9"
                />
              </div>
              {wrongField("jobTitle")}
            </div>
          </div>
        </section>

        {/* ── Research needs ──────────────────────────────────────── */}
        <section className="space-y-4 border-t border-border/60 pt-5 lg:border-t-0 lg:pt-0">
          <h2 className="text-sm font-semibold">
            {t("auth.sectionResearch")}
          </h2>

          <div className="space-y-2">
            <Label htmlFor="researchNeeds">{t("auth.researchNeeds")}</Label>
            <Textarea
              id="researchNeeds"
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

        {formError ? <p className="text-sm text-destructive lg:col-span-2">{formError}</p> : null}

        <Button
          type="submit"
          className="w-full gap-2 sm:w-48 lg:col-span-2 m-auto"
          disabled={registerMutation.isPending}
        >
          {registerMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <UserPlus className="size-4" />
          )}
          {registerMutation.isPending ? t("auth.registering") : t("auth.register")}
        </Button>
      </form>

    </Card>
  );

  return (
    <div className="w-full max-w-xl lg:max-w-5xl">
      <AuthHero
        icon={<UserPlus className="size-7 text-primary" />}
        title={t("auth.registerTitle")}
        subtitle={t("auth.registerSubtitle")}
      />
      {formCard}

      <p className="mt-4 text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-primary underline-offset-4 hover:underline">
          {t("auth.toLogin")}
        </Link>
      </p>
    </div>
  );
}

/** Ticks `seconds` down to zero once a second while it is positive. */
function useCountdown(seconds: number, setSeconds: (next: number) => void) {
  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds(seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds, setSeconds]);
}
