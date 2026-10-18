/**
 * GET /api/admin/content — one page of the catalogue for the admin content table.
 *
 * Request:  query (all optional) q (title substring, case-insensitive), type (MOVIE | SERIES), genre (genre id),
 *           page (1-based, default 1), pageSize (default 20, max 100)
 * Response: 200 AdminPage<AdminContentRow> { items, total, page, pageSize, pageCount }, titles A-Z; each item
 *             has genres and, for series, seasonCount / episodeCount (null for movies). A page past the end
 *             answers with the last page.
 *           401 / 403 not an admin · 422 { error } bad type, genre, page or pageSize
 *
 * Calls: requireAdmin → listContentForAdmin (admin-content.service)
 */
import { requireAdmin } from "@/app/api/_lib/auth";
import { handleError, parseWith } from "@/app/api/_lib/http";
import { adminContentQuerySchema } from "@/lib/validation/admin";
import { listContentForAdmin } from "@/server/services/admin-content.service";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const filters = parseWith(adminContentQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(await listContentForAdmin(filters));
  } catch (error) {
    return handleError(error);
  }
}
