/**
 * Guards shared by the /api/account/**, /api/profiles/** and /api/admin/** routes. They throw
 * typed errors (src/server/errors/index.ts), which the route's `handleError` turns into the response:
 *
 *   const user = await requireUser();                              // 401
 *   const { user, profile } = await requireOwnedProfile(profileId); // 401, 404
 *   const admin = await requireAdmin();                            // 401, 403
 *   const plan = await requireActivePlan(user);                    // 403 SUBSCRIPTION_REQUIRED
 *   const profile = await getSelectedProfile();                    // never throws: null if none
 *
 * The session cookie is real (src/server/auth/session.ts); the lookups go through the services.
 */
import { cookies } from "next/headers";

import { getSessionUserId } from "@/server/auth/session";
import { PROFILE_COOKIE } from "@/lib/constants";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "@/server/errors";
import { getActiveSubscription } from "@/server/services/billing.service";
import { getOwnedProfile } from "@/server/services/profiles.service";
import { findUserById } from "@/server/services/users.service";
import type { Profile, SubscriptionWithPlan, User } from "@/types";

/** The signed-in user: 401 without a valid session (or when the user no longer exists). */
export async function requireUser(): Promise<User> {
  const userId = await getSessionUserId();
  const user = userId ? await findUserById(userId) : null;
  if (!user) throw new UnauthorizedError();
  return user;
}

/** The signed-in user if they're an admin (users.role = 'ADMIN'): 401 without a session, 403 for everyone else. */
export async function requireAdmin(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new ForbiddenError("Admins only.");
  return user;
}

/** The user's running plan (ACTIVE, or CANCELLED before its end_date): 403 SUBSCRIPTION_REQUIRED without one. */
export async function requireActivePlan(user: User): Promise<SubscriptionWithPlan> {
  const subscription = await getActiveSubscription(user.userId);
  if (!subscription) throw new ForbiddenError("Choose a plan to start watching.", "SUBSCRIPTION_REQUIRED");
  return subscription;
}

/**
 * The profile, only if it belongs to the signed-in user: 401 without a session, 404 otherwise
 * (never reveal other accounts' profiles).
 */
export async function requireOwnedProfile(profileId: string): Promise<{ user: User; profile: Profile }> {
  const user = await requireUser();
  const id = Number(profileId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new NotFoundError("Profile not found.");
  return { user, profile: await getOwnedProfile(user.userId, id) };
}

/**
 * The profile picked in "Who's watching?" (the profileId cookie), only if it belongs to the
 * signed-in user; null when signed out, unset, or not theirs. Catalogue routes use it for the
 * maturity filter, and skip the filter when it's null.
 */
export async function getSelectedProfile(): Promise<Profile | null> {
  const userId = await getSessionUserId();
  const profileId = Number((await cookies()).get(PROFILE_COOKIE)?.value);
  if (!userId || !Number.isSafeInteger(profileId) || profileId <= 0) return null;
  try {
    return await getOwnedProfile(userId, profileId);
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}
