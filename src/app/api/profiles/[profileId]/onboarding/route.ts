import { z } from "zod";

import { requireOwnedProfile } from "@/app/api/_lib/auth";
import { handleError, parseBody } from "@/app/api/_lib/http";
import { getGenrePreferences, saveGenrePreferences } from "@/server/services/profiles.service";
import type { OnboardingInput } from "@/types";

type Context = RouteContext<"/api/profiles/[profileId]/onboarding">;

const onboardingSchema = z.object({
  genreIds: z.array(z.number().int().positive("Pick genres from the list.")),
});

/**
 * GET /api/profiles/:profileId/onboarding — the profile's saved genre picks, to pre-fill onboarding.
 *
 * Response: 200 OnboardingInput { genreIds: number[] }
 *           401 signed out · 404 unknown profile
 *
 * Calls: requireOwnedProfile → getGenrePreferences (profiles.service)
 */
export async function GET(_request: Request, { params }: Context) {
  try {
    const { profile } = await requireOwnedProfile((await params).profileId);
    const selections: OnboardingInput = { genreIds: await getGenrePreferences(profile.profileId) };
    return Response.json(selections);
  } catch (error) {
    return handleError(error);
  }
}

/**
 * PUT /api/profiles/:profileId/onboarding — save the cold-start genre picks and finish onboarding.
 *
 * Request:  body OnboardingInput { genreIds: number[] }
 * Response: 200 { profile: Profile } with onboardingCompleted = true (onboarded_at IS NOT NULL)
 *           401 signed out · 404 unknown profile
 *           422 body isn't { genreIds: number[] }, fewer than 3 distinct genres, or unknown genre ids
 *
 * Calls: requireOwnedProfile → saveGenrePreferences (profiles.service)
 */
export async function PUT(request: Request, { params }: Context) {
  try {
    const { profile } = await requireOwnedProfile((await params).profileId);
    const { genreIds } = await parseBody(request, onboardingSchema);
    return Response.json({ profile: await saveGenrePreferences(profile.profileId, genreIds) });
  } catch (error) {
    return handleError(error);
  }
}
