/** Catalog entities — mirror the planned genre / person / content / season / episode tables. */

export type ContentType = "MOVIE" | "SERIES";

export type MaturityLevel = "KIDS" | "TEEN" | "ADULT";

export interface Genre {
  genreId: number;
  name: string;
}

export interface Person {
  personId: number;
  /** name + dateOfBirth is the natural key, UNIQUE NULLS NOT DISTINCT (name, date_of_birth). */
  name: string;
  dateOfBirth: string | null;
  photoUrl: string | null;
}

/** A content_credit row with role 'ACTOR'; characterName is '' when the column is NULL. */
export interface CastCredit {
  person: Person;
  characterName: string;
}

export interface Content {
  contentId: number;
  /** title + contentType + releaseDate is the natural key, UNIQUE NULLS NOT DISTINCT. */
  title: string;
  description: string;
  releaseDate: string | null;
  contentType: ContentType;
  /** Runtime for movies; null for series (episodes carry their own). */
  durationMinutes: number | null;
  /** US certification such as "PG-13" or "TV-MA" (content.age_rating); null when TMDB has none. */
  ageRating: string | null;
  /** Not a column: derived from ageRating by the SQL function maturity_of(). Filters by profile maturity. */
  maturityLevel: MaturityLevel;
  posterUrl: string | null;
  backdropUrl: string | null;
  genres: Genre[];
  /** content_credit rows with role 'ACTOR', in credit_order (top-billed first). */
  cast: CastCredit[];
  /** content_credit rows with role 'DIRECTOR', in credit_order. */
  directors: Person[];
}

/** The lightweight shape used by cards, rows and grids. */
export type ContentSummary = Omit<Content, "cast" | "directors">;

export interface Episode {
  episodeId: number;
  seasonId: number;
  episodeNumber: number;
  title: string;
  description: string;
  releaseDate: string | null;
  durationMinutes: number | null;
  stillUrl: string | null;
}

export interface Season {
  seasonId: number;
  contentId: number;
  seasonNumber: number;
  name: string;
  releaseDate: string | null;
  episodes: Episode[];
}

export interface ContentDetail extends Content {
  /** Empty for movies. */
  seasons: Season[];
}
