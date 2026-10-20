/**
 * Shapes shared by scripts/import-tmdb.mts, and the admin TMDB routes.
 *
 *   Snapshot*  what the importer writes to data/tmdb/*.json (and what the admin preview shows)
 *   Tmdb*      the subset of TMDB's API responses we read
 *
 * Type-only module: Node's type stripping erases `import type`, so the script can share it.
 */
import type { ContentType, MaturityLevel } from "@/types";

// ─── Snapshot (data/tmdb) ────────────────────────────────────────────────────

export interface SnapshotGenre {
  tmdbId: number;
  name: string;
}

export interface SnapshotPerson {
  tmdbId: number;
  name: string;
  dateOfBirth: string | null;
  photoUrl: string | null;
}

export interface SnapshotEpisode {
  tmdbId: number;
  episodeNumber: number;
  title: string;
  description: string;
  releaseDate: string | null;
  durationMinutes: number | null;
  stillUrl: string | null;
}

export interface SnapshotSeason {
  tmdbId: number;
  seasonNumber: number;
  name: string;
  releaseDate: string | null;
  posterUrl: string | null;
  episodes: SnapshotEpisode[];
}

export interface SnapshotCastCredit {
  personTmdbId: number;
  characterName: string;
  order: number;
}

export interface SnapshotContent {
  /** TMDB ids are only unique per type, so (tmdbId, contentType) identifies a snapshot entry. Not stored in the database. */
  tmdbId: number;
  contentType: ContentType;
  title: string;
  originalTitle: string;
  description: string;
  releaseDate: string | null;
  /** Runtime for movies; null for series (episodes carry their own duration). */
  durationMinutes: number | null;
  /** A US certification content.age_rating's CHECK accepts, or null. */
  ageRating: string | null;
  /** Derived from ageRating, the same mapping as the SQL function maturity_of(); never stored. */
  maturityLevel: MaturityLevel;
  posterUrl: string | null;
  backdropUrl: string | null;
  /** Movie genre ids (TV-only genres are folded into them). */
  genreIds: number[];
  cast: SnapshotCastCredit[];
  directorIds: number[];
  /** Series only. */
  seasons?: SnapshotSeason[];
}

// ─── TMDB responses (only the fields we read) ────────────────────────────────

export type TmdbMediaType = "movie" | "tv";

export interface TmdbPage<T> {
  page: number;
  total_pages: number;
  total_results: number;
  results: T[];
}

/** One row of /discover/* or /search/* (movies carry title/release_date, TV name/first_air_date). */
export interface TmdbListItem {
  id: number;
  title?: string;
  name?: string;
  release_date?: string;
  first_air_date?: string;
  poster_path: string | null;
  overview: string;
}

export interface TmdbGenre {
  id: number;
  name: string;
}

export interface TmdbCastMember {
  id: number;
  name: string;
  character: string;
  order: number;
}

export interface TmdbCrewMember {
  id: number;
  name: string;
  job: string;
}

export interface TmdbCredits {
  cast: TmdbCastMember[];
  crew: TmdbCrewMember[];
}

export interface TmdbMovieDetails {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  release_date: string;
  runtime: number | null;
  poster_path: string | null;
  backdrop_path: string | null;
  adult: boolean;
  genres: TmdbGenre[];
  credits: TmdbCredits;
  release_dates: { results: { iso_3166_1: string; release_dates: { certification: string; type: number }[] }[] };
}

export interface TmdbTvDetails {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  first_air_date: string;
  episode_run_time: number[];
  poster_path: string | null;
  backdrop_path: string | null;
  adult: boolean;
  genres: TmdbGenre[];
  created_by: { id: number; name: string }[];
  credits: TmdbCredits;
  content_ratings: { results: { iso_3166_1: string; rating: string }[] };
  seasons: { season_number: number; episode_count: number }[];
}

export interface TmdbSeasonDetails {
  id: number;
  season_number: number;
  name: string;
  air_date: string | null;
  poster_path: string | null;
  episodes: {
    id: number;
    episode_number: number;
    name: string;
    overview: string;
    air_date: string | null;
    runtime: number | null;
    still_path: string | null;
  }[];
}

export interface TmdbPersonDetails {
  id: number;
  name: string;
  birthday: string | null;
  profile_path: string | null;
}
