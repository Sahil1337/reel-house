/**
 * GET /api/genres — all genres (search filter, onboarding, genre pages).
 *
 * Request:  none
 * Response: 200 { genres: Genre[] }, alphabetical
 *
 * Calls: listGenres (catalog.service)
 */
import { handleError } from "@/app/api/_lib/http";
import { listGenres } from "@/server/services/catalog.service";

export async function GET() {
  try {
    return Response.json({ genres: await listGenres() });
  } catch (error) {
    return handleError(error);
  }
}
