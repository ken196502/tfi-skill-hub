/**
 * A searchable dropdown that can also take free text.
 *
 * Renders as a text box that filters its own options as you type, with the
 * option list dropping below on focus. Typing and browsing are both available
 * at once, which a native `<select>` cannot do — with thirty-odd countries on
 * the sign-up form, scrolling a picker to find one is the slow path.
 *
 * With `allowCustom` the field stops being a closed set: anything typed can be
 * committed as a new value. The typed text is offered as its own highlighted row
 * at the top of the list ("use this"), so picking something new is a deliberate
 * choice rather than a side effect of tabbing away. Without the flag only listed
 * options can be picked, which is what a country or region field needs.
 *
 * Keyboard behaviour follows the ARIA combobox pattern: arrows move the active
 * row, Enter and Tab commit it, Escape closes the list and puts the current
 * value back, and blur commits what was typed. The listbox is referenced through
 * `aria-controls`/`aria-activedescendant` rather than moving DOM focus into the
 * options, so the text box keeps the caret and typing still filters.
 */

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useLang, useT } from '../lib/i18n'

export interface ComboboxOption {
  value: string
  /** Label in the active language; what the user sees and types into. */
  label: string
  /** Extra terms that should also match — an English name while in Chinese, etc. */
  keywords?: string
}

/**
 * A line in the dropdown. Either an existing option (`option`) or, when the
 * field accepts free text, the text the user just typed (`custom`).
 */
interface Row {
  key: string
  label: string
  option?: ComboboxOption
  custom?: string
}

