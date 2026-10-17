/**
 * Imports movies and series from TMDB into a JSON snapshot under data/tmdb/.
 *
 * The snapshot is the single source of real content for the app: the database
 * seed and the frontend mock layer both read it, so nobody else needs a TMDB key.
 *
 *   node scripts/import-tmdb.mts [--movies=300] [--series=200] [--max-seasons=5] [--cast=8] [--no-cache]
 *
 * Requires TMDB_API_KEY in .env (the v4 "API Read Access Token", or a v3 API key).
 * Responses are cached in .cache/tmdb/, so re-runs are fast and resumable.
 *
 * This product uses the TMDB API but is not endorsed or certified by TMDB.
 */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";

// The TMDB client and the TMDB → snapshot mappers are shared with the admin import routes.
import {
  buildMovie,
  buildPerson,
  buildSeries,
  creditedPersonIds,
  EXCLUDED_MOVIE_GENRES,
  EXCLUDED_TV_GENRES,
  fetchCatalogueGenres,
} from "../src/lib/tmdb/catalog.ts";
import { createTmdbClient, mapConcurrent, type TmdbCache } from "../src/lib/tmdb/client.ts";
import type { SnapshotContent, SnapshotGenre, TmdbGenre, TmdbListItem, TmdbPage } from "../src/lib/tmdb/types.ts";

// ─── Config ──────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    movies: { type: "string", default: "300" },
    series: { type: "string", default: "200" },
    "max-seasons": { type: "string", default: "5" },
    cast: { type: "string", default: "8" },
    "no-cache": { type: "boolean", default: false },
  },
});

const TARGET_MOVIES = Number(args.movies);
const TARGET_SERIES = Number(args.series);
const MAX_SEASONS = Number(args["max-seasons"]);
const CAST_LIMIT = Number(args.cast);
const USE_CACHE = !args["no-cache"];

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT_DIR = path.join(ROOT, "data", "tmdb");
const CACHE_DIR = path.join(ROOT, ".cache", "tmdb");

const CONCURRENCY = 8;

/** Share of each catalogue taken from the overall most-voted titles; the rest is spread evenly across genres. */
const GLOBAL_SHARE = 0.5;
const MIN_VOTES = { movie: 300, tv: 150 } as const;

// ─── HTTP ────────────────────────────────────────────────────────────────────

function loadApiKey(): string {
  try {
    process.loadEnvFile(path.join(ROOT, ".env"));
  } catch {
    // No .env file — fall back to the shell environment.
  }
  const key = process.env.TMDB_API_KEY?.trim();
  if (!key) {
    console.error("TMDB_API_KEY is not set. Add it to .env (see .env.example).");
    process.exit(1);
  }
  return key;
}

/** Responses are cached on disk by request URL, so re-runs are fast and resumable. */
const diskCache: TmdbCache = {
  async read(url) {
    const file = cacheFile(url);
    return USE_CACHE && existsSync(file) ? JSON.parse(await readFile(file, "utf8")) : undefined;
  },
  async write(url, body) {
    await writeFile(cacheFile(url), JSON.stringify(body));
  },
};

function cacheFile(url: string): string {
  return path.join(CACHE_DIR, `${createHash("sha1").update(url).digest("hex")}.json`);
}

const client = createTmdbClient({ apiKey: loadApiKey(), cache: diskCache });
const tmdb = client.get;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Every title needs at least one genre, or genre-based recommendations can't place it. */
function hasGenres(item: SnapshotContent): boolean {
  return item.genreIds.length > 0;
}

function progress(label: string, done: number, total: number): void {
  if (done === total || done % 25 === 0) console.log(`  ${label}: ${done}/${total}`);
}

// ─── Selection ───────────────────────────────────────────────────────────────

type MediaType = "movie" | "tv";

/** Lazily pages through /discover results for one query, skipping titles without a poster or overview. */
function discoverCursor(media: MediaType, extraParams: Record<string, string | number>) {
  const excluded = media === "movie" ? EXCLUDED_MOVIE_GENRES : EXCLUDED_TV_GENRES;
  let page = 0;
  let totalPages = Infinity;
  let buffer: TmdbListItem[] = [];

  return async function nextId(): Promise<number | null> {
    while (buffer.length === 0) {
      if (page >= totalPages || page >= 500) return null;
      page++;
      const result = await tmdb<TmdbPage<TmdbListItem>>(`/discover/${media}`, {
        sort_by: "vote_count.desc",
        include_adult: "false",
        "vote_count.gte": MIN_VOTES[media],
        without_genres: excluded.join("|"),
        page,
        ...extraParams,
      });
      totalPages = result.total_pages;
      buffer = result.results.filter((item) => item.poster_path && item.overview);
    }
    return buffer.shift()!.id;
  };
}

