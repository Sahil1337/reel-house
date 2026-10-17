import { z } from "zod";

import { requireOwnedProfile } from "@/app/api/_lib/auth";
import { handleError, parseBody, parseId } from "@/app/api/_lib/http";
import { rateTitle, removeRating } from "@/server/services/activity.service";

type Context = RouteContext<"/api/profiles/[profileId]/ratings/[contentId]">;

const ratingSchema = z.object({
  value: z
    .number()
    .int("Rating must be a whole number from 1 to 5.")
    .min(1, "Rating must be 1 to 5 stars.")
    .max(5, "Rating must be 1 to 5 stars."),
});

/**
 * PUT /api/profiles/:profileId/ratings/:contentId — rate a title 1–5 stars (re-rating replaces the old value).
 *
 * Request:  body { value: number }
 * Response: 200 { rating: Rating }
 *           401 signed out · 404 unknown profile or title · 422 value not an integer 1–5
 *
 * Calls: requireOwnedProfile → rateTitle (activity.service)
 */
export async function PUT(request: Request, { params }: Context) {
  try {
    const { profileId, contentId } = await params;
    const { profile } = await requireOwnedProfile(profileId);
    const id = parseId(contentId, "Title not found.");
    const { value } = await parseBody(request, ratingSchema);
    const rating = await rateTitle(profile.profileId, id, value);
    return Response.json({ rating });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * DELETE /api/profiles/:profileId/ratings/:contentId — clear a rating.
 *
 * Response: 204 (also when there was no rating — idempotent)
 *           401 signed out · 404 unknown profile
 *
 * Calls: requireOwnedProfile → removeRating (activity.service)
 */
export async function DELETE(_request: Request, { params }: Context) {
  try {
    const { profileId, contentId } = await params;
    const { profile } = await requireOwnedProfile(profileId);
    await removeRating(profile.profileId, parseId(contentId, "Title not found."));
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleError(error);
  }
}
