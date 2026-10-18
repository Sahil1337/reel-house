# Plan: activity + recommendations (Person C, Sahil)

A guide for writing `activity.service.ts` and `recommendations.service.ts` by hand. Every SQL query in
part B was run against the seeded Neon database, and the expected results are written next to it, so
you can check your version against them.

**What this replaces.** [`docs/backend/person-c-activity-recommendations.md`](../../docs/backend/person-c-activity-recommendations.md)
is still the spec for **`activity.service.ts`** (its section 4). For **recommendations**, this plan is the
build guide; that doc's section 5 just summarises it.

---

## 1. The algorithm in one picture

```
 GENRE TASTE  (the genre_taste VIEW, drizzle/0001_genre_taste_view.sql)

 watch_history ─► MAX(progress_percent) per title ─► 0 / .25 / .5 / .75 / 1 ─┐
 rating ────────► (value − 3) / 2   (5★ +1 … 1★ −1) ─────────────────────────┤ JOIN content_genre:
 my_list ───────► +0.5 ──────────────────────────────────────────────────────┤ points go to each
                                                                             │ of the title's genres
 profile_genre_preference (onboarding picks) ─► +1 to that genre ────────────┤
                                                                             │ UNION ALL,
                                                                             │ SUM per genre
 ┌───────────────────────────────────────────────────────────────────────────┘
 ▼
 genre_taste (profile_id, genre_id, taste_score, …)
 ├─► top picks   title = SUM of its genres' scores / √(#genres), unseen;
 │               ties: newest release first
 ├─► genre rows  the profile's top 2 genres; same query as top picks,
 │               filtered to that genre
 └─► hero        the first top pick

 Not ranked, just shown:
   continue-watching    latest history row per title, 1–89% progress
```

**Genre taste.** Each signal gives points (0–1 scale) to every genre of the title it touched:

| Signal | Points | SQL |
|---|---|---|
| Watched | <10% → 0 · <30% → 0.25 · <50% → 0.5 · <80% → 0.75 · else 1 | `CASE` on the title's best progress |
| Rating | 5★ +1 · 4★ +0.5 · 3★ 0 · 2★ −0.5 · 1★ −1 | `(value - 3) / 2.0` |
| My List | +0.5 | constant |
| Onboarding genre pick | +1 to that genre directly | constant |

This lives in **one view, `genre_taste`** (migration `drizzle/0001_genre_taste_view.sql`). It covers every
profile; you read one with `WHERE profile_id = $1`, and Postgres pushes that filter into all four signal
blocks, so it uses the indexes. Columns: `profile_id, genre_id, genre, watch_score, rating_score,
my_list_score, pick_score, taste_score`. The four `*_score` columns show where the total came from; ranking
uses only `taste_score`.

A title's score is the **sum** of its genres' taste divided by **√(number of genres)** (step B4 explains why:
plain sum lets 5–6-genre series win on genre count; plain average ties every single-genre title).

**Ties** break on release date, newest first (`c.release_date DESC NULLS LAST`), in every ranked row.

**Cold start needs no special code.** Onboarding makes every profile pick at least 3 genres before it reaches
Home (the profile picker sends un-onboarded profiles to `/onboarding`, which needs `ONBOARDING_MIN_GENRES = 3`;
"Skip" only shows once a profile is onboarded). So a new profile already has a genre taste from its picks, each
worth +1, and no popularity fallback is needed. A profile with nothing at all (only possible in seed data) gets
every score 0, ordered newest first.

**Home is computed on every request.** All the queries take a few milliseconds (top picks measured 4 ms), so there is
no cache, no 15-minute rule, and no reading back from `recommendation`.

### Home rows, in order

| # | Row id | Title | Items |
|---|---|---|---|
| 1 | `continue-watching` | Continue watching for {name} | latest history row per title with 1–89% |
| 2 | `top-picks` | Top picks for {name} | unseen titles by genre-taste score, with match % |
| 3–4 | `genre-picks-{genreId}` | {Genre} for you | the top-picks query filtered to one of the profile's top 2 genres |
| hero | — | — | the first top pick |

**Unseen** means the profile has no `watch_history`, `rating` or `my_list` row for the title. Rows 2, 3
and 4 never repeat a title: an id shown in an earlier row is skipped in later ones (a `Set` in TypeScript).
A row with no items is left out.

---

## 2. How to write raw SQL in this repo

