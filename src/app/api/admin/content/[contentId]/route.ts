/**
 * PATCH  /api/admin/content/:contentId — edit a title's details.
 * DELETE /api/admin/content/:contentId — permanently remove a title and everything that hangs off it.
 *
 * PATCH request:  path contentId · body, any of { title, description, releaseDate ("YYYY-MM-DD" | null),
 *                 ageRating (one of the 12 US certificates | null), posterUrl (http(s) | null),
 *                 backdropUrl (http(s) | null) }; send only what changed, at least one field.
 *                 content_type is not editable.
 * PATCH response: 200 { content: AdminContentRow } the updated row
 *                 400 body isn't JSON · 401 / 403 not an admin · 404 { error } no such title
 *                 409 { error, code: "CONTENT_EXISTS" } another title has that title + type + release date
 *                 422 { error } a field breaks its rule
 * DELETE request:  path contentId · no body
 * DELETE response: 204 no body (the title and its genre links, credits, seasons, episodes, watch history,
 *                  list entries, ratings and recommendations are gone; people and genres stay)
 *                  401 / 403 not an admin · 404 { error } no such title (also on a repeated delete)
 *
 * Calls: requireAdmin → updateContent / deleteContent (admin-content.service).
 */
import { requireAdmin } from "@/app/api/_lib/auth";
import { handleError, parseBody, parseId } from "@/app/api/_lib/http";
import { updateContentSchema } from "@/lib/validation/admin";
import { deleteContent, updateContent } from "@/server/services/admin-content.service";

export async function PATCH(request: Request, { params }: RouteContext<"/api/admin/content/[contentId]">) {
  try {
    await requireAdmin();
    const contentId = parseId((await params).contentId, "Title not found.");
    const input = await parseBody(request, updateContentSchema);
    return Response.json({ content: await updateContent(contentId, input) });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/admin/content/[contentId]">) {
  try {
    await requireAdmin();
    const contentId = parseId((await params).contentId, "Title not found.");
    await deleteContent(contentId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleError(error);
  }
}
