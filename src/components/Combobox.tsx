/**
 * A searchable dropdown.
 *
 * Renders as a text box that filters its own options as you type, with the
 * option list dropping below on focus. Typing and browsing are both available
 * at once, which a native `<select>` cannot do — with thirty-odd countries on
 * the sign-up form, scrolling a picker to find one is the slow path.
 *
 * Keyboard behaviour follows the ARIA combobox pattern: arrows move the active
 * option, Enter and Tab commit it, Escape closes the list and keeps whatever was
 * typed, and blur commits a matching entry. The listbox is referenced through
 * `aria-controls`/`aria-activedescendant` rather than moving DOM focus into the
 * options, so the text box keeps the caret and typing still filters.
 */

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useT } from '../lib/i18n'

export interface ComboboxOption {
  value: string
  /** Label in the active language; what the user sees and types into. */
  label: string
  /** Extra terms that should also match — an English name while in Chinese, etc. */
  keywords?: string
}

export function Combobox({
  value,
  options,
  onChange,
  placeholder,
  invalid = false,
  id,
  emptyLabel,
  /** Disabled options are shown but cannot be committed. */
  isDisabled,
}: {
  value: string
  options: ComboboxOption[]
  onChange: (value: string) => void
  placeholder?: string
  invalid?: boolean
  id?: string
  emptyLabel?: string
  isDisabled?: (value: string) => boolean
}) {
  const t = useT()
  const generatedId = useId()
  const inputId = id ?? generatedId
  const listId = `${inputId}-list`

  const [open, setOpen] = useState(false)
  /** What the user typed. Null while the box shows the selected label. */
  const [query, setQuery] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  /** Set on blur so the "close and commit" click handler can see it. */
  const closingRef = useRef(false)

  const selected = options.find((option) => option.value === value) ?? null
  const shown = query === null ? selected?.label ?? '' : query

  const matches = useMemo(() => {
    const needle = (query ?? '').trim().toLowerCase()
    if (needle === '') return options
    return options.filter((option) =>
      `${option.label} ${option.keywords ?? ''} ${option.value}`.toLowerCase().includes(needle),
    )
  }, [options, query])

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

  /** Reducer that stays out of the render path. */
  const commit = (option: ComboboxOption | undefined) => {
    if (!option || (isDisabled && isDisabled(option.value))) return
    onChange(option.value)
    setQuery(null)
    setOpen(false)
    inputRef.current?.blur()
  }

  const openList = () => {
    closingRef.current = false
    setOpen(true)
    // Start the highlight on the current selection so Enter re-picks it.
    const index = matches.findIndex((option) => option.value === value)
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
      setActiveIndex(matches.length === 0 ? 0 : (next + matches.length) % matches.length)
      return
    }
    if (event.key === 'Enter') {
      if (!open) {
        openList()
        return
      }
      event.preventDefault()
      commit(matches[activeIndex])
      return
    }
    if (event.key === 'Escape') {
      if (!open) return
      // Escape abandons the filter and puts the selected label back.
      event.preventDefault()
      event.stopPropagation()
      closingRef.current = true
      setQuery(null)
      setOpen(false)
      return
    }
    if (event.key === 'Tab') {
      // Tab moves on to the next field: commit what is highlighted rather than
      // leaving a typed-but-uncommitted filter behind.
      if (open) commit(matches[activeIndex])
    }
  }

  const onBlur = () => {
    if (closingRef.current) {
      closingRef.current = false
      return
    }
    setOpen(false)
    if (query !== null) {
      const trimmed = query.trim()
      const exact = matches.find(
        (option) => option.label.toLowerCase() === trimmed.toLowerCase(),
      )
      if (exact) commit(exact)
      else setQuery(null)
    }
  }

  const activeId = open && matches[activeIndex] ? `${listId}-${matches[activeIndex].value}` : undefined

  return (
    <div className="combo" ref={rootRef}>
      <div className="combo-control">
        <input
          id={inputId}
          ref={inputRef}
          className={`form-input combo-input${invalid ? ' field-invalid' : ''}`}
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
        {selected && (
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
        <ul className="combo-list" id={listId} role="listbox" aria-label={t('国家或地区', 'Country or region')}>
          {matches.length === 0 && (
            <li className="combo-empty">{emptyLabel ?? t('没有匹配的地区', 'No matching entries')}</li>
          )}
          {matches.map((option, index) => {
            const disabled = isDisabled ? isDisabled(option.value) : false
            return (
              <li
                key={option.value}
                id={`${listId}-${option.value}`}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={disabled || undefined}
                className={`combo-option${index === activeIndex ? ' active' : ''}${option.value === value ? ' selected' : ''}${disabled ? ' disabled' : ''}`}
                // pointerdown, not click: it fires before the input's blur, so
                // the commit is not undone by the blur handler reverting the
                // filter to the old selection.
                onMouseDown={(event) => {
                  event.preventDefault()
                  closingRef.current = true
                  commit(option)
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                {option.label}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
