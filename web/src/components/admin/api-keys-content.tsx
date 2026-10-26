"use client";

import { Check, Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/common/empty-state";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminApiKeys, useCreateApiKey, useRevokeApiKey } from "@/hooks/use-admin";
import { useI18n } from "@/i18n";
import type { TranslationKey } from "@/i18n";
import { pickLocalized } from "@/i18n/config";
import {
  API_KEY_SCOPES,
  apiKeyStatus,
  type AdminApiKey,
  type ApiKeyExpiry,
  type ApiKeyScope,
  type CreateApiKeyResult,
} from "@/lib/api/types";
import { formatDate } from "@/lib/format";
import { apiBaseForDisplay, buildUsageText, examplesFor } from "@/lib/usage-text";

const SCOPE_LABELS: Record<ApiKeyScope, TranslationKey> = {
  "skills:read": "admin.apiKeys.scopeSkillsRead",
  "skills:publish": "admin.apiKeys.scopeSkillsPublish",
  "skills:delete": "admin.apiKeys.scopeSkillsDelete",
  "skills:moderate": "admin.apiKeys.scopeSkillsModerate",
  "users:moderate": "admin.apiKeys.scopeUsersModerate",
};

/** One-line explanation under each scope checkbox. */
const SCOPE_HINTS: Record<ApiKeyScope, TranslationKey> = {
  "skills:read": "admin.apiKeys.scopeSkillsReadHint",
  "skills:publish": "admin.apiKeys.scopeSkillsPublishHint",
  "skills:delete": "admin.apiKeys.scopeSkillsDeleteHint",
  "skills:moderate": "admin.apiKeys.scopeSkillsModerateHint",
  "users:moderate": "admin.apiKeys.scopeUsersModerateHint",
};

/** No external store to follow — the snapshot only differs across hydration. */
const subscribeNoop = () => () => {};

function KeyStatusBadge({ status }: { status: "active" | "revoked" | "expired" }) {
  const { t } = useI18n();
  if (status === "active") {
    return (
      <Badge className="border-transparent bg-emerald-500/15 font-normal text-emerald-700 dark:text-emerald-400">
        {t("admin.apiKeys.statusActive")}
      </Badge>
    );
  }
  if (status === "revoked") {
    return (
      <Badge variant="outline" className="font-normal text-destructive">
        {t("admin.apiKeys.statusRevoked")}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="font-normal">
      {t("admin.apiKeys.statusExpired")}
    </Badge>
  );
}

/** Shows the leading 16 characters of the key — the full secret when the API
 *  returns it, otherwise the short prefix — followed by an ellipsis. */
function keyPrefixLabel(item: AdminApiKey): string {
  const value = item.secret ?? item.prefix;
  return `${value.slice(0, 16)}…`;
}

/** Copy-usage + revoke buttons, shared by the desktop table and mobile cards. */
function KeyActions({ item, onRevoke }: { item: AdminApiKey; onRevoke: () => void }) {
  const { t, locale } = useI18n();
  const status = apiKeyStatus(item);
  const [copied, setCopied] = useState(false);

  const copyUsage = async () => {
    const text = buildUsageText({
      name: item.name,
      token: item.secret ?? "<YOUR_API_KEY>",
      scopes: item.scopes,
      apiBase: apiBaseForDisplay(),
      locale,
    });
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("admin.apiKeys.usageCopied"));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(t("common.error"));
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Button variant="outline" size="sm" className="gap-1.5" onClick={copyUsage}>
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? t("common.copied") : t("admin.apiKeys.copyUsage")}
      </Button>
      {status === "active" ? (
        <Button variant="destructive" size="sm" className="gap-1" onClick={onRevoke}>
          <Trash2 className="size-3.5" />
          {t("admin.apiKeys.revoke")}
        </Button>
      ) : null}
    </div>
  );
}

