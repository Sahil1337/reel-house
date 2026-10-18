/**
 * Catalogue reads: search and browse, one title's full detail, the genre list and "More like this".
 *
 * Tables it reads: content, genre, content_genre, person, content_credit, season, episode — plus
 * watch_history (30-day popularity for ranking) and the content_similarity materialized view (item-kNN
 * for similar titles). Writes nothing; the catalogue is written only by admin.service.importTitle.
 *
 * Maturity is never stored: every catalogue query that filters by profile uses the SQL function
 * maturity_of(c.age_rating) (docs/schema/SCHEMA.md), whose enum order is KIDS < TEEN < ADULT and which maps a
 * NULL certificate to TEEN. A null `maturityLevel` argument means "no profile selected, no filter".
 *
 * Exports:
 *   ContentSearch                                          the search filter (parsed by the route)
 *   searchContent(query)                                   GET /api/content
 *   getContentDetail(contentId)                            GET /api/content/:contentId
 *   listGenres()                                           GET /api/genres
 *   getSimilarTitles(contentId, maturityLevel, limit = 12) GET /api/content/:contentId/similar
 *
 * Shared with recommendations.service (owned elsewhere): the `interaction_score` view and the
 * `content_similarity` materialized view (stage 1 and the item-kNN of the pipeline). getSimilarTitles
 * reads content_similarity directly in SQL; it imports nothing from that service.
 */
import "server-only";

import { isAllowedFor } from "@/lib/content/maturity";
import { findContent, getMockDb, toSummary } from "@/server/mocks/db";
import { NotFoundError } from "@/server/errors";
import type { ContentDetail, ContentSummary, ContentType, Genre, MaturityLevel } from "@/types";

export interface ContentSearch {
  /** Trimmed free text; undefined/empty = browse. Matches title, or cast/director names. */
  q?: string;
  type?: ContentType;
  /** genre.genre_id */
  genreId?: number;
  /** 1–100, default 60. */
  limit: number;
  /** The selected profile's level; null = no maturity filter. */
  maturityLevel: MaturityLevel | null;
}

