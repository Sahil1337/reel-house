/**
 * GET /api/admin/content/:contentId/impact — what removing this title would delete, per child table.
 * The remove dialog shows it before the admin confirms.
 *
 * Request:  path contentId
 * Response: 200 ContentDeletionImpact { contentId, title, contentType, counts: { content_genre, content_credit,
 *             season, episode, watch_history, my_list, rating } } rows removed by the ON DELETE
 *             CASCADE chain; a preview, rows added before the delete are removed too
 *           401 / 403 not an admin · 404 { error } no such title
 *
 * Calls: requireAdmin → getContentDeletionImpact (admin-content.service)
 */
import { requireAdmin } from "@/app/api/_lib/auth";
import { handleError, parseId } from "@/app/api/_lib/http";
import { getContentDeletionImpact } from "@/server/services/admin-content.service";

export async function GET(_request: Request, { params }: RouteContext<"/api/admin/content/[contentId]/impact">) {
  try {
    await requireAdmin();
    const contentId = parseId((await params).contentId, "Title not found.");
    return Response.json(await getContentDeletionImpact(contentId));
  } catch (error) {
    return handleError(error);
  }
}
