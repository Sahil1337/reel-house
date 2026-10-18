/**
 * Admin panel: the dashboard widgets and the TMDB import into the catalogue.
 *
 * Tables it reads: users, subscription, subscription_plan, payment, watch_history, content, content_genre,
 * genre, episode (dashboard) and content (natural-key lookups). It writes content, genre, content_genre,
 * person, content_credit, season and episode through importTitle — the only code that writes the catalogue.
 *
 * The live TMDB calls (search, fetchTitle) are NOT here: they are real code that stays in the admin routes
 * (src/app/api/_lib/tmdb.ts, src/lib/tmdb). These functions only touch the database.
 *
 * Exports:
 *   getDashboard()                                   GET /api/admin/dashboard
 *   markInCatalog(results)                           GET /api/admin/tmdb/search
 *   findCatalogueId(contentType, title, releaseDate) GET /api/admin/tmdb/:type/:tmdbId
 *   importTitle(input, title?)                       POST /api/admin/content/import
 */
import "server-only";

import { sql } from "drizzle-orm";

import { buildImportScript } from "@/lib/sql/import-title";
import { db, pool } from "@/server/db";
import { ServiceError } from "@/server/errors";
import type {
  AdminDashboard,
  ContentType,
  DashboardWidget,
  GenreCountRow,
  ImportTitleInput,
  ImportTitleResult,
  MostWatchedRow,
  PlanSubscriptionRow,
  RecentPaymentRow,
  TmdbSearchResult,
  TmdbTitleData,
} from "@/types";

/**
 * The query behind each dashboard widget. The `sql` strings ARE the queries to run — the page shows
 * them under "View SQL", so keep the two in step. Read-only and parameter-free.
 */
const QUERIES = {
  totalUsers: {
    explanation: "Counts customer accounts; admins are excluded by role.",
    sql: `SELECT COUNT(*) AS count
FROM users
WHERE role = 'USER';`,
  },
  activeSubscriptions: {
    explanation: "Subscriptions marked ACTIVE whose paid period hasn't ended yet.",
    sql: `SELECT COUNT(*) AS count
FROM subscription
WHERE status = 'ACTIVE'
  AND end_date > now();`,
  },
  titles: {
    explanation: "One pass over content, split by type with FILTER instead of two separate counts.",
    sql: `SELECT
  COUNT(*) FILTER (WHERE content_type = 'MOVIE')  AS movies,
  COUNT(*) FILTER (WHERE content_type = 'SERIES') AS series
FROM content;`,
  },
  episodes: {
    explanation: "Every episode row across all seasons of all series.",
    sql: `SELECT COUNT(*) AS count
FROM episode;`,
  },
  revenueThisMonth: {
    explanation:
      "Sums successful payments from the first of this month; failed, pending and refunded ones don't count.",
    sql: `SELECT
  COALESCE(SUM(amount), 0) AS amount,
  COUNT(*)                 AS payments,
  to_char(now(), 'YYYY-MM') AS month
FROM payment
WHERE status = 'SUCCESS'
  AND payment_date >= date_trunc('month', now())
  AND payment_date <  date_trunc('month', now()) + interval '1 month';`,
  },
  recentPayments: {
    explanation: "The ten newest payments, joined through subscription to the paying user and the plan.",
    sql: `SELECT
  p.payment_id, p.payment_date, p.amount, p.payment_mode, p.status, p.transaction_ref,
  u.name  AS user_name,
  u.email AS user_email,
  sp.name AS plan_name
FROM payment AS p
JOIN subscription      AS s  ON s.subscription_id = p.subscription_id
JOIN users             AS u  ON u.user_id = s.user_id
JOIN subscription_plan AS sp ON sp.plan_id = s.plan_id
ORDER BY p.payment_date DESC
LIMIT 10;`,
  },
  mostWatched: {
    explanation:
      "Ranks titles by how many different profiles watched them; plays counts history rows (one per episode for series).",
    sql: `SELECT
  c.content_id, c.title, c.content_type, c.poster_url,
  COUNT(DISTINCT wh.profile_id) AS viewers,
  COUNT(*)                      AS plays
FROM watch_history AS wh
JOIN content AS c ON c.content_id = wh.content_id
GROUP BY c.content_id
ORDER BY viewers DESC, plays DESC, c.title
LIMIT 10;`,
  },
  genreDistribution: {
    explanation: "Titles per genre through the content_genre bridge; LEFT JOIN keeps genres with no titles at 0.",
    sql: `SELECT g.genre_id, g.name, COUNT(cg.content_id) AS titles
FROM genre AS g
LEFT JOIN content_genre AS cg ON cg.genre_id = g.genre_id
GROUP BY g.genre_id
ORDER BY titles DESC, g.name;`,
  },
  subscriptionsByPlan: {
    explanation:
      "Every plan with its active and all-time subscription counts; LEFT JOIN keeps plans nobody has chosen.",
    sql: `SELECT
  sp.plan_id, sp.name AS plan_name, sp.price_monthly,
  COUNT(s.subscription_id) FILTER (WHERE s.status = 'ACTIVE') AS active,
  COUNT(s.subscription_id)                                    AS total
FROM subscription_plan AS sp
LEFT JOIN subscription AS s ON s.plan_id = sp.plan_id
GROUP BY sp.plan_id
ORDER BY sp.price_monthly;`,
  },
} satisfies Record<keyof AdminDashboard["widgets"], Omit<DashboardWidget<unknown>, "data">>;

