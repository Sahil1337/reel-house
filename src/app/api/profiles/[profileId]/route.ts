import { cookies } from "next/headers";

import { requireOwnedProfile } from "@/app/api/_lib/auth";
import { handleError, parseBody } from "@/app/api/_lib/http";
import { PROFILE_COOKIE } from "@/lib/constants";
import { profileSchema } from "@/lib/validation/profile";
import { deleteProfile, updateProfile } from "@/server/services/profiles.service";

type Context = RouteContext<"/api/profiles/[profileId]">;

const profileChangesSchema = profileSchema.partial();

/**
 * GET /api/profiles/:profileId — one profile. Pages use it to validate the profileId cookie.
 *
 * Response: 200 { profile: Profile }
 *           401 signed out · 404 unknown profile or not on this account
 *
 * Calls: requireOwnedProfile
 */
export async function GET(_request: Request, { params }: Context) {
  try {
    const { profile } = await requireOwnedProfile((await params).profileId);
    return Response.json({ profile });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * PATCH /api/profiles/:profileId — rename, or change avatar or maturity.
 *
 * Request:  body Partial<ProfileInput> (same field rules as POST /api/profiles, only for the fields present)
 * Response: 200 { profile: Profile }
 *           401 signed out · 404 unknown profile · 409 name taken on this account · 422 invalid field
 *
 * Calls: requireOwnedProfile → updateProfile (profiles.service)
 */
export async function PATCH(request: Request, { params }: Context) {
  try {
    const { user, profile } = await requireOwnedProfile((await params).profileId);
    const changes = await parseBody(request, profileChangesSchema);
    return Response.json({ profile: await updateProfile(user.userId, profile.profileId, changes) });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * DELETE /api/profiles/:profileId — remove a profile and all of its activity.
 * Clears the profileId cookie when it pointed at the deleted profile.
 *
 * Response: 204
 *           401 signed out · 404 unknown profile · 409 { error } when it's the account's last profile
 *
 * Calls: requireOwnedProfile → deleteProfile (profiles.service)
 */
export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { user, profile } = await requireOwnedProfile((await params).profileId);
    await deleteProfile(user.userId, profile.profileId);
    const store = await cookies();
    if (Number(store.get(PROFILE_COOKIE)?.value) === profile.profileId) {
      store.delete({ name: PROFILE_COOKIE, path: "/" });
    }
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleError(error);
  }
}
