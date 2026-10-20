/**
 * POST /api/auth/sign-up — create an account with its first profile, nothing else. No plan and no
 * payment here: after signing in, the user buys a plan from the account page, which starts Razorpay
 * checkout through POST /api/account/subscriptions.
 *
 * Request:  body { name, email, phone: string | null, password }
 *           (name trimmed, ≥ 2 chars; email trimmed + lower-cased; phone ≤ 20 chars; password ≥ 8 chars)
 * Response: 201 { user: User }
 *           409 { error } "That email is already registered."
 *           422 { error } name < 2 chars, invalid email, phone too long, password < 8 chars
 *
 * Starts a session for the newly created user (startSession) so the user is signed in and lands
 * directly on /profiles.
 *
 * Calls: hashPassword (src/server/auth/password.ts, scrypt) → createUser (users.service) → startSession (src/server/auth/session.ts)
 */
import { z } from "zod";

import { handleError, parseBody } from "@/app/api/_lib/http";
import { hashPassword } from "@/server/auth/password";
import { startSession } from "@/server/auth/session";
import { createUser } from "@/server/services/users.service";

const signUpSchema = z.object({
  name: z.string().trim().min(2, "Enter your name."),
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  phone: z.string().trim().max(20, "Phone numbers can be at most 20 characters.").nullable().optional(),
  password: z.string().min(8, "Passwords need at least 8 characters."),
});

export async function POST(request: Request) {
  try {
    const { name, email, phone, password } = await parseBody(request, signUpSchema);
    const user = await createUser({ name, email, phone: phone || null, passwordHash: await hashPassword(password) });
    await startSession(user.userId);
    return Response.json({ user }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
