/**
 * Service errors and their HTTP mapping.
 *
 * The original distinguishes errors carrying a *sentinel* (`ErrNotFound`,
 * `ErrForbidden`, `ErrConflict`) from plain `fmt.Errorf` values, and only the
 * former get a meaningful status. Everything else falls through to 400 —
 * including several cases where "not found" is the intuitive answer.
 *
 * That behaviour is reproduced deliberately: the `kind` field is optional, and
 * an error without one maps to 400 no matter how its message reads. Callers
 * have been written against that.
 */

export type ErrorKind = 'notfound' | 'forbidden' | 'conflict'

export interface AmbiguousCandidate {
  namespace: string
  slug: string
  ownerHandle: string
  skillId: string
}

export class ServiceError extends Error {
  /** Absent → the error maps to HTTP 400. */
  readonly kind?: ErrorKind
  readonly candidates?: AmbiguousCandidate[]

  constructor(message: string, kind?: ErrorKind, candidates?: AmbiguousCandidate[]) {
    super(message)
    this.name = 'ServiceError'
    this.kind = kind
    this.candidates = candidates
  }
}

/** No kind → HTTP 400. This is the default for most validation failures. */
export function fail(message: string): never {
  throw new ServiceError(message)
}

export function notFound(message: string): never {
  throw new ServiceError(message, 'notfound')
}

export function forbidden(message: string): never {
  throw new ServiceError(message, 'forbidden')
}

export function conflict(message: string): never {
  throw new ServiceError(message, 'conflict')
}

/** `AmbiguousSlugError` — `Is(ErrConflict)` is true, and it carries candidates. */
export function ambiguousSlug(slug: string, candidates: AmbiguousCandidate[]): never {
  throw new ServiceError(
    `ambiguous slug '${slug}': exists in multiple namespaces`,
    'conflict',
    candidates,
  )
}

export function isServiceError(e: unknown): e is ServiceError {
  return e instanceof ServiceError
}

/** `writeServiceError` — rule order matters; the first match wins. */
export function httpStatusFor(e: unknown): number {
  if (isServiceError(e)) {
    switch (e.kind) {
      case 'notfound':
        return 404
      case 'forbidden':
        return 403
      case 'conflict':
        return 409
      default:
        return 400
    }
  }
  return 400
}

/** Body for `writeServiceError`. The ambiguous-slug case adds `candidates`. */
export function errorBody(e: unknown): Record<string, unknown> {
  const message = e instanceof Error ? e.message : String(e)
  if (isServiceError(e) && e.candidates) {
    return { error: message, candidates: e.candidates }
  }
  return { error: message }
}
