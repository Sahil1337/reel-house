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

import { getMockDb } from "@/server/mocks/db";
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

/**
 * Every admin dashboard widget, each with the query that produces it (and a one-line explanation),
 * plus the time it was generated.
 *
 * Steps:
 *   1. Run the nine QUERIES[*].sql statements (above — the same text the page shows under "View SQL")
 *      in parallel (Promise.all over pool.query). For one consistent snapshot across widgets, run them
 *      sequentially on one connection inside BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY instead.
 *   2. Map snake_case columns to the camelCase fields of src/types/admin.ts. COUNT and SUM already
 *      arrive as numbers (pg type parsers in src/server/db/index.ts), so no casts in SQL.
 *   3. Return { widgets: { [key]: { ...QUERIES[key], data } }, generatedAt: new Date().toISOString() }.
 * SQL (one per widget; see QUERIES for the verbatim text):
 *   totalUsers           SELECT COUNT(*) AS count FROM users WHERE role = 'USER';
 *   activeSubscriptions  SELECT COUNT(*) AS count FROM subscription WHERE status = 'ACTIVE' AND end_date > now();
 *   titles               COUNT(*) FILTER (WHERE content_type = 'MOVIE' / 'SERIES') FROM content;
 *   episodes             SELECT COUNT(*) AS count FROM episode;
 *   revenueThisMonth     SUM(amount) / COUNT(*) of payment WHERE status = 'SUCCESS' within date_trunc('month', now());
 *   recentPayments       10 newest payment ⋈ subscription ⋈ users ⋈ subscription_plan, ORDER BY payment_date DESC;
 *   mostWatched          watch_history ⋈ content, COUNT(DISTINCT profile_id) AS viewers, COUNT(*) AS plays, top 10;
 *   genreDistribution    genre LEFT JOIN content_genre, COUNT(cg.content_id) AS titles;
 *   subscriptionsByPlan  subscription_plan LEFT JOIN subscription, active (FILTER status = 'ACTIVE') and total.
 * Tables: users, subscription, subscription_plan, payment, watch_history, content, content_genre, genre,
 *   episode  ·  Keys/constraints relied on: none for correctness. Indexes that keep it fast as tables grow:
 *   payment (payment_date DESC), payment (status, payment_date), subscription (plan_id, status),
 *   watch_history (content_id), content_genre (genre_id) — the content_genre PK (content_id, genre_id)
 *   doesn't serve lookups by genre.
 * Transaction: optional (REPEATABLE READ READ ONLY for a consistent snapshot)  ·  Idempotent: yes (read-only)
 * Edge cases: an empty database gives zeros and empty lists; genres and plans nobody uses stay in their
 *   lists with 0 (LEFT JOIN).
 * Throws: nothing (the route's requireAdmin has already run).
 * Called by: GET /api/admin/dashboard
 * Mock today: counts and groups the mock rows in memory with the same shapes; activeSubscriptions counts
 *   status ACTIVE only (no end_date check) and revenue sums this calendar month's SUCCESS payments.
 */