`db` is Drizzle over node-postgres (`src/server/db/index.ts`). For these queries, use raw SQL with the `sql`
template tag. It's closest to psql and to what you'll show your teacher.

```ts
import { sql } from "drizzle-orm";
import { db } from "@/server/db";

const { rows } = await db.execute<{ content_id: number; value: number }>(sql`
  SELECT content_id, value FROM rating WHERE profile_id = ${profileId}
`);
// rows: [{ content_id: 8, value: 5 }, ...]   ← column names come back snake_case
```

Things that will bite you:

| Need | Write | Why |
|---|---|---|
| A value | `${profileId}` | Becomes `$1`, never string-concatenated (no SQL injection) |
| An enum | `${profile.maturityLevel}::maturity_level` | Without the cast Postgres compares text, and `'KIDS' < 'TEEN'` happens to work for the wrong reason |
| A list of ids | `= ANY(${sql.param(ids)})` | `IN ${ids}` renders `IN ()` for an empty list, which is a syntax error |
| A reusable SQL piece | a function returning `sql\`...\`` and `${piece}` inside another `sql` | Fragments nest |
| Numbers | nothing | `NUMERIC`/`BIGINT` are already parsed to `number` in `db/index.ts` |
| Timestamps | `.toISOString()` | `timestamptz` comes back as a JS `Date`; the API sends ISO strings |
| A transaction | `await db.transaction(async (tx) => { await tx.execute(sql\`...\`); ... })` | Use `tx`, not `db`, inside |
| FK violation → 404 | `(error as { cause?: { code?: string } }).cause?.code === "23503"` | Drizzle wraps the pg error in `DrizzleQueryError`; the code is on `.cause` |

Try every query in psql first (`psql "$DATABASE_URL"` after `set -a; source .env; set +a`), then paste it
into `sql\`...\`` and swap the literals for `${...}`.

---

## 3. Build order

- [ ] **0. Setup**: branch `feat/activity-recs`, `npm run dev`, open psql and run the queries in section 5 to get used to the data.
- [ ] **A. `activity.service.ts`**: section 4 below (follows the existing spec).
- [ ] **B1. Types**: shrink `src/types/recommendations.ts`.
- [ ] **B2. Shared SQL fragments + `loadSummaries`**.
- [ ] **B3. `getGenreTaste` + `getSignalFlags`**.
- [ ] **B4. `getTopPicks`**.
- [ ] **B5. `getContinueWatching`**.
- [ ] **B6. `getGenreTitles`**: the top-picks query filtered to one genre.
- [ ] **B7. `getHomeFeed`**: wire it all together.
- [ ] **B8. `storeTopPicks`**.
- [ ] **C. Cleanup**: remove mock imports, update the file header comment and the Person C doc, `npm run lint`, `npm run build`.

Test after **every** step with psql or curl (section 6). Don't write all of it and then debug.

---

## 4. Part A: `activity.service.ts`