export function Combobox({
  value,
  options,
  onChange,
  placeholder,
  invalid = false,
  id,
  emptyLabel,
  listLabel,
  isDisabled,
  allowCustom = false,
}: {
  value: string
  options: ComboboxOption[]
  onChange: (value: string) => void
  placeholder?: string
  invalid?: boolean
  id?: string
  emptyLabel?: string
  /** Accessible name for the listbox; describes what the options are. */
  listLabel?: string
  /** Disabled options are shown but cannot be committed. */
  isDisabled?: (value: string) => boolean
  /** Let the user commit text that is not in `options`. */
  allowCustom?: boolean
}) {
  const t = useT()
  const { lang } = useLang()
  const generatedId = useId()
  const inputId = id ?? generatedId
  const listId = `${inputId}-list`

  const [open, setOpen] = useState(false)
  /** What the user typed. Null while the box shows the current value. */
  const [query, setQuery] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  /** Set on blur so the "close and commit" click handler can see it. */
  const closingRef = useRef(false)

  const selected = options.find((option) => option.value === value) ?? null
  // With a free-text field the value need not be one of the options, so fall
  // back to showing it verbatim rather than blanking the box.
  const shown = query === null ? (selected?.label ?? (allowCustom ? value : '')) : query

  const matches = useMemo(() => {
    const needle = (query ?? '').trim().toLowerCase()
    if (needle === '') return options
    return options.filter((option) =>
      `${option.label} ${option.keywords ?? ''} ${option.value}`.toLowerCase().includes(needle),
    )
  }, [options, query])

  /**
   * The dropdown as displayed: the typed text first when it is a new value,
   * then the matching options in the order they were given.
   */
  const rows = useMemo<Row[]>(() => {
    const typed = (query ?? '').trim()
    const exact = matches.some(
      (option) => option.label.toLowerCase() === typed.toLowerCase(),
    )
    const custom: Row[] =
      allowCustom && typed !== '' && !exact
        ? [{ key: '__custom__', label: t(`使用「${typed}」`, `Use "${typed}"`), custom: typed }]
        : []
    return [...custom, ...matches.map((option) => ({
      key: option.value,
      label: option.label,
      option,
    }))]
    // `t` is a stable per-language function; `matches` already tracks the query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowCustom, matches, query, lang])

  // Close when the click lands anywhere else. `pointerdown` rather than `click`
  // so it fires before a click on another option can open its own list.
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  /*
   * Escape has to be taken in the capture phase, and stopped there.
   *
   * While the list is open, Escape means "put the list away" — but a dialog
   * wrapping this field listens for the same key on `document`, and a listener
   * registered earlier (the dialog mounts first) runs before React's own
   * handler, so stopping propagation inside `onKeyDown` arrives too late and the
   * whole dialog closes. Capturing on `document` runs before any bubble-phase
   * listener regardless of registration order.
   */
  useEffect(() => {
    if (!open) return
    const onKeyDownCapture = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || !rootRef.current?.contains(event.target as Node)) return
      event.preventDefault()
      event.stopPropagation()
      closingRef.current = true
      setQuery(null)
      setOpen(false)
    }
    document.addEventListener('keydown', onKeyDownCapture, true)
    return () => document.removeEventListener('keydown', onKeyDownCapture, true)
  }, [open])

  /** Reducer that stays out of the render path. */
  const close = () => {
    setQuery(null)
    setOpen(false)
    inputRef.current?.blur()
  }

  const commit = (row: Row | undefined) => {
    if (!row) return
    if (row.custom !== undefined) {
      onChange(row.custom)
      close()
      return
    }
    const option = row.option
    if (!option || (isDisabled && isDisabled(option.value))) return
    onChange(option.value)
    close()
  }

  const openList = () => {
    closingRef.current = false
    setOpen(true)
    // Select the current value: opening the list usually means "I want to
    // change this", so the next character should replace it rather than be
    // appended to it.
    inputRef.current?.select()
    // Start the highlight on the current selection so Enter re-picks it.
    const index = rows.findIndex((row) => row.option?.value === value)
    setActiveIndex(index >= 0 ? index : 0)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        openList()
        return
      }
      const step = event.key === 'ArrowDown' ? 1 : -1
      // Wrap around, and stay put on an empty list rather than cycling.
      const next = activeIndex + step
      setActiveIndex(rows.length === 0 ? 0 : (next + rows.length) % rows.length)
      return
    }
    if (event.key === 'Enter') {
      if (!open) {
        openList()
        return
      }
      event.preventDefault()
      commit(rows[activeIndex])
      return
    }
    if (event.key === 'Tab') {
      // Tab moves on to the next field: commit what is highlighted rather than
      // leaving a typed-but-uncommitted filter behind.
      if (open) commit(rows[activeIndex])
    }
  }

  const onBlur = () => {
    if (closingRef.current) {
      closingRef.current = false
      return
    }
    setOpen(false)
    if (query === null) return
    const trimmed = query.trim()
    const exact = rows.find(
      (row) => row.option !== undefined && row.option.label.toLowerCase() === trimmed.toLowerCase(),
    )
    if (exact) commit(exact)
    // Free text commits whatever was typed; a closed field drops the filter and
    // keeps the value it already had.
    else if (allowCustom && trimmed !== '') onChange(trimmed)
    setQuery(null)
  }

  const activeId = open && rows[activeIndex] ? `${listId}-${rows[activeIndex].key}` : undefined
  const canClear = allowCustom ? value !== '' : selected !== null

  return (
    <div className="combo" ref={rootRef}>
      <div className="combo-control">
        <input
          id={inputId}
          ref={inputRef}
          className={`form-input combo-input${allowCustom ? ' combo-input-free' : ''}${invalid ? ' field-invalid' : ''}`}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          autoComplete="off"
          value={shown}
          placeholder={placeholder}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveIndex(0)
            if (!open) setOpen(true)
          }}
          onFocus={openList}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
        />
        {/* A clear affordance only once something is chosen — otherwise it sits
            there inviting a click on an empty form. */}
        {canClear && (
          <button
            className="combo-clear"
            type="button"
            aria-label={t('清除选择', 'Clear selection')}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange('')
              setQuery(null)
              setOpen(false)
              inputRef.current?.focus()
            }}
          >
            ×
          </button>
        )}
        <button
          className="combo-toggle"
          type="button"
          aria-label={open ? t('收起选项', 'Hide options') : t('展开选项', 'Show options')}
          tabIndex={-1}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            inputRef.current?.focus()
            if (open) setOpen(false)
            else openList()
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className={open ? 'combo-caret open' : 'combo-caret'}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>

      {open && (
        <ul
          className="combo-list"
          id={listId}
          role="listbox"
          aria-label={listLabel ?? t('可选项', 'Options')}
        >
          {rows.length === 0 && (
            <li className="combo-empty">{emptyLabel ?? t('没有匹配的地区', 'No matching entries')}</li>
          )}
          {rows.map((row, index) => {
            const disabled =
              !row.custom && row.option !== undefined && isDisabled
                ? isDisabled(row.option.value)
                : false
            return (
              <li
                key={row.key}
                id={`${listId}-${row.key}`}
                role="option"
                aria-selected={row.option?.value === value}
                aria-disabled={disabled || undefined}
                className={[
                  'combo-option',
                  index === activeIndex ? 'active' : '',
                  row.option?.value === value ? 'selected' : '',
                  row.custom !== undefined ? 'combo-option-new' : '',
                  disabled ? 'disabled' : '',
                ].filter(Boolean).join(' ')}
                // pointerdown, not click: it fires before the input's blur, so
                // the commit is not undone by the blur handler reverting the
                // filter to the old selection.
                onMouseDown={(event) => {
                  event.preventDefault()
                  closingRef.current = true
                  commit(row)
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {row.label}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}