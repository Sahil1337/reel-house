# Person A: catalogue and admin

You own everything that **reads the catalogue** and everything the **admin panel** does. Read
[README.md](README.md) first (architecture, setup, conventions, curl testing); this file is the complete
spec for your two services. Schema: [`../schema/SCHEMA.md`](../schema/SCHEMA.md). The Neon database already has the
migrations and the seeded data (500 titles, 12.9k episodes, 2.9k people), so every query below can run
against real rows as soon as you write it.

## Table of contents

1. [Scope](#1-scope)
2. [Dependencies on B and C, and what to stub](#2-dependencies-on-b-and-c-and-what-to-stub)
3. [Ordered checklist](#3-ordered-checklist)
4. [Catalogue service (`catalog.service.ts`)](#4-catalogue-service-catalogservicets)
5. [Admin service (`admin.service.ts`)](#5-admin-service-adminservicets)
6. [Deep dive: the TMDB import transaction](#6-deep-dive-the-tmdb-import-transaction)
7. [Deep dive: the dashboard queries](#7-deep-dive-the-dashboard-queries)
8. [Implementation notes (Drizzle, mapping, pitfalls)](#8-implementation-notes-drizzle-mapping-pitfalls)
9. [Definition of done](#9-definition-of-done)

---

## 1. Scope

| Files you own                                                      |                                                                                                                 |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `src/server/services/catalog.service.ts`                           | `ContentSearch` (type), `searchContent`, `getContentDetail`, `listGenres`, `getSimilarTitles`                   |
| `src/server/services/admin.service.ts`                             | `getDashboard`, `markInCatalog`, `findCatalogueId`, `importTitle` (+ the `QUERIES` constant)                    |
| `src/app/api/admin/content/import/route.ts`                        | wire the server-side TMDB fetch (section 6.4)                                                                   |
| a custom migration `drizzle/NNNN_dashboard_indexes.sql` (optional) | the dashboard indexes from README section 7.3, if the queries get slow. `unaccent` is already enabled by `0002` |

| Routes                                | Service function                                          |
| ------------------------------------- | --------------------------------------------------------- |
| `GET /api/genres`                     | `listGenres`                                              |
| `GET /api/content`                    | `searchContent`                                           |
| `GET /api/content/:contentId`         | `getContentDetail`                                        |
| `GET /api/content/:contentId/similar` | `getSimilarTitles`                                        |
| `GET /api/admin/dashboard`            | `getDashboard`                                            |
| `GET /api/admin/tmdb/search`          | `markInCatalog` (the live TMDB call is already real)      |
| `GET /api/admin/tmdb/:type/:tmdbId`   | `findCatalogueId` (live fetch + SQL preview already real) |
| `POST /api/admin/content/import`      | `importTitle`                                             |

Already real, do not rewrite: `src/app/api/_lib/tmdb.ts` (`getTmdbClient`, `parseMediaType`,
`tmdbErrorResponse`), `src/lib/tmdb/*` (client, mappers, `fetchTitle`, `toSearchResult`) and
`src/lib/sql/import-title.ts` (`buildImportScript`). The catalogue is written **only** by `importTitle`.

Tables you read: `content`, `genre`, `content_genre`, `person`, `content_credit`, `season`, `episode`,
`watch_history` (popularity), `content_similarity` (kNN), and for the dashboard `users`, `subscription`,
`subscription_plan`, `payment`. You write: `content`, `genre`, `content_genre`, `person`, `content_credit`,
`season`, `episode` (import only).

Maturity is never stored: filter with `maturity_of(c.age_rating) <= $level` (enum order KIDS < TEEN < ADULT,
NULL certificate counts as TEEN). A `null` `maturityLevel` argument means "no profile selected, no filter".

---

## 2. Dependencies on B and C, and what to stub

| You need                                                    | From                                                                                                                        | Until it lands                                                                                                                                                   |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requireAdmin` -> `findUserById` (admin routes)             | B (`users.service`)                                                                                                         | The mock lookup still finds the seeded admin (user 2); the seed uses the same ids, so admin routes work                                                          |
| `getSelectedProfile` -> `getOwnedProfile` (maturity filter) | B (`profiles.service`)                                                                                                      | Mock lookup works for seeded profiles 1 to 3                                                                                                                     |
| `content_similarity` rows for `getSimilarTitles`            | C (the view is created by migration 0001 and was refreshed once by the seed; C's `refreshContentSimilarity` keeps it fresh) | The seeded activity of 3 profiles gives a small, real similarity table. A title with no rows ranks on genres/people only, which is correct behaviour, not a stub |
| Activity rows for the popularity ranking and dashboard      | C writes them later; the seed provides 15 history rows                                                                      | Real data from the seed is enough                                                                                                                                |
| Payments/subscriptions for dashboard widgets                | B writes later; the seed provides 8 payments, 2 subscriptions                                                               | Real data from the seed is enough                                                                                                                                |

Who depends on you: `activity.getTitleActivity` calls `getContentDetail` (C); `recommendations` reads
the same tables and `getSimilarTitles`'s SQL is reused for the "Because you liked X" row (C). Keep
`getContentDetail`'s `NotFoundError("Title not found.")` message stable.

---

## 3. Ordered checklist

- [ ] **0. Prep**: branch `feat/catalogue-admin`, `.env` with your Neon branch `DATABASE_URL`, `npm run dev`, open `npm run db:studio` and look at `content`, `content_genre`, `content_credit`.
- [x] **1. `unaccent` extension**: already enabled by migration `0002`. (Optional, later: the README 7.3 dashboard indexes in a custom migration.)
- [ ] **2. `listGenres`** (simplest; proves the db wiring). curl `/api/genres`.
- [ ] **3. `getContentDetail`**: six small queries, assemble `ContentDetail`. curl a movie, a series, and `/api/content/999999` (404).
- [ ] **4. `searchContent`**: filters, ranking, genres json. curl each filter; Mini's profile (KIDS) must not see R-rated titles.
- [ ] **5. `getSimilarTitles`**: full query with the 0.05 cut-off. curl `/api/content/1/similar` as KIDS and ADULT.
- [ ] **6. `markInCatalog` and `findCatalogueId`** (natural-key lookups). Test through the admin import page search and preview.
- [ ] **7. `getDashboard`**: run the nine `QUERIES`, map rows. Open `/admin`.
- [ ] **8. `importTitle`** + wire the route to fetch the title server-side (section 6.4). Import a new title twice: first 201 `created: true`, then 200 `created: false`; check row counts in Studio; force an error and confirm nothing was written.
- [ ] **9. Cleanup**: remove `getMockDb`/`findContent`/`toSummary` imports from your two files, `npm run lint`, `npm run build`, run the whole UI (browse, search, title page, admin).
- [ ] **10. Optional**: `REPEATABLE READ READ ONLY` snapshots for `getContentDetail` and `getDashboard`; a `pg_trgm` index if search is slow; full-sync option for re-imports.

---

## 4. Catalogue service (`catalog.service.ts`)

### 4.1 Types and mapping

```ts
export interface ContentSearch {
  q?: string; // trimmed free text; undefined/empty = browse
  type?: ContentType; // 'MOVIE' | 'SERIES'
  genreId?: number; // genre.genre_id
  limit: number; // 1-100, default 60 (the route has clamped it)
  maturityLevel: MaturityLevel | null; // selected profile's level; null = no filter
}
```

Return types come from `@/types`: `ContentSummary` (= `Content` minus `cast`/`directors`:
`contentId, title, description, releaseDate, contentType, durationMinutes, ageRating, maturityLevel,
posterUrl, backdropUrl, genres: Genre[]`), `ContentDetail` (= `Content` + `seasons: Season[]`),
`Genre { genreId, name }`.

Row mapping: `maturity_of(c.age_rating) AS maturity_level` gives `maturityLevel`; `release_date` must come
back as the string `YYYY-MM-DD` (select `c.release_date::text` in raw SQL); `genres` come from the
`json_agg(json_build_object('genreId', ..., 'name', ...))` subquery already in camelCase.

### 4.2 `listGenres(): Promise<Genre[]>`

Every genre, alphabetical (search filter, onboarding, genre pages).

```sql
SELECT genre_id, name FROM genre ORDER BY name;
```

|                          |                                                       |
| ------------------------ | ----------------------------------------------------- |
| Tables / keys            | `genre`; `genre.name UNIQUE`                          |
| Transaction / idempotent | no / yes (read)                                       |
| Edge cases               | genres no title uses are still listed                 |
| Throws                   | nothing                                               |
| Called by                | `GET /api/genres`                                     |
| Mock today               | returns the mock genre list as stored (not re-sorted) |

Drizzle: `db.select({ genreId: genre.genreId, name: genre.name }).from(genre).orderBy(genre.name)`.

### 4.3 `getContentDetail(contentId: number): Promise<ContentDetail>`

One title with everything the title page and player need: genres, billed cast with character names,
directors and, for series, every season with its episodes (`seasons` is `[]` for movies).

Steps:

1. Load the content row; no row -> `NotFoundError("Title not found.")`.
2. Attach genres, cast, directors and seasons (queries below; run them in parallel with `Promise.all`).
3. Maturity is **not** checked here: the page checks it against the selected profile and shows "not
   available on this profile" instead of a 404.

```sql
SELECT content_id, title, description, release_date, content_type, duration_minutes, age_rating,
       maturity_of(age_rating) AS maturity_level, poster_url, backdrop_url
FROM content WHERE content_id = $1;

-- genres
SELECT g.genre_id, g.name FROM content_genre AS cg JOIN genre AS g ON g.genre_id = cg.genre_id
WHERE cg.content_id = $1 ORDER BY g.name;

-- cast: top-billed first; characterName = COALESCE(character_name, '')
SELECT p.person_id, p.name, p.date_of_birth, p.photo_url, COALESCE(cc.character_name, '') AS character_name
FROM content_credit AS cc JOIN person AS p ON p.person_id = cc.person_id
WHERE cc.content_id = $1 AND cc.role = 'ACTOR' ORDER BY cc.credit_order;

-- directors (the response keeps cast and directors as two lists; both come from content_credit)
SELECT p.person_id, p.name, p.date_of_birth, p.photo_url
FROM content_credit AS cc JOIN person AS p ON p.person_id = cc.person_id
WHERE cc.content_id = $1 AND cc.role = 'DIRECTOR' ORDER BY cc.credit_order;

-- seasons (season 0, "Specials", is skipped), series only
SELECT season_id, content_id, season_number, name, release_date
FROM season WHERE content_id = $1 AND season_number > 0 ORDER BY season_number;

-- their episodes, grouped by season_id in code
SELECT episode_id, season_id, episode_number, title, description, release_date, duration_minutes, still_url
FROM episode WHERE season_id = ANY($2::int[]) ORDER BY season_id, episode_number;
```

|                          |                                                                                                                                                                                                                                                                  |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables / keys            | `content`, `content_genre`, `genre`, `content_credit`, `person`, `season`, `episode`. Relies on `content` PK; `content_credit` PK `(content_id, person_id, role)`; `season` UNIQUE `(content_id, season_number)`; `episode` UNIQUE `(season_id, episode_number)` |
| Transaction / idempotent | no (for one consistent snapshot run them in a `REPEATABLE READ READ ONLY` transaction) / yes                                                                                                                                                                     |
| Edge cases               | a movie has no seasons (skip the season and episode queries); a series season with no episodes keeps `episodes: []`; NULL `character_name` comes back as `''`; no seasons for a series is fine                                                                   |
| Throws                   | `NotFoundError("Title not found.")` when the id does not exist                                                                                                                                                                                                   |
| Called by                | `GET /api/content/:contentId`; `getSimilarTitles` (existence check); `activity.service` `getTitleActivity`                                                                                                                                                       |
| Mock today               | returns the mock catalogue entry, or throws `NotFoundError`                                                                                                                                                                                                      |

Assembly sketch (Drizzle `sql` + `db.execute`, or the builder with `inArray(episode.seasonId, ids)`):

```ts
const [row] = (await db.execute(sql`SELECT ... FROM content WHERE content_id = ${contentId}`)).rows;
if (!row) throw new NotFoundError("Title not found.");
const [genres, cast, directors, seasons] = await Promise.all([...]);
const episodes = seasons.length ? await ... : [];            // ANY(${sql.param(seasonIds)}::int[]) or inArray()
return { ...mapContent(row), genres, cast: cast.map((r) => ({ person: mapPerson(r), characterName: r.character_name })),
         directors: directors.map(mapPerson), seasons: seasons.map((s) => ({ ...mapSeason(s), episodes: bySeason.get(s.season_id) ?? [] })) };
```

### 4.4 `searchContent(query: ContentSearch): Promise<ContentSummary[]>`

Searches and browses the catalogue: filters by maturity / type / genre / text, ranks, and returns the card
shape (no cast, directors or seasons).

Steps:

1. Maturity: keep titles with `maturity_of(c.age_rating) <= $maturityLevel`; `null` = no filter.
2. `type` -> `content_type = $type`. `genre` -> `EXISTS (SELECT 1 FROM content_genre WHERE content_id = c.content_id AND genre_id = $genre)`.
3. `q` -> unaccented, case-insensitive `ILIKE '%' || $q || '%'` on title, **or** an `EXISTS` over `content_credit` joined to `person` whose name matches, any role (`EXISTS`, so a title is not repeated per matching person or role). **Escape `%`, `_` and `\` in `q` before binding** (`q.replace(/[\\%_]/g, "\\$&")`). `unaccent` is enabled by migration `0002`.
4. Rank: exact title (4) > title prefix (3) > title contains (2) > person match (1), then most watched (distinct profiles in `watch_history` over the last 30 days, the popularity prior), then `release_date DESC`. With no `q` it is just most watched, then `release_date DESC` ("most popular first"). `LIMIT $limit`.
5. Genres per row from `content_genre` join `genre` via `json_agg` (a correlated subquery).

```sql
WITH popularity AS (
  SELECT content_id, COUNT(DISTINCT profile_id) AS viewers
  FROM watch_history
  WHERE watched_at > now() - interval '30 days'
  GROUP BY content_id
)
SELECT c.content_id, c.title, c.description, c.release_date, c.content_type, c.duration_minutes,
       c.age_rating, maturity_of(c.age_rating) AS maturity_level, c.poster_url, c.backdrop_url,
       COALESCE((SELECT json_agg(json_build_object('genreId', g.genre_id, 'name', g.name) ORDER BY g.name)
                 FROM content_genre AS cg JOIN genre AS g ON g.genre_id = cg.genre_id
                 WHERE cg.content_id = c.content_id), '[]'::json) AS genres
FROM content AS c
LEFT JOIN popularity AS pop ON pop.content_id = c.content_id
WHERE ($1::maturity_level IS NULL OR maturity_of(c.age_rating) <= $1)
  AND ($2::content_type   IS NULL OR c.content_type = $2)
  AND ($3::int            IS NULL OR EXISTS (SELECT 1 FROM content_genre AS cg
                                              WHERE cg.content_id = c.content_id AND cg.genre_id = $3))
  AND ($4::text           IS NULL
       OR unaccent(c.title) ILIKE '%' || unaccent($4) || '%'
       OR EXISTS (SELECT 1 FROM content_credit AS cc JOIN person AS p ON p.person_id = cc.person_id
                  WHERE cc.content_id = c.content_id AND unaccent(p.name) ILIKE '%' || unaccent($4) || '%'))
ORDER BY CASE WHEN $4::text IS NULL                                  THEN 0
              WHEN unaccent(c.title) ILIKE unaccent($4)              THEN 4   -- exact
              WHEN unaccent(c.title) ILIKE unaccent($4) || '%'       THEN 3   -- prefix
              WHEN unaccent(c.title) ILIKE '%' || unaccent($4) || '%' THEN 2  -- contains
              ELSE 1 END DESC,                                                -- person match
         COALESCE(pop.viewers, 0) DESC,
         c.release_date DESC NULLS LAST
LIMIT $5;
-- $1 maturityLevel | null, $2 type | null, $3 genreId | null, $4 q (LIKE-escaped) | null, $5 limit
```

|                          |                                                                                                                                                                                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables / keys            | `content`, `content_genre`, `genre`, `content_credit`, `person`, `watch_history`. Relies on `content_genre` PK + `content_genre_genre_idx`, `content_credit_person_idx`, `watch_history_recent_idx`, `maturity_of()`                            |
| Transaction / idempotent | no / yes (read)                                                                                                                                                                                                                                 |
| Edge cases               | no matches -> `[]`; a title with several matching cast members appears once; no release date sorts last; the route has already clamped `limit` to 1-100 and dropped an unknown `type`; an empty string `q` arrives as `undefined` (bind `null`) |
| Throws                   | nothing                                                                                                                                                                                                                                         |
| Called by                | `GET /api/content`                                                                                                                                                                                                                              |
| Mock today               | the first `limit` catalogue items as summaries, ignoring q / type / genre / maturity                                                                                                                                                            |

`sql` template note: bind each optional value as `${value ?? null}` with an explicit cast on every
occurrence (`${maturityLevel ?? null}::maturity_level`); Drizzle creates a separate `$n` per occurrence,
which is fine.

### 4.5 `getSimilarTitles(contentId, maturityLevel, limit = 12): Promise<ContentSummary[]>`

```ts
export async function getSimilarTitles(
  contentId: number,
  maturityLevel: MaturityLevel | null,
  limit = 12,
): Promise<ContentSummary[]>;
```

"More like this": up to `limit` titles ranked by a blend of what viewers did with them (item-kNN) and how
much their genres and people overlap (content-based). Never the title itself.

Steps:

1. `getContentDetail(contentId)` -> `NotFoundError` for an unknown id (so the route answers 404). A cheaper
   `SELECT 1 FROM content WHERE content_id = $1` with the same error message is acceptable.
2. `itemSimilarity`: cosine similarity between this title and every other over per-profile interaction scores,
   shrunk by `common / (common + 2)` so pairs seen by few profiles count less. Precomputed in the
   `content_similarity` materialized view (refreshed by C; shared with `recommendations.service`), so here it
   is a lookup: `score WHERE content_a = $1`. Titles with no row get 0.
3. `contentSimilarity`: `0.7 x Jaccard(shared genres) + 0.3 x min(1, shared people / 2)`, where people are
   `content_credit` rows with `role = 'ACTOR' AND credit_order < 5` (top-5 billed) or `role = 'DIRECTOR'`.
4. `score = 0.65 x itemSimilarity + 0.35 x contentSimilarity`; keep `score > 0.05` and titles the profile may
   see (`maturity_of(age_rating) <= $maturityLevel`; null = no filter); never the title itself.
5. `ORDER BY score DESC` (ties: `release_date DESC`) `LIMIT $limit` (12 on the title page); attach genres as
   in `searchContent`.

```sql
WITH item AS (                                     -- itemSimilarity
       SELECT content_b AS content_id, score AS item_sim
       FROM content_similarity WHERE content_a = $1
     ),
     my_genres AS (SELECT genre_id FROM content_genre WHERE content_id = $1),
     my_people AS (
       SELECT person_id FROM content_credit
       WHERE content_id = $1 AND (role = 'DIRECTOR' OR (role = 'ACTOR' AND credit_order < 5))
     ),
     genre_overlap AS (                             -- Jaccard = shared / (|A| + |B| - shared)
       SELECT cg.content_id,
              COUNT(*) FILTER (WHERE cg.genre_id IN (SELECT genre_id FROM my_genres))::real AS shared,
              COUNT(*) AS theirs
       FROM content_genre AS cg GROUP BY cg.content_id
     ),
     people_overlap AS (
       SELECT cc.content_id, COUNT(DISTINCT cc.person_id) AS shared
       FROM content_credit AS cc
       WHERE cc.person_id IN (SELECT person_id FROM my_people)
         AND (cc.role = 'DIRECTOR' OR (cc.role = 'ACTOR' AND cc.credit_order < 5))
       GROUP BY cc.content_id
     ),
     scored AS (
       SELECT c.content_id, c.title, c.description, c.release_date, c.content_type, c.duration_minutes,
              c.age_rating, maturity_of(c.age_rating) AS maturity_level, c.poster_url, c.backdrop_url,
              <genres json_agg subquery as in searchContent> AS genres,
              0.65 * COALESCE(i.item_sim, 0)
            + 0.35 * ( 0.7 * COALESCE(go.shared / NULLIF((SELECT COUNT(*) FROM my_genres) + go.theirs - go.shared, 0), 0)
                     + 0.3 * LEAST(1, COALESCE(po.shared, 0) / 2.0) ) AS score
       FROM content AS c
       LEFT JOIN item           AS i  ON i.content_id  = c.content_id
       LEFT JOIN genre_overlap  AS go ON go.content_id = c.content_id
       LEFT JOIN people_overlap AS po ON po.content_id = c.content_id
       WHERE c.content_id <> $1
         AND ($2::maturity_level IS NULL OR maturity_of(c.age_rating) <= $2)
     )
SELECT * FROM scored WHERE score > 0.05          -- the cut-off needs the expression repeated or a CTE: this is the CTE
ORDER BY score DESC, release_date DESC NULLS LAST
LIMIT $3;
```

(The JSDoc shows the select without the `scored` wrapper and says "repeat the expression in a subquery/CTE
and filter outside"; the `scored` CTE above is that form.) Strip `score` before mapping to `ContentSummary`.

|                          |                                                                                                                                                                                                                                                                                              |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables / keys            | `content_similarity` (mat. view over `interaction_score`), `content`, `content_genre`, `genre`, `content_credit`. Relies on `content_similarity_pair_key` UNIQUE `(content_a, content_b)`; `content_genre` PK; `content_credit` PK `(content_id, person_id, role)`; `maturity_of()`          |
| Transaction / idempotent | no / yes (read; `content_similarity` is only as fresh as its last refresh)                                                                                                                                                                                                                   |
| Edge cases               | a title nobody interacted with has no `content_similarity` rows and ranks on genres/people alone; fewer than `limit` titles can clear 0.05; the cosine can be negative for titles the same viewers rated low, which pushes them out; the same blend is reused by C for "Because you liked X" |
| Throws                   | `NotFoundError("Title not found.")`                                                                                                                                                                                                                                                          |
| Called by                | `GET /api/content/:contentId/similar`                                                                                                                                                                                                                                                        |
| Mock today               | the first `limit` other titles in catalogue order (default 12), ignoring maturity                                                                                                                                                                                                            |

---

## 5. Admin service (`admin.service.ts`)

The live TMDB calls (search, `fetchTitle`) are **not** here; they are real code in the admin routes
(`src/app/api/_lib/tmdb.ts`, `src/lib/tmdb`). These functions only touch the database.

### 5.1 `markInCatalog(results: Omit<TmdbSearchResult, "alreadyInCatalog">[]): Promise<TmdbSearchResult[]>`

Flags which TMDB search results are already in the catalogue. The database stores no TMDB ids, so a result is
"in the catalogue" when a `content` row has the same natural key `(title, content_type, release_date)`,
taken from the result's `title`, `contentType` and `releaseDate`.

Steps:

1. Empty input -> `[]` without a query.
2. One query for the whole page (not one per row): the page's titles, types and dates as three parallel
   arrays; it returns the 1-based positions (`ord`) of the results that exist.
3. Copy each result with `alreadyInCatalog = (its position is in that set)`. Order unchanged.

```sql
SELECT v.ord
FROM unnest($1::text[], $2::content_type[], $3::date[]) WITH ORDINALITY AS v (title, content_type, release_date, ord)
JOIN content AS c ON c.title = v.title AND c.content_type = v.content_type
                 AND c.release_date IS NOT DISTINCT FROM v.release_date;
-- served by the UNIQUE NULLS NOT DISTINCT (title, content_type, release_date) index
```

|                          |                                                                                                                                                                                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables / keys            | `content`; UNIQUE NULLS NOT DISTINCT `(title, content_type, release_date)`; `IS NOT DISTINCT FROM` lets a NULL release date match, like the key does                                                                                                                                |
| Transaction / idempotent | no / yes                                                                                                                                                                                                                                                                            |
| Edge cases               | a title TMDB later renames or re-dates does not match its imported row and shows as new; two results with the same key are both flagged. `$3::date[]` binds `null` entries fine (`(string \| null)[]`); pass arrays with `sql.param([...])` or via `db.$client.query(text, values)` |
| Throws                   | nothing                                                                                                                                                                                                                                                                             |
| Called by                | `GET /api/admin/tmdb/search`                                                                                                                                                                                                                                                        |
| Mock today               | flags a result when the mock catalogue's `findByKey(contentType, title, releaseDate)` hits                                                                                                                                                                                          |

### 5.2 `findCatalogueId(contentType: ContentType, title: string, releaseDate: string | null): Promise<number | null>`

The `content_id` of the catalogue row with this natural key, or `null`. Feeds the import preview's
`alreadyInCatalog` / `existingContentId`: non-null means an import refreshes the row (its SQL is an upsert
on the same key).

```sql
SELECT content_id FROM content
WHERE title = $1 AND content_type = $2 AND release_date IS NOT DISTINCT FROM $3;
```

|                          |                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| Tables / keys            | `content`; UNIQUE NULLS NOT DISTINCT `(title, content_type, release_date)`: at most one row can match, even with a NULL release date |
| Transaction / idempotent | no / yes                                                                                                                             |
| Edge cases               | a title TMDB renamed or re-dated will not match (an import would add a new row)                                                      |
| Throws                   | nothing                                                                                                                              |
| Called by                | `GET /api/admin/tmdb/:type/:tmdbId`                                                                                                  |
| Mock today               | `findByKey(contentType, title, releaseDate)?.contentId ?? null`                                                                      |

### 5.3 `getDashboard(): Promise<AdminDashboard>`

Every admin dashboard widget, each with the query that produces it (and a one-line explanation), plus the time
it was generated. The nine `QUERIES[*].sql` strings in the file **are** the queries to run (the page shows
them under "View SQL"): keep the two in step. Full list and mapping in [section 7](#7-deep-dive-the-dashboard-queries).

Steps:

1. Run the nine statements in parallel (`Promise.all` over `db.execute(sql.raw(QUERIES.x.sql))`; they are
   parameter-free so `sql.raw` is safe). For one consistent snapshot, run them sequentially on one connection
   inside `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY` instead.
2. Map snake_case columns to the camelCase fields of `src/types/admin.ts`. `COUNT`/`SUM` are cast to
   `int`/`numeric` in SQL because node-postgres returns `bigint` as a string, and numeric amounts need `Number()` in TS.
3. Return `{ widgets: { [key]: { ...QUERIES[key], data } }, generatedAt: new Date().toISOString() }`.

|                          |                                                                                                                                                                                               |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables                   | `users`, `subscription`, `subscription_plan`, `payment`, `watch_history`, `content`, `content_genre`, `genre`, `episode`                                                                      |
| Keys relied on           | none for correctness; indexes for speed in 7.3                                                                                                                                                |
| Transaction / idempotent | optional (`REPEATABLE READ READ ONLY`) / yes                                                                                                                                                  |
| Edge cases               | an empty database gives zeros and empty lists; genres and plans nobody uses stay in their lists with 0 (LEFT JOIN)                                                                            |
| Throws                   | nothing (`requireAdmin` already ran)                                                                                                                                                          |
| Called by                | `GET /api/admin/dashboard`                                                                                                                                                                    |
| Mock today               | counts and groups the mock rows in memory with the same shapes; `activeSubscriptions` counts status ACTIVE only (no `end_date` check) and revenue sums this calendar month's SUCCESS payments |

### 5.4 `importTitle(input: ImportTitleInput, title?: TmdbTitleData): Promise<ImportTitleResult>`

Adds (or refreshes) one TMDB title in the catalogue, in one transaction: the content row with its genres,
people, credits and, for series, seasons and episodes. Full walk-through in [section 6](#6-deep-dive-the-tmdb-import-transaction).

|                          |                                                                                                                                                                                                                                                      |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables                   | `content`, `genre`, `content_genre`, `person`, `content_credit`, `season`, `episode`                                                                                                                                                                 |
| Transaction / idempotent | yes (`BEGIN ... COMMIT` on one connection) / yes (every write is an upsert on a natural key)                                                                                                                                                         |
| Throws                   | nothing typed; a failed statement rolls back and rethrows (500). The route owns the TMDB 404 / 502 / 503 answers since it does the fetch                                                                                                             |
| Called by                | `POST /api/admin/content/import`                                                                                                                                                                                                                     |
| Mock today               | persists nothing and fetches nothing (`title` is not passed yet). If the mock catalogue already has a title with that TMDB id and type, returns `{ contentId: <its id>, created: false }`, else `{ contentId: <catalogue size + 1>, created: true }` |

---

## 6. Deep dive: the TMDB import transaction

### 6.1 What is already real

- `GET /api/admin/tmdb/search?q=&type=movie|tv`: live TMDB search, mapped by `toSearchResult()`; only `markInCatalog` is yours.
- `GET /api/admin/tmdb/:type/:tmdbId`: `fetchTitle(tmdb, type, tmdbId)` (`src/lib/tmdb/catalog.ts`, the same mapper as `scripts/import-tmdb.mts`)
  returns `{ content, people, genres }` in the `data/tmdb` snapshot shape; the route adds
  `alreadyInCatalog`/`existingContentId` (your `findCatalogueId`) and `buildImportScript(title)` = `{ statements, rowCounts }`.
- `buildImportScript(title)` (`src/lib/sql/import-title.ts`) generates the exact statements for the SQL panel. Each
  `SqlStatement` is `{ step, title, explanation, sql, params, inlinedSql, table, rowCount }`. **`importTitle` runs the same statements**: send `sql` + `params`, never `inlinedSql` (that is for display).

### 6.2 Statement order (generated; nothing is carried between statements)

`$1,$2,$3` = `title, content_type, release_date` of the content row; every dependent statement finds the content row with
`c.title = $1 AND c.content_type = $2 AND c.release_date IS NOT DISTINCT FROM $3`.

| Step | Statement (skipped when empty)                                                                                                                                                                                                                                                                                                                                                                                                                    | Idempotency                                                                                              |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1    | `BEGIN;`                                                                                                                                                                                                                                                                                                                                                                                                                                          |                                                                                                          |
| 2    | Upsert `content`: `INSERT INTO content (title, content_type, release_date, description, duration_minutes, age_rating, poster_url, backdrop_url) VALUES ($1..$8) ON CONFLICT (title, content_type, release_date) DO UPDATE SET description, duration_minutes, age_rating, poster_url, backdrop_url = EXCLUDED.* RETURNING content_id, (xmax = 0) AS created;`                                                                                      | natural key `UNIQUE NULLS NOT DISTINCT`; `xmax = 0` is true only for a freshly inserted row              |
| 3    | `INSERT INTO genre (name) VALUES ($1), ($2), ... ON CONFLICT (name) DO NOTHING;`                                                                                                                                                                                                                                                                                                                                                                  | `genre.name UNIQUE` (TV-only genres were folded into movie genres by the mapper)                         |
| 4    | `INSERT INTO content_genre (content_id, genre_id) SELECT c.content_id, g.genre_id FROM content c JOIN genre g ON g.name = ANY ($4::text[]) WHERE <content key> ON CONFLICT DO NOTHING;`                                                                                                                                                                                                                                                           | PK `(content_id, genre_id)`                                                                              |
| 5    | Upsert `person` (cast + directors/creators de-duplicated by `(name, date_of_birth)`): `INSERT INTO person (name, date_of_birth, photo_url) VALUES ... ON CONFLICT (name, date_of_birth) DO UPDATE SET photo_url = EXCLUDED.photo_url;`                                                                                                                                                                                                            | `UNIQUE NULLS NOT DISTINCT (name, date_of_birth)`; namesakes without a birth date share a row (accepted) |
| 6    | Cast: `INSERT INTO content_credit (...) SELECT c.content_id, p.person_id, 'ACTOR'::credit_role, NULLIF(v.character_name, ''), v.credit_order FROM content c CROSS JOIN (VALUES ...) AS v (name, date_of_birth, character_name, credit_order) JOIN person p ON p.name = v.name AND p.date_of_birth IS NOT DISTINCT FROM v.date_of_birth WHERE <content key> ON CONFLICT (content_id, person_id, role) DO UPDATE SET character_name, credit_order;` | PK `(content_id, person_id, role)`; `credit_order` 0 = top billed                                        |
| 7    | Directors (series: creators stand in): same shape, `'DIRECTOR'::credit_role`, `NULL` character, `ON CONFLICT ... DO UPDATE SET credit_order`                                                                                                                                                                                                                                                                                                      | CHECK: `character_name` only for actors                                                                  |
| 8a   | Series only: `INSERT INTO season (content_id, season_number, name, release_date) SELECT c.content_id, v.* FROM content c CROSS JOIN (VALUES ...) v (season_number, name, release_date) WHERE <content key> ON CONFLICT (content_id, season_number) DO UPDATE SET name, release_date;` (season 0 and empty seasons are skipped)                                                                                                                    | `UNIQUE (content_id, season_number)`                                                                     |
| 8b   | One statement **per season**: `INSERT INTO episode (season_id, episode_number, title, description, release_date, duration_minutes, still_url) SELECT s.season_id, v.* FROM season s JOIN content c ON c.content_id = s.content_id CROSS JOIN (VALUES ...) v (...) WHERE <content key> AND s.season_number = $4 ON CONFLICT (season_id, episode_number) DO UPDATE SET title, description, release_date, duration_minutes, still_url;`              | `UNIQUE (season_id, episode_number)`                                                                     |
| last | `COMMIT;`                                                                                                                                                                                                                                                                                                                                                                                                                                         |                                                                                                          |

Tables/constraints relied on: `content` UNIQUE NULLS NOT DISTINCT `(title, content_type, release_date)` (constraint `content_title_type_release_key`);
`genre` UNIQUE `(name)`; `person` UNIQUE NULLS NOT DISTINCT `(name, date_of_birth)` (`person_name_dob_key`); `content_genre` PK; `content_credit`
PK; `season` UNIQUE `(content_id, season_number)`; `episode` UNIQUE `(season_id, episode_number)`; FKs `ON DELETE CASCADE`. CHECKs: `age_rating` in the US
codes (or NULL); `content_credit.character_name` NULL unless ACTOR; `duration_minutes` NULL for series; `season_number > 0`.

Edge cases (copied from the service):

- Two admins importing the same title at once serialise on those unique indexes (the second waits, then updates).
- If TMDB has since renamed or re-dated the title, its key no longer matches and the import adds a **new** content row.
- Re-imports add and refresh but never remove: a genre or cast credit TMDB dropped stays linked. For a full sync,
  `DELETE FROM content_genre WHERE content_id = $1` and `DELETE FROM content_credit WHERE content_id = $1` right after
  the content upsert, inside the same transaction (open decision).
- Multi-row upserts may not touch one row twice, which is why the generator de-duplicates people by key.

### 6.3 Implementation skeleton

```ts
import { db } from "@/server/db";
import { buildImportScript } from "@/lib/sql/import-title";

export async function importTitle(input: ImportTitleInput, title?: TmdbTitleData): Promise<ImportTitleResult> {
  if (!title) throw new ServiceError("The title must be fetched before importing.", 500); // route always passes it
  const { statements } = buildImportScript(title); // [BEGIN, content upsert, ..., COMMIT]
  const client = await db.$client.connect(); // ONE pooled connection: a transaction belongs to a connection
  let created: { content_id: number; created: boolean } | undefined;
  try {
    for (const statement of statements) {
      const result = await client.query(statement.sql, statement.params); // $n placeholders verbatim
      if (statement.table === "content") created = result.rows[0]; // RETURNING content_id, created
    }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {}); // BEGIN was statement 1
    throw error; // route answers 500
  } finally {
    client.release(); // always
  }
  return { contentId: created!.content_id, created: created!.created };
}
```

Notes: `statement.params` may contain JS arrays (`$4::text[]`); `pg` serialises them. If `db.$client` is not
reachable through the lazy proxy in `db/index.ts`, export the `Pool` next to `db` in a PR. Alternatively run
`statements.filter((s) => s.table !== null)` inside `db.transaction` with `tx.execute(...)`, but then the
`$n` placeholders need converting; the dedicated client is simpler. The `input` argument says which title it
was; nothing stores the TMDB id.

### 6.4 Route wiring (`src/app/api/admin/content/import/route.ts`)

The route currently calls `importTitle(input.data)` without a title. With the real service it must fetch on the
server first (never trust a payload from the browser), reusing the helpers of the preview route:

```ts
const tmdb = getTmdbClient(); // 503 TMDB_KEY_MISSING as a Response
if (tmdb instanceof Response) return tmdb;
let title: Awaited<ReturnType<typeof fetchTitle>>;
try {
  title = await fetchTitle(tmdb, input.data.type, input.data.tmdbId);
} catch (error) {
  return tmdbErrorResponse(error);
} // 404 / 502
const result = await importTitle(input.data, title);
return Response.json(result, { status: result.created ? 201 : 200 });
```

Update the route's header comment (remove the TODO paragraph) in the same PR.

### 6.5 Verify

1. `curl -b jar-admin -H 'content-type: application/json' -d '{"type":"movie","tmdbId":<a title not in the snapshot>}' .../api/admin/content/import` -> 201 `created: true`; the title appears in `/api/content` and the admin search shows `alreadyInCatalog: true`.
2. Same call again -> 200 `created: false`; row counts unchanged (Studio).
3. Import a series: seasons and episodes present, season 0 absent.
4. Break step 6 on purpose (temporarily pass a bad enum) -> 500 and the `content` row from step 2 is not there (rollback).
5. As the demo user -> 403; signed out -> 401; bad body -> 400.

---

## 7. Deep dive: the dashboard queries

All statements are parameter-free and live in the `QUERIES` constant of `admin.service.ts` (each with an
`explanation`). Mapping to `AdminDashboard["widgets"]`:

| Widget key            | SQL (verbatim from `QUERIES`)                                                                                                                                                                                                                                                | Maps to                                       |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `totalUsers`          | `SELECT COUNT(*)::int AS count FROM users WHERE role = 'USER';`                                                                                                                                                                                                              | `{ count }`                                   |
| `activeSubscriptions` | `SELECT COUNT(*)::int AS count FROM subscription WHERE status = 'ACTIVE' AND end_date > now();`                                                                                                                                                                              | `{ count }`                                   |
| `titles`              | `SELECT COUNT(*) FILTER (WHERE content_type = 'MOVIE')::int AS movies, COUNT(*) FILTER (WHERE content_type = 'SERIES')::int AS series FROM content;`                                                                                                                         | `{ movies, series }`                          |
| `episodes`            | `SELECT COUNT(*)::int AS count FROM episode;`                                                                                                                                                                                                                                | `{ count }`                                   |
| `revenueThisMonth`    | `SELECT COALESCE(SUM(amount), 0)::numeric AS amount, COUNT(*)::int AS payments, to_char(now(), 'YYYY-MM') AS month FROM payment WHERE status = 'SUCCESS' AND payment_date >= date_trunc('month', now()) AND payment_date < date_trunc('month', now()) + interval '1 month';` | `{ amount: Number(amount), payments, month }` |
| `recentPayments`      | see below                                                                                                                                                                                                                                                                    | `RecentPaymentRow[]`                          |
| `mostWatched`         | see below                                                                                                                                                                                                                                                                    | `MostWatchedRow[]`                            |
| `genreDistribution`   | see below                                                                                                                                                                                                                                                                    | `GenreCountRow[]`                             |
| `subscriptionsByPlan` | see below                                                                                                                                                                                                                                                                    | `PlanSubscriptionRow[]`                       |

```sql
-- recentPayments: the ten newest payments, joined through subscription to the paying user and the plan
SELECT p.payment_id, p.payment_date, p.amount, p.payment_mode, p.status, p.transaction_ref,
       u.name AS user_name, u.email AS user_email, sp.name AS plan_name
FROM payment AS p
JOIN subscription      AS s  ON s.subscription_id = p.subscription_id
JOIN users             AS u  ON u.user_id = s.user_id
JOIN subscription_plan AS sp ON sp.plan_id = s.plan_id
ORDER BY p.payment_date DESC
LIMIT 10;

-- mostWatched: ranks titles by how many different profiles watched them; plays counts history rows (one per episode for series)
SELECT c.content_id, c.title, c.content_type, c.poster_url,
       COUNT(DISTINCT wh.profile_id)::int AS viewers,
       COUNT(*)::int                      AS plays
FROM watch_history AS wh
JOIN content AS c ON c.content_id = wh.content_id
GROUP BY c.content_id
ORDER BY viewers DESC, plays DESC, c.title
LIMIT 10;

-- genreDistribution: titles per genre through the content_genre bridge; LEFT JOIN keeps genres with no titles at 0
SELECT g.genre_id, g.name, COUNT(cg.content_id)::int AS titles
FROM genre AS g
LEFT JOIN content_genre AS cg ON cg.genre_id = g.genre_id
GROUP BY g.genre_id
ORDER BY titles DESC, g.name;

-- subscriptionsByPlan: every plan with its active and all-time subscription counts; LEFT JOIN keeps plans nobody has chosen
SELECT sp.plan_id, sp.name AS plan_name, sp.price_monthly,
       COUNT(s.subscription_id) FILTER (WHERE s.status = 'ACTIVE')::int AS active,
       COUNT(s.subscription_id)::int                                   AS total
FROM subscription_plan AS sp
LEFT JOIN subscription AS s ON s.plan_id = sp.plan_id
GROUP BY sp.plan_id
ORDER BY sp.price_monthly;
```

### 7.1 Row mapping

| Widget                | Conversions                                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `revenueThisMonth`    | `amount` is `numeric` -> `Number(row.amount)`                                                                                                  |
| `recentPayments`      | `paymentId`, `paymentDate` -> ISO string, `amount` -> `Number`, `paymentMode`, `status`, `transactionRef`, `userName`, `userEmail`, `planName` |
| `mostWatched`         | `contentId`, `title`, `contentType`, `posterUrl`, `viewers`, `plays`                                                                           |
| `genreDistribution`   | `genreId`, `name`, `titles`                                                                                                                    |
| `subscriptionsByPlan` | `priceMonthly` -> `Number`                                                                                                                     |

`activeSubscriptions` intentionally adds `end_date > now()` (the mock counts status only). The `GROUP BY c.content_id` /
`g.genre_id` / `sp.plan_id` forms are valid because the grouped column is the primary key.

### 7.2 Check

`curl -b jar-admin .../api/admin/dashboard | jq '.widgets | keys'` -> nine keys; with the seed: `totalUsers.count = 1`, 8 payments in
`recentPayments`, `genreDistribution` has 18 rows. Each widget's `sql` field must equal what actually ran.

### 7.3 Indexes (custom migration, optional but recommended as data grows)

```sql
CREATE INDEX payment_date_idx        ON payment (payment_date DESC);
CREATE INDEX payment_status_date_idx ON payment (status, payment_date);
CREATE INDEX subscription_plan_status_idx ON subscription (plan_id, status);
CREATE INDEX watch_history_content_idx    ON watch_history (content_id);
```

(`content_genre_genre_idx` already exists. Add the matching `index()` entries to the Drizzle schema in the same PR.)

---

## 8. Implementation notes (Drizzle, mapping, pitfalls)

- **Raw vs builder.** The SQL above is long; use ``db.execute(sql`...`)`` and read `result.rows`. The builder is fine for `listGenres` and the small lookups.
- **Arrays.** In the `sql` template a plain JS array expands to a `($1, $2, ...)` list, which breaks `= ANY($n::int[])`. Wrap it: `${sql.param(ids)}::int[]` (verify with a scratch query), use `inArray()`, or call `db.$client.query(text, values)` with the `$n` text verbatim.
- **Types from the driver.** `COUNT`/`SUM` -> cast in SQL (`::int`); `numeric` arrives as a string -> `Number()`; `date` -> select `::text`; timestamps -> `new Date(v).toISOString()`.
- **Escape LIKE input** and bind `null` (not `undefined`) for absent filters.
- **Don't leak `score`** (an internal column of `getSimilarTitles`) into `ContentSummary`.
- **No `server/mocks` import** may remain in `catalog.service.ts` / `admin.service.ts` when you are done (`toSummary`, `findContent`, `getMockDb`, `findByKey`).
- Keep `NotFoundError` messages exactly: `"Title not found."`.
- The generated import SQL and the dashboard SQL are shown in the UI: if you change either, change the code that renders it and the text together.

---

## 9. Definition of done

- [ ] `catalog.service.ts` and `admin.service.ts` import nothing from `@/server/mocks`; `grep -n "server/mocks" src/server/services/{catalog,admin}.service.ts` is empty.
- [ ] Every function above matches its SQL, errors and edge cases; transaction on `importTitle` only (plus optional read-only snapshots).
- [ ] `unaccent` migration (and optional indexes) applied on `main` and in `drizzle/`.
- [ ] curl checks pass (README section 4): `/api/genres` alphabetical; `/api/content` filters + KIDS profile sees no R/TV-MA titles; `/api/content/:id` for a movie (seasons `[]`) and a series (seasons + episodes) and a missing id (404); `/api/content/:id/similar` (never the title itself, <= 12, respects maturity); admin dashboard 9 widgets (403 for the demo user, 401 signed out); admin search flags `alreadyInCatalog`; import twice (201 then 200), failure rolls back.
- [ ] UI works: browse/search/genre pages, title page ("More like this", cast, seasons, episodes), the command palette, `/admin` dashboard (all "View SQL" panels), `/admin/import` end to end.
- [ ] `npm run lint` and `npm run build` pass; route header comment of `POST /api/admin/content/import` updated.
- [ ] PR(s) reviewed by one of B or C with their curl evidence.
