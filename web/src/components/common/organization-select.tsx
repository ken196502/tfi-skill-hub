"use client";

import { Check, ChevronDown, Search } from "lucide-react";
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useI18n } from "@/i18n";
import { useBrands } from "@/hooks/use-brands";
import type { Brand } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/** Fixed row height (px) — a two-line name plus its secondary line fits. */
const ROW_HEIGHT = 50;
/** Visible list height (px): four rows plus a peek of the fifth. */
const LIST_HEIGHT = 260;
/** Rows rendered beyond the viewport on each side, so scrolling stays filled. */
const OVERSCAN = 4;

interface OrganizationSelectProps {
  id?: string;
  /** Stored brand ID (the backend's `orgCode`), not a display name. */
  value: string;
  onValueChange: (value: string) => void;
  placeholder: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
}

/** A brand row plus the React key the API does not provide. */
type BrandOption = Brand & { key: string };

/**
 * Searchable organisation picker with a virtualised list.
 *
 * The platform Select has no filter box and the directory runs to hundreds of
 * entries, so this is a small combobox built on Popover: a pinned search field,
 * a fixed-height scroll area, and only the visible slice of rows in the DOM.
 * Brands arrive in one cached fetch and are filtered client-side. The field
 * stores the brand ID (the backend's `orgCode`) and renders its localized
 * name.
 */
