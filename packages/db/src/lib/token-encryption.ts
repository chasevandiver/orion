import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-cbc";

function getKey(): Buffer {
  const hex = process.env.TOKEN_ENCRYPTION_KEY ?? "0".repeat(64);
  return Buffer.from(hex, "hex");
}

export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptToken(encoded: string): string {
  const key = getKey();
  const [ivHex, encryptedHex] = encoded.split(":");
  const iv = Buffer.from(ivHex!, "hex");
  const encryptedBuffer = Buffer.from(encryptedHex!, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  return Buffer.concat([
    decipher.update(encryptedBuffer),
    decipher.final(),
  ]).toString("utf8");
}

export function decryptTokenSafe(encoded: string): string | null {
  try {
    return decryptToken(encoded);
  } catch {
    return null;
  }
}
