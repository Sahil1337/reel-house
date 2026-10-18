/**
 * GET /api/profiles/:profileId/home/explain — why the Home page shows what it shows: the profile's
 * signals, genre taste, the score of each top pick and what was filtered out ("Why these picks?").
 *
 * Request:  path profileId (ownership-checked, see ../../route.ts)
 * Response: 200 HomeExplanation { signals, picks, taste, topPicks, filters }
 *           401 signed out · 404 unknown profile
 *
 * Calls: requireOwnedProfile → explainHomeFeed (recommendations.service)
 */
import { requireOwnedProfile } from "@/app/api/_lib/auth";
import { handleError } from "@/app/api/_lib/http";
import { explainHomeFeed } from "@/server/services/recommendations.service";

export async function GET(_request: Request, { params }: RouteContext<"/api/profiles/[profileId]/home/explain">) {
  try {
    const { profile } = await requireOwnedProfile((await params).profileId);
    return Response.json(await explainHomeFeed(profile));
  } catch (error) {
    return handleError(error);
  }
}