export function OrganizationSelect({
  id,
  value,
  onValueChange,
  placeholder,
  invalid = false,
  disabled = false,
  className,
}: OrganizationSelectProps) {
  const { t, locale } = useI18n();
  const { data: brands = [], isPending, isError, refetch } = useBrands();
  const [open, setOpen] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  // Rows carry a stable key: the brand ID when present, names otherwise.
  const allOptions = useMemo<BrandOption[]>(
    () =>
      brands.map((brand, index) => ({
        ...brand,
        key: brand.brandId || `${brand.nameEn}|${brand.nameZh}|${index}`,
      })),
    [brands],
  );
  const options = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    if (query === "") return allOptions;
    return allOptions.filter(
      (brand) =>
        brand.nameEn.toLowerCase().includes(query) ||
        brand.nameZh.toLowerCase().includes(query),
    );
  }, [allOptions, keyword]);
  const active = Math.min(activeIndex, Math.max(0, options.length - 1));

  // The active language leads; the other name stays visible as a subtitle.
  const primaryName = (brand: Brand) =>
    locale === "zh" ? brand.nameZh : brand.nameEn;
  const secondaryName = (brand: Brand) =>
    locale === "zh" ? brand.nameEn : brand.nameZh;
  // The stored value is the brand ID; the trigger reads the localized name.
  // An id missing from the directory falls back to the raw stored value.
  const selectedBrand = brands.find((brand) => brand.brandId === value);
  const selectedLabel = selectedBrand ? primaryName(selectedBrand) : value;

  // Only the rows intersecting the viewport (plus overscan) are rendered.
  // `start` is clamped so a shrinking result set cannot leave a blank frame.
  const start = Math.min(
    Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN),
    Math.max(0, options.length - 1),
  );
  const end = Math.min(
    options.length,
    Math.ceil((scrollTop + LIST_HEIGHT) / ROW_HEIGHT) + OVERSCAN,
  );
  const visible = options.slice(start, end);

  const scrollToIndex = (index: number) => {
    const list = listRef.current;
    if (!list) return;
    const top = index * ROW_HEIGHT;
    if (top < list.scrollTop) {
      list.scrollTop = top;
    } else if (top + ROW_HEIGHT > list.scrollTop + LIST_HEIGHT) {
      list.scrollTop = top + ROW_HEIGHT - LIST_HEIGHT;
    }
  };

  const moveActive = (next: number) => {
    const clamped = Math.min(Math.max(next, 0), Math.max(0, options.length - 1));
    setActiveIndex(clamped);
    scrollToIndex(clamped);
  };

  const choose = (brand: BrandOption) => {
    onValueChange(brand.brandId);
    setOpen(false);
  };

  // Every open starts from a clean query, with the selected row centred in view.
  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    setKeyword("");
    setScrollTop(0);
    if (next) {
      const index = Math.max(
        0,
        options.findIndex((brand) => brand.brandId === value),
      );
      setActiveIndex(index);
      requestAnimationFrame(() => {
        const list = listRef.current;
        if (!list) return;
        list.scrollTop = Math.max(0, index * ROW_HEIGHT - LIST_HEIGHT / 2);
        setScrollTop(list.scrollTop);
      });
    }
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // IME composition uses Enter/arrows to pick candidates — never intercept it.
    if (event.nativeEvent.isComposing) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(active + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(active - 1);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = options[active];
      if (option) choose(option);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          aria-controls={open ? listId : undefined}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn(
            "flex min-h-10 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-transparent px-3 py-2 text-left text-sm transition-colors outline-none select-none",
            "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
            "disabled:cursor-not-allowed disabled:opacity-50",
            "aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20",
            "dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
            className,
          )}
        >
          <span
            className={cn(
              "line-clamp-2 min-w-0 flex-1 break-words leading-snug",
              value === "" && "text-muted-foreground",
            )}
            title={selectedLabel || undefined}
          >
            {selectedLabel || placeholder}
          </span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) min-w-[22rem] max-w-[calc(100vw-2rem)] gap-0 overflow-hidden p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="flex items-center gap-2 border-b px-2.5">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            // Radix would focus the panel itself; the query field is the target.
            autoFocus
            value={keyword}
            onChange={(event) => {
              setKeyword(event.target.value);
              setActiveIndex(0);
              // A new result set starts at its first row, not mid-list.
              if (listRef.current) listRef.current.scrollTop = 0;
              setScrollTop(0);
            }}
            onKeyDown={onSearchKeyDown}
            placeholder={t("common.orgSearchPlaceholder")}
            role="combobox"
            aria-expanded={open}
            aria-autocomplete="list"
            aria-controls={listId}
            aria-activedescendant={
              open && options.length > 0 ? `${listId}-option-${active}` : undefined
            }
            className="h-10 w-full min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>

        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={placeholder}
          onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
          className="overflow-y-auto overscroll-contain p-1"
          style={{ height: LIST_HEIGHT }}
        >
          {isPending ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              {t("common.orgLoading")}
            </p>
          ) : isError ? (
            <div className="space-y-1 px-2 py-4 text-center text-xs">
              <p className="text-muted-foreground">{t("common.orgLoadFailed")}</p>
              <button
                type="button"
                onClick={() => void refetch()}
                className="text-primary underline-offset-2 hover:underline"
              >
                {t("common.retry")}
              </button>
            </div>
          ) : options.length === 0 ? (
            <p className="px-2 py-4 text-center text-xs text-muted-foreground">
              {t("common.orgEmpty")}
            </p>
          ) : (
            <div style={{ height: options.length * ROW_HEIGHT, position: "relative" }}>
              <div style={{ transform: `translateY(${start * ROW_HEIGHT}px)` }}>
                {visible.map((brand, offset) => {
                  const index = start + offset;
                  const selected = brand.brandId === value;
                  const primary = primaryName(brand);
                  const secondary = secondaryName(brand);
                  return (
                    <button
                      key={brand.key}
                      id={`${listId}-option-${index}`}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      tabIndex={-1}
                      onClick={() => choose(brand)}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 text-left text-sm",
                        index === active && "bg-accent text-accent-foreground",
                      )}
                      style={{ height: ROW_HEIGHT }}
                    >
                      <span
                        className="flex min-w-0 flex-1 flex-col gap-0.5 py-0.5"
                        title={
                          brand.nameZh === brand.nameEn
                            ? brand.nameEn
                            : `${brand.nameZh} / ${brand.nameEn}`
                        }
                      >
                        <span className="line-clamp-2 break-words leading-snug">
                          {primary}
                        </span>
                        {secondary !== primary ? (
                          <span className="truncate text-xs leading-snug text-muted-foreground">
                            {secondary}
                          </span>
                        ) : null}
                      </span>
                      {selected ? <Check className="size-4 shrink-0" /> : null}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
