/**
 * Turns the rich-text editor's markup into portable HTML.
 *
 * The editor is Quill, and Quill writes lists in a shape only Quill can read:
 * both bullets and numbers come out as `<ol><li data-list="bullet">`, with the
 * marker drawn by `li[data-list=bullet]::before` in Quill's own stylesheet and
 * nesting expressed as a `ql-indent-N` class. Our detail pages deliberately do
 * not ship Quill's stylesheet, and the server-side sanitiser drops `data-list`
 * (it only keeps an allow-list of attributes) — so saving Quill's raw output
 * would turn every bullet list into a numbered one on the published page.
 *
 * `normalizeRichTextHtml` rebuilds the editor's markup into plain
 * `<ul>` / `<ol>` nesting that any renderer understands, strips the `ql-*`
 * styling classes, and converts Quill's code block into a real `<pre>`.
 *
 * It is idempotent: normalising already-normal markup returns it unchanged,
 * which is what lets the editor treat its own output as a controlled value
 * without a feedback loop.
 */

/** Matches the `ql-indent-2` style class Quill puts on nested list items. */
const INDENT_CLASS = /(?:^|\s)ql-indent-(\d+)(?:\s|$)/

/** Marker Quill injects inside a list item so the bullet can be styled. */
const UI_MARKER_CLASS = 'ql-ui'

export function normalizeRichTextHtml(html: string): string {
  const source = html ?? ''
  if (source.trim() === '') return ''
  // Server-side render passes never reach here; the editor only mounts in the
  // browser. Returning the input untouched keeps this function total.
  if (typeof DOMParser === 'undefined') return source

  const doc = new DOMParser().parseFromString(`<body>${source}</body>`, 'text/html')
  const body = doc.body

  // Note for anyone tempted to guard on `doc.defaultView`: a document built by
  // `DOMParser` has no browsing context, so `defaultView` is `null`. Bailing out
  // on that would skip the list rebuild below while leaving the cleanup pass
  // running — which silently stores bullets as `<ol>`, i.e. renders every
  // bullet list as "1. 2. 3.". Everything used here is on `Document` itself.
  //
  // Ordered first: rebuild reads `ql-indent-N`, which cleanup removes.
  for (const list of Array.from(body.querySelectorAll('ol, ul'))) {
    if (list.querySelector(':scope > li[data-list]')) rebuildList(list, doc)
  }
  for (const container of Array.from(body.querySelectorAll('.ql-code-block-container'))) {
    flattenCodeBlock(container, doc)
  }
  cleanup(body)

  return body.innerHTML
}

/** Nested `<ul>`/`<ol>` rebuilt in one pass over Quill's flat item list. */
function rebuildList(container: Element, doc: Document): void {
  const parent = container.parentNode
  if (!parent) return

  const items = Array.from(container.children).filter((child) => child.tagName === 'LI')
  if (items.length === 0) return

  const output = doc.createDocumentFragment()
  const stack: Array<{ el: Element; level: number; kind: 'ul' | 'ol' }> = []

  for (const item of items) {
    // Read before cleanup strips the class that carries them.
    const kind: 'ul' | 'ol' = item.getAttribute('data-list') === 'ordered' ? 'ol' : 'ul'
    const level = Number(INDENT_CLASS.exec(item.getAttribute('class') ?? '')?.[1] ?? 0)

    // Close every list that this item cannot belong to: a shallower item ends
    // the deeper ones, and a switch between bullets and numbers ends the list
    // at the same depth.
    while (stack.length > 0) {
      const top = stack[stack.length - 1]
      if (top.level > level || (top.level === level && top.kind !== kind)) stack.pop()
      else break
    }

    const top = stack[stack.length - 1]
    let target: Element
    if (!top) {
      target = doc.createElement(kind)
      output.appendChild(target)
      stack.push({ el: target, level, kind })
    } else if (level > top.level) {
      // Deeper than its parent: the sublist hangs off the previous item. With
      // no previous item there is nothing to hang off, so it starts a new list.
      const anchor = top.el.lastElementChild
      if (anchor) {
        target = doc.createElement(kind)
        anchor.appendChild(target)
        stack.push({ el: target, level, kind })
      } else {
        stack.pop()
        target = doc.createElement(kind)
        output.appendChild(target)
        stack.push({ el: target, level, kind })
      }
    } else {
      target = top.el
    }

    target.appendChild(item)
  }

  parent.replaceChild(output, container)
}

/** `ql-code-block-container` → a single `<pre>` with newline-separated lines. */
function flattenCodeBlock(container: Element, doc: Document): void {
  const lines = Array.from(container.querySelectorAll('.ql-code-block')).map(
    (line) => line.textContent ?? '',
  )
  const pre = doc.createElement('pre')
  const code = doc.createElement('code')
  code.textContent = lines.join('\n')
  pre.appendChild(code)
  container.replaceWith(pre)
}

/** Drops everything Quill-only from the tree: markers, classes, attributes. */
function cleanup(root: Element): void {
  for (const marker of Array.from(root.querySelectorAll(`.${UI_MARKER_CLASS}`))) {
    marker.remove()
  }
  for (const el of Array.from(root.querySelectorAll('*'))) {
    el.removeAttribute('data-list')
    el.removeAttribute('contenteditable')
    el.removeAttribute('spellcheck')

    const kept = (el.getAttribute('class') ?? '')
      .split(/\s+/)
      .filter((name) => name !== '' && !name.startsWith('ql-'))
    if (kept.length > 0) el.setAttribute('class', kept.join(' '))
    else el.removeAttribute('class')
  }
}