/**
 * Searches and browses the catalogue: filters by maturity / type / genre / text, ranks, and returns the
 * card shape (no cast, directors or seasons).
 *
 * Steps:
 *   1. Maturity: keep titles with maturity_of(c.age_rating) <= $maturityLevel (the selected profile's
 *      level, enum order KIDS < TEEN < ADULT; NULL certificate counts as TEEN). maturityLevel null = no filter.
 *   2. type → content_type = $type. genre → EXISTS (SELECT 1 FROM content_genre WHERE content_id =
 *      c.content_id AND genre_id = $genre).
 *   3. q → unaccented, case-insensitive ILIKE '%' || $q || '%' on title, OR an EXISTS over content_credit ⋈
 *      person whose name matches, any role (EXISTS, so a title isn't repeated per matching person or role).
 *      Escape %, _ and \ in q before binding. Needs `CREATE EXTENSION unaccent`.
 *   4. Rank: exact title (4) > title prefix (3) > title contains (2) > person match (1), then most
 *      watched (COUNT(DISTINCT profile_id) in watch_history over the last 30 days DESC — the popularity
 *      prior, see docs/schema/SCHEMA.md "Ranking"), then release_date DESC. With no q it's just most watched, then
 *      release_date DESC ("most popular first"). LIMIT $limit.
 *   5. genres per row from content_genre ⋈ genre via json_agg (a correlated subquery, below).
 * SQL:
 *   WITH popularity AS (
 *     SELECT content_id, COUNT(DISTINCT profile_id) AS viewers
 *     FROM watch_history
 *     WHERE watched_at > now() - interval '30 days'
 *     GROUP BY content_id
 *   )
 *   SELECT c.content_id, c.title, c.description, c.release_date, c.content_type, c.duration_minutes,
 *          c.age_rating, maturity_of(c.age_rating) AS maturity_level, c.poster_url, c.backdrop_url,
 *          COALESCE((SELECT json_agg(json_build_object('genreId', g.genre_id, 'name', g.name) ORDER BY g.name)
 *                    FROM content_genre AS cg JOIN genre AS g ON g.genre_id = cg.genre_id
 *                    WHERE cg.content_id = c.content_id), '[]') AS genres
 *   FROM content AS c
 *   LEFT JOIN popularity AS pop ON pop.content_id = c.content_id
 *   WHERE ($1::maturity_level IS NULL OR maturity_of(c.age_rating) <= $1)
 *     AND ($2::content_type   IS NULL OR c.content_type = $2)
 *     AND ($3::int            IS NULL OR EXISTS (SELECT 1 FROM content_genre AS cg
 *                                                 WHERE cg.content_id = c.content_id AND cg.genre_id = $3))
 *     AND ($4::text           IS NULL
 *          OR unaccent(c.title) ILIKE '%' || unaccent($4) || '%'
 *          OR EXISTS (SELECT 1 FROM content_credit AS cc JOIN person AS p ON p.person_id = cc.person_id
 *                     WHERE cc.content_id = c.content_id AND unaccent(p.name) ILIKE '%' || unaccent($4) || '%'))
 *   ORDER BY CASE WHEN $4::text IS NULL                                  THEN 0
 *                 WHEN unaccent(c.title) ILIKE unaccent($4)              THEN 4   -- exact
 *                 WHEN unaccent(c.title) ILIKE unaccent($4) || '%'       THEN 3   -- prefix
 *                 WHEN unaccent(c.title) ILIKE '%' || unaccent($4) || '%' THEN 2  -- contains
 *                 ELSE 1 END DESC,                                                -- person match
 *            COALESCE(pop.viewers, 0) DESC,
 *            c.release_date DESC NULLS LAST
 *   LIMIT $5;
 *   -- $1 maturityLevel | null, $2 type | null, $3 genreId | null, $4 q (LIKE-escaped) | null, $5 limit
 * Tables: content, content_genre, genre, content_credit, person, watch_history  ·  Keys/constraints relied
 *   on: content_genre PK (content_id, genre_id) + content_genre_genre_idx, content_credit_person_idx,
 *   watch_history_recent_idx, the maturity_of() function.
 * Transaction: no  ·  Idempotent: yes (read-only)
 * Edge cases: no matches → []; a title with several matching cast members appears once; no release date
 *   sorts last; the route has already clamped `limit` to 1–100 and dropped an unknown type.
 * Throws: nothing.
 * Called by: GET /api/content
 * Mock today: returns the first `limit` catalogue items the maturity level allows, as summaries, ignoring
 *   q / type / genre.
 */
export async function searchContent(query: ContentSearch): Promise<ContentSummary[]> {
  // TODO: implement
  const { maturityLevel } = query;
  return getMockDb()
    .contents.filter((content) => maturityLevel === null || isAllowedFor(maturityLevel, content.maturityLevel))
    .slice(0, query.limit)
    .map(toSummary);
}