export async function getDashboard(): Promise<AdminDashboard> {
  // TODO: implement — run QUERIES[*].sql; the counts and groupings below are over the mock rows.
  const db = getMockDb();
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const paidThisMonth = db.payments.filter(
    (payment) => payment.status === "SUCCESS" && payment.paymentDate.startsWith(month),
  );

  const recentPayments: RecentPaymentRow[] = db.payments
    .toSorted((a, b) => b.paymentDate.localeCompare(a.paymentDate))
    .slice(0, 10)
    .map((payment) => {
      const subscription = db.subscriptions.find((entry) => entry.subscriptionId === payment.subscriptionId)!;
      const user = db.users.find((entry) => entry.userId === subscription.userId)!;
      const plan = db.plans.find((entry) => entry.planId === subscription.planId)!;
      const { paymentId, paymentDate, amount, paymentMode, status, transactionRef } = payment;
      return {
        paymentId,
        paymentDate,
        amount,
        paymentMode,
        status,
        transactionRef,
        userName: user.name,
        userEmail: user.email,
        planName: plan.name,
      };
    });

  const mostWatched: MostWatchedRow[] = [...Map.groupBy(db.watchHistory, (row) => row.contentId)]
    .map(([contentId, rows]) => {
      const content = db.contentById.get(contentId)!;
      const viewers = new Set(rows.map((row) => row.profileId)).size;
      return {
        contentId,
        title: content.title,
        contentType: content.contentType,
        posterUrl: content.posterUrl,
        viewers,
        plays: rows.length,
      };
    })
    .toSorted((a, b) => b.viewers - a.viewers || b.plays - a.plays || a.title.localeCompare(b.title))
    .slice(0, 10);

  const genreDistribution: GenreCountRow[] = db.genres
    .map((genre) => ({
      genreId: genre.genreId,
      name: genre.name,
      titles: db.contents.filter((content) => content.genres.some((entry) => entry.genreId === genre.genreId)).length,
    }))
    .toSorted((a, b) => b.titles - a.titles || a.name.localeCompare(b.name));

  const subscriptionsByPlan: PlanSubscriptionRow[] = db.plans.map((plan) => {
    const subscriptions = db.subscriptions.filter((entry) => entry.planId === plan.planId);
    return {
      planId: plan.planId,
      planName: plan.name,
      priceMonthly: plan.priceMonthly,
      active: subscriptions.filter((entry) => entry.status === "ACTIVE").length,
      total: subscriptions.length,
    };
  });

  return {
    widgets: {
      totalUsers: { ...QUERIES.totalUsers, data: { count: db.users.filter((user) => user.role === "USER").length } },
      activeSubscriptions: {
        ...QUERIES.activeSubscriptions,
        data: { count: db.subscriptions.filter((entry) => entry.status === "ACTIVE").length },
      },
      titles: {
        ...QUERIES.titles,
        data: {
          movies: db.contents.filter((content) => content.contentType === "MOVIE").length,
          series: db.contents.filter((content) => content.contentType === "SERIES").length,
        },
      },
      episodes: { ...QUERIES.episodes, data: { count: db.episodeById.size } },
      revenueThisMonth: {
        ...QUERIES.revenueThisMonth,
        data: {
          amount: paidThisMonth.reduce((sum, payment) => sum + payment.amount, 0),
          payments: paidThisMonth.length,
          month,
        },
      },
      recentPayments: { ...QUERIES.recentPayments, data: recentPayments },
      mostWatched: { ...QUERIES.mostWatched, data: mostWatched },
      genreDistribution: { ...QUERIES.genreDistribution, data: genreDistribution },
      subscriptionsByPlan: { ...QUERIES.subscriptionsByPlan, data: subscriptionsByPlan },
    },
    generatedAt: now.toISOString(),
  };
}

/**
 * Flags which TMDB search results are already in the catalogue.
 *
 * The database stores no TMDB ids, so a result is "in the catalogue" when a content row has the same
 * natural key (title, content_type, release_date), taken from the result's title, contentType and
 * releaseDate.
 *
 * Steps:
 *   1. Empty input → [] without a query.
 *   2. One query for the whole page (not one per row), the page's titles, types and dates as three
 *      parallel arrays; it returns the 1-based positions (ord) of the results that exist.
 *   3. Copy each result with alreadyInCatalog = (its position is in that set). Order is unchanged.
 * SQL:
 *   SELECT v.ord
 *   FROM unnest($1::text[], $2::content_type[], $3::date[]) WITH ORDINALITY AS v (title, content_type, release_date, ord)
 *   JOIN content AS c ON c.title = v.title AND c.content_type = v.content_type
 *                    AND c.release_date IS NOT DISTINCT FROM v.release_date;
 *   -- served by the UNIQUE NULLS NOT DISTINCT (title, content_type, release_date) index
 * Tables: content  ·  Keys/constraints relied on: content UNIQUE NULLS NOT DISTINCT (title, content_type,
 *   release_date) — IS NOT DISTINCT FROM lets a NULL release date match, like the key does.
 * Transaction: no  ·  Idempotent: yes (read-only)
 * Edge cases: a title TMDB later renames or re-dates doesn't match its imported row and shows as new; two
 *   results with the same key are both flagged.
 * Throws: nothing.
 * Called by: GET /api/admin/tmdb/search
 * Mock today: flags a result when the mock catalogue's findByKey(contentType, title, releaseDate) hits.
 */
export async function markInCatalog(
  results: Omit<TmdbSearchResult, "alreadyInCatalog">[],
): Promise<TmdbSearchResult[]> {
  // TODO: implement
  const { findByKey } = getMockDb();
  return results.map((result) => ({
    ...result,
    alreadyInCatalog: Boolean(findByKey(result.contentType, result.title, result.releaseDate)),
  }));
}

/**
 * The content_id of the catalogue row with this natural key, or null. Feeds the import preview's
 * alreadyInCatalog / existingContentId: non-null means an import refreshes the row (its SQL is an
 * upsert on the same key).
 *
 * Steps:
 *   1. Look the row up by (title, content_type, release_date), taken from the fetched TMDB title.
 *   2. Return its content_id, or null when there is none.
 * SQL:
 *   SELECT content_id FROM content
 *   WHERE title = $1 AND content_type = $2 AND release_date IS NOT DISTINCT FROM $3;
 * Tables: content  ·  Keys/constraints relied on: content UNIQUE NULLS NOT DISTINCT (title, content_type,
 *   release_date) — at most one row can match, even with a NULL release date.
 * Transaction: no  ·  Idempotent: yes (read-only)
 * Edge cases: a title TMDB later renamed or re-dated won't match (an import would add a new row).
 * Throws: nothing.
 * Called by: GET /api/admin/tmdb/:type/:tmdbId
 * Mock today: the mock catalogue's findByKey(contentType, title, releaseDate)?.contentId ?? null.
 */
