/**
 * Password hashing, kept dependency-free so both the database bootstrap and the
 * auth service can use it without creating an import cycle.
 *
 * **Differs from upstream**, which used bcrypt. scrypt from `node:crypto` keeps
 * the service at zero runtime dependencies. The algorithm is recorded in the
 * stored value (`scrypt:<saltHex>:<hashHex>`) so hashes remain distinguishable
 * and a future migration can upgrade them in place.
 */

import crypto from 'node:crypto'

/** Upstream `SetPassword` rejects anything shorter. */
export const MIN_PASSWORD_LENGTH = 8

const SCRYPT_KEYLEN = 32
const SCRYPT_SALT_BYTES = 16
const SCRYPT_PREFIX = 'scrypt'

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(SCRYPT_SALT_BYTES)
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN)
  return `${SCRYPT_PREFIX}:${salt.toString('hex')}:${hash.toString('hex')}`
}

/**
 * Constant-time verification. Returns `false` for a malformed stored value
 * rather than throwing, so a corrupt row degrades to "wrong password".
 */
export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false
  const parts = stored.split(':')
  if (parts.length !== 3 || parts[0] !== SCRYPT_PREFIX) return false
  const salt = Buffer.from(parts[1], 'hex')
  const expected = Buffer.from(parts[2], 'hex')
  if (salt.length === 0 || expected.length === 0) return false
  const actual = crypto.scryptSync(password, salt, expected.length)
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}
