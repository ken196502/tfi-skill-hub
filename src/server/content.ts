/**
 * Content helpers: fingerprints, path sanitisation, MIME sniffing, SKILL.md
 * frontmatter extraction, and multipart ingestion.
 *
 * Ported from `pkg/service/common.go`.
 */

import crypto from 'node:crypto'
import path from 'node:path'

export const MAX_UPLOAD_FILES = 500
export const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5 MiB per file
/** Cap for `GET .../file` reads of a stored skill file. */
export const MAX_SKILL_FILE_READ = 512 * 1024

export type FileMap = Map<string, Uint8Array>

const sha256Hex = (data: Uint8Array | string): string =>
  crypto.createHash('sha256').update(data).digest('hex')

export const sha256Of = sha256Hex

/**
 * Hashes only file **contents**, with the sorted per-file digests joined by
 * `:` before a final pass. Used for skills so that fingerprints stay
 * backward-compatible with existing published versions.
 *
 * Note the (intentional) quirk: the map is iterated in insertion order and the
 * resulting digests are sorted, so file order does not matter — but two files
 * with identical content collapse to the same digest entry.
 */
export function computeContentFingerprint(files: FileMap): string {
  const parts: string[] = []
  for (const content of files.values()) {
    parts.push(sha256Hex(content))
  }
  parts.sort()
  return sha256Hex(parts.join(':'))
}

/**
 * Normalises an uploaded path: cleans `.`/`..` segments, strips a leading `/`,
 * and returns `''` when the result escapes the package root.
 */
export function sanitizeFilePath(name: string): string {
  let cleaned = path.posix.normalize(name.replace(/\\/g, '/'))
  cleaned = cleaned.replace(/^\/+/, '')
  if (cleaned === '.' || cleaned === '..' || cleaned === '') return ''
  if (cleaned.startsWith('../') || cleaned.includes('/../')) return ''
  return cleaned
}

const CONTENT_TYPES: Record<string, string> = {
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
  yaml: 'application/yaml',
  yml: 'application/yaml',
  js: 'text/javascript',
  mjs: 'text/javascript',
  cjs: 'text/javascript',
  ts: 'text/typescript',
  tsx: 'text/typescript',
  py: 'text/x-python',
  sh: 'application/x-sh',
  bash: 'application/x-sh',
  zsh: 'application/x-sh',
  css: 'text/css',
  html: 'text/html',
  htm: 'text/html',
  xml: 'application/xml',
  csv: 'text/csv',
  toml: 'application/toml',
  ini: 'text/plain',
  sql: 'application/sql',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  pdf: 'application/pdf',
  zip: 'application/zip',
  gz: 'application/gzip',
}

export function contentTypeFor(filePath: string): string {
  const ext = path.posix.extname(filePath).slice(1).toLowerCase()
  return CONTENT_TYPES[ext] ?? 'application/octet-stream'
}

/**
 * Extracts the YAML frontmatter block from a `SKILL.md`, returning
 * `{ raw }` (the trimmed block, fences removed) or `{}` when absent.
 *
 * The value is stored verbatim rather than parsed into structured keys —
 * matching upstream, which keeps the raw block so consumers can apply their own
 * YAML interpretation.
 */
export function parseSkillMdFrontmatter(content: Uint8Array | string): Record<string, unknown> {
  const text = typeof content === 'string' ? content : new TextDecoder().decode(content)
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!match) return {}
  const raw = match[1].trim()
  if (raw === '') return {}
  return { raw }
}

export interface MultipartFiles {
  files: FileMap
  /** Non-file form fields, first value only, **not** trimmed. */
  fields: Map<string, string>
}

/**
 * Reads every file part from a multipart body, regardless of field name — the
 * Go implementation does the same, so clients may name their file parts
 * anything.
 *
 * Errors mirror the upstream messages exactly, because the publish handlers
 * surface them to callers verbatim.
 */
export async function readMultipart(
  request: Request,
  fileSizeLimit: number = MAX_FILE_SIZE,
): Promise<MultipartFiles> {
  const form = await request.formData()
  const files: FileMap = new Map()
  const fields = new Map<string, string>()

  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') {
      if (!fields.has(key)) fields.set(key, value)
      continue
    }
    if (files.size >= MAX_UPLOAD_FILES) {
      throw new Error(`too many files (max ${MAX_UPLOAD_FILES})`)
    }
    if (value.size > fileSizeLimit) {
      throw new Error(`file ${value.name} exceeds max size (${fileSizeLimit} bytes)`)
    }
    const safe = sanitizeFilePath(value.name)
    if (safe === '') {
      throw new Error(`invalid file path ${JSON.stringify(value.name)}`)
    }
    if (files.has(safe)) {
      throw new Error(`duplicate file path ${JSON.stringify(safe)}`)
    }
    const buf = new Uint8Array(await value.arrayBuffer())
    if (buf.byteLength > fileSizeLimit) {
      throw new Error(`file ${safe} exceeds max size (${fileSizeLimit} bytes)`)
    }
    files.set(safe, buf)
  }

  return { files, fields }
}

/**
 * `formValue` — the Go helper trims whitespace. The skill publish path uses raw
 * `PostForm` (no trim) instead, so callers pick the helper that matches.
 */
export function formValue(fields: Map<string, string>, key: string): string {
  return (fields.get(key) ?? '').trim()
}

export function splitTags(raw: string): string[] {
  return raw
    .split(/[,; ]+/)
    .map((t) => t.trim())
    .filter((t) => t !== '')
}
