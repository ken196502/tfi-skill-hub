/**
 * Allow-list HTML sanitiser for skill detail pages.
 *
 * Upstream rendered SKILL.md with `marked` + `dompurify`. This build renders
 * Markdown by escaping first (`lib/markdown.ts`), which is safe but means a
 * publisher cannot use real markup. Detail HTML is the escape hatch: it is
 * stored and rendered as HTML, so it needs an actual sanitiser — and, because
 * the project keeps zero runtime dependencies, that sanitiser lives here rather
 * than being pulled from npm.
 *
 * The approach is allow-list and reconstructive: the input is tokenised, every
 * tag and attribute is screened against a fixed vocabulary, and the output is
 * re-emitted from scratch. Nothing is copied through verbatim, so a malformed
 * or hostile fragment cannot smuggle markup past the filter.
 *
 * The function is pure and dependency-free on purpose: the server runs it
 * before storing, and the page runs it again before rendering, so content that
 * reached the database by any other route is still cleaned at display time.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/** Tags that survive, with their children. */
const ALLOWED_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'p', 'br', 'hr', 'blockquote', 'pre', 'code',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark', 'small', 'sub', 'sup',
  'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'colgroup', 'col',
  'div', 'span', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav',
  'abbr', 'kbd', 'samp', 'var', 'time', 'wbr',
])

/** Tags whose element — and everything inside it — is dropped. */
const DROP_CONTENT_TAGS = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'applet', 'frame', 'frameset',
  'template', 'noscript', 'svg', 'math', 'link', 'meta', 'base', 'form',
  'input', 'button', 'select', 'textarea', 'option', 'label', 'fieldset',
  'audio', 'video', 'source', 'track', 'canvas', 'map', 'area', 'portal',
])

/** Tags with no closing tag. */
const VOID_TAGS = new Set(['br', 'hr', 'img', 'wbr', 'col'])

/** Per-tag attribute allow-list; `*` applies to every allowed tag. */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  '*': new Set(['class', 'lang', 'dir', 'title']),
  a: new Set(['href', 'target', 'rel']),
  img: new Set(['src', 'alt', 'width', 'height', 'loading']),
  td: new Set(['colspan', 'rowspan']),
  th: new Set(['colspan', 'rowspan', 'scope']),
  ol: new Set(['start']),
  col: new Set(['span']),
}

/** Tags that close an open paragraph when they start. */
const BLOCK_TAGS = new Set([
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'blockquote', 'pre', 'ul', 'ol',
  'table', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside',
  'nav', 'figure', 'dl', 'hr',
])

/** Control characters, NBSP and zero-width code points — URL obfuscation tools. */
const URL_NOISE = /[\u0000-\u0020\u007f-\u00a0\u200b-\u200f\u2028\u2029]/g

const MAX_OUTPUT_LENGTH = 512 * 1024

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Decodes entities in an attribute value before it is judged. Hostile input
 * hides schemes as `java&#115;cript:` and similar, so the check must run on the
 * decoded text; the value is re-escaped when emitted.
 */
function decodeEntities(input: string): string {
  if (!input.includes('&')) return input
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  }
  return input
    .replace(/&#x([0-9a-f]+);?/gi, (_m, hex) => safeChar(parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_m, dec) => safeChar(parseInt(dec, 10)))
    .replace(/&([a-z]+);?/gi, (m, name: string) => named[name.toLowerCase()] ?? m)
}

function safeChar(code: number): string {
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return ''
  if (code < 0x20 || code === 0x7f) return ''
  try {
    return String.fromCodePoint(code)
  } catch {
    return ''
  }
}

/**
 * Keeps http(s), mailto, tel and site-relative targets; everything else —
 * `javascript:`, `data:`, `vbscript:`, `file:` — becomes `#`.
 *
 * Exception: inline raster images (`data:image/…;base64`) are allowed so detail
 * pages can embed screenshots without hosting. SVG data URIs stay blocked —
 * SVG can carry scripts when loaded outside an `<img>` context.
 */
