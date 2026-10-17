/**
 * TMDB → snapshot mapping, shared by scripts/import-tmdb.mts (bulk import into data/tmdb/)
 * and the admin import routes (one title at a time, live). Same rules in both places:
 *
 *   - Genres: one genre table for movies and series, so TMDB's TV-only genres are folded
 *     into movie genre ids (TV_GENRE_TO_MOVIE_GENRES); "TV Movie" is dropped.
 *   - Age rating: the US certification, kept only if content.age_rating's CHECK allows it
 *     (TV-Y7-FV → TV-Y7, anything else → null). Maturity is derived from it exactly like the
 *     SQL function maturity_of() in docs/schema/SCHEMA.md: KIDS / TEEN / ADULT, no certification → TEEN.
 *   - Series: the first `maxSeasons` seasons (season 0, "Specials", skipped), each with its
 *     episodes; the creators stand in as directors.
 *   - Cast: the top `castLimit` billed, renumbered 0…n.
 *
 * No path aliases and only type imports, so Node can run it with type stripping.
 */
import type { TmdbClient } from "./client";
import type {
  SnapshotCastCredit,
  SnapshotContent,
  SnapshotGenre,
  SnapshotPerson,
  SnapshotSeason,
  TmdbCredits,
  TmdbGenre,
  TmdbListItem,
  TmdbMediaType,
  TmdbMovieDetails,
  TmdbPersonDetails,
  TmdbSeasonDetails,
  TmdbTvDetails,
} from "./types";

const IMAGE_BASE = "https://image.tmdb.org/t/p";

export const DEFAULT_MAX_SEASONS = 5;
export const DEFAULT_CAST_LIMIT = 8;

/** Genres that don't belong in the catalogue. */
export const EXCLUDED_MOVIE_GENRES = [10770]; // TV Movie
export const EXCLUDED_TV_GENRES = [10763, 10764, 10766, 10767]; // News, Reality, Soap, Talk

/**
 * The app uses one genre table for movies and series, so TMDB's TV-only genres are
 * folded into the movie genre ids. Ids not listed here are shared already.
 */
export const TV_GENRE_TO_MOVIE_GENRES: Record<number, number[]> = {
  10759: [28, 12], // Action & Adventure → Action, Adventure
  10762: [10751], // Kids → Family
  10765: [878, 14], // Sci-Fi & Fantasy → Science Fiction, Fantasy
  10768: [10752], // War & Politics → War
};

