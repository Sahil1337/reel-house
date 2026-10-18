/** Shapes returned by GET /api/profiles/:profileId/home (the recommendation pipeline is documented there). */
import type { ContentSummary, Episode } from "./catalog";

/**
 * Stage 1 output: contentId → interaction score (the interaction_score view for one profile).
 * Titles the profile never touched are absent.
 */
export type InteractionScores = Map<number, number>;

/** Stage 2 output: one candidate title with its four 0–1 parts. */
export interface Candidate {
  contentId: number;
  genreAffinity: number;
  peopleAffinity: number;
  itemKnn: number;
  popularityPrior: number;
}

/** Stage 3 output: a candidate after the blend and filters, best first. */
export interface RankedCandidate extends Candidate {
  content: ContentSummary;
  /** 0.6 × genreAffinity + 0.4 × peopleAffinity. */
  affinity: number;
  /** 0.5 × affinity + 0.3 × itemKnn + 0.2 × popularityPrior. */
  score: number;
  /** round(55 + 44 × min(1, score ÷ best score)): the "93% fit" chip. */
  match: number;
}

/** Stage 4 output: what the Home page is built from (and what stage 5 stores). */
export interface HomeBuild {
  hero: HomeHero | null;
  rows: HomeRow[];
}

export type HomeRowKind =
  | "continue-watching"
  | "top-picks"
  | "because-you-liked"
  | "trending"
  | "top-rated-genre"
  | "more-with-person"
  | "genre-picks";

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
  /**
   * Human-readable explanation of why this row exists, shown subtly in the UI. Computed by
   * buildHomeRows from the row kind plus context (genre, person, anchor title); never stored.
   */
  reason: string;
  /** "because-you-liked" only: the title the row is anchored on (computed per request, not stored). */
  anchor?: { contentId: number; title: string };
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
