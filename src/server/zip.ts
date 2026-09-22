/**
 * Minimal ZIP writer.
 *
 * Upstream shells out to git and streams a `git archive` zip. With version
 * content held in SQLite we need to build the archive ourselves, so this module
 * emits the ZIP container directly: local file headers, a central directory and
 * an end-of-central-directory record, with per-entry deflate via `node:zlib`.
 *
 * Everything is in-memory — bundles are capped at 5 MiB of source content by
 * the upload path, and the runtime bundle endpoint enforces its own 100 MiB cap.
 */

import zlib from 'node:zlib'
import crypto from 'node:crypto'

// ─────────────────────────────────────────────────────────────────────────────
// CRC-32 (IEEE 802.3)
// ─────────────────────────────────────────────────────────────────────────────

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
}

// ─────────────────────────────────────────────────────────────────────────────
// DOS date/time
// ─────────────────────────────────────────────────────────────────────────────

/** ZIP stores timestamps in a 2-second-resolution MS-DOS format. */
function dosDateTime(d: Date): { time: number; date: number } {
  const year = Math.max(1980, d.getFullYear())
  const time =
    (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2)
  const date = ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()
  return { time: time & 0xffff, date: date & 0xffff }
}

// ─────────────────────────────────────────────────────────────────────────────
// Writer
// ─────────────────────────────────────────────────────────────────────────────

export interface ZipEntry {
  path: string
  content: Uint8Array
}

interface CentralEntry {
  nameBytes: Buffer
  crc: number
  compressedSize: number
  uncompressedSize: number
  method: number
  offset: number
  time: number
  date: number
}

const METHOD_STORE = 0
const METHOD_DEFLATE = 8
/** Below this, deflate's overhead outweighs the saving. */
const DEFLATE_THRESHOLD = 64

/**
 * Builds a ZIP archive. Entries are written with forward-slash separated paths
 * and **no** shared directory prefix — the same shape `git archive` produces
 * for a repository root.
 */
export function createZip(
  entries: ZipEntry[],
  modifiedAt: Date = new Date(),
): Uint8Array {
  const { time, date } = dosDateTime(modifiedAt)
  const chunks: Buffer[] = []
  const central: CentralEntry[] = []
  let offset = 0

  // Sort for reproducible output; callers usually pass them already ordered.
  const ordered = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))

  for (const entry of ordered) {
    const nameBytes = Buffer.from(entry.path, 'utf8')
    const raw = Buffer.from(entry.content)
    const crc = crc32(raw)

    let method = METHOD_STORE
    let payload: Buffer = raw
    if (raw.length >= DEFLATE_THRESHOLD) {
      const deflated = zlib.deflateRawSync(raw, { level: 6 })
      if (deflated.length < raw.length) {
        method = METHOD_DEFLATE
        payload = deflated
      }
    }

    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0) // local file header signature
    header.writeUInt16LE(20, 4) // version needed to extract (2.0)
    header.writeUInt16LE(0x0800, 6) // flags: UTF-8 names
    header.writeUInt16LE(method, 8)
    header.writeUInt16LE(time, 10)
    header.writeUInt16LE(date, 12)
    header.writeUInt32LE(crc, 14)
    header.writeUInt32LE(payload.length, 18)
    header.writeUInt32LE(raw.length, 22)
    header.writeUInt16LE(nameBytes.length, 26)
    header.writeUInt16LE(0, 28) // extra field length

    chunks.push(header, nameBytes, payload)
    central.push({
      nameBytes,
      crc,
      compressedSize: payload.length,
      uncompressedSize: raw.length,
      method,
      offset,
      time,
      date,
    })
    offset += header.length + nameBytes.length + payload.length
  }

  const centralStart = offset
  for (const e of central) {
    const buf = Buffer.alloc(46)
    buf.writeUInt32LE(0x02014b50, 0) // central directory header signature
    buf.writeUInt16LE(20, 4) // version made by
    buf.writeUInt16LE(20, 6) // version needed to extract
    buf.writeUInt16LE(0x0800, 8) // flags: UTF-8 names
    buf.writeUInt16LE(e.method, 10)
    buf.writeUInt16LE(e.time, 12)
    buf.writeUInt16LE(e.date, 14)
    buf.writeUInt32LE(e.crc, 16)
    buf.writeUInt32LE(e.compressedSize, 20)
    buf.writeUInt32LE(e.uncompressedSize, 24)
    buf.writeUInt16LE(e.nameBytes.length, 28)
    buf.writeUInt16LE(0, 30) // extra field length
    buf.writeUInt16LE(0, 32) // file comment length
    buf.writeUInt16LE(0, 34) // disk number start
    buf.writeUInt16LE(0, 36) // internal attributes
    buf.writeUInt32LE(0, 38) // external attributes
    buf.writeUInt32LE(e.offset, 42)
    chunks.push(buf, e.nameBytes)
    offset += buf.length + e.nameBytes.length
  }

  const centralSize = offset - centralStart
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0) // end of central directory signature
  eocd.writeUInt16LE(0, 4) // this disk number
  eocd.writeUInt16LE(0, 6) // disk with central directory
  eocd.writeUInt16LE(central.length, 8)
  eocd.writeUInt16LE(central.length, 10)
  eocd.writeUInt32LE(centralSize, 12)
  eocd.writeUInt32LE(centralStart, 16)
  eocd.writeUInt16LE(0, 20) // comment length
  chunks.push(eocd)

  return new Uint8Array(Buffer.concat(chunks))
}

/** SHA-256 of the archive bytes, used by the agent archive endpoint header. */
export function zipSha256(zip: Uint8Array): string {
  return crypto.createHash('sha256').update(zip).digest('hex')
}
