/**
 * DELETE /api/profiles/:profileId/my-list/:contentId — take a title off My List.
 *
 * Request:  path profileId, contentId
 * Response: 200 { contentId, inMyList: false } (also when it wasn't in the list — idempotent)
 *           401 signed out · 404 unknown profile
 *
 * Calls: requireOwnedProfile → removeFromMyList (activity.service)
 */
import { requireOwnedProfile } from "@/app/api/_lib/auth";
import { handleError, parseId } from "@/app/api/_lib/http";
import { removeFromMyList } from "@/server/services/activity.service";

export async function DELETE(
  _request: Request,
  { params }: RouteContext<"/api/profiles/[profileId]/my-list/[contentId]">,
) {
  try {
    const { profileId, contentId } = await params;
    const { profile } = await requireOwnedProfile(profileId);
    const id = parseId(contentId, "Title not found.");
    await removeFromMyList(profile.profileId, id);
    return Response.json({ contentId: id, inMyList: false });
  } catch (error) {
    return handleError(error);
  }
}
