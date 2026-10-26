"use client";

import { Check } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

/**
 * Free-text category picker with dictionary suggestions.
 *
 * The field accepts any value — the catalogue dictionary is a suggestion
 * source, not a closed enum, so an admin can introduce a new category by
 * typing it. Matching covers both the stored code and its localized label.
 */
export function CategoryCombobox({
  value,
  options,
  onChange,
  labelFor,
  placeholder,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  /** Localized label of an option; the stored value stays the raw code. */
  labelFor: (option: string) => string;
  placeholder?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  /** Text being typed; `null` = showing the localized label of the code. */
  const [text, setText] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const search = (text ?? "").trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!search) return options;
    return options.filter(
      (option) =>
        option.toLowerCase().includes(search) ||
        labelFor(option).toLowerCase().includes(search),
    );
  }, [options, search, labelFor]);

  const activeIndex = filtered.length === 0 ? -1 : Math.min(highlight, filtered.length - 1);
  const customValue = text !== null && text.trim() !== "" && filtered.length === 0;
  // The field shows what is being typed, and the localized label otherwise —
  // focusing must never swap a Chinese label for the raw code.
  const displayValue = text ?? labelFor(value);

  /** Writes a code (or a custom category) back and returns to the label view. */
  const commit = (next: string) => {
    onChange(next);
    setText(null);
    setOpen(false);
  };

  /** Resolves unsubmitted text: an exact code or label maps back to its code. */
  const commitTyped = () => {
    if (text === null) {
      setOpen(false);
      return;
    }
    const typed = text.trim();
    if (typed === "") {
      commit("");
      return;
    }
    const match = options.find(
      (option) =>
        option.toLowerCase() === typed.toLowerCase() ||
        labelFor(option).toLowerCase() === typed.toLowerCase(),
    );
    commit(match ?? typed);
  };

  const choose = (option: string) => commit(option);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true);
        // Closing the list (outside click, focus leaving) commits what was
        // typed instead of dropping it silently.
        else commitTyped();
      }}
    >
      <PopoverAnchor asChild>
        <Input
          ref={inputRef}
          value={displayValue}
          placeholder={placeholder}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          onFocus={() => {
            setHighlight(0);
            setOpen(true);
          }}
          onClick={() => {
            setOpen(true);
          }}
          onChange={(event) => {
            const next = event.target.value;
            setText(next);
            // Keep the parent draft in step while typing so the dialog's
            // unsaved-input guard sees the edit; the commit step below
            // normalizes a typed label back to its code on blur.
            onChange(next);
            setHighlight(0);
            setOpen(true);
          }}
          onBlur={() => {
            if (open) commitTyped();
          }}
          onKeyDown={(event) => {
            // IME composition uses Enter/arrows to pick candidates.
            if (event.nativeEvent.isComposing) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              setHighlight(Math.min(activeIndex + 1, filtered.length - 1));
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setHighlight(Math.max(activeIndex - 1, 0));
            } else if (event.key === "Enter" && open && activeIndex >= 0) {
              event.preventDefault();
              choose(filtered[activeIndex]);
            } else if (event.key === "Enter" && customValue) {
              event.preventDefault();
              commitTyped();
            } else if (event.key === "Escape") {
              commitTyped();
            }
          }}
        />
      </PopoverAnchor>

      <PopoverContent
        align="start"
        sideOffset={4}
        // Keep the input focused while picking, so the dialog does not blur.
        onOpenAutoFocus={(event) => event.preventDefault()}
        onPointerDownOutside={(event) => {
          // Clicking the field itself must not dismiss and instantly reopen
          // the list (a visible flicker); only touches elsewhere dismiss it.
          if (inputRef.current?.contains(event.target as Node)) {
            event.preventDefault();
          }
        }}
        className="w-72 gap-1 p-1"
      >
        {customValue ? (
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => commit((text ?? "").trim())}
          >
            {t("admin.content.categoryCustom", { value: (text ?? "").trim() })}
          </button>
        ) : filtered.length === 0 ? (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">
            {t("admin.content.categoryNoMatch")}
          </p>
        ) : (
          <ul role="listbox" className="max-h-56 overflow-y-auto">
            {filtered.map((option, index) => {
              const selected = option === value;
              return (
                <li key={option}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={selected}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                      index === activeIndex ? "bg-accent" : "hover:bg-accent/60",
                    )}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => choose(option)}
                  >
                    <span className="min-w-0 flex-1 truncate">{labelFor(option)}</span>
                    {option !== labelFor(option) ? (
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {option}
                      </span>
                    ) : null}
                    {selected ? <Check className="size-3.5 shrink-0" /> : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
