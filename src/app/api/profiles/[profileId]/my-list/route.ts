import { z } from "zod";

import { requireOwnedProfile } from "@/app/api/_lib/auth";
import { handleError, parseBody } from "@/app/api/_lib/http";
import { addToMyList, listMyList } from "@/server/services/activity.service";

type Context = RouteContext<"/api/profiles/[profileId]/my-list">;

const addSchema = z.object({ contentId: z.number().int().positive("Pick a title.") });

/**
 * GET /api/profiles/:profileId/my-list — the My List page.
 *
 * Request:  path profileId
 * Response: 200 { items: (ContentSummary & { addedAt: string })[] }, most recently added first
 *           401 signed out · 404 unknown profile
 *
 * Calls: requireOwnedProfile → listMyList (activity.service)
 */
export async function GET(_request: Request, { params }: Context) {
  try {
    const { profile } = await requireOwnedProfile((await params).profileId);
    return Response.json({ items: await listMyList(profile.profileId) });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/profiles/:profileId/my-list — save a title for later.
 *
 * Request:  body { contentId: number }
 * Response: 201 { contentId, inMyList: true } (also when it was already listed — idempotent)
 *           401 signed out · 404 unknown profile or title · 422 invalid body
 *
 * Calls: requireOwnedProfile → addToMyList (activity.service)
 */
export async function POST(request: Request, { params }: Context) {
  try {
    const { profile } = await requireOwnedProfile((await params).profileId);
    const { contentId } = await parseBody(request, addSchema);
    await addToMyList(profile.profileId, contentId);
    return Response.json({ contentId, inMyList: true }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