/** Desktop — the console lists keys in a table, cards stay for narrow screens. */
function KeyTable({
  items,
  onRevoke,
}: {
  items: AdminApiKey[];
  onRevoke: (item: AdminApiKey) => void;
}) {
  const { t, locale } = useI18n();

  return (
    <Card className="hidden gap-0 overflow-hidden py-0 md:block">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("admin.apiKeys.name")}</TableHead>
              <TableHead>{t("admin.apiKeys.scopes")}</TableHead>
              <TableHead className="hidden md:table-cell">
                {t("admin.apiKeys.createdAt")}
              </TableHead>
              <TableHead className="hidden lg:table-cell">
                {t("admin.apiKeys.lastUsed")}
              </TableHead>
              <TableHead>{t("admin.apiKeys.status")}</TableHead>
              <TableHead className="text-right">{t("common.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <KeyRound className="size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="font-medium">{item.name}</div>
                      <code className="mt-0.5 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                        {keyPrefixLabel(item)}
                      </code>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {item.scopes.map((scope) => (
                      <Badge key={scope} variant="secondary" className="text-xs font-normal">
                        {t(SCOPE_LABELS[scope])}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <div>{formatDate(item.createdAt, locale)}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {item.expiresAt
                      ? `${t("admin.apiKeys.expires")}: ${formatDate(item.expiresAt, locale)}`
                      : t("admin.apiKeys.never")}
                  </div>
                </TableCell>
                <TableCell className="hidden text-muted-foreground lg:table-cell">
                  {item.lastUsedAt
                    ? formatDate(item.lastUsedAt, locale)
                    : t("admin.apiKeys.neverUsed")}
                </TableCell>
                <TableCell>
                  <KeyStatusBadge status={apiKeyStatus(item)} />
                  {item.createdByHandle ? (
                    <div className="mt-1 text-xs text-muted-foreground">@{item.createdByHandle}</div>
                  ) : null}
                </TableCell>
                <TableCell className="text-right">
                  <KeyActions item={item} onRevoke={() => onRevoke(item)} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
}

/** Mobile — card per key, the table's counterpart on narrow screens. */
function KeyRow({ item, onRevoke }: { item: AdminApiKey; onRevoke: () => void }) {
  const { t, locale } = useI18n();
  const status = apiKeyStatus(item);

  return (
    <Card className="gap-0 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <KeyRound className="size-4 shrink-0 text-muted-foreground" />
            <span className="font-medium">{item.name}</span>
            <KeyStatusBadge status={status} />
          </div>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{keyPrefixLabel(item)}</code>
            <span>
              {t("admin.apiKeys.createdAt")}: {formatDate(item.createdAt, locale)}
            </span>
            <span>
              {item.expiresAt
                ? `${t("admin.apiKeys.expires")}: ${formatDate(item.expiresAt, locale)}`
                : t("admin.apiKeys.never")}
            </span>
            <span>
              {item.lastUsedAt
                ? `${t("admin.apiKeys.lastUsed")}: ${formatDate(item.lastUsedAt, locale)}`
                : t("admin.apiKeys.neverUsed")}
            </span>
            {item.createdByHandle ? (
              <span>
                {t("admin.apiKeys.createdBy")}: @{item.createdByHandle}
              </span>
            ) : null}
          </div>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {item.scopes.map((scope) => (
              <Badge key={scope} variant="secondary" className="text-xs font-normal">
                {t(SCOPE_LABELS[scope])}
              </Badge>
            ))}
          </div>
        </div>

        <KeyActions item={item} onRevoke={onRevoke} />
      </div>
    </Card>
  );
}

function CreateKeyDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (result: CreateApiKeyResult) => void;
}) {
  const { t } = useI18n();
  const create = useCreateApiKey();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<ApiKeyScope[]>(["skills:read"]);
  const [expiresIn, setExpiresIn] = useState<ApiKeyExpiry>("never");

  const reset = () => {
    setName("");
    setScopes(["skills:read"]);
    setExpiresIn("never");
  };

  const close = () => {
    reset();
    onClose();
  };

  const toggleScope = (scope: ApiKeyScope) => {
    setScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
    );
  };

  const submit = () => {
    if (!name.trim()) return;
    if (scopes.length === 0) {
      toast.warning(t("admin.apiKeys.scopeRequired"));
      return;
    }
    create.mutate(
      {
        name: name.trim(),
        scopes,
        expiresIn,
      },
      {
        onSuccess: (result) => {
          reset();
          onCreated(result);
        },
        onError: () => toast.error(t("common.error")),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("admin.apiKeys.createTitle")}</DialogTitle>
          <DialogDescription>{t("admin.apiKeys.createDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="key-name">{t("admin.apiKeys.name")}</Label>
            <Input
              id="key-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("admin.apiKeys.namePlaceholder")}
            />
          </div>

          <div className="space-y-2">
            <Label>{t("admin.apiKeys.scopes")}</Label>
            <div className="space-y-2.5 rounded-md border p-3">
              {API_KEY_SCOPES.map((scope) => (
                <label key={scope} className="flex cursor-pointer items-start gap-2.5 text-sm">
                  <Checkbox
                    className="mt-0.5"
                    checked={scopes.includes(scope)}
                    onCheckedChange={() => toggleScope(scope)}
                  />
                  <span className="min-w-0">
                    <span className="block">{t(SCOPE_LABELS[scope])}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {t(SCOPE_HINTS[scope])}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("admin.apiKeys.expiresIn")}</Label>
            <Select
              value={expiresIn}
              onValueChange={(value) => setExpiresIn(value as ApiKeyExpiry)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="never">{t("admin.apiKeys.expiresNever")}</SelectItem>
                <SelectItem value="30d">{t("admin.apiKeys.expires30")}</SelectItem>
                <SelectItem value="90d">{t("admin.apiKeys.expires90")}</SelectItem>
                <SelectItem value="365d">{t("admin.apiKeys.expires365")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            {t("common.cancel")}
          </Button>
          <Button
            className="gap-2"
            disabled={create.isPending || !name.trim()}
            onClick={submit}
          >
            {create.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <KeyRound className="size-4" />
            )}
            {t("admin.apiKeys.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevealKeyDialog({
  result,
  onClose,
}: {
  result: CreateApiKeyResult | null;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [copied, setCopied] = useState(false);

  const close = () => {
    setCopied(false);
    onClose();
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.key);
      setCopied(true);
      toast.success(t("common.copied"));
    } catch {
      toast.error(t("common.error"));
    }
  };

  /** Full usage sheet with this fresh key already filled in. */
  const copyUsage = async () => {
    if (!result) return;
    const text = buildUsageText({
      name: result.metadata.name,
      token: result.key,
      scopes: result.metadata.scopes,
      apiBase: apiBaseForDisplay(),
      locale,
    });
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("admin.apiKeys.usageCopied"));
    } catch {
      toast.error(t("common.error"));
    }
  };

  return (
    <Dialog open={Boolean(result)} onOpenChange={(value) => !value && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("admin.apiKeys.keyDialogTitle")}</DialogTitle>
          <DialogDescription>{t("admin.apiKeys.keyDialogDesc")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
            {t("admin.apiKeys.keyWarning")}
          </div>
          <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3">
            <code className="min-w-0 flex-1 break-all font-mono text-xs">{result?.key}</code>
            <Button size="icon-sm" variant="outline" onClick={copy}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="gap-1.5" onClick={copyUsage}>
            <Copy className="size-4" />
            {t("admin.apiKeys.copyUsage")}
          </Button>
          <Button onClick={close}>{t("common.close")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Page-level usage guide: every sample targets this deployment's API base
 * (build-time NEXT_PUBLIC_API_BASE_URL) so SIT and prod each point at their
 * own backend. Rendered after mount — the base is resolved from the browser.
 */
function UsageSection() {
  const { t, locale } = useI18n();
  const [copiedItem, setCopiedItem] = useState<string | null>(null);

  // The base resolves differently on the server (placeholder) and in the
  // browser (real host); useSyncExternalStore swaps the snapshot after
  // hydration — no mismatch warning, no setState inside an effect.
  const apiBase = useSyncExternalStore(subscribeNoop, apiBaseForDisplay, apiBaseForDisplay);
  const examples = examplesFor([...API_KEY_SCOPES]);

  const copyCommand = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("common.copied"));
      setCopiedItem(key);
      window.setTimeout(
        () => setCopiedItem((current) => (current === key ? null : current)),
        2000,
      );
    } catch {
      toast.error(t("common.error"));
    }
  };

  const copyAll = () =>
    copyCommand(
      "all",
      examples
        .map(
          (example) =>
            `# ${pickLocalized(example.label, locale)}\n${example.command(apiBase, "<YOUR_API_KEY>")}`,
        )
        .join("\n\n"),
    );

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">{t("admin.apiKeys.usageTitle")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("admin.apiKeys.usageDesc")}
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={copyAll}>
          {copiedItem === "all" ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {t("admin.apiKeys.usageCopyAll")}
        </Button>
      </div>

      {/* <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{t("admin.apiKeys.usageBaseLabel")}</span>
        <code className="rounded bg-muted px-1.5 py-0.5 font-mono">{apiBase}</code>
      </div> */}

      <div className="space-y-2.5">
        {examples.map((example) => {
          const label = pickLocalized(example.label, locale);
          const command = example.command(apiBase, "<YOUR_API_KEY>");
          return (
            <div key={label} className="overflow-hidden rounded-lg border">
              <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
                <span className="text-xs font-medium">{label}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("admin.apiKeys.copyUsage")}
                  onClick={() => copyCommand(label, command)}
                >
                  {copiedItem === label ? (
                    <Check className="size-3.5" />
                  ) : (
                    <Copy className="size-3.5" />
                  )}
                </Button>
              </div>
              <pre className="overflow-x-auto px-3 py-2.5 font-mono text-xs leading-relaxed">
                {command}
              </pre>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function ApiKeysContent() {
  const { t } = useI18n();
  const keys = useAdminApiKeys();
  const revoke = useRevokeApiKey();

  const [createOpen, setCreateOpen] = useState(false);
  const [revealResult, setRevealResult] = useState<CreateApiKeyResult | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<AdminApiKey | null>(null);

  const items = keys.data?.data ?? [];
  const activeCount = items.filter((item) => apiKeyStatus(item) === "active").length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">{t("admin.apiKeys.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("admin.apiKeys.subtitle")}
            {!keys.isLoading ? (
              <span className="ml-2 text-emerald-600 dark:text-emerald-400">
                {t("admin.apiKeys.activeCount", { count: activeCount })}
              </span>
            ) : null}
          </p>
        </div>
        <Button className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          {t("admin.apiKeys.create")}
        </Button>
      </header>

      {keys.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={KeyRound} title={t("admin.apiKeys.empty")} />
      ) : (
        <>
          <KeyTable items={items} onRevoke={setRevokeTarget} />

          {/* Mobile — cards */}
          <div className="space-y-3 md:hidden">
            {items.map((item) => (
              <KeyRow key={item.id} item={item} onRevoke={() => setRevokeTarget(item)} />
            ))}
          </div>
        </>
      )}

      {/* API usage guide — every sample targets this deployment's API base. */}
      <UsageSection />

      <CreateKeyDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(result) => {
          setCreateOpen(false);
          setRevealResult(result);
        }}
      />
      <RevealKeyDialog result={revealResult} onClose={() => setRevealResult(null)} />

      <AlertDialog
        open={Boolean(revokeTarget)}
        onOpenChange={(open) => !open && setRevokeTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("admin.apiKeys.revokeTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("admin.apiKeys.revokeDesc", { name: revokeTarget?.name ?? "" })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (!revokeTarget) return;
                revoke.mutate(revokeTarget.id, {
                  onSuccess: () => {
                    toast.success(t("admin.apiKeys.revoked"));
                    setRevokeTarget(null);
                  },
                  onError: () => toast.error(t("common.error")),
                });
              }}
            >
              {t("admin.apiKeys.revoke")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
