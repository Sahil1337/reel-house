/**
 * Shapes of the JSON files under data/.
 *
 *   data/tmdb/*.json  written by `scripts/import-tmdb.mts` (types shared via src/lib/tmdb/types.ts)
 *   data/mock/*.json  hand-written account + activity rows (plans, subscriptions and payments
 *                     use the src/types shapes as-is; the rest are below)
 *
 * Rows reference titles by their snapshot entry (contentType + tmdbId) and episodes by
 * seasonNumber + episodeNumber, never by app ids — those are assigned when loading,
 * the way identity columns would be when seeding the database. The TMDB id is only
 * matched against data/tmdb in memory; the database has no TMDB id column.
 */
import type { ContentType, MyListEntry, Profile, Rating, User, WatchHistory } from "@/types";

// ─── data/tmdb ───────────────────────────────────────────────────────────────

/** Written by scripts/import-tmdb.mts; the shapes live with the shared TMDB mappers. */
export type { SnapshotContent, SnapshotEpisode, SnapshotGenre, SnapshotPerson, SnapshotSeason } from "@/lib/tmdb/types";

// ─── data/mock ───────────────────────────────────────────────────────────────

/** A title in data/tmdb: TMDB ids are only unique per type, so the pair identifies one entry. */
export interface TitleRef {
  contentType: ContentType;
  tmdbId: number;
}

/** users row; passwordHash is "scrypt$<salt>$<hash>" (see src/server/auth/password.ts). */
export interface MockUser extends User {
  passwordHash: string;
}

/** profile row plus its profile_genre_preference rows (by genre name). */
export interface MockProfile extends Profile {
  genrePreferences: string[];
}

export interface MockWatchHistory extends Omit<WatchHistory, "contentId" | "episodeId">, TitleRef {
  /** Null for movies. */
  seasonNumber: number | null;
  episodeNumber: number | null;
}

export type MockMyListEntry = Omit<MyListEntry, "contentId"> & TitleRef;

export type MockRating = Omit<Rating, "contentId"> & TitleRef;
