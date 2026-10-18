/**
 * GET /api/profiles/:profileId/home — the personalised Home page: a hero pick plus shelves,
 * each shelf carrying a human-readable `reason` the UI shows under its title.
 *
 * Request:  path profileId (ownership-checked, see ../route.ts)
 * Response: 200 HomeFeed { profileId, hero: { content, reason, match? } | null, rows: HomeRow[], generatedAt }
 *           HomeRow = { id, kind, title, reason, items: { content, match?, progress? }[] }
 *           401 signed out · 404 unknown profile
 *
 * Calls: requireOwnedProfile → getHomeFeed (recommendations.service; the pipeline is specified there)
 */
import { requireOwnedProfile } from "@/app/api/_lib/auth";
import { handleError } from "@/app/api/_lib/http";
import { getHomeFeed } from "@/server/services/recommendations.service";

export async function GET(_request: Request, { params }: RouteContext<"/api/profiles/[profileId]/home">) {
  try {
    const { profile } = await requireOwnedProfile((await params).profileId);
    return Response.json(await getHomeFeed(profile));
  } catch (error) {
    return handleError(error);
  }
}