/**
 * One title with everything the title page and the player need: genres, billed cast with character
 * names, directors and, for series, every season with its episodes (seasons is [] for movies).
 *
 * Steps:
 *   1. Load the content row; no row → NotFoundError "Title not found.".
 *   2. Attach genres, cast, directors and seasons (queries below; run them in parallel).
 *   3. Maturity is NOT checked here: the page checks it against the selected profile and shows
 *      "not available on this profile" rather than a 404.
 * SQL:
 *   SELECT content_id, title, description, release_date, content_type, duration_minutes, age_rating,
 *          maturity_of(age_rating) AS maturity_level, poster_url, backdrop_url
 *   FROM content WHERE content_id = $1;
 *
 *   -- genres
 *   SELECT g.genre_id, g.name FROM content_genre AS cg JOIN genre AS g ON g.genre_id = cg.genre_id
 *   WHERE cg.content_id = $1 ORDER BY g.name;
 *
 *   -- cast: top-billed first; characterName = COALESCE(character_name, '')
 *   SELECT p.person_id, p.name, p.date_of_birth, p.photo_url, COALESCE(cc.character_name, '') AS character_name
 *   FROM content_credit AS cc JOIN person AS p ON p.person_id = cc.person_id
 *   WHERE cc.content_id = $1 AND cc.role = 'ACTOR' ORDER BY cc.credit_order;
 *
 *   -- directors (the response keeps cast and directors as two lists; both come from content_credit)
 *   SELECT p.person_id, p.name, p.date_of_birth, p.photo_url
 *   FROM content_credit AS cc JOIN person AS p ON p.person_id = cc.person_id
 *   WHERE cc.content_id = $1 AND cc.role = 'DIRECTOR' ORDER BY cc.credit_order;
 *
 *   -- seasons (season 0, "Specials", is skipped) — series only
 *   SELECT season_id, content_id, season_number, name, release_date
 *   FROM season WHERE content_id = $1 AND season_number > 0 ORDER BY season_number;
 *
 *   -- their episodes, grouped by season_id in code
 *   SELECT episode_id, season_id, episode_number, title, description, release_date, duration_minutes, still_url
 *   FROM episode WHERE season_id IN ($2, $3, ...) ORDER BY season_id, episode_number;  -- one $n per season_id
 * Tables: content, content_genre, genre, content_credit, person, season, episode  ·  Keys/constraints relied
 *   on: content PK; content_credit PK (content_id, person_id, role); season UNIQUE (content_id,
 *   season_number); episode UNIQUE (season_id, episode_number).
 * Transaction: no (for one consistent snapshot run the queries in a REPEATABLE READ READ ONLY
 *   transaction)  ·  Idempotent: yes (read-only)
 * Edge cases: a movie has no seasons; a series season with no episodes keeps `episodes: []`; a NULL
 *   character_name comes back as ''.
 * Throws: NotFoundError "Title not found." when the id doesn't exist.
 * Called by: GET /api/content/:contentId; getSimilarTitles (existence check); activity.service
 * Mock today: returns the mock catalogue entry, or throws NotFoundError.
 */
export async function getContentDetail(contentId: number): Promise<ContentDetail> {
  // TODO: implement
  const content = findContent(contentId);
  if (!content) throw new NotFoundError("Title not found.");
  return content;
}

/**
 * Every genre, alphabetical (search filter, onboarding, genre pages).
 *
 * Steps:
 *   1. SELECT the rows, ordered by name.
 * SQL:
 *   SELECT genre_id, name FROM genre ORDER BY name;
 * Tables: genre  ·  Keys/constraints relied on: genre.name UNIQUE
 * Transaction: no  ·  Idempotent: yes (read-only)
 * Edge cases: genres no title uses are still listed.
 * Throws: nothing.
 * Called by: GET /api/genres
 * Mock today: returns the mock genre list as stored (not re-sorted).
 */
export async function listGenres(): Promise<Genre[]> {
  // TODO: implement
  return getMockDb().genres;
}

