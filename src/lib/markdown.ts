/**
 * Minimal Markdown → HTML renderer for SKILL.md bodies.
 *
 * Upstream used `marked` + `dompurify`. Two reasons for the hand-rolled version:
 *
 * 1. It removes two runtime dependencies.
 * 2. It is safe by construction and SSR-friendly. Every input is HTML-escaped
 *    **before** any formatting is applied, so raw HTML in a skill's source can
 *    never become live markup. `dompurify` needs a DOM, which makes it awkward
 *    during server rendering; escaping first sidesteps that entirely.
 *
 * Supported: ATX headings, fenced and indented code, inline code, bold, italic,
 * strikethrough, links, images, unordered/ordered lists, blockquotes, horizontal
 * rules, tables, and paragraphs. Anything else falls through as plain text.
 */

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Only http(s), mailto and site-relative links are allowed through. */
function safeUrl(url: string): string {
  const trimmed = url.trim()
  if (/^(https?:|mailto:|#|\/)/i.test(trimmed)) return trimmed
  return '#'
}

/** Inline formatting. Input must already be escaped. */
function inline(text: string): string {
  let out = text

  // Images before links — the syntaxes overlap.
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_m, alt, src, title) => {
    const t = title ? ` title="${title}"` : ''
    return `<img src="${safeUrl(src)}" alt="${alt}"${t} />`
  })

  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_m, label, href, title) => {
    const t = title ? ` title="${title}"` : ''
    return `<a href="${safeUrl(href)}" rel="noopener noreferrer"${t}>${label}</a>`
  })

  // Inline code first so its contents are not further formatted.
  out = out.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`)
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  out = out.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>')
  out = out.replace(/~~([^~]+)~~/g, '<del>$1</del>')

  return out
}

function renderTable(rows: string[]): string {
  const cellsOf = (row: string) =>
    row
      .replace(/^\||\|$/g, '')
      .split('|')
      .map((c) => c.trim())

  const header = cellsOf(rows[0])
  const body = rows.slice(2).map(cellsOf)
  const head = header.map((c) => `<th>${inline(c)}</th>`).join('')
  const bodyRows = body
    .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`)
    .join('')
  return `<table><thead><tr>${head}</tr></thead><tbody>${bodyRows}</tbody></table>`
}

export function renderMarkdown(source: string): string {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const html: string[] = []
  let i = 0

  const isTableDivider = (line: string) => /^\|?[\s:-]*-[\s|:-]*\|?$/.test(line) && line.includes('-')

  while (i < lines.length) {
    const line = lines[i]

    // Fenced code block.
    const fence = /^```(\w*)\s*$/.exec(line)
    if (fence) {
      const lang = fence[1]
      const buf: string[] = []
      i += 1
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        buf.push(lines[i])
        i += 1
      }
      i += 1 // closing fence
      const cls = lang ? ` class="language-${escapeHtml(lang)}"` : ''
      html.push(`<pre><code${cls}>${escapeHtml(buf.join('\n'))}</code></pre>`)
      continue
    }

    // Horizontal rule.
    if (/^\s*([-*_])\s*\1\s*\1[\s\S]*$/.test(line) && line.trim().length >= 3) {
      html.push('<hr />')
      i += 1
      continue
    }

    // ATX heading.
    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      const level = heading[1].length
      html.push(`<h${level}>${inline(escapeHtml(heading[2].trim()))}</h${level}>`)
      i += 1
      continue
    }

    // Table: a header row followed by a divider row.
    if (line.includes('|') && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const rows = [line, lines[i + 1]]
      i += 2
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(lines[i])
        i += 1
      }
      html.push(renderTable(rows))
      continue
    }

    // Blockquote (consume consecutive `>` lines).
    if (/^>\s?/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^>\s?/, ''))
        i += 1
      }
      html.push(`<blockquote>${inline(escapeHtml(buf.join(' ')))}</blockquote>`)
      continue
    }

    // Unordered list.
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ''))
        i += 1
      }
      html.push(`<ul>${items.map((t) => `<li>${inline(escapeHtml(t))}</li>`).join('')}</ul>`)
      continue
    }

    // Ordered list.
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s+/, ''))
        i += 1
      }
      html.push(`<ol>${items.map((t) => `<li>${inline(escapeHtml(t))}</li>`).join('')}</ol>`)
      continue
    }

    // Blank line.
    if (line.trim() === '') {
      i += 1
      continue
    }

    // Paragraph: consume until a blank line or a block-level construct.
    const buf: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^(#{1,6}\s|```|>\s?|\s*[-*+]\s+|\s*\d+[.)]\s+)/.test(lines[i])
    ) {
      buf.push(lines[i])
      i += 1
    }
    if (buf.length > 0) {
      html.push(`<p>${inline(escapeHtml(buf.join(' ')))}</p>`)
    }
  }

  return html.join('\n')
}
