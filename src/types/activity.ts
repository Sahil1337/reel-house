/** Viewing activity — mirror watch_history / my_list / rating / onboarding tables. */
import type { ContentSummary, Episode } from "./catalog";

export interface WatchHistory {
  historyId: number;
  profileId: number;
  contentId: number;
  /** Null for movies. */
  episodeId: number | null;
  watchedAt: string;
  /** 0–100. "Completed" is derived, never stored: progressPercent >= COMPLETED_THRESHOLD (see isCompleted). */
  progressPercent: number;
}

export interface MyListEntry {
  profileId: number;
  contentId: number;
  addedAt: string;
}

export interface Rating {
  profileId: number;
  contentId: number;
  /** 1–5 */
  value: number;
  ratedAt: string;
}

export interface ProfileGenrePreference {
  profileId: number;
  genreId: number;
}

/** One My List entry joined with its title (GET /api/profiles/:profileId/my-list), most recently added first. */
export type MyListItem = ContentSummary & { addedAt: string };

/** A history row joined with what was watched, for the history page and resume logic. */
export interface HistoryItem extends WatchHistory {
  content: ContentSummary;
  episode: (Episode & { seasonNumber: number }) | null;
}

export interface ProgressInput {
  contentId: number;
  episodeId: number | null;
  progressPercent: number;
}

/** What a profile has done with one title — drives the title page controls. */
export interface TitleActivity {
  inMyList: boolean;
  rating: number | null;
  /** The most recent unfinished (or next) thing to play. */
  resume: {
    episodeId: number | null;
    progressPercent: number;
    label: string;
  } | null;
}

export interface OnboardingInput {
  genreIds: number[];
}
