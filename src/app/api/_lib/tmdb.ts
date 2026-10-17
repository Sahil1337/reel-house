/**
 * TMDB access for the /api/admin/tmdb/** routes. IMPLEMENTED (live TMDB calls, not a stub).
 * Each returns the data, or the error Response to send back as-is (like ./auth.ts):
 *
 *   const tmdb = getTmdbClient();
 *   if (tmdb instanceof Response) return tmdb;
 *
 * The key never leaves the server: TMDB_API_KEY is read from the environment (.env), and the
 * browser only ever talks to our routes.
 */
import { createTmdbClient, TmdbError, type TmdbClient } from "@/lib/tmdb/client";
import type { TmdbMediaType } from "@/lib/tmdb/types";

/** A client for this request, or 503 when TMDB_API_KEY isn't configured. */
export function getTmdbClient(): TmdbClient | Response {
  const apiKey = process.env.TMDB_API_KEY?.trim();
  if (!apiKey) {
    return Response.json(
      {
        error: "TMDB_API_KEY isn't set on the server. Add it to .env (see .env.example) and restart.",
        code: "TMDB_KEY_MISSING",
      },
      { status: 503 },
    );
  }
  // Two attempts: an admin is waiting, so a rate-limited request fails fast rather than backing off for long.
  return createTmdbClient({ apiKey, maxAttempts: 2 });
}

export function parseMediaType(value: string | null): TmdbMediaType | null {
  return value === "movie" || value === "tv" ? value : null;
}

/** Maps a failed TMDB call to our response: 404 stays 404, a rejected key and outages become 502. */
export function tmdbErrorResponse(error: unknown): Response {
  if (error instanceof TmdbError) {
    if (error.status === 404) return Response.json({ error: "TMDB has no title with that id." }, { status: 404 });
    if (error.status === 401) {
      return Response.json(
        { error: "TMDB rejected the API key. Check TMDB_API_KEY in .env.", code: "TMDB_KEY_INVALID" },
        { status: 502 },
      );
    }
    if (error.status === 429)
      return Response.json({ error: "TMDB is rate-limiting us. Try again in a few seconds." }, { status: 502 });
    return Response.json({ error: `TMDB answered ${error.status}. Try again shortly.` }, { status: 502 });
  }
  return Response.json({ error: "Couldn't reach TMDB. Check the server's connection." }, { status: 502 });
}
