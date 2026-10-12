import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

function deriveKey(password: string, salt: Buffer, keyLength: number, options: { N: number; r: number; p: number; maxmem: number }): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, keyLength, options, (error, derived) => {
      if (error) reject(error);
      else resolve(derived as Buffer);
    });
  });
}

/**
 * Local password policy used while SDM is running without an identity provider.
 * We intentionally require the three character classes requested by the product
 * brief. Digits are not mandatory; users may include them as part of a strong
 * password. Passwords are capped to avoid excessive KDF work.
 */
export const LOCAL_PASSWORD_POLICY = {
  minLength: 8,
  maxLength: 256,
  requiresUppercase: true,
  requiresLowercase: true,
  requiresSpecial: true,
} as const;

export function validateLocalPassword(password: unknown): string | null {
  if (typeof password !== "string") return "Password is required";
  if (password.length < LOCAL_PASSWORD_POLICY.minLength) return "Password must be at least 8 characters";
  if (password.length > LOCAL_PASSWORD_POLICY.maxLength) return "Password must be at most 256 characters";
  if (!/[A-Z]/.test(password)) return "Password must include an uppercase letter";
  if (!/[a-z]/.test(password)) return "Password must include a lowercase letter";
  if (!/[^A-Za-z0-9\s]/.test(password)) return "Password must include a special character";
  return null;
}

function encode(value: Buffer): string {
  return value.toString("base64url");
}

function decode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

export async function hashLocalPassword(password: string): Promise<string> {
  const validationError = validateLocalPassword(password);
  if (validationError) throw new Error(validationError);
  const salt = randomBytes(16);
  const derived = await deriveKey(password, salt, SCRYPT_KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAX_MEMORY,
  });
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${encode(salt)}$${encode(derived)}`;
}

export async function verifyLocalPassword(password: string, encodedHash: string | null | undefined): Promise<boolean> {
  if (!encodedHash || typeof password !== "string") return false;
  const parts = encodedHash.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nText, rText, pText, saltText, derivedText] = parts;
  const n = Number(nText);
  const r = Number(rText);
  const p = Number(pText);
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p) || n <= 1 || n > 1_048_576 || r <= 0 || r > 32 || p <= 0 || p > 16) return false;
  try {
    const salt = decode(saltText);
    const expected = decode(derivedText);
    if (expected.length === 0 || salt.length === 0 || expected.length > 128) return false;
    const actual = await deriveKey(password, salt, expected.length, { N: n, r, p, maxmem: SCRYPT_MAX_MEMORY });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
