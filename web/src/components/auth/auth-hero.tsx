import type { ReactNode } from "react";

/**
 * Brand hero shared by the sign-in and sign-up pages — the demo's auth
 * layout (centred tile, title and subtitle above the form card). The tile
 * carries the page's own action icon (log in / sign up) rather than the
 * company mark.
 */
export function AuthHero({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: ReactNode;
  subtitle: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center pb-6 text-center">
      <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 via-primary/5 to-transparent shadow-sm ring-1 ring-primary/15 dark:from-primary/25 dark:via-primary/10 dark:ring-primary/25">
        {icon}
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}