type TotalUsersDbRow = { count: number };
type ActiveSubscriptionsDbRow = { count: number };
type TitlesDbRow = { movies: number; series: number };
type EpisodesDbRow = { count: number };
type RevenueThisMonthDbRow = { amount: number | string; payments: number; month: string };

type RecentPaymentDbRow = {
  payment_id: number;
  payment_date: Date | string;
  amount: number | string;
  payment_mode: RecentPaymentRow["paymentMode"];
  status: RecentPaymentRow["status"];
  transaction_ref: string;
  user_name: string;
  user_email: string;
  plan_name: string;
};

type MostWatchedDbRow = {
  content_id: number;
  title: string;
  content_type: ContentType;
  poster_url: string | null;
  viewers: number;
  plays: number;
};

type GenreDistributionDbRow = {
  genre_id: number;
  name: string;
  titles: number;
};

type SubscriptionsByPlanDbRow = {
  plan_id: number;
  plan_name: string;
  price_monthly: number | string;
  active: number;
  total: number;
};

/**
 * Every admin dashboard widget, each with the query that produces it (and a one-line explanation),
 * plus the time it was generated.
 */
export async function getDashboard(): Promise<AdminDashboard> {
  const [
    totalUsersRes,
    activeSubsRes,
    titlesRes,
    episodesRes,
    revenueRes,
    recentPaymentsRes,
    mostWatchedRes,
    genreDistRes,
    subsByPlanRes,
  ] = await Promise.all([
    db.execute<TotalUsersDbRow>(sql.raw(QUERIES.totalUsers.sql)),
    db.execute<ActiveSubscriptionsDbRow>(sql.raw(QUERIES.activeSubscriptions.sql)),
    db.execute<TitlesDbRow>(sql.raw(QUERIES.titles.sql)),
    db.execute<EpisodesDbRow>(sql.raw(QUERIES.episodes.sql)),
    db.execute<RevenueThisMonthDbRow>(sql.raw(QUERIES.revenueThisMonth.sql)),
    db.execute<RecentPaymentDbRow>(sql.raw(QUERIES.recentPayments.sql)),
    db.execute<MostWatchedDbRow>(sql.raw(QUERIES.mostWatched.sql)),
    db.execute<GenreDistributionDbRow>(sql.raw(QUERIES.genreDistribution.sql)),
    db.execute<SubscriptionsByPlanDbRow>(sql.raw(QUERIES.subscriptionsByPlan.sql)),
  ]);

  const recentPayments: RecentPaymentRow[] = recentPaymentsRes.rows.map((r) => ({
    paymentId: r.payment_id,
    paymentDate: r.payment_date instanceof Date ? r.payment_date.toISOString() : new Date(r.payment_date).toISOString(),
    amount: Number(r.amount),
    paymentMode: r.payment_mode,
    status: r.status,
    transactionRef: r.transaction_ref,
    userName: r.user_name,
    userEmail: r.user_email,
    planName: r.plan_name,
  }));

  const mostWatched: MostWatchedRow[] = mostWatchedRes.rows.map((r) => ({
    contentId: r.content_id,
    title: r.title,
    contentType: r.content_type,
    posterUrl: r.poster_url,
    viewers: Number(r.viewers),
    plays: Number(r.plays),
  }));

  const genreDistribution: GenreCountRow[] = genreDistRes.rows.map((r) => ({
    genreId: r.genre_id,
    name: r.name,
    titles: Number(r.titles),
  }));

  const subscriptionsByPlan: PlanSubscriptionRow[] = subsByPlanRes.rows.map((r) => ({
    planId: r.plan_id,
    planName: r.plan_name,
    priceMonthly: Number(r.price_monthly),
    active: Number(r.active),
    total: Number(r.total),
  }));

  const revRow = revenueRes.rows[0];

  return {
    widgets: {
      totalUsers: {
        ...QUERIES.totalUsers,
        data: { count: Number(totalUsersRes.rows[0]?.count ?? 0) },
      },
      activeSubscriptions: {
        ...QUERIES.activeSubscriptions,
        data: { count: Number(activeSubsRes.rows[0]?.count ?? 0) },
      },
      titles: {
        ...QUERIES.titles,
        data: {
          movies: Number(titlesRes.rows[0]?.movies ?? 0),
          series: Number(titlesRes.rows[0]?.series ?? 0),
        },
      },
      episodes: {
        ...QUERIES.episodes,
        data: { count: Number(episodesRes.rows[0]?.count ?? 0) },
      },
      revenueThisMonth: {
        ...QUERIES.revenueThisMonth,
        data: {
          amount: Number(revRow?.amount ?? 0),
          payments: Number(revRow?.payments ?? 0),
          month: revRow?.month ?? new Date().toISOString().slice(0, 7),
        },
      },
      recentPayments: { ...QUERIES.recentPayments, data: recentPayments },
      mostWatched: { ...QUERIES.mostWatched, data: mostWatched },
      genreDistribution: { ...QUERIES.genreDistribution, data: genreDistribution },
      subscriptionsByPlan: { ...QUERIES.subscriptionsByPlan, data: subscriptionsByPlan },
    },
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Flags which TMDB search results are already in the catalogue by natural key (title, content_type, release_date).
 *
 * SQL:
 *   SELECT v.ord
 *   FROM unnest($1::text[], $2::content_type[], $3::date[]) WITH ORDINALITY AS v (title, content_type, release_date, ord)
 *   JOIN content AS c ON c.title = v.title AND c.content_type = v.content_type
 *                    AND c.release_date IS NOT DISTINCT FROM v.release_date;
 */
export async function markInCatalog(
  results: Omit<TmdbSearchResult, "alreadyInCatalog">[],
): Promise<TmdbSearchResult[]> {
  if (results.length === 0) return [];

  const titles = results.map((r) => r.title);
  const types = results.map((r) => r.contentType);
  const dates = results.map((r) => r.releaseDate ?? null);

  const queryText = `
    SELECT v.ord
    FROM unnest($1::text[], $2::content_type[], $3::date[]) WITH ORDINALITY AS v (title, content_type, release_date, ord)
    JOIN content AS c ON c.title = v.title AND c.content_type = v.content_type
                     AND c.release_date IS NOT DISTINCT FROM v.release_date;
  `;

  const { rows } = await pool.query<{ ord: number }>(queryText, [titles, types, dates]);
  const matchedOrds = new Set(rows.map((r) => Number(r.ord)));

  return results.map((result, index) => ({
    ...result,
    alreadyInCatalog: matchedOrds.has(index + 1),
  }));
}

/**
 * Returns the content_id of the catalogue row with this natural key, or null.
 *
 * SQL:
 *   SELECT content_id FROM content
 *   WHERE title = $1 AND content_type = $2 AND release_date IS NOT DISTINCT FROM $3;
 */
export async function findCatalogueId(
  contentType: ContentType,
  title: string,
  releaseDate: string | null,
): Promise<number | null> {
  const result = await db.execute<{ content_id: number }>(sql`
    SELECT content_id FROM content
    WHERE title = ${title}
      AND content_type = ${contentType}::content_type
      AND release_date IS NOT DISTINCT FROM ${releaseDate ? sql`${releaseDate}::date` : sql`NULL::date`};
  `);
  return result.rows[0]?.content_id ?? null;
}

/**
 * Adds (or refreshes) one TMDB title in the catalogue: the content row with its genres, people, credits
 * and, for series, seasons and episodes — in one atomic transaction.
 */
export async function importTitle(input: ImportTitleInput, title?: TmdbTitleData): Promise<ImportTitleResult> {
  if (!title) {
    throw new ServiceError("The title must be fetched before importing.", 500);
  }

  const { statements } = buildImportScript(title);
  const client = await pool.connect();
  let created: { content_id: number; created: boolean } | undefined;

  try {
    for (const statement of statements) {
      const result = await client.query(statement.sql, statement.params);
      if (statement.table === "content") {
        created = result.rows[0];
      }
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }

  if (!created) {
    throw new ServiceError("Failed to obtain imported content row.", 500);
  }

  return {
    contentId: created.content_id,
    created: Boolean(created.created),
  };
}
