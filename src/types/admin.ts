/** Shapes returned by the /api/admin/** routes (admin panel). */
import type { SnapshotContent, SnapshotGenre, SnapshotPerson, TmdbMediaType } from "@/lib/tmdb/types";

import type { PaymentStatus, PaymentMode } from "./billing";
import type { ContentType } from "./catalog";

// ─── TMDB import ─────────────────────────────────────────────────────────────

export type { TmdbMediaType };

/** One row of GET /api/admin/tmdb/search. */
export interface TmdbSearchResult {
  tmdbId: number;
  contentType: ContentType;
  title: string;
  releaseDate: string | null;
  posterUrl: string | null;
  overview: string;
  /** A content row with this (title, content_type, release_date) already exists. */
  alreadyInCatalog: boolean;
}

/** A value bound to a $n placeholder. Arrays bind to array parameters (`= ANY($n::int[])`). */
export type SqlParam = string | number | boolean | null | (string | number)[];

/** One statement of a generated SQL script, for display. */
export interface SqlStatement {
  step: number;
  title: string;
  /** Why it runs and which constraint makes it safe to re-run. */
  explanation: string;
  /** Parameterized: $1, $2, … */
  sql: string;
  params: SqlParam[];
  /** The same statement with the params inlined as escaped literals, for reading. */
  inlinedSql: string;
  /** The table it writes; null for BEGIN / COMMIT. */
  table: string | null;
  /** Rows it writes (0 for BEGIN / COMMIT). */
  rowCount: number;
}

/** "What will be stored": rows written per table. */
export interface TableRowCount {
  table: string;
  rows: number;
}

/** GET /api/admin/tmdb/:type/:tmdbId — the live TMDB title, mapped like the importer, plus its SQL. */
export interface TmdbTitlePreview {
  content: SnapshotContent;
  /** Everyone in content.cast and content.directorIds, with details. */
  people: SnapshotPerson[];
  /** content.genreIds with names (TV genres already folded into movie genres). */
  genres: SnapshotGenre[];
  alreadyInCatalog: boolean;
  existingContentId: number | null;
  rowCounts: TableRowCount[];
  /** BEGIN … COMMIT, in execution order. */
  statements: SqlStatement[];
}

/** The fetched TMDB title an import stores: the first three fields of TmdbTitlePreview. */
export type TmdbTitleData = Pick<TmdbTitlePreview, "content" | "people" | "genres">;

export interface ImportTitleInput {
  type: TmdbMediaType;
  tmdbId: number;
}

export interface ImportTitleResult {
  contentId: number;
  /** false when the title already existed and the upserts refreshed it. */
  created: boolean;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

/** Every dashboard widget carries the query that produces it. */
export interface DashboardWidget<T> {
  data: T;
  sql: string;
  /** One line: what the query does and why. */
  explanation: string;
}

export interface RecentPaymentRow {
  paymentId: number;
  paymentDate: string;
  amount: number;
  paymentMode: PaymentMode;
  status: PaymentStatus;
  transactionRef: string;
  userName: string;
  userEmail: string;
  planName: string;
}

export interface MostWatchedRow {
  contentId: number;
  title: string;
  contentType: ContentType;
  posterUrl: string | null;
  /** Distinct profiles that watched it. */
  viewers: number;
  /** watch_history rows (a series has one per episode watched). */
  plays: number;
}

export interface GenreCountRow {
  genreId: number;
  name: string;
  titles: number;
}

export interface PlanSubscriptionRow {
  planId: number;
  planName: string;
  priceMonthly: number;
  active: number;
  total: number;
}

export interface AdminDashboard {
  widgets: {
    totalUsers: DashboardWidget<{ count: number }>;
    activeSubscriptions: DashboardWidget<{ count: number }>;
    titles: DashboardWidget<{ movies: number; series: number }>;
    episodes: DashboardWidget<{ count: number }>;
    revenueThisMonth: DashboardWidget<{ amount: number; payments: number; month: string }>;
    recentPayments: DashboardWidget<RecentPaymentRow[]>;
    mostWatched: DashboardWidget<MostWatchedRow[]>;
    genreDistribution: DashboardWidget<GenreCountRow[]>;
    subscriptionsByPlan: DashboardWidget<PlanSubscriptionRow[]>;
  };
  generatedAt: string;
}

export type DashboardWidgetKey = keyof AdminDashboard["widgets"];
