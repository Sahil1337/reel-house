/**
 * Accounts: the `users` table (and the first `profile` row created together with a new account).
 *
 * Owns: users (user_id, name, email, password_hash, phone, role, created_at).
 * Never returns password_hash except from findUserCredentialsByEmail, which only sign-in uses.
 *
 * Exports:
 *   findUserById(userId)                  — the user behind a session cookie
 *   findUserCredentialsByEmail(email)     — the user + password hash, for sign-in
 *   createUser(input)                     — sign-up: users row + first profile, one transaction
 *
 * Hardening to do later (sign-in / sessions; the cookie and scrypt hashing are real today):
 *   - bcrypt or argon2id instead of plain scrypt defaults, with a tunable cost.
 *   - Rate-limit sign-in attempts per IP and per email (e.g. a login_attempt table or a KV store).
 *   - Run a dummy hash when the email is unknown, so timing matches the wrong-password path.
 *   - Stateless cookie vs. a session table: a table (session_id, user_id, expires_at) allows expiry,
 *     "sign out everywhere" and revocation (also DELETE the session row on sign-out, so a copied
 *     cookie stops working); the signed cookie can't be revoked early. With a session table,
 *     findUserById's caller would also check the row exists and hasn't expired, and slide its
 *     expiry forward on use.
 */
import "server-only";

import { findUser, findUserCredentials, getMockDb } from "@/server/mocks/db";
import type { NewUser, User } from "@/types";

/**
 * The user with this id, without password_hash; null when there's none (e.g. the account was
 * deleted while a session cookie is still around — callers treat that as signed out).
 *
 * Steps:
 *   1. Select the row by primary key, listing columns explicitly so password_hash is never read.
 * SQL:
 *   SELECT user_id, name, email, phone, role, created_at FROM users WHERE user_id = $1;
 * Tables: users  ·  Keys/constraints relied on: PK users_pkey
 * Transaction: no  ·  Idempotent: yes (read-only)
 * Edge cases: map snake_case columns to the User type (userId, createdAt as ISO string).
 * Throws: nothing (returns null when missing)
 * Called by: requireUser (src/app/api/_lib/auth.ts) → every guarded route, GET /api/auth/me
 * Mock today: looks the user up in data/mock/users.json via src/server/mocks.
 */
export async function findUserById(userId: number): Promise<User | null> {
  // TODO: implement
  return findUser(userId) ?? null;
}

/**
 * The user plus the stored password hash for this email, for sign-in; null when no account has it.
 * The hash never leaves the server: sign-in verifies it with verifyPassword (src/server/auth/password.ts,
 * scrypt, stored as "scrypt$<salt>$<hash>", compared with timingSafeEqual) and returns only `user`.
 *
 * Steps:
 *   1. Trim the email, then look it up case-insensitively.
 *   2. Split the row into { user, passwordHash }.
 * SQL:
 *   SELECT user_id, name, email, phone, role, created_at, password_hash
 *   FROM users WHERE lower(email) = lower($1);
 * Tables: users  ·  Keys/constraints relied on: UNIQUE INDEX users_email_key ON users (lower(email))
 *   (the query uses the same expression, so the index serves it and at most one row matches)
 * Transaction: no  ·  Idempotent: yes (read-only)
 * Edge cases: unknown email returns null — the route answers with the same 401 message as a wrong
 *   password, so emails can't be probed.
 * Throws: nothing
 * Called by: POST /api/auth/sign-in
 * Mock today: case-insensitive lookup in data/mock/users.json via src/server/mocks (findUserCredentials).
 */
export async function findUserCredentialsByEmail(email: string): Promise<{ user: User; passwordHash: string } | null> {
  // TODO: implement
  return findUserCredentials(email) ?? null;
}

/**
 * Registers an account together with its first profile — nothing else. No plan and no payment
 * here: after signing in, the user buys a plan from the account page, which starts Razorpay
 * checkout through POST /api/account/subscriptions.
 *
 * Steps (one transaction, so a failure leaves no half-created account):
 *   1. INSERT the users row. The password is already hashed by the route (hashPassword() from
 *      src/server/auth/password.ts; or bcrypt/argon2 when you upgrade). role is left to its default
 *      'USER' — sign-up never creates admins. UNIQUE lower(email) violation → ConflictError.
 *   2. INSERT the first profile for the new user_id: name = first word of the user's name, avatar
 *      'lamp', maturity_level 'ADULT', onboarded_at NULL (onboarding not done yet). Same row shape
 *      as POST /api/profiles, but skip the 5-profile check (it is the first one).
 *   3. Return the User (without password_hash).
 * SQL:
 *   INSERT INTO users (name, email, phone, password_hash)
 *   VALUES ($1, $2, $3, $4)
 *   RETURNING user_id, name, email, phone, role, created_at;
 *   INSERT INTO profile (user_id, name, avatar, maturity_level)
 *   VALUES ($userId, split_part($1, ' ', 1), 'lamp', 'ADULT');       -- onboarded_at stays NULL
 * Tables: users, profile  ·  Keys/constraints relied on: UNIQUE INDEX users_email_key
 *   (lower(email)) → 23505 means "email taken"; users.role DEFAULT 'USER'; FK profile.user_id
 * Transaction: yes (db.transaction)  ·  Idempotent: no
 * Edge cases: the email is stored lower-cased by the route's validation; the first word of the name
 *   fits profile.name VARCHAR(24) — truncate to 24 characters if a single word is longer.
 * Throws: ConflictError 409 "That email is already registered." when the email exists
 * Called by: POST /api/auth/sign-up
 * Mock today: returns a plausible User (userId = number of mock users + 1, role 'USER', createdAt
 *   now) and persists nothing — the route does not start a session for it.
 */
export async function createUser(input: NewUser): Promise<User> {
  // TODO: implement
  return {
    userId: getMockDb().users.length + 1,
    name: input.name,
    email: input.email,
    phone: input.phone,
    role: "USER",
    createdAt: new Date().toISOString(),
  };
}