The existing spec ([person-c doc §4](../../docs/backend/person-c-activity-recommendations.md#4-activityservicets))
has the SQL for every function. Build them in this order; each one is one or two queries.

| Order | Function | Spec | The one thing to get right |
|---|---|---|---|
| 1 | `isInMyList`, `addToMyList`, `removeFromMyList`, `listMyList` | §4.4–4.6, 4.10 | `ON CONFLICT DO NOTHING`; FK 23503 → `NotFoundError("Title not found.")` |
| 2 | `getRating`, `rateTitle`, `removeRating` | §4.7, 4.8, 4.11 | upsert with `ON CONFLICT (profile_id, content_id) DO UPDATE` |
| 3 | `listHistory`, `removeHistoryEntry` | §4.2, 4.3 | `c.*, e.*` clash on `title` etc.: alias columns explicitly; 0 rows deleted → 404 |
| 4 | `recordProgress` | §4.1 | movie → `episode_id = NULL`; series episode must belong to the title (422); upsert + `rec_status` update in **one transaction** |
| 5 | `getNextEpisode`, `getResumePoint`, `getTitleActivity` | §4.9, 4.12, 4.13 | `(season_number, episode_number) > (...)` row comparison; run the 3 helpers with `Promise.all` |

Simplifications:
- Skip the optional `SHOWN → CLICKED` write in `getTitleActivity`. `recordProgress` already does it.
- `listHistory` and `listMyList` need a `ContentSummary` per row. Reuse `loadSummaries` from B2 (export it from a
  small shared module, or copy it) instead of writing the genres subquery twice.

---

## 5. Part B: `recommendations.service.ts`

### B1. Types (`src/types/recommendations.ts`)

Delete `Candidate`, `RankedCandidate`, `HomeBuild` and `InteractionScores`. Shrink the row kinds:

```ts
export type HomeRowKind = "continue-watching" | "top-picks" | "genre-picks";
```

Keep `RowItem`, `HomeRow`, `HomeHero`, `HomeFeed`, `RecStatus`, `Recommendation`. The UI only reads
`row.kind === "continue-watching"`, so nothing on the frontend breaks.

In the service, delete `WEIGHTS` and the exports `shouldRefreshRecommendations`, `computeInteractionScores`,
`generateCandidates`, `rankCandidates`, `buildHomeRows` and `storeRecommendations`. Keep `ROW_SIZE = 18`
and `getHomeFeed`.

New `REASONS` (private const):

```ts
const REASONS = {
  continueWatching: "Pick up where you left off.",
  topPicks: "Based on the genres you watch, rate and save.",
  topPicksPickedGenres: "Based on the genres you picked — rate a few to personalise this row.",
  topPicksNoSignals: "The newest titles to get you started — rate a few to personalise this row.",
  genreWatched: (genre: string) => `You watch a lot of ${genre}.`,
  genrePicked: (genre: string) => `You picked ${genre} during setup.`,
  heroPick: (name: string) => `Our top pick for ${name} tonight`,
  heroPopular: "Picked for you",
};
```

### B2. Shared SQL fragments + `loadSummaries`

Three of the queries filter the same way. Write the filters once:

```ts
/** WHERE-clause piece: titles this profile's maturity level allows. Expects the content alias `c`. */
function allowedFor(level: MaturityLevel) {
  return sql`maturity_of(c.age_rating) <= ${level}::maturity_level`;
}

/** WHERE-clause piece: the profile never watched, rated or saved the title. Expects alias `c`. */
function unseenBy(profileId: number) {
  return sql`NOT EXISTS (SELECT 1 FROM watch_history AS w WHERE w.profile_id = ${profileId} AND w.content_id = c.content_id)
         AND NOT EXISTS (SELECT 1 FROM rating        AS r WHERE r.profile_id = ${profileId} AND r.content_id = c.content_id)
         AND NOT EXISTS (SELECT 1 FROM my_list       AS m WHERE m.profile_id = ${profileId} AND m.content_id = c.content_id)`;
}
```

`loadSummaries(ids)` turns ids into the `ContentSummary` cards need. Load **every** row's ids in **one** call at
the end of `getHomeFeed`, not one call per row.

```sql
SELECT c.content_id, c.title, c.description, c.release_date, c.content_type, c.duration_minutes,
       c.age_rating, maturity_of(c.age_rating) AS maturity_level, c.poster_url, c.backdrop_url,
       COALESCE((SELECT json_agg(json_build_object('genreId', g.genre_id, 'name', g.name) ORDER BY g.name)
                   FROM content_genre AS cg JOIN genre AS g ON g.genre_id = cg.genre_id
                  WHERE cg.content_id = c.content_id), '[]') AS genres
  FROM content AS c
 WHERE c.content_id = ANY($ids);
```

The result is unordered. Build a `Map<contentId, ContentSummary>` and read from it in the order you need.
`json_agg` arrives as already-parsed JSON, so `genres` is a ready `Genre[]`.

Checked on the seed: ids `{311, 33}` give Breaking Bad `[Crime, Drama]` (ADULT) and Dune `[Adventure, Science Fiction]` (TEEN).

### B3. `getGenreTaste(profileId)` + `getSignalFlags(profileId)`

The heart of the engine is already in the database: the `genre_taste` view (`drizzle/0001_genre_taste_view.sql`,
open it to read the full SQL with comments). `getGenreTaste` just reads it:

```sql
SELECT genre_id, genre, taste_score
  FROM genre_taste
 WHERE profile_id = $1
 ORDER BY taste_score DESC;
```

How the view works (the same query we built step by step in `demo.sql`):
1. `watched` CTE: one row per (profile, title), `MAX(progress_percent)`. A series has one `watch_history` row
   **per episode**; without this, Breaking Bad would count 3 times for Riya.
2. `genre_points` CTE: four `UNION ALL` blocks, one per signal, each giving `(profile_id, genre_id, source,
   points)`. Watch, rating and My List join `content_genre` (a title's points go to each of its genres); the
   onboarding pick is already a genre, so it needs no join.
3. Final `SELECT`: `SUM(points)` per (profile, genre) = `taste_score`, plus one `SUM(...) FILTER (WHERE source = ...)`
   column per signal so you can see where the total came from. `HAVING SUM > 0` drops disliked genres.

Expected for **Riya (1)**:

| genre | watch | rating | my_list | pick | **taste** |
|---|---|---|---|---|---|
| Drama | 3.00 | 2.00 | 2.00 | 1.00 | **8.00** |
| Science Fiction | 3.75 | 2.00 | 1.00 | 1.00 | **7.75** |
| Adventure | 2.75 | 1.00 | 0 | 0 | **3.75** |
| Crime | 2.00 | 1.50 | 0 | 0 | **3.50** |
| … Comedy | 1.00 | −0.50 | 0 | 0 | **0.50** |

Kabir (2): Action 6, Adventure 4.5, Animation 3.5. Mini (3): Animation 1, Family 1 (My List only).

`getSignalFlags` picks the wording of the top-picks and genre-row reasons:

```sql
SELECT EXISTS (SELECT 1 FROM watch_history WHERE profile_id = $1)
    OR EXISTS (SELECT 1 FROM rating        WHERE profile_id = $1)
    OR EXISTS (SELECT 1 FROM my_list       WHERE profile_id = $1) AS has_signals,
       EXISTS (SELECT 1 FROM profile_genre_preference WHERE profile_id = $1) AS has_picks;
```

Expected: Riya `t, t`; Mini (3) `t, f` (her My List counts as a signal).

### B4. `getTopPicks(profile, limit)` → `{ contentId, score }[]`

Every unseen title gets `SUM(taste of its genres) / SQRT(number of genres it has)`; a genre the profile has
no taste for counts as 0. Why √ (full reasoning, with numbers, is in `demo.sql` above the query):
- Plain **SUM** rewards having many genres: for Riya, "The 100" (6 genres) scored 27.5 and swept the top.
- Plain **AVG** punishes extra matching genres: Drama-only titles (8) beat Drama + Sci-Fi (7.9), all tied.
- **÷ √n** sits in between: each extra liked genre still helps, but less each time. Ex Machina (Drama + Sci-Fi)
  15.75 / √2 = 11.14 vs The 100 27.5 / √6 = 11.23.

```sql
SELECT c.content_id,
       SUM(COALESCE(t.taste_score, 0)) / SQRT(COUNT(*)::numeric) AS score   -- ::numeric: SQRT of a count is double
  FROM content AS c
  JOIN content_genre AS cg ON cg.content_id = c.content_id                  -- one row per (title, genre)
  LEFT JOIN genre_taste AS t ON t.genre_id = cg.genre_id                    -- a genre with no taste counts as 0
                            AND t.profile_id = $1           -- in the ON, NOT in WHERE (see below)
 WHERE ${allowedFor(level)} AND ${unseenBy(profileId)}
 GROUP BY c.content_id, c.release_date
 ORDER BY score DESC, c.release_date DESC NULLS LAST                        -- ties: newest first
 LIMIT $limit;
```

Why `t.profile_id = $1` sits in the `ON`: in `WHERE`, rows where the LEFT JOIN found no taste (`t.profile_id`
is NULL) would be thrown away, turning it into an inner join. Untasted genres would vanish from the average,
and a profile with only a few tasted genres would get no picks at all.

Ask for `ROW_SIZE * 2`: the hero takes one, and the rest are spares.

Expected:
- **Riya**: The Martian 11.26, The 100 11.23, Ex Machina 11.14, then Logan / Arrival / The Prestige 10.83.
- **Kabir (2, TEEN)**: What If…?, Super Dragon Ball Heroes, My Hero Academia, Dragon Ball Super, … at 8.94 (Action/Adventure/Animation).
- **Mini (3, KIDS)**: Shrek 1.57, then Moana, Zootopia, Frozen, Wreck-It Ralph at 1.5; only KIDS titles. Inside Out must **not** appear, because it's on her My List.

**Match %** (the "93% fit" chip), in TypeScript: `best = picks[0].score`, then for each pick
`match = Math.round(55 + 44 * Math.min(1, score / best))`. If `best` is 0 (no taste at all), leave `match` undefined.

### B5. `getContinueWatching(profileId, level)` → `RowItem[]`

```sql
SELECT latest.content_id, latest.progress_percent,
       e.episode_id, e.season_id, e.episode_number, e.title AS episode_title, e.description AS episode_description,
       e.release_date AS episode_release_date, e.duration_minutes AS episode_duration, e.still_url,
       s.season_number
  FROM (SELECT DISTINCT ON (w.content_id) w.content_id, w.episode_id, w.progress_percent, w.watched_at
          FROM watch_history AS w
         WHERE w.profile_id = $1
         ORDER BY w.content_id, w.watched_at DESC) AS latest      -- latest row per title
  JOIN content AS c ON c.content_id = latest.content_id
  LEFT JOIN episode AS e ON e.episode_id = latest.episode_id      -- NULL for movies
  LEFT JOIN season  AS s ON s.season_id  = e.season_id
 WHERE latest.progress_percent BETWEEN 1 AND 89 AND ${allowedFor(level)}
 ORDER BY latest.watched_at DESC
 LIMIT 18;
```

Map each row to `{ content, progress: { progressPercent, episode } }`, where `episode` is `null` when
`episode_id` is null, else `{ episodeId, seasonId, episodeNumber, title, description, releaseDate, durationMinutes, stillUrl, seasonNumber }`.

`DISTINCT ON` keeps the first row per `content_id` under the `ORDER BY`. That's why the inner query
sorts by `content_id` first, and the outer query re-sorts by time.

Expected for **Riya**: Breaking Bad S1:E3 41%, Dune 62%, Parasite 6%, Stranger Things S1:E2 23%.

### B6. `getGenreTitles(genreId, profile, limit)`

A genre row is the **same query as B4**, restricted to titles that have the genre. There is no new ranking
idea: the titles are ranked by the profile's taste, so Riya's "Drama for you" starts with the Drama titles she
is most likely to like, not the newest. Add one filter to the `WHERE`:

```sql
SELECT c.content_id,
       SUM(COALESCE(t.taste_score, 0)) / SQRT(COUNT(*)::numeric) AS score
  FROM content AS c
  JOIN content_genre AS cg ON cg.content_id = c.content_id
  LEFT JOIN genre_taste AS t ON t.genre_id = cg.genre_id AND t.profile_id = $1
 WHERE ${allowedFor(level)} AND ${unseenBy(profileId)}
   AND EXISTS (SELECT 1 FROM content_genre WHERE content_id = c.content_id AND genre_id = $genre)
 GROUP BY c.content_id, c.release_date
 ORDER BY score DESC, c.release_date DESC NULLS LAST
 LIMIT $limit;
```

Why `EXISTS` and not `AND cg.genre_id = $genre` in the `WHERE`: that filter would remove the title's other
genre rows before `COUNT(*)` and `SUM`, so every title would be scored on the one genre alone. `EXISTS`
checks the genre without touching the join, so the score is exactly the one B4 gives the title.

You can share the code: give `getTopPicks` an optional `genreId` that adds the `EXISTS` line, and let
`getGenreTitles` call it.

Expected for **Riya** (Drama): The Martian 11.26, The 100 11.23, Ex Machina 11.14, then Logan / Arrival /
The Prestige 10.83, Fallout 10.73. Many of these are also her top picks, which is why the dedupe in B7 matters.

### B7. `getHomeFeed(profile)`: the orchestrator

```
1. In parallel (Promise.all):
     taste      = getGenreTaste(id)
     flags      = getSignalFlags(id)
     picks      = getTopPicks(profile, ROW_SIZE * 2)
     continueRow = getContinueWatching(id, level)
2. In parallel (needs step 1):
     genre rows = taste.slice(0, 2) → getGenreTitles(genre.genreId, profile, ROW_SIZE * 4) each
3. Dedupe: const shown = new Set<number>()
     hero      = picks[0]                         → shown.add
     topPicks  = picks, skip shown, take 18       → shown.add each
     genre rows = each one in order, skip shown, take 18 → shown.add each
   (continue-watching is not deduped)
4. summaries = loadSummaries(every id from steps 1–3)   ← ONE query
5. Build HomeRow[] in the order of section 1, using REASONS:
     top-picks reason: hasSignals → topPicks · only hasPicks → topPicksPickedGenres · neither → topPicksNoSignals
     genre rows reason: hasSignals → genreWatched(name) · else genrePicked(name)
     hero reason: hasSignals || hasPicks → heroPick(name) · else heroPopular ("Picked for you")
   Drop rows with items.length === 0.
6. try { await storeTopPicks(id, topPicks) } catch (e) { console.error(e) }   ← never fails the page
7. return { profileId, hero, rows, generatedAt: new Date().toISOString() }
```

Why fetch `ROW_SIZE * 4` for the genre rows? Dedupe removes the titles already in top picks (and in the first
genre row), and you still want 18 left. The best Drama and Science Fiction titles are the same ones that top
Riya's picks, so the genre rows lose a lot: checked on the seed, with `ROW_SIZE * 3` her Science Fiction row
ends up with 17 titles after dedupe, with `* 4` it has 35.

### B8. `storeTopPicks(profileId, picks)`

This writes the top-picks row into the `recommendation` table, so the table is used and `recordProgress` can move
`rec_status` from SHOWN to CLICKED to WATCHED. It's one transaction:

```sql
BEGIN;
INSERT INTO recommendation (profile_id, content_id, row_type, relevance_score, generated_at)
VALUES ($1, $c1, 'top-picks', $s1, now()), ($1, $c2, 'top-picks', $s2, now()), ...
ON CONFLICT (profile_id, content_id)
DO UPDATE SET row_type = EXCLUDED.row_type,
              relevance_score = EXCLUDED.relevance_score,
              generated_at = now();                       -- rec_status is NOT touched: it survives
DELETE FROM recommendation
 WHERE profile_id = $1 AND generated_at < now() AND rec_status <> 'DISMISSED';   -- picks that dropped out
COMMIT;
```

`now()` is the same for the whole transaction, so `generated_at < now()` matches exactly the rows this run
didn't upsert. Build the VALUES list with `sql.join(picks.map((p) => sql\`(${profileId}, ${p.contentId}, 'top-picks', ${p.score}, now())\`), sql\`, \`)`.
If `picks` is empty, skip the INSERT and only run the DELETE.

---

## 6. Testing

curl (log in first; see `docs/backend/README.md` §4):

```bash
curl -b jar $BASE/api/profiles/1/home | jq '.hero.content.title, (.rows[] | {id, title, reason, n: (.items|length)})'
curl -b jar $BASE/api/profiles/3/home | jq '[.rows[].items[].content.maturityLevel] | unique'   # ["KIDS"] only
```

Checklist:
- [ ] Riya: hero is a Drama title. Rows in order: continue-watching (4), top-picks (18), then 2 genre rows (Drama, Science Fiction).
- [ ] No title appears in two of top-picks / genre rows.
- [ ] No row except continue-watching contains a title Riya watched, rated or saved.
- [ ] Mini sees only KIDS titles, and her top-picks reason is `topPicks` (she has My List signals).
- [ ] A brand-new profile with 3 onboarding genres: top picks come only from those genres, with reason `topPicksPickedGenres`, and the hero reason is `heroPick` (it has picks).
- [ ] A brand-new profile with nothing: every score is 0, so top picks are the newest allowed titles (release date descending), reason `topPicksNoSignals`, hero "Picked for you". Only reachable with seed data, since onboarding forces 3 genres.
- [ ] Rate a title 5★, reload Home, and its genres rise in the genre rows (no cache, so it's instant).
- [ ] `SELECT * FROM recommendation WHERE profile_id = 1 ORDER BY relevance_score DESC;` lists the top picks.
- [ ] Watch a recommended title to 95% → its `rec_status` is WATCHED. Reload Home → it's gone from top picks.
- [ ] `grep -n "server/mocks" src/server/services/{activity,recommendations}.service.ts` is empty.
- [ ] `npm run lint` and `npm run build` pass.

---

## 7. Pitfalls

- **`GROUP BY` and `ORDER BY`**: every column you sort by (`c.release_date`) must also be in
  `GROUP BY`, or Postgres errors. B4 and B6 already include them.
- **`LEFT JOIN genre_taste` is on purpose.** With an inner join, a title's untasted genres would vanish from
  `COUNT(*)` (the n in √n) and inflate its score.
- **`HAVING SUM(points) > 0`** (in the view) drops disliked genres from taste, so they count as 0 rather than
  negative. That's deliberate. Changing it means a new migration (`CREATE OR REPLACE VIEW`), not an app edit.
- **Episode rows**: a series has one `watch_history` row per episode. Always collapse to one row per title
  first (`MAX(progress_percent) ... GROUP BY profile_id, content_id` in the view, `DISTINCT ON` in B5) before scoring.
- **Update the docs when you're done**: the header comment of `recommendations.service.ts`, the route comment in
  `src/app/api/profiles/[profileId]/home/route.ts`, and section 5 of the Person C doc, so Tejasva and Yash
  read the real algorithm.
