/** Shapes for the Home page (GET /api/profiles/:profileId/home) and the recommendation queries behind it. */
import type { ContentSummary, Episode } from "./catalog";

/** One row of the genre_taste view for a profile: how much it likes this genre. */
export interface GenreTaste {
  genreId: number;
  genre: string;
  tasteScore: number;
}

/** A recommended title and its score (sum of its genres' taste ÷ √ number of genres). */
export interface TopPick {
  contentId: number;
  score: number;
}

export type HomeRowKind = "continue-watching" | "top-picks" | "genre-picks";

export interface RowItem {
  content: ContentSummary;
  /** 0–100 "fit" for this profile; absent on rows that aren't personalised. */
  match?: number;
  /** Continue Watching only. */
  progress?: {
    progressPercent: number;
    episode: (Episode & { seasonNumber: number }) | null;
  };
}

export interface HomeRow {
  id: string;
  kind: HomeRowKind;
  title: string;
  /** Why this row is shown, displayed under its title. Computed per request, never stored. */
  reason: string;
  items: RowItem[];
}

export interface HomeHero {
  content: ContentSummary;
  reason: string;
  /** 0–100 "fit", once the pipeline ranks candidates. */
  match?: number;
}

export interface HomeFeed {
  profileId: number;
  hero: HomeHero | null;
  rows: HomeRow[];
  generatedAt: string;
}

/** recommendation.rec_status — the feedback loop: the player and title page move SHOWN → CLICKED → WATCHED, or DISMISSED. */
export type RecStatus = "SHOWN" | "CLICKED" | "WATCHED" | "DISMISSED";

/** A recommendation row: PRIMARY KEY (profile_id, content_id). The reason text is computed, never stored. */
export interface Recommendation {
  profileId: number;
  contentId: number;
  /** The shelf it was ranked for, e.g. "top-picks". */
  rowType: HomeRowKind;
  relevanceScore: number;
  generatedAt: string;
  recStatus: RecStatus;
}
