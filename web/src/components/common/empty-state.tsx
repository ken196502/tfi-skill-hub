import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        // Frosted card panel: keeps the dashed placeholder readable on the
        // brand surface backgrounds (home/skills/favorites).
        "motion-rise flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-card/60 px-6 py-14 text-center backdrop-blur-sm dark:bg-card/40",
        className,
      )}
    >
      {Icon ? (
        <div className="rounded-full bg-muted p-3">
          <Icon className="size-6 text-muted-foreground" />
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="font-medium">{title}</p>
        {description ? (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
