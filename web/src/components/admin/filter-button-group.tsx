"use client";

import { cn } from "@/lib/utils";

export interface FilterOption<T extends string> {
  value: T;
  label: string;
}

/**
 * Ant Design `Button.Group`-style segmented filter: one joined strip with
 * hairline dividers, a single active segment in the brand colour, and only
 * the outer corners rounded. Used by the console list filters.
 */
export function FilterButtonGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: T;
  options: FilterOption<T>[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {label ? <span className="text-xs text-muted-foreground">{label}</span> : null}
      <div
        role="group"
        aria-label={label}
        className="inline-flex h-8 items-stretch overflow-hidden rounded-[6px] border border-input bg-card"
      >
        {options.map((option, index) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={cn(
                "inline-flex items-center justify-center px-3 text-sm whitespace-nowrap transition-colors focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ring",
                index > 0 && "border-l border-input",
                active
                  ? "bg-primary font-medium text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
