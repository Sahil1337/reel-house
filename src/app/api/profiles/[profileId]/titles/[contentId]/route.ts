/**
 * GET /api/profiles/:profileId/titles/:contentId — what this profile has done with one title.
 * Drives the title page (Play/Resume label, My List button, star rating) and where the player starts.
 *
 * Request:  path profileId, contentId
 * Response: 200 TitleActivity { inMyList: boolean, rating: number | null,
 *             resume: { episodeId: number | null, progressPercent: number, label: string } | null }
 *           401 signed out · 404 unknown profile or title
 *
 * Calls: requireOwnedProfile → getTitleActivity (activity.service)
 */
import { requireOwnedProfile } from "@/app/api/_lib/auth";
import { handleError, parseId } from "@/app/api/_lib/http";
import { getTitleActivity } from "@/server/services/activity.service";

export async function GET(_request: Request, { params }: RouteContext<"/api/profiles/[profileId]/titles/[contentId]">) {
  try {
    const { profileId, contentId } = await params;
    const { profile } = await requireOwnedProfile(profileId);
    return Response.json(await getTitleActivity(profile.profileId, parseId(contentId, "Title not found.")));
  } catch (error) {
    return handleError(error);
  }
}
