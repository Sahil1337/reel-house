/**
 * POST /api/auth/sign-in — start a session for an existing account. IMPLEMENTED (not a stub):
 * the password check and the session cookie are real.
 *
 * Request:  body { email: string, password: string }
 * Response: 200 { user: User } (never the password hash) + Set-Cookie session
 *           400 { error } "Enter your email and password." — body isn't JSON or a field is missing
 *           401 { error } "That email and password don't match an account." — the same message
 *               for an unknown email and a wrong password, so emails can't be probed
 *
 * Calls: findUserCredentialsByEmail (users.service) → verifyPassword (src/server/auth/password.ts,
 *   scrypt) → startSession (src/server/auth/session.ts: httpOnly, sameSite=lax, path=/ cookie
 *   `session=<userId>.<hmac>`, HMAC-SHA256 with SESSION_SECRET; also clears profileId)
 *
 * Hardening to do later (bcrypt/argon2, rate limit, dummy hash, session table) is listed in
 * src/server/services/users.service.ts.
 */
import { handleError } from "@/app/api/_lib/http";
import { verifyPassword } from "@/server/auth/password";
import { startSession } from "@/server/auth/session";
import { ServiceError, UnauthorizedError } from "@/server/errors";
import { findUserCredentialsByEmail } from "@/server/services/users.service";

export async function POST(request: Request) {
  try {
    const body: { email?: unknown; password?: unknown } = await request.json().catch(() => ({}));
    if (typeof body.email !== "string" || typeof body.password !== "string" || !body.email || !body.password) {
      throw new ServiceError("Enter your email and password.", 400);
    }

    const account = await findUserCredentialsByEmail(body.email);
    if (!account || !(await verifyPassword(body.password, account.passwordHash))) {
      throw new UnauthorizedError("That email and password don't match an account.");
    }

    await startSession(account.user.userId);
    return Response.json({ user: account.user });
  } catch (error) {
    return handleError(error);
  }
}
