/**
 * POST /api/admin/content/import — add (or refresh) one TMDB title in the catalogue.
 * The import page's "Import" button calls it after the admin has reviewed the preview and its SQL.
 *
 * Request:  body { type: "movie" | "tv", tmdbId: number }
 * Response: 201 { contentId, created: true }   a new content row (with its genres, people, seasons, episodes)
 *           200 { contentId, created: false }  the title was already there; every row was refreshed in place
 *           400 { error } body isn't JSON, unknown type, tmdbId not a positive integer
 *           401 / 403 not an admin · 404 TMDB has no such title
 *           503 { error } TMDB_API_KEY missing · 502 { error } TMDB failed · 500 { error } the transaction rolled back
 *
 * Calls: requireAdmin → importTitle (admin.service).
 * TODO (with the real importTitle): fetch the title on the server first — getTmdbClient
 *   (src/app/api/_lib/tmdb.ts) + fetchTitle (src/lib/tmdb/catalog.ts), TMDB errors via tmdbErrorResponse —
 *   and pass it as importTitle(input, title). Not wired yet: the mock import needs no TMDB call.
 */
import { z } from "zod";

import { importTitle } from "@/server/services/admin.service";

import { requireAdmin } from "@/app/api/_lib/auth";
import { handleError } from "@/app/api/_lib/http";

const importSchema = z.object({
  type: z.enum(["movie", "tv"]),
  tmdbId: z.number().int().positive(),
});

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const body: unknown = await request.json().catch(() => ({}));
    const input = importSchema.safeParse(body);
    if (!input.success) {
      return Response.json({ error: 'Send { type: "movie" | "tv", tmdbId: number }.' }, { status: 400 });
    }
    const result = await importTitle(input.data);
    return Response.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    return handleError(error);
  }
}
