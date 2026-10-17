/**
 * GET /api/content/:contentId/similar — "More like this" on the title page.
 *
 * Request:  path contentId
 * Response: 200 { items: ContentSummary[] } — up to 12, best first, never the title itself
 *           404 { error } when the id doesn't exist
 *
 * Calls: getSelectedProfile (maturity filter; none selected → no filter) → getSimilarTitles (catalog.service)
 */
import { getSelectedProfile } from "@/app/api/_lib/auth";
import { handleError, parseId } from "@/app/api/_lib/http";
import { getSimilarTitles } from "@/server/services/catalog.service";

export async function GET(_request: Request, { params }: RouteContext<"/api/content/[contentId]/similar">) {
  try {
    const contentId = parseId((await params).contentId, "Title not found.");
    const profile = await getSelectedProfile();
    return Response.json({ items: await getSimilarTitles(contentId, profile?.maturityLevel ?? null) });
  } catch (error) {
    return handleError(error);
  }
}
