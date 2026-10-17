/**
 * POST /api/auth/sign-out — end the session. IMPLEMENTED (not a stub).
 *
 * Request:  no body
 * Response: 204 + Set-Cookie clearing `session` and `profileId` (both path=/)
 *
 * Calls: endSession (src/server/auth/session.ts) — signing out twice is harmless.
 * (With a session table, it would also DELETE the session row; see users.service.)
 */
import { endSession } from "@/server/auth/session";

export async function POST() {
  await endSession();
  return new Response(null, { status: 204 });
}
