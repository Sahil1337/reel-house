/**
 * GET /api/admin/tmdb/search?q=&type=movie|tv — search TMDB live, for the admin import page.
 * The TMDB call is IMPLEMENTED; only the "already in the catalogue" lookup goes through the service.
 *
 * Request:  query
 *             q     text, trimmed; empty → { results: [] } without calling TMDB; capped at 100 chars
 *             type  "movie" | "tv" (400 otherwise)
 * Response: 200 { results: TmdbSearchResult[], totalResults: number } — TMDB's first page (≤ 20)
 *           400 { error } bad type · 401 / 403 not an admin
 *           503 { error, code: "TMDB_KEY_MISSING" } · 502 { error } TMDB failed or rejected the key
 *
 * Calls: requireAdmin → getTmdbClient (src/app/api/_lib/tmdb.ts) → GET /search/{movie|tv}?query=
 *   &include_adult=false&page=1, each row mapped by toSearchResult() (src/lib/tmdb/catalog.ts) →
 *   markInCatalog (admin.service)
 */
import { toSearchResult } from "@/lib/tmdb/catalog";
import type { TmdbListItem, TmdbPage } from "@/lib/tmdb/types";
import { markInCatalog } from "@/server/services/admin.service";

import { requireAdmin } from "@/app/api/_lib/auth";
import { handleError } from "@/app/api/_lib/http";
import { getTmdbClient, parseMediaType, tmdbErrorResponse } from "@/app/api/_lib/tmdb";

export async function GET(request: Request) {
  try {
    await requireAdmin();

    const searchParams = new URL(request.url).searchParams;
    const type = parseMediaType(searchParams.get("type"));
    if (!type) return Response.json({ error: 'type must be "movie" or "tv".' }, { status: 400 });
    const q = (searchParams.get("q") ?? "").trim().slice(0, 100);
    if (!q) return Response.json({ results: [], totalResults: 0 });

    const tmdb = getTmdbClient();
    if (tmdb instanceof Response) return tmdb;

    let page: TmdbPage<TmdbListItem>;
    try {
      page = await tmdb.get<TmdbPage<TmdbListItem>>(`/search/${type}`, { query: q, include_adult: "false", page: 1 });
    } catch (error) {
      return tmdbErrorResponse(error);
    }

    const results = await markInCatalog(page.results.map((item) => toSearchResult(item, type)));
    return Response.json({ results, totalResults: page.total_results });
  } catch (error) {
    return handleError(error);
  }
}
