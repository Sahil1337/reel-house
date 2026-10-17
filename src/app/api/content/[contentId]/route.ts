/**
 * GET /api/content/:contentId — everything the title page and player need.
 *
 * Request:  path contentId
 * Response: 200 { content: ContentDetail } — genres, cast with character names, directors, and for
 *           series every season with its episodes (seasons is [] for movies)
 *           404 { error } when the id doesn't exist
 *
 * Calls: getContentDetail (catalog.service). The page itself checks maturity against the selected
 * profile and shows "not available on this profile" rather than a 404.
 */
import { handleError, parseId } from "@/app/api/_lib/http";
import { getContentDetail } from "@/server/services/catalog.service";

export async function GET(_request: Request, { params }: RouteContext<"/api/content/[contentId]">) {
  try {
    const contentId = parseId((await params).contentId, "Title not found.");
    return Response.json({ content: await getContentDetail(contentId) });
  } catch (error) {
    return handleError(error);
  }
}
