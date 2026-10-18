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
 LAYER 1: genre taste  (one SQL query, built from CTEs)

 watch_history ─► MAX(progress_percent) ──────┐
                  GROUP BY content_id         │  1 row per title
                  <30%=0 · 30–69%=1 · ≥70%=2  │
 rating ────────► value − 3 (5★ +2 … 1★ −2) ──┤
 my_list ───────► +1 ─────────────────────────┤
                                              ▼  UNION ALL
                                              ●  "title points"
                                              │  JOIN content_genre
                                              ▼  copy to its genres
                                              │
 profile_genre_preference ─► +2 to genre ─────┤
   (onboarding picks)                         │
                                              ▼  SUM per genre
                                              ●  "genre taste"
                                              │  (one score per genre)
 ┌────────────────────────────────────────────┘
 ├─► top picks   title = AVG of its genres' scores, unseen only
 ├─► genre rows  the profile's top 2 genres
 └─► hero        the first top pick

 LAYER 2: trending

 watch_history (last 7 days) ─► COUNT(DISTINCT profile_id) per title
                              ├─► "Trending now" row
                              └─► tie-break for every ranked row

 Not ranked, just shown:
   continue-watching    latest history row per title, 1–89% progress
   because you liked X  titles sharing the most genres with the
                        most recently liked title
```

**Layer 1: personal genre taste.** Each signal gives points to every genre of the title it touched:

| Signal | Points | SQL |
|---|---|---|
| Watched | <30% → 0 · 30–69% → 1 · ≥70% → 2 | `CASE` on the title's best progress |
| Rating | 5★ +2 · 4★ +1 · 3★ 0 · 2★ −1 · 1★ −2 | `value - 3` |
| My List | +1 | constant |
| Onboarding genre pick | +2 to that genre directly | constant |

No views: every query reads the base tables directly (`watch_history`, `rating`, `my_list`,
`profile_genre_preference`). The schema has none: it's one migration, `drizzle/0000_schema.sql`.

A title's score is the **average** of its genres' points. We use the average, not the sum, because with a
sum, titles tagged with 5–8 genres won every time. (I tried it on the seed: Riya's top 10 all tied.)

**Layer 2: trending.** `COUNT(DISTINCT profile_id)` over the last 7 days of `watch_history`. It breaks ties
in layer 1 and is its own "Trending now" row.

**Cold start needs no special code.** With only onboarding picks, only the picked genres have weight. With
nothing at all, every score is 0 and the order falls back to trending, then release date.

**Home is computed on every request.** All the queries take a few milliseconds (top picks measured 4 ms), so there is
no cache, no 15-minute rule, and no reading back from `recommendation`.

### Home rows, in order

| # | Row id | Title | Items |
|---|---|---|---|
| 1 | `continue-watching` | Continue watching for {name} | latest history row per title with 1–89% |
| 2 | `top-picks` | Top picks for {name} | unseen titles by genre-taste score, with match % |
| 3 | `because-you-liked-{id}` | Because you liked {anchor} | unseen titles sharing the most genres with the anchor |
| 4 | `trending` | Trending now | most viewers in 7 days |
| 5–6 | `genre-picks-{genreId}` | {Genre} for you | unseen titles in the profile's top 2 genres |
| hero | — | — | the first top pick |

**Unseen** means the profile has no `watch_history`, `rating` or `my_list` row for the title. Rows 2, 3, 5
and 6 never repeat a title: an id shown in an earlier row is skipped in later ones (a `Set` in TypeScript).
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
- [ ] **B6. `getAnchor` + `getSimilarByGenre`**.
- [ ] **B7. `getTrending` + `getGenreTitles`**.
- [ ] **B8. `getHomeFeed`**: wire it all together.
- [ ] **B9. `storeTopPicks`**.
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
export type HomeRowKind = "continue-watching" | "top-picks" | "because-you-liked" | "trending" | "genre-picks";
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
  topPicksPickedGenres: "Popular in the genres you picked — rate a few to personalise this row.",
  topPicksNoSignals: "Popular titles to get you started — rate a few to personalise this row.",
  becauseYouLiked: (anchor: string) => `Shares genres with ${anchor}.`,
  trending: "The most-watched titles on Reelhouse right now.",
  genreWatched: (genre: string) => `You watch a lot of ${genre}.`,
  genrePicked: (genre: string) => `You picked ${genre} during setup.`,
  heroPick: (name: string) => `Our top pick for ${name} tonight`,
  heroPopular: "Popular on Reelhouse",
};
```