const SAFE_DATA_IMAGE = /^data:image\/(png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i

function safeUrl(raw: string, tag = '', attr = ''): string {
  const value = decodeEntities(raw).replace(URL_NOISE, '').trim()
  if (value === '') return '#'
  if (tag === 'img' && attr === 'src' && SAFE_DATA_IMAGE.test(value)) return value
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    return /^(https?:|mailto:|tel:)/i.test(value) ? value : '#'
  }
  if (/^(#|\/|\.\/|\.\.\/)/.test(value)) return value
  // A bare path or anchor without a leading slash is still fine.
  if (/^[\w.-]+(\/|#|$)/.test(value) && !value.includes(':')) return value
  return '#'
}

/** `class` values are restricted so they cannot smuggle CSS or quotes. */
function safeClass(raw: string): string {
  return decodeEntities(raw)
    .split(/\s+/)
    .filter((token) => /^[A-Za-z0-9_-]{1,64}$/.test(token))
    .slice(0, 8)
    .join(' ')
}

// ─────────────────────────────────────────────────────────────────────────────
// Attributes
// ─────────────────────────────────────────────────────────────────────────────

interface Attr {
  name: string
  value: string
}

function parseAttrs(raw: string): Attr[] {
  const attrs: Attr[] = []
  const re = /([A-Za-z_:][-\w:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    const name = m[1].toLowerCase()
    const value = m[3] ?? m[4] ?? m[5] ?? ''
    if (attrs.some((a) => a.name === name)) continue
    attrs.push({ name, value })
  }
  return attrs
}

function isUrlAttr(tag: string, name: string): boolean {
  return (tag === 'a' && name === 'href') || (tag === 'img' && name === 'src')
}

function renderAttrs(tag: string, attrs: Attr[]): string {
  const perTag = ALLOWED_ATTRS[tag]
  const globalAttrs = ALLOWED_ATTRS['*']
  const out: string[] = []

  for (const attr of attrs) {
    // Event handlers never survive, whatever element carries them.
    if (attr.name.startsWith('on')) continue
    if (!perTag?.has(attr.name) && !globalAttrs.has(attr.name)) continue

    if (isUrlAttr(tag, attr.name)) {
      out.push(`${attr.name}="${escapeHtml(safeUrl(attr.value, tag, attr.name))}"`)
      continue
    }
    if (attr.name === 'class') {
      const value = safeClass(attr.value)
      if (value !== '') out.push(`class="${escapeHtml(value)}"`)
      continue
    }
    if (attr.name === 'target') {
      if (attr.value === '_blank') out.push('target="_blank"')
      continue
    }
    if (attr.name === 'rel') {
      const value = safeClass(attr.value)
      if (value !== '') out.push(`rel="${escapeHtml(value)}"`)
      continue
    }
    if (attr.name === 'title' || attr.name === 'alt') {
      out.push(`${attr.name}="${escapeHtml(decodeEntities(attr.value))}"`)
      continue
    }
    if (attr.name === 'lang') {
      const value = decodeEntities(attr.value).trim()
      if (/^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(value)) {
        out.push(`lang="${escapeHtml(value)}"`)
      }
      continue
    }
    if (attr.name === 'dir') {
      const value = decodeEntities(attr.value).trim().toLowerCase()
      if (value === 'ltr' || value === 'rtl' || value === 'auto') out.push(`dir="${value}"`)
      continue
    }
    if (attr.name === 'scope') {
      const value = decodeEntities(attr.value).trim().toLowerCase()
      if (['row', 'col', 'rowgroup', 'colgroup'].includes(value)) out.push(`scope="${value}"`)
      continue
    }
    if (attr.name === 'loading') {
      const value = decodeEntities(attr.value).trim().toLowerCase()
      if (value === 'lazy' || value === 'eager') out.push(`loading="${value}"`)
      continue
    }
    if (attr.name === 'colspan' || attr.name === 'rowspan' || attr.name === 'span' || attr.name === 'start') {
      const n = Number.parseInt(decodeEntities(attr.value).trim(), 10)
      if (Number.isFinite(n) && n > 0 && n <= 1000) out.push(`${attr.name}="${n}"`)
      continue
    }
    if (attr.name === 'width' || attr.name === 'height') {
      const n = Number.parseInt(decodeEntities(attr.value).trim(), 10)
      if (Number.isFinite(n) && n > 0 && n <= 4096) out.push(`${attr.name}="${n}"`)
    }
  }

  // A link opening a new tab always carries the noopener/noreferrer pair.
  if (tag === 'a' && out.some((a) => a.startsWith('target="_blank"')) && !out.some((a) => a.startsWith('rel='))) {
    out.push('rel="noopener noreferrer"')
  }
  return out.join(' ')
}

// ─────────────────────────────────────────────────────────────────────────────
// Sanitiser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cleans an untrusted HTML fragment.
 *
 * The result is always well-formed: tags are re-emitted from the token stream
 * and whatever is still open at the end gets closed, so a truncated fragment
 * cannot leak its markup into the surrounding page.
 */
export function sanitizeHtml(input: string): string {
  const source = input ?? ''
  const out: string[] = []
  const open: string[] = []
  // Element being discarded together with its text, plus its nesting depth.
  let dropTag: string | null = null
  let dropDepth = 0
  let i = 0

  const closeThrough = (tag: string) => {
    const index = open.lastIndexOf(tag)
    if (index === -1) return
    for (let j = open.length - 1; j >= index; j -= 1) out.push(`</${open[j]}>`)
    open.length = index
  }

  while (i < source.length) {
    const lt = source.indexOf('<', i)

    if (lt === -1) {
      if (dropTag === null && i < source.length) out.push(escapeText(source.slice(i)))
      break
    }
    if (lt > i && dropTag === null) out.push(escapeText(source.slice(i, lt)))

    // Comments, doctypes and CDATA are dropped outright.
    if (source.startsWith('<!--', lt)) {
      const end = source.indexOf('-->', lt + 4)
      i = end === -1 ? source.length : end + 3
      continue
    }
    if (source.startsWith('<!', lt) || source.startsWith('<?', lt)) {
      const end = source.indexOf('>', lt)
      i = end === -1 ? source.length : end + 1
      continue
    }

    // Read to the next `>` that is not inside a quoted attribute value.
    let j = lt + 1
    let quote = ''
    let end = -1
    while (j < source.length) {
      const ch = source[j]
      if (quote !== '') {
        if (ch === quote) quote = ''
      } else if (ch === '"' || ch === "'") {
        quote = ch
      } else if (ch === '>') {
        end = j
        break
      }
      j += 1
    }
    if (end === -1) {
      // Unterminated tag: the rest is text.
      if (dropTag === null) out.push(escapeText(source.slice(lt)))
      break
    }

    const raw = source.slice(lt + 1, end)
    i = end + 1

    // Not a tag at all (e.g. `a < b`): emit the `<` and move on by one.
    if (!/^[A-Za-z/]/.test(raw)) {
      if (dropTag === null) out.push('&lt;')
      continue
    }

    if (raw.startsWith('/')) {
      const tag = raw.slice(1).trim().toLowerCase().replace(/\/+$/, '')
      if (dropTag !== null) {
        if (tag === dropTag) {
          dropDepth -= 1
          if (dropDepth <= 0) dropTag = null
        }
        continue
      }
      if (ALLOWED_TAGS.has(tag)) closeThrough(tag)
      continue
    }

    const nameMatch = /^([A-Za-z][-\w]*)/.exec(raw)
    if (!nameMatch) continue
    const tag = nameMatch[1].toLowerCase()
    const attrsRaw = raw.slice(nameMatch[0].length)
    const isVoid = VOID_TAGS.has(tag)
    const selfClosing = /\/\s*$/.test(attrsRaw)

    if (dropTag !== null) {
      if (tag === dropTag && !isVoid && !selfClosing) dropDepth += 1
      continue
    }

    if (DROP_CONTENT_TAGS.has(tag)) {
      if (!isVoid && !selfClosing) {
        dropTag = tag
        dropDepth = 1
      }
      continue
    }

    if (!ALLOWED_TAGS.has(tag)) {
      // Unknown tags are dropped, their text content is kept.
      continue
    }

    if (BLOCK_TAGS.has(tag) && open[open.length - 1] === 'p') {
      out.push('</p>')
      open.pop()
    }

    const attrs = renderAttrs(tag, parseAttrs(attrsRaw))
    if (isVoid || selfClosing) {
      out.push(attrs === '' ? `<${tag} />` : `<${tag} ${attrs} />`)
    } else {
      out.push(attrs === '' ? `<${tag}>` : `<${tag} ${attrs}>`)
      open.push(tag)
    }
  }

  for (let j = open.length - 1; j >= 0; j -= 1) out.push(`</${open[j]}>`)

  return out.join('').slice(0, MAX_OUTPUT_LENGTH)
}

/**
 * Text outside tags. Entities already present in the source (`&lt;`, `&amp;`)
 * are preserved as-is rather than double-encoded, so an author's own escaping
 * renders as they expect; a bare `&` is encoded.
 */
function escapeText(text: string): string {
  return text
    .replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** `true` when nothing but tags and whitespace would be rendered. */
export function isBlankHtml(input: string): boolean {
  const text = sanitizeHtml(input)
    // An <img> is content even without any text around it — a detail body made
    // purely of screenshots must not be treated as blank.
    .replace(/<img\b[^>]*>/gi, 'x')
    .replace(/<[^>]*>/g, '')
    .replace(/&[a-z]+;/gi, '')
    .trim()
  return text === ''
}
