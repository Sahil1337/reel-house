/**
 * GET /api/auth/me — who is signed in. IMPLEMENTED (not a stub).
 * Server pages call it through getCurrentUser() (src/server/session/current-session.ts).
 *
 * Request:  the `session` cookie
 * Response: 200 { user: User } (never the password hash)
 *           401 { error } "Sign in to continue." — no cookie, a bad signature, or a user that no longer exists
 *
 * Calls: requireUser → getSessionUserId (HMAC-SHA256 check, src/server/auth/session-token.ts) + findUserById (users.service)
 */
import { requireUser } from "@/app/api/_lib/auth";
import { handleError } from "@/app/api/_lib/http";

export async function GET() {
  try {
    return Response.json({ user: await requireUser() });
  } catch (error) {
    return handleError(error);
  }
}
