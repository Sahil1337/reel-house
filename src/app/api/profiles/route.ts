import { requireUser } from "@/app/api/_lib/auth";
import { handleError, parseBody } from "@/app/api/_lib/http";
import { profileSchema } from "@/lib/validation/profile";
import { createProfile, listProfiles } from "@/server/services/profiles.service";

/**
 * GET /api/profiles — the profiles on the signed-in account ("Who's watching?").
 *
 * Request:  none (user from the session)
 * Response: 200 { profiles: Profile[] } in creation order
 *           401 signed out
 *
 * Calls: requireUser → listProfiles (profiles.service)
 */
export async function GET() {
  try {
    const user = await requireUser();
    return Response.json({ profiles: await listProfiles(user.userId) });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/profiles — add a profile to the account.
 *
 * Request:  body ProfileInput { name, avatar, maturityLevel }
 *           (name 1–24 chars after trim, avatar ∈ AVATAR_KEYS, maturityLevel ∈ KIDS | TEEN | ADULT)
 * Response: 201 { profile: Profile } with onboardingCompleted = false
 *           401 signed out
 *           409 { error } at the plan's profile limit (subscription_plan.max_profiles), or the name is taken
 *           422 { error } invalid name, avatar or maturity level
 *
 * The client sends new profiles through /onboarding afterwards.
 *
 * Calls: requireUser → createProfile (profiles.service)
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = await parseBody(request, profileSchema);
    return Response.json({ profile: await createProfile(user.userId, input) }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
