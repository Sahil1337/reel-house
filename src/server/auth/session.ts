/**
 * The session cookie for route handlers: `session=<userId>.<hmac>` (see session-token.ts).
 * httpOnly, sameSite=lax, path=/, 30 days. Stateless — nothing is stored server-side.
 *
 * Later: put an expiry (issued-at) inside the signed value, or move to a session table so a
 * session can be revoked server-side (sign out everywhere, password change).
 */
import "server-only";

import { cookies } from "next/headers";

import { PROFILE_COOKIE, SESSION_COOKIE } from "@/lib/constants";

import { createSessionToken, verifySessionToken } from "./session-token";

/** The signed-in user's id, or null when there's no valid session cookie. */
export async function getSessionUserId(): Promise<number | null> {
  return verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
}

export async function startSession(userId: number): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, createSessionToken(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  // A new session starts at "Who's watching?".
  store.delete({ name: PROFILE_COOKIE, path: "/" });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  // Same path as when they were set, or the browser keeps them.
  store.delete({ name: SESSION_COOKIE, path: "/" });
  store.delete({ name: PROFILE_COOKIE, path: "/" });
}
