/**
 * DELETE /api/profiles/:profileId/history/:historyId — remove one entry from History.
 *
 * Request:  path profileId, historyId
 * Response: 204
 *           401 signed out · 404 unknown profile, or no such entry on this profile
 *
 * Calls: requireOwnedProfile → removeHistoryEntry (activity.service)
 */
import { requireOwnedProfile } from "@/app/api/_lib/auth";
import { handleError, parseId } from "@/app/api/_lib/http";
import { removeHistoryEntry } from "@/server/services/activity.service";

export async function DELETE(
  _request: Request,
  { params }: RouteContext<"/api/profiles/[profileId]/history/[historyId]">,
) {
  try {
    const { profileId, historyId } = await params;
    const { profile } = await requireOwnedProfile(profileId);
    await removeHistoryEntry(profile.profileId, parseId(historyId, "History entry not found."));
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleError(error);
  }
}
