/**
 * POST /api/profiles/:profileId/progress — the player reports how far the viewer got.
 * Sent on pause, seek, the 90% mark, the end, every 10s while playing, and on page hide
 * (that last one with fetch keepalive).
 *
 * Request:  body { contentId: number, episodeId: number | null, progressPercent: number }
 * Response: 200 { entry: WatchHistory }
 *           401 signed out · 403 SUBSCRIPTION_REQUIRED no running plan · 404 unknown profile/title · 422 invalid body, series without episodeId,
 *           or an episode of another title
 *
 * Calls: requireOwnedProfile → requireActivePlan → recordProgress (activity.service)
 */
import { z } from "zod";

import { requireActivePlan, requireOwnedProfile } from "@/app/api/_lib/auth";
import { handleError, parseBody } from "@/app/api/_lib/http";
import { recordProgress } from "@/server/services/activity.service";

const progressSchema = z.object({
  contentId: z.number().int().positive("Pick a title."),
  episodeId: z.number().int().positive().nullable(),
  progressPercent: z.number().finite("Progress must be a number."),
});

export async function POST(request: Request, { params }: RouteContext<"/api/profiles/[profileId]/progress">) {
  try {
    const { user, profile } = await requireOwnedProfile((await params).profileId);
    await requireActivePlan(user);
    const input = await parseBody(request, progressSchema);
    const entry = await recordProgress(profile.profileId, input);
    return Response.json({ entry });
  } catch (error) {
    return handleError(error);
  }
}
