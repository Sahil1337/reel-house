/**
 * Stateless session token: "<userId>.<HMAC-SHA256(userId)>", stored in the httpOnly session cookie.
 * The signature stops anyone from editing the cookie to become another user. Used by the API
 * routes and by proxy.ts, so it has no Next.js-specific imports.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

const DEV_SECRET = "reelhouse-dev-only-secret";
let warned = false;

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (value) return value;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set in production.");
  if (!warned) {
    warned = true;
    console.warn("[auth] SESSION_SECRET is not set — using an insecure development secret. Add it to .env.");
  }
  return DEV_SECRET;
}

function sign(userId: number): string {
  return createHmac("sha256", secret()).update(String(userId)).digest("hex");
}

export function createSessionToken(userId: number): string {
  return `${userId}.${sign(userId)}`;
}

/** The user id the token was issued for, or null when it is missing, malformed or tampered with. */
export function verifySessionToken(token: string | undefined): number | null {
  const [id, signature] = token?.split(".") ?? [];
  const userId = Number(id);
  if (!Number.isInteger(userId) || userId <= 0 || !signature) return null;

  const expected = Buffer.from(sign(userId), "hex");
  const actual = Buffer.from(signature, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected) ? userId : null;
}
