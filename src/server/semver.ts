/**
 * Semver parsing, comparison and range matching.
 *
 * Replaces `pkg/semver/semver.go`. Only what the registry actually needs:
 * strict parsing of release versions with optional prerelease/build metadata,
 * three-way comparison with prerelease precedence, range matching for declared
 * skill dependencies, and "next patch" for the file-update flow.
 */

export interface Semver {
  major: number
  minor: number
  patch: number
  prerelease: string
  build: string
  raw: string
}

/** Matches `1.2.3`, `1.2.3-rc.1`, `1.2.3+build`, `1.2.3-rc.1+build`. */
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([\w.]+))?(?:\+([\w.]+))?$/

export function parse(input: string): Semver | null {
  const m = SEMVER_RE.exec((input ?? '').trim())
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ?? '',
    build: m[5] ?? '',
    raw: input.trim(),
  }
}

export function isValid(input: string): boolean {
  return parse(input) !== null
}

/** Numeric comparison of two prerelease identifier lists, per semver §11. */
function comparePrerelease(a: string, b: string): number {
  if (a === b) return 0
  // A version without a prerelease outranks one with.
  if (a === '') return 1
  if (b === '') return -1

  const pa = a.split('.')
  const pb = b.split('.')
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i]
    const y = pb[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    const nx = /^\d+$/.test(x)
    const ny = /^\d+$/.test(y)
    if (nx && ny) {
      const d = Number(x) - Number(y)
      if (d !== 0) return d < 0 ? -1 : 1
    } else if (nx !== ny) {
      // Numeric identifiers always have lower precedence than alphanumeric.
      return nx ? -1 : 1
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}

/** `-1 | 0 | 1`. Build metadata is ignored, as semver requires. */
export function compare(a: string, b: string): number {
  const va = parse(a)
  const vb = parse(b)
  if (!va || !vb) return 0
  if (va.major !== vb.major) return va.major < vb.major ? -1 : 1
  if (va.minor !== vb.minor) return va.minor < vb.minor ? -1 : 1
  if (va.patch !== vb.patch) return va.patch < vb.patch ? -1 : 1
  return comparePrerelease(va.prerelease, vb.prerelease)
}

export const gt = (a: string, b: string): boolean => compare(a, b) > 0
export const lt = (a: string, b: string): boolean => compare(a, b) < 0

/** Highest version in a list; `null` for an empty list. Invalid entries skipped. */
export function max(versions: string[]): string | null {
  let best: string | null = null
  for (const v of versions) {
    if (!isValid(v)) continue
    if (best === null || compare(v, best) > 0) best = v
  }
  return best
}

/**
 * Bump the patch component of a release version, keeping major/minor and
 * dropping any prerelease/build metadata. Used by the file-update flow, which
 * publishes a new patch release rather than overwriting.
 */
export function nextPatch(version: string): string {
  const v = parse(version)
  if (!v) return '0.0.1'
  return `${v.major}.${v.minor}.${v.patch + 1}`
}

/**
 * Range matching for declared dependencies: `^1.2.3`, `~1.2.3`, `>=1.2.3`,
 * `1.2.x`, `*`, or a bare exact version. Ranges may be space-separated to form
 * an AND (`>=1.2.0 <2.0.0`). Anything unparseable is treated as unsatisfiable
 * so a bad range never silently allows an install.
 */
export function satisfies(version: string, range: string): boolean {
  const v = parse(version)
  if (!v) return false
  const trimmed = (range ?? '').trim()
  if (trimmed === '' || trimmed === '*' || trimmed === 'x') return true

  // Comma is an alias for logical AND here (npm-style `>=1.0.0, <2.0.0`).
  const clauses = trimmed.split(/[\s,]+/).filter(Boolean)
  if (clauses.length === 0) return true

  return clauses.every((clause) => satisfiesOne(v, clause))
}

function satisfiesOne(v: Semver, clause: string): boolean {
  const m = /^(\^|~|>=|<=|>|<|=)?\s*(.+)$/.exec(clause)
  if (!m) return false
  const op = m[1] ?? ''
  const target = m[2]

  // `1.2.x` / `1.x` wildcards.
  if (/^[xX*]/.test(target) || /\.\s*[xX*]/.test(target)) {
    const parts = target.split('.').map((p) => p.trim())
    if (parts[0] === '*' || parts[0] === 'x' || parts[0] === 'X') return true
    if (Number(parts[0]) !== v.major) return false
    if (parts[1] === undefined || ['*', 'x', 'X'].includes(parts[1])) return true
    if (Number(parts[1]) !== v.minor) return false
    if (parts[2] === undefined || ['*', 'x', 'X'].includes(parts[2])) return true
    return Number(parts[2]) === v.patch
  }

  const t = parse(target)
  if (!t) return false

  switch (op) {
    case '>=':
      return compare(v.raw, t.raw) >= 0
    case '<=':
      return compare(v.raw, t.raw) <= 0
    case '>':
      return compare(v.raw, t.raw) > 0
    case '<':
      return compare(v.raw, t.raw) < 0
    case '=':
      return compare(v.raw, t.raw) === 0
    case '^': {
      // >=target and <next major (with the 0.x exception npm uses).
      if (compare(v.raw, t.raw) < 0) return false
      if (t.major > 0) return v.major === t.major
      if (t.minor > 0) return v.major === 0 && v.minor === t.minor
      return v.major === 0 && v.minor === 0 && v.patch === t.patch
    }
    case '~': {
      // >=target and <next minor.
      if (compare(v.raw, t.raw) < 0) return false
      return v.major === t.major && v.minor === t.minor
    }
    default:
      return compare(v.raw, t.raw) === 0
  }
}