/**
 * "More like this": up to `limit` titles ranked by a blend of what viewers did with them (item-kNN) and
 * how much their genres and people overlap (content-based). Never the title itself.
 *
 * Steps:
 *   1. getContentDetail(contentId) → NotFoundError for an unknown id (so the route answers 404).
 *   2. itemSimilarity: cosine similarity between this title and every other over per-profile
 *      interaction scores, shrunk by common / (common + 2) so pairs seen by few profiles count less.
 *      Precomputed in the content_similarity materialized view (docs/schema/SCHEMA.md; refreshed on a schedule,
 *      shared with recommendations.service), so here it is a lookup: score WHERE content_a = $1.
 *      Titles with no row get 0.
 *   3. contentSimilarity: 0.7 × Jaccard(shared genres) + 0.3 × min(1, shared people ÷ 2), where people
 *      are content_credit rows with role = 'ACTOR' AND credit_order < 5 (top-5 billed) or role = 'DIRECTOR'.
 *   4. score = 0.65 × itemSimilarity + 0.35 × contentSimilarity; keep score > 0.05 and titles the
 *      profile may see (maturity_of(age_rating) <= $maturityLevel; null = no filter); never the title itself.
 *   5. ORDER BY score DESC (ties: release_date DESC) LIMIT $limit (12 on the title page); attach genres
 *      as in searchContent.
 * SQL:
 *   WITH item AS (                                     -- itemSimilarity
 *          SELECT content_b AS content_id, score AS item_sim
 *          FROM content_similarity WHERE content_a = $1
 *        ),
 *        my_genres AS (SELECT genre_id FROM content_genre WHERE content_id = $1),
 *        my_people AS (
 *          SELECT person_id FROM content_credit
 *          WHERE content_id = $1 AND (role = 'DIRECTOR' OR (role = 'ACTOR' AND credit_order < 5))
 *        ),
 *        genre_overlap AS (                             -- Jaccard = shared / (|A| + |B| - shared)
 *          SELECT cg.content_id,
 *                 COUNT(*) FILTER (WHERE cg.genre_id IN (SELECT genre_id FROM my_genres))::real AS shared,
 *                 COUNT(*) AS theirs
 *          FROM content_genre AS cg GROUP BY cg.content_id
 *        ),
 *        people_overlap AS (
 *          SELECT cc.content_id, COUNT(DISTINCT cc.person_id) AS shared
 *          FROM content_credit AS cc
 *          WHERE cc.person_id IN (SELECT person_id FROM my_people)
 *            AND (cc.role = 'DIRECTOR' OR (cc.role = 'ACTOR' AND cc.credit_order < 5))
 *          GROUP BY cc.content_id
 *        )
 *   SELECT c.content_id, c.title, c.description, c.release_date, c.content_type, c.duration_minutes,
 *          c.age_rating, maturity_of(c.age_rating) AS maturity_level, c.poster_url, c.backdrop_url,
 *          <genres json_agg subquery as in searchContent> AS genres,
 *          0.65 * COALESCE(i.item_sim, 0)
 *        + 0.35 * ( 0.7 * COALESCE(go.shared / NULLIF((SELECT COUNT(*) FROM my_genres) + go.theirs - go.shared, 0), 0)
 *                 + 0.3 * LEAST(1, COALESCE(po.shared, 0) / 2.0) ) AS score
 *   FROM content AS c
 *   LEFT JOIN item          AS i  ON i.content_id  = c.content_id
 *   LEFT JOIN genre_overlap AS go ON go.content_id = c.content_id
 *   LEFT JOIN people_overlap AS po ON po.content_id = c.content_id
 *   WHERE c.content_id <> $1
 *     AND ($2::maturity_level IS NULL OR maturity_of(c.age_rating) <= $2)
 *   -- keep only score > 0.05: repeat the expression in a subquery/CTE and filter outside, then:
 *   ORDER BY score DESC, c.release_date DESC NULLS LAST
 *   LIMIT $3;
 * Tables: content_similarity (mat. view over interaction_score), content, content_genre, genre,
 *   content_credit  ·  Keys/constraints relied on: content_similarity_pair_key UNIQUE (content_a,
 *   content_b); content_genre PK; content_credit PK (content_id, person_id, role); maturity_of().
 * Transaction: no  ·  Idempotent: yes (read-only; content_similarity is only as fresh as its last refresh)
 * Edge cases: a title nobody has interacted with has no content_similarity rows, so it ranks on
 *   genres/people alone; fewer than `limit` titles can clear the 0.05 bar; the cosine can be negative
 *   for titles the same viewers rated low, which pushes them out.
 * Throws: NotFoundError "Title not found." when the id doesn't exist.
 * Called by: GET /api/content/:contentId/similar
 * Mock today: the first `limit` other titles in catalogue order (default 12) that the maturity level allows.
 */
export async function getSimilarTitles(
  contentId: number,
  maturityLevel: MaturityLevel | null,
  limit = 12,
): Promise<ContentSummary[]> {
  // TODO: implement
  const content = await getContentDetail(contentId);
  return getMockDb()
    .contents.filter(
      (other) =>
        other.contentId !== content.contentId &&
        (maturityLevel === null || isAllowedFor(maturityLevel, other.maturityLevel)),
    )
    .slice(0, limit)
    .map(toSummary);
}
