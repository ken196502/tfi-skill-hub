/**
 * Client-side payload encryption, matching the TFI GroupCrm stack:
 * AES/ECB/Pkcs7 via crypto-js, key from the build-time env
 * (`NEXT_PUBLIC_CRYPTO_KEY`), Base64 output — exactly what the backend
 * decrypts on receipt.
 *
 * Sub-path imports keep the bundle to the algorithms actually used.
 */

import AES from "crypto-js/aes";
import Utf8 from "crypto-js/enc-utf8";
import ECB from "crypto-js/mode-ecb";
import Pkcs7 from "crypto-js/pad-pkcs7";

const ENCRYPT_WORD = process.env.NEXT_PUBLIC_CRYPTO_KEY ?? "";

/** AES/ECB/Pkcs7-encrypts a UTF-8 string; the result is Base64. */
export function encrypt(word: string): string {
  if (!ENCRYPT_WORD) {
    // Fail loudly rather than letting a password leave in the clear.
    throw new Error("NEXT_PUBLIC_CRYPTO_KEY is not configured");
  }
  const key = Utf8.parse(ENCRYPT_WORD);
  const srcs = Utf8.parse(word);
  return AES.encrypt(srcs, key, { mode: ECB, padding: Pkcs7 }).toString();
}
