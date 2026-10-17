/**
 * GET /api/profiles/:profileId/history — the History page.
 *
 * Request:  path profileId
 * Response: 200 { items: HistoryItem[] }, newest first — each watch_history row plus `content`
 *           (ContentSummary) and, for series, `episode` (Episode + seasonNumber)
 *           401 signed out · 404 unknown profile
 *
 * Calls: requireOwnedProfile → listHistory (activity.service)
 */
import { requireOwnedProfile } from "@/app/api/_lib/auth";
import { handleError } from "@/app/api/_lib/http";
import { listHistory } from "@/server/services/activity.service";

export async function GET(_request: Request, { params }: RouteContext<"/api/profiles/[profileId]/history">) {
  try {
    const { profile } = await requireOwnedProfile((await params).profileId);
    return Response.json({ items: await listHistory(profile.profileId) });
  } catch (error) {
    return handleError(error);
  }
}
