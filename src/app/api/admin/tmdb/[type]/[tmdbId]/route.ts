/**
 * GET /api/admin/tmdb/:type/:tmdbId — one TMDB title, live, mapped exactly like scripts/import-tmdb.mts
 * maps it, plus the SQL that importing it would run. Feeds the import page's preview and SQL panel.
 * The TMDB fetch and the SQL text are IMPLEMENTED; only the catalogue lookup goes through the service.
 *
 * Request:  path type "movie" | "tv", tmdbId a positive integer (400 otherwise). The TMDB id only
 *           names the title to ask TMDB for; the database stores none.
 * Response: 200 TmdbTitlePreview {
 *             content, people, genres,          the snapshot shape of data/tmdb (src/lib/tmdb/types.ts)
 *             alreadyInCatalog, existingContentId,
 *             rowCounts: { table, rows }[],     what an import writes, per table
 *             statements: SqlStatement[]        BEGIN … COMMIT, each { step, title, explanation, sql, params, inlinedSql }
 *           }
 *           400 bad type or id · 401 / 403 not an admin · 404 TMDB has no such title
 *           503 { error, code: "TMDB_KEY_MISSING" } · 502 { error } TMDB failed or rejected the key
 *
 * Calls: requireAdmin → getTmdbClient (src/app/api/_lib/tmdb.ts) → fetchTitle (src/lib/tmdb/catalog.ts,
 *   shared with the import script) → findCatalogueId (admin.service) → buildImportScript
 *   (src/lib/sql/import-title.ts, text only)
 */
import { buildImportScript } from "@/lib/sql/import-title";
import { fetchTitle } from "@/lib/tmdb/catalog";
import { findCatalogueId } from "@/server/services/admin.service";
import type { TmdbTitlePreview } from "@/types";

import { requireAdmin } from "@/app/api/_lib/auth";
import { handleError } from "@/app/api/_lib/http";
import { getTmdbClient, parseMediaType, tmdbErrorResponse } from "@/app/api/_lib/tmdb";

type Context = RouteContext<"/api/admin/tmdb/[type]/[tmdbId]">;

export async function GET(_request: Request, { params }: Context) {
  try {
    await requireAdmin();

    const { type: typeParam, tmdbId: idParam } = await params;
    const type = parseMediaType(typeParam);
    const tmdbId = Number(idParam);
    if (!type || !Number.isInteger(tmdbId) || tmdbId <= 0) {
      return Response.json(
        { error: "Use /api/admin/tmdb/movie/:tmdbId or /api/admin/tmdb/tv/:tmdbId." },
        { status: 400 },
      );
    }

    const tmdb = getTmdbClient();
    if (tmdb instanceof Response) return tmdb;

    let title: Awaited<ReturnType<typeof fetchTitle>>;
    try {
      title = await fetchTitle(tmdb, type, tmdbId);
    } catch (error) {
      return tmdbErrorResponse(error);
    }

    const { content } = title;
    const existingContentId = await findCatalogueId(content.contentType, content.title, content.releaseDate);

    const preview: TmdbTitlePreview = {
      ...title,
      alreadyInCatalog: existingContentId !== null,
      existingContentId,
      ...buildImportScript(title),
    };
    return Response.json(preview);
  } catch (error) {
    return handleError(error);
  }
}
