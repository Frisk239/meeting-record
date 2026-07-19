import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 10;

export function newId(prefix = ""): string {
  const id = randomBytes(16).toString("hex");
  return prefix ? `${prefix}_${id}` : id;
}

export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function safeEqualString(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Mask API key for UI: show last 4 if long enough. */
export function maskApiKey(key: string): string {
  if (!key) return "";
  if (key.length <= 4) return "••••";
  return `••••••••${key.slice(-4)}`;
}