export async function findCatalogueId(
  contentType: ContentType,
  title: string,
  releaseDate: string | null,
): Promise<number | null> {
  // TODO: implement
  return getMockDb().findByKey(contentType, title, releaseDate)?.contentId ?? null;
}

/**
 * Adds (or refreshes) one TMDB title in the catalogue: the content row with its genres, people, credits
 * and, for series, seasons and episodes — in one transaction.
 *
 * `title` is the TMDB title the route fetched (fetchTitle in src/lib/tmdb/catalog.ts, re-fetched on the
 * server rather than trusting a payload from the browser; same data the preview showed). `input` only
 * says which title that was; nothing stores the TMDB id (the database has no TMDB id column).
 *
 * Steps (buildImportScript(title) in src/lib/sql/import-title.ts generates exactly these statements,
 * { sql, params }; send sql + params, never inlinedSql):
 *   1. BEGIN. Check out ONE pooled connection (a transaction belongs to a connection); run each
 *      statement in order with client.query(sql, params). On any error: ROLLBACK, release, rethrow (the
 *      route answers 500). Always release the connection (finally). The transaction means the catalogue
 *      never holds half a title.
 *   2. Upsert the movie/series into content on its natural key. RETURNING content_id, (xmax = 0) AS
 *      created — xmax = 0 only when the row was freshly inserted; read both values from this statement.
 *   3. Make sure each genre exists (genre.name UNIQUE; ON CONFLICT DO NOTHING). TMDB's TV-only genres
 *      were folded into the shared movie genres before this point.
 *   4. Link the title to its genres in content_genre (PK (content_id, genre_id) makes repeats a no-op).
 *      Both ids are looked up by natural key, nothing is carried over from earlier steps.
 *   5. Upsert the people (cast and directors, or creators for series) on UNIQUE NULLS NOT DISTINCT
 *      (name, date_of_birth): someone already in the catalogue keeps their person_id and gets a refreshed
 *      photo. Accepted trade-off: namesakes with no birth date share one row.
 *   6. Credit the top cast: content_credit role 'ACTOR', character_name (NULL when TMDB doesn't say),
 *      credit_order = billing order (0 = top billed). Re-import updates character and order.
 *   7. Credit the directors (series: the creators stand in): content_credit role 'DIRECTOR', no
 *      character_name (CHECK), credit_order = position. Someone who also acts keeps both credits (role
 *      is part of the PK).
 *   8. Series only: upsert the seasons (season 0 "Specials" and empty seasons are skipped) on UNIQUE
 *      (content_id, season_number), then, one statement per season, upsert its episodes on UNIQUE
 *      (season_id, episode_number), the season_id found by (content natural key, season_number).
 *   9. COMMIT. Return { contentId, created }.
 * SQL (generated; $1,$2,$3 = title, content_type, release_date of the content row, in every dependent
 *   statement matched with  c.title = $1 AND c.content_type = $2 AND c.release_date IS NOT DISTINCT FROM $3):
 *   BEGIN;
 *   INSERT INTO content (title, content_type, release_date, description, duration_minutes, age_rating, poster_url, backdrop_url)
 *   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
 *   ON CONFLICT (title, content_type, release_date) DO UPDATE
 *   SET description = EXCLUDED.description, duration_minutes = EXCLUDED.duration_minutes,
 *       age_rating = EXCLUDED.age_rating, poster_url = EXCLUDED.poster_url, backdrop_url = EXCLUDED.backdrop_url
 *   RETURNING content_id, (xmax = 0) AS created;
 *   INSERT INTO genre (name) VALUES ($1), … ON CONFLICT (name) DO NOTHING;
 *   INSERT INTO content_genre (content_id, genre_id)
 *   SELECT c.content_id, g.genre_id FROM content AS c JOIN genre AS g ON g.name IN ($4, $5, ...)
 *   WHERE <content key> ON CONFLICT DO NOTHING;
 *   INSERT INTO person (name, date_of_birth, photo_url) VALUES (…), …
 *   ON CONFLICT (name, date_of_birth) DO UPDATE SET photo_url = EXCLUDED.photo_url;
 *   INSERT INTO content_credit (content_id, person_id, role, character_name, credit_order)
 *   SELECT c.content_id, p.person_id, 'ACTOR'::credit_role, NULLIF(v.character_name, ''), v.credit_order
 *   FROM content AS c CROSS JOIN (VALUES …) AS v (name, date_of_birth, character_name, credit_order)
 *   JOIN person AS p ON p.name = v.name AND p.date_of_birth IS NOT DISTINCT FROM v.date_of_birth
 *   WHERE <content key>
 *   ON CONFLICT (content_id, person_id, role) DO UPDATE
 *   SET character_name = EXCLUDED.character_name, credit_order = EXCLUDED.credit_order;
 *   INSERT INTO content_credit … 'DIRECTOR'::credit_role, NULL, v.credit_order … (same shape, no character)
 *   ON CONFLICT (content_id, person_id, role) DO UPDATE SET credit_order = EXCLUDED.credit_order;
 *   INSERT INTO season (content_id, season_number, name, release_date)
 *   SELECT c.content_id, v.season_number, v.name, v.release_date FROM content AS c
 *   CROSS JOIN (VALUES …) AS v (season_number, name, release_date) WHERE <content key>
 *   ON CONFLICT (content_id, season_number) DO UPDATE SET name = EXCLUDED.name, release_date = EXCLUDED.release_date;
 *   INSERT INTO episode (season_id, episode_number, title, description, release_date, duration_minutes, still_url)
 *   SELECT s.season_id, v.episode_number, v.title, v.description, v.release_date, v.duration_minutes, v.still_url
 *   FROM season AS s JOIN content AS c ON c.content_id = s.content_id
 *   CROSS JOIN (VALUES …) AS v (episode_number, title, description, release_date, duration_minutes, still_url)
 *   WHERE <content key> AND s.season_number = $4
 *   ON CONFLICT (season_id, episode_number) DO UPDATE
 *   SET title = EXCLUDED.title, description = EXCLUDED.description, release_date = EXCLUDED.release_date,
 *       duration_minutes = EXCLUDED.duration_minutes, still_url = EXCLUDED.still_url;   -- once per season
 *   COMMIT;
 * Tables: content, genre, content_genre, person, content_credit, season, episode  ·  Keys/constraints
 *   relied on: content UNIQUE NULLS NOT DISTINCT (title, content_type, release_date); genre UNIQUE (name);
 *   person UNIQUE NULLS NOT DISTINCT (name, date_of_birth); content_genre PK (content_id, genre_id);
 *   content_credit PK (content_id, person_id, role); season UNIQUE (content_id, season_number); episode
 *   UNIQUE (season_id, episode_number); FKs → content/person/season ON DELETE CASCADE. CHECKs: content_type
 *   IN ('MOVIE','SERIES'); content.age_rating IN the US certificate codes (or NULL); content_credit.
 *   character_name NULL unless role = 'ACTOR'; duration_minutes NULL for series; season_number > 0.
 * Transaction: yes (BEGIN … COMMIT on one connection)  ·  Idempotent: yes — every write is an upsert
 *   (ON CONFLICT … DO UPDATE) or ON CONFLICT DO NOTHING on the keys above, and every later statement finds
 *   the content and person rows by those same natural keys, so importing the same title twice refreshes it
 *   instead of failing or duplicating rows, and a double-clicked button is harmless.
 * Edge cases: two admins importing the same title at once serialise on those unique indexes (the second
 *   waits for the first to commit, then updates). If TMDB has since renamed or re-dated the title, its key
 *   no longer matches and the import adds a new content row. Re-imports add and refresh but never remove:
 *   a genre or cast credit TMDB has since dropped stays linked; for a full sync, DELETE FROM content_genre /
 *   content_credit WHERE content_id = $1 right after the content upsert, inside the same transaction.
 *   Multi-row upserts may not touch one row twice, which is why the generator de-duplicates people by key.
 * Throws: nothing typed; a failed statement rolls back and rethrows (500). The route owns the TMDB 404 /
 *   502 / 503 answers, since it does the fetch.
 * Called by: POST /api/admin/content/import
 * Mock today: persists nothing and fetches nothing (`title` is not passed yet). If the mock catalogue
 *   already has a title with that TMDB id and type, returns { contentId: <its id>, created: false };
 *   otherwise { contentId: <catalogue size + 1>, created: true }.
 */
export async function importTitle(input: ImportTitleInput, title?: TmdbTitleData): Promise<ImportTitleResult> {
  // TODO: implement — the real body requires `title`; run buildImportScript(title).statements in a transaction.
  void title;
  const { contents, findByTmdb } = getMockDb();
  const existing = findByTmdb(input.type === "movie" ? "MOVIE" : "SERIES", input.tmdbId);
  return existing
    ? { contentId: existing.contentId, created: false }
    : { contentId: contents.length + 1, created: true };
}

