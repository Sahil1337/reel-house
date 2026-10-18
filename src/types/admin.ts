/** Shapes returned by the /api/admin/** routes (admin panel). */
import type { SnapshotContent, SnapshotGenre, SnapshotPerson, TmdbMediaType } from "@/lib/tmdb/types";

import type { PaymentStatus, PaymentMode, SubscriptionStatus } from "./billing";
import type { ContentType, Genre } from "./catalog";

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

// ─── Content management ──────────────────────────────────────────────────────

/** A page of a server-side paginated admin list. */
export interface AdminPage<T> {
  items: T[];
  /** Rows matching the filters, across all pages. */
  total: number;
  /** 1-based. */
  page: number;
  pageSize: number;
  pageCount: number;
}

/** One row of GET /api/admin/content. */
export interface AdminContentRow {
  contentId: number;
  title: string;
  contentType: ContentType;
  releaseDate: string | null;
  ageRating: string | null;
  posterUrl: string | null;
  genres: Genre[];
  /** null for movies. */
  seasonCount: number | null;
  /** null for movies. */
  episodeCount: number | null;
}

/** GET /api/admin/content query. */
export interface AdminContentFilters {
  /** Case-insensitive title substring. */
  q?: string;
  type?: ContentType;
  genre?: number;
  /** 1-based; default 1. */
  page?: number;
  /** Default 20, max 100. */
  pageSize?: number;
}

/**
 * GET /api/admin/content/:contentId/impact — rows `DELETE FROM content WHERE content_id = $1` removes
 * through ON DELETE CASCADE. Keys are the child tables.
 */
export interface ContentDeletionImpact {
  contentId: number;
  title: string;
  contentType: ContentType;
  counts: {
    content_genre: number;
    content_credit: number;
    season: number;
    episode: number;
    watch_history: number;
    my_list: number;
    rating: number;
    recommendation: number;
  };
}

/** PATCH /api/admin/content/:contentId body: the editable columns; send only what changed. */
export interface UpdateContentInput {
  title?: string;
  description?: string;
  releaseDate?: string | null;
  ageRating?: string | null;
  posterUrl?: string | null;
  backdropUrl?: string | null;
}

// ─── Plans ───────────────────────────────────────────────────────────────────

/** subscription_plan.video_quality: VARCHAR(10), one of these codes. */
export type VideoQuality = "720p" | "1080p" | "4K";

/** One row of GET /api/admin/plans: a plan with its subscription counts. */
export interface AdminPlan {
  planId: number;
  name: string;
  priceMonthly: number;
  videoQuality: string;
  maxDevices: number;
  /** subscriptions with status ACTIVE. */
  activeSubscribers: number;
  /** subscriptions in any status; > 0 blocks deleting the plan (ON DELETE RESTRICT). */
  totalSubscriptions: number;
}

/** POST /api/admin/plans body. */
export interface CreatePlanInput {
  name: string;
  priceMonthly: number;
  videoQuality: VideoQuality;
  maxDevices: number;
}

/** PATCH /api/admin/plans/:planId body: send only what changed. */
export type UpdatePlanInput = Partial<CreatePlanInput>;

// ─── Subscriptions ───────────────────────────────────────────────────────────

/** One row of GET /api/admin/subscriptions: subscription ⋈ users ⋈ subscription_plan. */
export interface AdminSubscriptionRow {
  subscriptionId: number;
  userId: number;
  userName: string;
  userEmail: string;
  planId: number;
  planName: string;
  planPriceMonthly: number;
  /** NULL while PENDING. */
  startDate: string | null;
  endDate: string | null;
  status: SubscriptionStatus;
  createdAt: string;
}

/** GET /api/admin/subscriptions query. */
export interface AdminSubscriptionFilters {
  status?: SubscriptionStatus;
  /** Case-insensitive user email substring. */
  q?: string;
  /** 1-based; default 1. */
  page?: number;
  /** Default 20, max 100. */
  pageSize?: number;
}

/** PATCH /api/admin/subscriptions/:subscriptionId body. */
export type AdminSubscriptionAction =
  { action: "cancel" } | { action: "extend"; months: number } | { action: "change_plan"; planId: number };
