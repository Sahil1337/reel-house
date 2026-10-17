/**
 * GET /api/content?q=&type=MOVIE|SERIES&genre=&limit= — search and browse the catalogue.
 * Used by /search, the ⌘K palette, genre pages and the poster walls.
 *
 * Request:  query
 *             q      optional text; matches title, cast or director names
 *             type   optional "MOVIE" | "SERIES" (anything else is ignored)
 *             genre  optional genre id
 *             limit  optional, default 60, clamped to 1–100
 * Response: 200 { items: ContentSummary[] }
 *
 * Calls: getSelectedProfile (maturity filter; none selected → no filter) → searchContent (catalog.service)
 */
import { handleError } from "@/app/api/_lib/http";
import { getSelectedProfile } from "@/app/api/_lib/auth";
import { searchContent, type ContentSearch } from "@/server/services/catalog.service";

/** q / type / genre / limit from the query string; unknown type and non-numeric genre are ignored. */
function parseContentQuery(searchParams: URLSearchParams): Omit<ContentSearch, "maturityLevel"> {
  const q = searchParams.get("q")?.trim();
  const type = searchParams.get("type");
  const genre = Number(searchParams.get("genre"));
  const limit = Math.trunc(Number(searchParams.get("limit"))) || 60;
  return {
    q: q || undefined,
    type: type === "MOVIE" || type === "SERIES" ? type : undefined,
    genreId: Number.isSafeInteger(genre) && genre > 0 ? genre : undefined,
    limit: Math.min(Math.max(limit, 1), 100),
  };
}

export async function GET(request: Request) {
  try {
    const profile = await getSelectedProfile();
    const query = parseContentQuery(new URL(request.url).searchParams);
    const items = await searchContent({ ...query, maturityLevel: profile?.maturityLevel ?? null });
    return Response.json({ items });
  } catch (error) {
    return handleError(error);
  }
}
