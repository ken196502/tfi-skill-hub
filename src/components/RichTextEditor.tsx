import { useEffect, useRef, useState } from 'react'
import type Quill from 'quill'
import { normalizeRichTextHtml } from '../lib/richText'

/**
 * Rich-text field backed by Quill.
 *
 * Quill is a browser-only library — it reaches for `document` while
 * initialising — so it is imported dynamically once the field is on screen
 * rather than at module scope. Nothing here runs during a server render, which
 * also means the field can sit inside a dialog that only ever opens on a click.
 *
 * The stored value is *not* Quill's `innerHTML`: that carries list markup only
 * Quill understands. Everything leaving this component goes through
 * `normalizeRichTextHtml` first — see `lib/richText.ts`.
 */

/** Deliberately small: headings, inline emphasis, lists, quote, code, links. */
const TOOLBAR = [
  [{ header: [1, 2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['blockquote', 'code-block', 'link'],
  ['clean'],
]

/** Anything not listed here is dropped on input, keeping the output predictable. */
const FORMATS = [
  'header',
  'bold',
  'italic',
  'underline',
  'strike',
  'list',
  'indent',
  'blockquote',
  'code-block',
  'link',
]

const STYLE_ELEMENT_ID = 'quill-snow-styles'

/**
 * Quill's stylesheet ships as a file, but this chunk is loaded on demand — so
 * it is inlined into a `<style>` tag instead, which lands with the code and
 * cannot flash unstyled.
 */
function injectStyles(css: string): void {
  if (document.getElementById(STYLE_ELEMENT_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ELEMENT_ID
  style.textContent = css
  document.head.appendChild(style)
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const quillRef = useRef<Quill | null>(null)
  const onChangeRef = useRef(onChange)
  const emittedRef = useRef<string | null>(null)
  const valueRef = useRef(value)
  const placeholderRef = useRef(placeholder)
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')

  onChangeRef.current = onChange
  valueRef.current = value
  placeholderRef.current = placeholder

  useEffect(() => {
    let disposed = false
    let created: Quill | null = null

    const emit = () => {
      const html = normalizeRichTextHtml(created?.root.innerHTML ?? '')
      emittedRef.current = html
      onChangeRef.current(html)
    }

    void (async () => {
      try {
        const [quillModule, cssModule] = await Promise.all([
          import('quill'),
          import('quill/dist/quill.snow.css?inline'),
        ])
        if (disposed || !hostRef.current) return

        injectStyles(cssModule.default)
        const editor = new quillModule.default(hostRef.current, {
          theme: 'snow',
          placeholder: placeholderRef.current,
          modules: { toolbar: TOOLBAR },
          formats: FORMATS,
        })
        created = editor
        // `silent`: seeding the field is not a user edit, so it must not call
        // back into the form and mark it dirty.
        editor.clipboard.dangerouslyPasteHTML(valueRef.current ?? '', 'silent')
        emittedRef.current = valueRef.current ?? ''
        editor.on('text-change', emit)

        quillRef.current = editor
        setStatus('ready')
      } catch (error) {
        if (disposed) return
        console.error('rich text editor could not be loaded', error)
        setStatus('unavailable')
      }
    })()

    return () => {
      disposed = true
      if (created) created.off('text-change', emit)
      quillRef.current = null
    }
  }, [])

  // Adopt a value the parent swapped in — the dialog moving to another record,
  // or a reset after saving. Skipped when the value is just an echo of what the
  // field already emitted, which is what keeps this from looping.
  useEffect(() => {
    const editor = quillRef.current
    if (status !== 'ready' || !editor) return
    const next = value ?? ''
    if (emittedRef.current === next) return
    if (normalizeRichTextHtml(editor.root.innerHTML) === next) {
      emittedRef.current = next
      return
    }
    editor.clipboard.dangerouslyPasteHTML(next, 'silent')
    emittedRef.current = next
  }, [value, status])

  // Quill failed to load (offline chunk, blocked script): fall back to editing
  // the markup directly rather than leaving the form unusable.
  if (status === 'unavailable') {
    return (
      <textarea
        className="form-input rich-text-fallback"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
      />
    )
  }

  return (
    <div className="rich-text-editor">
      <div ref={hostRef} className="rich-text-host" />
      {status === 'loading' && <div className="rich-text-loading" aria-hidden="true" />}
    </div>
  )
}