### B2. Shared SQL fragments + `loadSummaries`

Four of the queries filter the same way. Write the filters once:

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

/** FROM-clause piece: distinct viewers per title over the last 7 days (the trending signal). */
const recentViewers = sql`(SELECT content_id, COUNT(DISTINCT profile_id) AS viewers
                             FROM watch_history
                            WHERE watched_at > now() - interval '7 days'
                            GROUP BY content_id)`;
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

The heart of layer 1. It returns the genres with a positive score, strongest first. Build it in three
CTEs (named sub-queries, read top to bottom):

```sql
WITH watched AS (                        -- 1. one row per title: a series has one row PER EPISODE
  SELECT content_id, MAX(progress_percent) AS progress
    FROM watch_history
   WHERE profile_id = $1
   GROUP BY content_id
),
title_points AS (                        -- 2. points per title, from each signal
  SELECT content_id,
         CASE WHEN progress < 30 THEN 0
              WHEN progress < 70 THEN 1
              ELSE 2 END AS points
    FROM watched
  UNION ALL
  SELECT content_id, value - 3 FROM rating  WHERE profile_id = $1      -- 5★ +2 … 1★ −2
  UNION ALL
  SELECT content_id, 1         FROM my_list WHERE profile_id = $1
),
genre_points AS (                        -- 3. copy each title's points to its genres, add picks
  SELECT cg.genre_id, tp.points
    FROM title_points AS tp
    JOIN content_genre AS cg ON cg.content_id = tp.content_id
  UNION ALL
  SELECT genre_id, 2 FROM profile_genre_preference WHERE profile_id = $1
)
SELECT g.genre_id, g.name, SUM(gp.points) AS score
  FROM genre_points AS gp
  JOIN genre AS g ON g.genre_id = gp.genre_id
 GROUP BY g.genre_id, g.name
HAVING SUM(gp.points) > 0
 ORDER BY score DESC;
```

Why step 1 matters: summing straight from `watch_history` counts Breaking Bad 3 times for Riya (3 episode
rows), which inflates Crime and Drama.

Expected for **Riya (1)**: Drama 16, Science Fiction 15, Adventure 7, Crime 7, Mystery 6, Action 6,
Thriller 5, Fantasy 3, Comedy 1, History 1.

Put the three CTEs in a TS function (`tasteCtes(profileId)` returning `sql\`...\``) so B4 can reuse them.

`getSignalFlags` picks the wording of the top-picks and genre-row reasons:

```sql
SELECT EXISTS (SELECT 1 FROM watch_history WHERE profile_id = $1)
    OR EXISTS (SELECT 1 FROM rating        WHERE profile_id = $1)
    OR EXISTS (SELECT 1 FROM my_list       WHERE profile_id = $1) AS has_signals,
       EXISTS (SELECT 1 FROM profile_genre_preference WHERE profile_id = $1) AS has_picks;
```

Expected: Riya `t, t`; Mini (3) `t, f` (her My List counts as a signal).

### B4. `getTopPicks(profile, limit)` → `{ contentId, score }[]`

The B3 CTEs come first, then every title gets the average of its genres' scores, and unseen titles are ranked.

