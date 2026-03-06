/**
 * Token encryption utility for OAuth credentials stored in `channel_connections`.
 *
 * Algorithm: AES-256-GCM
 *   - 256-bit key derived from TOKEN_ENCRYPTION_KEY env var (must be 64 hex chars = 32 bytes)
 *   - Random 96-bit IV per encryption operation (prepended to ciphertext)
 *   - GCM authentication tag appended (provides integrity + authenticity)
 *
 * Output format (base64-encoded): [12-byte IV][ciphertext][16-byte auth tag]
 *
 * Security properties:
 *   - Same plaintext encrypted twice produces different ciphertexts (IV randomness)
 *   - Tampered ciphertext is detected before decryption (GCM auth tag)
 *   - Key never leaves the server environment
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;   // 96-bit IV recommended for GCM
const TAG_BYTES = 16;  // 128-bit authentication tag

function getKey(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
      "Generate with: openssl rand -hex 32",
    );
  }
  return Buffer.from(hex, "hex");
}

/**
 * Encrypts a plaintext token string.
 * Returns a base64-encoded string safe for database storage.
 */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  // Layout: [IV (12)] + [ciphertext (variable)] + [tag (16)]
  return Buffer.concat([iv, encrypted, tag]).toString("base64");
}

/**
 * Decrypts a base64-encoded token string produced by encryptToken.
 * Throws if the ciphertext has been tampered with (GCM tag mismatch).
 */
export function decryptToken(encoded: string): string {
  const key = getKey();
  const data = Buffer.from(encoded, "base64");

  if (data.length < IV_BYTES + TAG_BYTES + 1) {
    throw new Error("Invalid encrypted token: payload too short");
  }

  const iv = data.subarray(0, IV_BYTES);
  const tag = data.subarray(data.length - TAG_BYTES);
  const ciphertext = data.subarray(IV_BYTES, data.length - TAG_BYTES);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}

/**
 * Safely decrypts a token, returning null instead of throwing.
 * Use for non-critical reads where a missing/corrupt token should
 * degrade gracefully (e.g., skip a channel in a batch operation).
 */
export function decryptTokenSafe(encoded: string): string | null {
  try {
    return decryptToken(encoded);
  } catch {
    return null;
  }
}