/** content.age_rating's CHECK list, grouped by what maturity_of() (docs/schema/SCHEMA.md) returns. */
const KIDS_RATINGS = new Set(["G", "PG", "TV-Y", "TV-Y7", "TV-G", "TV-PG"]);
const TEEN_RATINGS = new Set(["PG-13", "TV-14"]);
const ADULT_RATINGS = new Set(["R", "NC-17", "NR", "TV-MA"]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function imageUrl(filePath: string | null, size: "w185" | "w300" | "w500" | "w1280"): string | null {
  return filePath ? `${IMAGE_BASE}/${size}${filePath}` : null;
}

function nullableDate(value: string | null | undefined): string | null {
  return value ? value : null;
}

/** A TMDB certification as content.age_rating stores it: a code its CHECK allows, else null. */
function ageRatingFor(certification: string | null | undefined): string | null {
  const code = certification === "TV-Y7-FV" ? "TV-Y7" : certification; // FV ("fantasy violence") is a TV-Y7 descriptor
  if (!code) return null;
  return KIDS_RATINGS.has(code) || TEEN_RATINGS.has(code) || ADULT_RATINGS.has(code) ? code : null;
}

/** Mirrors maturity_of(): only for the derived maturityLevel field, it is never stored. */
export function maturityFor(ageRating: string | null): SnapshotContent["maturityLevel"] {
  if (!ageRating) return "TEEN";
  if (KIDS_RATINGS.has(ageRating)) return "KIDS";
  if (TEEN_RATINGS.has(ageRating)) return "TEEN";
  return "ADULT";
}

function castFrom(credits: TmdbCredits, castLimit: number): SnapshotCastCredit[] {
  return credits.cast
    .toSorted((a, b) => a.order - b.order)
    .slice(0, castLimit)
    .map((member, index) => ({ personTmdbId: member.id, characterName: member.character ?? "", order: index }));
}

// ─── Builders (one TMDB title → one snapshot row) ────────────────────────────

export async function buildMovie(
  client: TmdbClient,
  id: number,
  { castLimit = DEFAULT_CAST_LIMIT }: { castLimit?: number } = {},
): Promise<SnapshotContent> {
  const movie = await client.get<TmdbMovieDetails>(`/movie/${id}`, { append_to_response: "credits,release_dates" });

  const usRelease = movie.release_dates.results.find((entry) => entry.iso_3166_1 === "US");
  const ageRating = ageRatingFor(usRelease?.release_dates.find((release) => release.certification)?.certification);

  return {
    tmdbId: movie.id,
    contentType: "MOVIE",
    title: movie.title,
    originalTitle: movie.original_title,
    description: movie.overview,
    releaseDate: nullableDate(movie.release_date),
    durationMinutes: movie.runtime || null,
    ageRating,
    maturityLevel: maturityFor(ageRating),
    posterUrl: imageUrl(movie.poster_path, "w500"),
    backdropUrl: imageUrl(movie.backdrop_path, "w1280"),
    genreIds: movie.genres.map((genre) => genre.id).filter((genreId) => !EXCLUDED_MOVIE_GENRES.includes(genreId)),
    cast: castFrom(movie.credits, castLimit),
    directorIds: [
      ...new Set(movie.credits.crew.filter((member) => member.job === "Director").map((member) => member.id)),
    ],
  };
}

export async function buildSeries(
  client: TmdbClient,
  id: number,
  {
    maxSeasons = DEFAULT_MAX_SEASONS,
    castLimit = DEFAULT_CAST_LIMIT,
  }: { maxSeasons?: number; castLimit?: number } = {},
): Promise<SnapshotContent> {
  const show = await client.get<TmdbTvDetails>(`/tv/${id}`, { append_to_response: "credits,content_ratings" });

  const ageRating = ageRatingFor(show.content_ratings.results.find((entry) => entry.iso_3166_1 === "US")?.rating);
  const fallbackRuntime = show.episode_run_time[0] ?? null;

  const seasonNumbers = show.seasons
    .map((season) => season.season_number)
    .filter((number) => number > 0) // season 0 is "Specials"
    .sort((a, b) => a - b)
    .slice(0, maxSeasons);

  const seasons = await Promise.all(
    seasonNumbers.map(async (seasonNumber): Promise<SnapshotSeason> => {
      const season = await client.get<TmdbSeasonDetails>(`/tv/${id}/season/${seasonNumber}`);
      return {
        tmdbId: season.id,
        seasonNumber: season.season_number,
        name: season.name,
        releaseDate: nullableDate(season.air_date),
        posterUrl: imageUrl(season.poster_path, "w500"),
        episodes: season.episodes.map((episode) => ({
          tmdbId: episode.id,
          episodeNumber: episode.episode_number,
          title: episode.name,
          description: episode.overview,
          releaseDate: nullableDate(episode.air_date),
          durationMinutes: episode.runtime ?? fallbackRuntime,
          stillUrl: imageUrl(episode.still_path, "w300"),
        })),
      };
    }),
  );

  // Series rarely credit a single director; the creators play that role. Fall back
  // to credited directors when a show lists no creator.
  const creators = show.created_by.map((creator) => creator.id);
  const directors = creators.length
    ? creators
    : show.credits.crew.filter((member) => member.job === "Director").map((member) => member.id);

  const genreIds = show.genres.flatMap((genre) => TV_GENRE_TO_MOVIE_GENRES[genre.id] ?? [genre.id]);

  return {
    tmdbId: show.id,
    contentType: "SERIES",
    title: show.name,
    originalTitle: show.original_name,
    description: show.overview,
    releaseDate: nullableDate(show.first_air_date),
    durationMinutes: null,
    ageRating,
    maturityLevel: maturityFor(ageRating),
    posterUrl: imageUrl(show.poster_path, "w500"),
    backdropUrl: imageUrl(show.backdrop_path, "w1280"),
    genreIds: [...new Set(genreIds)],
    cast: castFrom(show.credits, castLimit),
    directorIds: [...new Set(directors)],
    seasons: seasons.filter((season) => season.episodes.length > 0),
  };
}

export async function buildPerson(client: TmdbClient, id: number): Promise<SnapshotPerson> {
  const person = await client.get<TmdbPersonDetails>(`/person/${id}`);
  return {
    tmdbId: person.id,
    name: person.name,
    dateOfBirth: nullableDate(person.birthday),
    photoUrl: imageUrl(person.profile_path, "w185"),
  };
}

/** Every person a title credits (cast first, then directors), each once. */
export function creditedPersonIds(content: SnapshotContent): number[] {
  return [...new Set([...content.cast.map((member) => member.personTmdbId), ...content.directorIds])];
}

/** The catalogue's genre list: TMDB's movie genres minus the excluded ones (TV genres fold into these). */
export async function fetchCatalogueGenres(client: TmdbClient): Promise<TmdbGenre[]> {
  const { genres } = await client.get<{ genres: TmdbGenre[] }>("/genre/movie/list");
  return genres.filter((genre) => !EXCLUDED_MOVIE_GENRES.includes(genre.id));
}

/**
 * One title with everything an import stores: the content row (with seasons and episodes for
 * series), each credited person's details and the named genres. Used by the admin preview.
 */
export async function fetchTitle(
  client: TmdbClient,
  media: TmdbMediaType,
  id: number,
): Promise<{ content: SnapshotContent; people: SnapshotPerson[]; genres: SnapshotGenre[] }> {
  const [content, catalogueGenres] = await Promise.all([
    media === "movie" ? buildMovie(client, id) : buildSeries(client, id),
    fetchCatalogueGenres(client),
  ]);
  const people = await Promise.all(creditedPersonIds(content).map((personId) => buildPerson(client, personId)));
  const genres = content.genreIds.flatMap((genreId) => {
    const genre = catalogueGenres.find((entry) => entry.id === genreId);
    return genre ? [{ tmdbId: genre.id, name: genre.name }] : [];
  });
  return { content, people, genres };
}

// ─── Search ──────────────────────────────────────────────────────────────────

/** A /search/movie or /search/tv row in the light shape the admin search grid uses. */
export function toSearchResult(item: TmdbListItem, media: TmdbMediaType) {
  const date = media === "movie" ? item.release_date : item.first_air_date;
  return {
    tmdbId: item.id,
    contentType: media === "movie" ? ("MOVIE" as const) : ("SERIES" as const),
    title: (media === "movie" ? item.title : item.name) ?? "Untitled",
    releaseDate: nullableDate(date),
    posterUrl: imageUrl(item.poster_path, "w300"),
    overview: item.overview,
  };
}