/**
 * Picks `target` ids: the first half from the overall most-voted titles (so the
 * catalogue is recognisable), the rest round-robin across genres (so every genre
 * has enough titles for genre-based recommendations to work).
 */
async function selectIds(media: MediaType, target: number, genres: TmdbGenre[]): Promise<number[]> {
  const selected = new Set<number>();

  const global = discoverCursor(media, {});
  while (selected.size < Math.round(target * GLOBAL_SHARE)) {
    const id = await global();
    if (id === null) break;
    selected.add(id);
  }

  const cursors = genres.map((genre) => discoverCursor(media, { with_genres: genre.id }));
  const exhausted = new Set<number>();
  while (selected.size < target && exhausted.size < cursors.length) {
    for (let i = 0; i < cursors.length && selected.size < target; i++) {
      if (exhausted.has(i)) continue;
      let id: number | null;
      do id = await cursors[i]();
      while (id !== null && selected.has(id));
      if (id === null) exhausted.add(i);
      else selected.add(id);
    }
  }

  return [...selected];
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(OUT_DIR, { recursive: true });

  console.log("Fetching genres…");
  const [catalogueGenres, tvGenres] = await Promise.all([
    fetchCatalogueGenres(client),
    tmdb<{ genres: TmdbGenre[] }>("/genre/tv/list"),
  ]);
  const discoverableTvGenres = tvGenres.genres.filter((genre) => !EXCLUDED_TV_GENRES.includes(genre.id));

  console.log(`Selecting ${TARGET_MOVIES} movies and ${TARGET_SERIES} series…`);
  const [movieIds, seriesIds] = await Promise.all([
    selectIds("movie", TARGET_MOVIES, catalogueGenres),
    selectIds("tv", TARGET_SERIES, discoverableTvGenres),
  ]);

  console.log("Fetching movie details…");
  let done = 0;
  const movies = (
    await mapConcurrent(movieIds, CONCURRENCY, async (id) => {
      const movie = await buildMovie(client, id, { castLimit: CAST_LIMIT });
      progress("movies", ++done, movieIds.length);
      return movie;
    })
  ).filter(hasGenres);

  console.log("Fetching series, seasons and episodes…");
  done = 0;
  const series = (
    await mapConcurrent(seriesIds, CONCURRENCY, async (id) => {
      const show = await buildSeries(client, id, { maxSeasons: MAX_SEASONS, castLimit: CAST_LIMIT });
      progress("series", ++done, seriesIds.length);
      return show;
    })
  ).filter(hasGenres);

  const content = [...movies, ...series];

  const personIds = [...new Set(content.flatMap(creditedPersonIds))];
  console.log(`Fetching ${personIds.length} people…`);
  done = 0;
  const people = await mapConcurrent(personIds, CONCURRENCY, async (id) => {
    const person = await buildPerson(client, id);
    progress("people", ++done, personIds.length);
    return person;
  });

  const usedGenreIds = new Set(content.flatMap((item) => item.genreIds));
  const genres: SnapshotGenre[] = catalogueGenres
    .filter((genre) => usedGenreIds.has(genre.id))
    .map((genre) => ({ tmdbId: genre.id, name: genre.name }));

  const byTmdbId = (a: { tmdbId: number }, b: { tmdbId: number }) => a.tmdbId - b.tmdbId;
  const meta = {
    source: "TMDB (https://www.themoviedb.org)",
    attribution: "This product uses the TMDB API but is not endorsed or certified by TMDB.",
    importedAt: new Date().toISOString(),
    counts: {
      genres: genres.length,
      movies: movies.length,
      series: series.length,
      seasons: series.reduce((sum, show) => sum + (show.seasons?.length ?? 0), 0),
      episodes: series.reduce(
        (sum, show) => sum + (show.seasons ?? []).reduce((total, season) => total + season.episodes.length, 0),
        0,
      ),
      people: people.length,
    },
    options: { maxSeasons: MAX_SEASONS, castLimit: CAST_LIMIT },
  };

  await Promise.all([
    writeJson("meta.json", meta),
    writeJson("genres.json", genres),
    writeJson("people.json", people.toSorted(byTmdbId)),
    writeJson("movies.json", movies.toSorted(byTmdbId)),
    writeJson("series.json", series.toSorted(byTmdbId)),
  ]);

  console.log(`\nDone → ${path.relative(ROOT, OUT_DIR)}/`);
  console.table(meta.counts);
  console.log(`${client.stats.requests} API requests, ${client.stats.cacheHits} cache hits.`);
}

async function writeJson(fileName: string, data: unknown): Promise<void> {
  await writeFile(path.join(OUT_DIR, fileName), JSON.stringify(data, null, 2) + "\n");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
