/**
 * Password hashing with Node's built-in scrypt — no dependency needed.
 * Stored format: "scrypt$<salt hex>$<hash hex>", the value kept in users.password_hash.
 *
 * Generate a hash for data/mock/users.json:
 *   node -e "const c=require('crypto');const s=c.randomBytes(16);console.log('scrypt\$'+s.toString('hex')+'\$'+c.scryptSync('demo1234',s,64).toString('hex'))"
 */
import "server-only";

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;

const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Pre-computed scrypt hash to equalize timing when an email does not exist. */
export const DUMMY_HASH =
  "scrypt$fdbb05fcf9d711e389a771f4e6a35088$95f1d9ef5bf3f50051b44f851bdfe0de16f309ff255d4b54ab5c926208f5d5fc07406d592ceb3807ccc235fe5593c2a7e224474f8160dd593b13abc392127a43";

