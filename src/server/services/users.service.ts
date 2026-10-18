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
 */
import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/server/db";
import { ConflictError, ServiceError } from "@/server/errors";
import type { NewUser, User, UserRole } from "@/types";

type UserRow = {
  user_id: number;
  name: string;
  email: string;
  phone: string | null;
  role: UserRole;
  created_at: Date | string;
};

type UserCredentialsRow = UserRow & {
  password_hash: string;
};

function mapUser(row: UserRow): User {
  return {
    userId: row.user_id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
  };
}

/**
 * The user with this id, without password_hash; null when there's none (e.g. the account was
 * deleted while a session cookie is still around — callers treat that as signed out).
 *
 * SQL:
 *   SELECT user_id, name, email, phone, role, created_at FROM users WHERE user_id = $1;
 */
export async function findUserById(userId: number): Promise<User | null> {
  const result = await db.execute<UserRow>(sql`
    SELECT user_id, name, email, phone, role, created_at
    FROM users
    WHERE user_id = ${userId};
  `);
  const row = result.rows[0];
  return row ? mapUser(row) : null;
}

/**
 * The user plus the stored password hash for this email, for sign-in; null when no account has it.
 * The hash never leaves the server: sign-in verifies it with verifyPassword and returns only `user`.
 *
 * SQL:
 *   SELECT user_id, name, email, phone, role, created_at, password_hash
 *   FROM users WHERE lower(email) = lower($1);
 */
export async function findUserCredentialsByEmail(email: string): Promise<{ user: User; passwordHash: string } | null> {
  const trimmed = email.trim();
  if (!trimmed) return null;

  const result = await db.execute<UserCredentialsRow>(sql`
    SELECT user_id, name, email, phone, role, created_at, password_hash
    FROM users
    WHERE lower(email) = lower(${trimmed});
  `);
  const row = result.rows[0];
  if (!row) return null;

  return {
    user: mapUser(row),
    passwordHash: row.password_hash,
  };
}

/**
 * Registers an account together with its first profile in a single atomic transaction.
 *
 * SQL:
 *   INSERT INTO users (name, email, phone, password_hash)
 *   VALUES ($1, $2, $3, $4)
 *   RETURNING user_id, name, email, phone, role, created_at;
 *
 *   INSERT INTO profile (user_id, name, avatar, maturity_level)
 *   VALUES ($userId, split_part($1, ' ', 1), 'lamp', 'ADULT');
 */
export async function createUser(input: NewUser): Promise<User> {
  return db.transaction(async (tx) => {
    try {
      const trimmedEmail = input.email.trim().toLowerCase();
      const trimmedName = input.name.trim();

      const userResult = await tx.execute<UserRow>(sql`
        INSERT INTO users (name, email, phone, password_hash)
        VALUES (${trimmedName}, ${trimmedEmail}, ${input.phone}, ${input.passwordHash})
        RETURNING user_id, name, email, phone, role, created_at;
      `);
      const userRow = userResult.rows[0];
      if (!userRow) throw new ServiceError("Failed to create user account.", 500);

      const firstWord = (trimmedName.split(/\s+/)[0] || "User").slice(0, 24);
      await tx.execute(sql`
        INSERT INTO profile (user_id, name, avatar, maturity_level)
        VALUES (${userRow.user_id}, ${firstWord}, 'lamp', 'ADULT');
      `);

      return mapUser(userRow);
    } catch (error) {
      const code = (error as { cause?: { code?: string } }).cause?.code;
      if (code === "23505") {
        throw new ConflictError("That email is already registered.");
      }
      throw error;
    }
  });
}
