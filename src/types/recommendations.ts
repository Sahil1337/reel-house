/** Shapes for the Home page (GET /api/profiles/:profileId/home), its "Why these picks?" explainer (…/home/explain) and the queries behind them. */
import type { ContentSummary, ContentType, Episode, MaturityLevel } from "./catalog";

/** One row of the genre_taste view for a profile: how much it likes this genre, and from which signals. */
export interface GenreTaste {
  genreId: number;
  genre: string;
  watchScore: number;
  ratingScore: number;
  myListScore: number;
  pickScore: number;
  tasteScore: number;
}

/** A recommended title and its score (sum of its genres' taste ÷ √ number of genres). */
export type TopPick = {
  contentId: number;
  score: number;
};

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

/** One title the profile touched and the points each signal gave to every one of its genres. */
export interface TitleSignals {
  contentId: number;
  title: string;
  posterUrl: string | null;
  contentType: ContentType;
  releaseDate: string | null;
  genres: string[];
  /** Best progress over all episodes (0–100) and the points it earns; null if never watched. */
  watched: { percent: number; points: number } | null;
  /** Stars (1–5) and the points (stars − 3) ÷ 2; null if not rated. */
  rating: { stars: number; points: number } | null;
  /** On My List: +0.5; null if not saved. */
  myList: { points: number } | null;
  totalPoints: number;
}

/** One genre of a top pick and the taste it contributed (0 if the profile has no taste for it). */
export interface PickGenre {
  genreId: number;
  name: string;
  taste: number;
}

/** A top pick's score worked out: sum of genre taste ÷ √(number of genres). */
export interface PickExplanation {
  contentId: number;
  title: string;
  posterUrl: string | null;
  contentType: ContentType;
  /** Breaks ties: equal scores go newest first. */
  releaseDate: string | null;
  genres: PickGenre[];
  sum: number;
  genreCount: number;
  sqrtN: number;
  score: number;
  /** 0–100, absent when nothing scores above 0. */
  match?: number;
}

/** Everything behind the Home page picks for one profile, step by step. */
export interface HomeExplanation {
  /** Step 1: titles the profile watched, rated or saved. */
  signals: TitleSignals[];
  /** Step 1: genres picked in onboarding (+1 each). */
  picks: string[];
  /** Step 2: the genre_taste view rows, strongest first. */
  taste: GenreTaste[];
  /** Step 3: the first 10 top picks with their scoring. */
  topPicks: PickExplanation[];
  /** Step 4: what is left out of the picks. */
  filters: {
    /** Every title in the catalogue. */
    catalogue: number;
    /** Titles left to score: allowed for this maturity level and never watched, rated or saved. */
    candidates: number;
    maturityLevel: MaturityLevel;
    /** Titles above the profile's maturity level. */
    tooMature: number;
    /** Titles already watched / rated / saved (a title can be in several). */
    watched: number;
    rated: number;
    saved: number;
  };
}