```sql
WITH watched AS (...), title_points AS (...), genre_points AS (...),      -- same as B3
     taste AS (SELECT genre_id, SUM(points) AS score FROM genre_points GROUP BY genre_id HAVING SUM(points) > 0)
SELECT c.content_id, AVG(COALESCE(t.score, 0)) AS score
  FROM content AS c
  JOIN content_genre AS cg ON cg.content_id = c.content_id
  LEFT JOIN taste    AS t  ON t.genre_id    = cg.genre_id      -- genres with no taste count as 0
  LEFT JOIN ${recentViewers} AS p ON p.content_id = c.content_id
 WHERE ${allowedFor(level)} AND ${unseenBy(profileId)}
 GROUP BY c.content_id, c.release_date, p.viewers
 ORDER BY score DESC, COALESCE(p.viewers, 0) DESC, c.release_date DESC NULLS LAST
 LIMIT $limit;
```

Ask for `ROW_SIZE * 2`: the hero takes one, and the rest are spares.

Expected:
- **Riya**: Drama-only titles tie at 16 (The Last of Us, Bridgerton, The Queen's Gambit, Euphoria, …).
- **Kabir (2, TEEN)**: Raiders of the Lost Ark 10.5, then Avatar: The Way of Water, Spider-Man: No Way Home, Avengers: Endgame, … at 9.
- **Mini (3, KIDS)**: only G/PG/TV-Y/TV-Y7/TV-G/TV-PG titles. Inside Out must **not** appear, because it's on her My List.

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

### B6. `getAnchor(profileId)` + `getSimilarByGenre(anchorId, profile, limit)`

The anchor is the title the profile liked most recently. "Liked" means rated 4★ or more, or watched at
least 70%.

```sql
SELECT liked.content_id, c.title
  FROM (SELECT content_id, rated_at AS liked_at FROM rating
         WHERE profile_id = $1 AND value >= 4
        UNION ALL
        SELECT content_id, watched_at FROM watch_history
         WHERE profile_id = $1 AND progress_percent >= 70) AS liked
  JOIN content AS c ON c.content_id = liked.content_id
 GROUP BY liked.content_id, c.title
 ORDER BY MAX(liked.liked_at) DESC
 LIMIT 1;
```

Expected for **Riya**: Breaking Bad (311). Mini and a new profile → no row → skip the row.

Similar titles: a self-join of `content_genre` counts the genres each title shares with the anchor.

```sql
SELECT c.content_id, COUNT(*) AS shared_genres
  FROM content_genre AS a
  JOIN content_genre AS b ON b.genre_id = a.genre_id AND b.content_id <> a.content_id
  JOIN content AS c ON c.content_id = b.content_id
  LEFT JOIN ${recentViewers} AS p ON p.content_id = c.content_id
 WHERE a.content_id = $anchor AND ${allowedFor(level)} AND ${unseenBy(profileId)}
 GROUP BY c.content_id, c.release_date, p.viewers
 ORDER BY shared_genres DESC, COALESCE(p.viewers, 0) DESC, c.release_date DESC NULLS LAST
 LIMIT $limit;
```

Expected for Breaking Bad (Crime, Drama): Tulsa King, DAHMER, Joker, The Act, … (all share 2 genres).

### B7. `getTrending(level, limit)` + `getGenreTitles(genreId, profile, limit)`

Trending is the same for everyone at a maturity level and includes titles the profile has seen:

```sql
SELECT c.content_id
  FROM content AS c
  LEFT JOIN ${recentViewers} AS p ON p.content_id = c.content_id
 WHERE ${allowedFor(level)}
 ORDER BY COALESCE(p.viewers, 0) DESC, c.release_date DESC NULLS LAST
 LIMIT $limit;
```

Expected: Arcane, Dune, Interstellar, Breaking Bad (1 viewer each this week), then the newest releases.

A genre row lists unseen titles in one genre:

```sql
SELECT c.content_id
  FROM content AS c
  JOIN content_genre AS cg ON cg.content_id = c.content_id AND cg.genre_id = $genre
  LEFT JOIN ${recentViewers} AS p ON p.content_id = c.content_id
 WHERE ${allowedFor(level)} AND ${unseenBy(profileId)}
 ORDER BY COALESCE(p.viewers, 0) DESC, c.release_date DESC NULLS LAST
 LIMIT $limit;
```

### B8. `getHomeFeed(profile)`: the orchestrator

```
1. In parallel (Promise.all):
     taste      = getGenreTaste(id)
     flags      = getSignalFlags(id)
     picks      = getTopPicks(profile, ROW_SIZE * 2)
     continueRow = getContinueWatching(id, level)
     anchor     = getAnchor(id)
     trending   = getTrending(level, ROW_SIZE)
2. In parallel (needs step 1):
     similar    = anchor ? getSimilarByGenre(anchor.contentId, profile, ROW_SIZE * 3) : []
     genreIds   = taste.slice(0, 2) → getGenreTitles(genre.genreId, profile, ROW_SIZE * 3) each
3. Dedupe: const shown = new Set<number>()
     hero      = picks[0]                         → shown.add
     topPicks  = picks, skip shown, take 18       → shown.add each
     because   = similar, skip shown, take 18     → shown.add each
     genre rows = same, in order
   (continue-watching and trending are not deduped)
4. summaries = loadSummaries(every id from steps 1–3)   ← ONE query
5. Build HomeRow[] in the order of section 1, using REASONS:
     top-picks reason: hasSignals → topPicks · only hasPicks → topPicksPickedGenres · neither → topPicksNoSignals
     genre rows reason: hasSignals → genreWatched(name) · else genrePicked(name)
     hero reason: hasSignals || hasPicks → heroPick(name) · else heroPopular
   Drop rows with items.length === 0.
6. try { await storeTopPicks(id, topPicks) } catch (e) { console.error(e) }   ← never fails the page
7. return { profileId, hero, rows, generatedAt: new Date().toISOString() }
```

Why fetch `ROW_SIZE * 3` for the later rows? Dedupe removes titles already in top picks, and you still want
18 left. (Riya's "Drama for you" row would otherwise lose most of its titles to top picks.)

### B9. `storeTopPicks(profileId, picks)`

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
- [ ] Riya: hero is a Drama title. Rows in order: continue-watching (4), top-picks (18), because-you-liked-311, trending, then 2 genre rows.
- [ ] No title appears in two of top-picks / because-you-liked / genre rows.
- [ ] No row except continue-watching and trending contains a title Riya watched, rated or saved.
- [ ] Mini sees only KIDS titles, and her top-picks reason is `topPicks` (she has My List signals).
- [ ] A brand-new profile with 3 onboarding genres: top picks come only from those genres, with reason `topPicksPickedGenres`, and the hero reason is `heroPick` (it has picks).
- [ ] A brand-new profile with nothing: top picks = trending order, reason `topPicksNoSignals`, hero "Popular on Reelhouse".
- [ ] Rate a title 5★, reload Home, and its genres rise in the genre rows (no cache, so it's instant).
- [ ] `SELECT * FROM recommendation WHERE profile_id = 1 ORDER BY relevance_score DESC;` lists the top picks.
- [ ] Watch a recommended title to 95% → its `rec_status` is WATCHED. Reload Home → it's gone from top picks.
- [ ] `grep -n "server/mocks" src/server/services/{activity,recommendations}.service.ts` is empty.
- [ ] `npm run lint` and `npm run build` pass.

---

## 7. Pitfalls

- **`GROUP BY` and `ORDER BY`**: every column you sort by (`c.release_date`, `p.viewers`) must also be in
  `GROUP BY`, or Postgres errors. B4 and B6 already include them.
- **`LEFT JOIN taste` is on purpose.** With an inner join, a title's untasted genres would vanish from the
  average and inflate its score.
- **`HAVING SUM(points) > 0`** drops disliked genres from taste, so they count as 0 rather than negative. That's
  deliberate. Keep negatives (remove the HAVING) only if you want 1★ titles to actively push their genres down.
- **Episode rows**: a series has one `watch_history` row per episode. Always collapse to one row per title
  first (`MAX(progress_percent) ... GROUP BY content_id` in B3, `DISTINCT ON` in B5) before scoring.
- **Update the docs when you're done**: the header comment of `recommendations.service.ts`, the route comment in
  `src/app/api/profiles/[profileId]/home/route.ts`, and section 5 of the Person C doc, so Tejasva and Yash
  read the real algorithm.
