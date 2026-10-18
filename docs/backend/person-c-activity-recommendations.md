# Person C: Sahil — activity & recommendations

Sahil, you own **what a profile does** (watch progress, History, My List, ratings, the title-page state) and **what
Home shows because of it** (the recommendation pipeline). Read [README.md](README.md) first (architecture,
setup, conventions, curl testing); this file is the complete spec for your two services and the pipeline
behind them. Schema: [`../schema/SCHEMA.md`](../schema/SCHEMA.md) ("Viewing activity", "Recommendations", "Ranking"). The
Neon database already has the migrations (including the `interaction_score` view and the `content_similarity`
materialized view) and the seeded data, so you can run every query below against real rows right away.

## Table of contents

1. [Scope](#1-scope)
2. [Dependencies on A, and what to stub](#2-dependencies-on-a-and-what-to-stub)
3. [Ordered checklist](#3-ordered-checklist)
4. [`activity.service.ts`](#4-activityservicets)
5. [`recommendations.service.ts`](#5-recommendationsservicets)
6. [Deep dive: the recommendation pipeline](#6-deep-dive-the-recommendation-pipeline)
7. [Deep dive: refresh policy, `content_similarity` refresh, `rec_status` loop](#7-deep-dive-refresh-policy-content_similarity-refresh-rec_status-loop)
8. [Testing with the seeded data](#8-testing-with-the-seeded-data)
9. [Implementation notes and pitfalls](#9-implementation-notes-and-pitfalls)
10. [Definition of done](#10-definition-of-done)

---

## 1. Scope

| Files you own                                    |                                                                                                                                                                                                                        |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/server/services/activity.service.ts`        | `recordProgress`, `listHistory`, `removeHistoryEntry`, `listMyList`, `addToMyList`, `removeFromMyList`, `rateTitle`, `removeRating`, `getTitleActivity`, `isInMyList`, `getRating`, `getResumePoint`, `getNextEpisode` |
| `src/server/services/recommendations.service.ts` | `ROW_SIZE`, `WEIGHTS`, `getHomeFeed`, `shouldRefreshRecommendations`, `computeInteractionScores`, `generateCandidates`, `rankCandidates`, `buildHomeRows`, `storeRecommendations`, `refreshContentSimilarity`          |
| a refresh trigger for `content_similarity`       | npm script and/or guarded route (section 7.2)                                                                                                                                                                          |

| Routes (all `requireOwnedProfile`)                        | Service function            |
| --------------------------------------------------------- | --------------------------- |
| `POST /api/profiles/:profileId/progress`                  | `recordProgress`            |
| `GET /api/profiles/:profileId/history`                    | `listHistory`               |
| `DELETE /api/profiles/:profileId/history/:historyId`      | `removeHistoryEntry`        |
| `GET, POST /api/profiles/:profileId/my-list`              | `listMyList`, `addToMyList` |
| `DELETE /api/profiles/:profileId/my-list/:contentId`      | `removeFromMyList`          |
| `PUT, DELETE /api/profiles/:profileId/ratings/:contentId` | `rateTitle`, `removeRating` |
| `GET /api/profiles/:profileId/titles/:contentId`          | `getTitleActivity`          |
| `GET /api/profiles/:profileId/home`                       | `getHomeFeed`               |

Tables you own: `watch_history`, `my_list`, `rating`, `recommendation`. You read: `interaction_score` (view),
`content_similarity` (materialized view), `profile_genre_preference`, `profile`, `content`, `content_genre`, `genre`,
`content_credit`, `person`, `season`, `episode`. Onboarding itself (`PUT .../onboarding`) is Tejasva's (A); you only read what it
stores (`profile_genre_preference`, `profile.onboarded_at`).

**Completed is not a column.** A `watch_history` row is completed when `progress_percent >= 90` (SQL) /
`isCompleted(progressPercent)` from `@/lib/content/progress` with `COMPLETED_THRESHOLD` (TS).

All routes are already ownership-checked by `requireOwnedProfile` before your functions run, so `profileId` is
always the signed-in user's profile. Still filter every query by `profile_id`.

---

## 2. Dependencies on A, and what to stub

| You need                                                                | From                                | Until it lands                                                                                                                                                                                     |
| ----------------------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `requireOwnedProfile` -> `getOwnedProfile`, `findUserById`              | A (Tejasva)                         | The mock lookups find the seeded profiles 1-3 (user 1) because the seed uses the same ids. Keep working against the mock-backed guards and test only with those until Tejasva merges the real ones |
| `getContentDetail(contentId)` (existence check in `getTitleActivity`)   | A (Tejasva): `catalog.service`      | The mock catalogue has the same 500 ids; works unchanged                                                                                                                                           |
| Catalogue rows (`content`, `content_genre`, credits, seasons, episodes) | seeded                              | No stub needed                                                                                                                                                                                     |
| `getSimilarTitles` SQL (for "Because you liked X")                      | A (Tejasva)                         | You can copy the SQL (Tejasva's file section 7.5) into your own query returning `item_sim` and `content_sim` separately; nothing blocks you                                                        |
| `profile_genre_preference` / `onboarded_at` writes                      | A (Tejasva): `saveGenrePreferences` | The seed has picks for profiles 1 and 2 (profile 3 has none: cold start without picks)                                                                                                             |

Who depends on you: Tejasva's (A) `getSimilarTitles` reads `content_similarity`, which you keep fresh; the dashboard's
`mostWatched` / the popularity ranking read the `watch_history` rows you write.

---

## 3. Ordered checklist

- [ ] **0. Prep**: branch `feat/activity-recs`, own Neon branch in `.env`, `npm run dev`, `db:studio` to look at `watch_history`, `my_list`, `rating`; run the stage-1 query (section 8.1) and compare with the table there.
- [ ] **1. My List**: `listMyList`, `addToMyList`, `removeFromMyList` (+ `isInMyList`). curl add twice (201 both), list, remove twice.
- [ ] **2. Ratings**: `rateTitle`, `removeRating` (+ `getRating`). curl 5, then 3, value 6 -> 422, unknown title -> 404.
- [ ] **3. History**: `listHistory`, `removeHistoryEntry`. History page; second delete -> 404.
- [ ] **4. Progress**: `recordProgress` (validation, upsert, feedback loop in one transaction). Player in the UI; movie and series; wrong episode -> 422; 95% twice -> one row.
- [ ] **5. Title activity**: `getTitleActivity`, `getResumePoint`, `getNextEpisode`. Title page labels "Resume · 62%", "Resume S1:E3", "Play S1:E4"; finale completed -> null.
- [ ] **6. Stage 1**: `computeInteractionScores` (+ verify the `interaction_score` view against section 8.1).
- [ ] **7. Stage 2**: `generateCandidates` (genre, people, kNN, prior; cold start).
- [ ] **8. Stage 3**: `rankCandidates` (blend, filters, match).
- [ ] **9. Stage 4**: `buildHomeRows` (rows in order, reasons, hero, anchors).
- [ ] **10. Stage 5 + policy**: `storeRecommendations`, `shouldRefreshRecommendations`, `getHomeFeed` wiring (stored vs recompute).
- [ ] **11. `refreshContentSimilarity`** + trigger (section 7.2); call it after you add test activity.
- [ ] **12. Tune** `WEIGHTS`, check the three demo profiles' Home pages, cold start (profile 3, a brand new profile).
- [ ] **13. Cleanup**: remove `getMockDb`/`toHistoryItem`/`toSummary`/`findContent` imports; update the route header comments that change; lint; build.

---

## 4. `activity.service.ts`

Types: `WatchHistory { historyId, profileId, contentId, episodeId | null, watchedAt (ISO), progressPercent }`,
`HistoryItem = WatchHistory & { content: ContentSummary; episode: (Episode & { seasonNumber }) | null }`,
`MyListItem = ContentSummary & { addedAt }`, `Rating { profileId, contentId, value, ratedAt }`,
`ProgressInput { contentId, episodeId | null, progressPercent }`, `TitleActivity { inMyList, rating, resume }`.
`ContentSummary` needs `genres` (use the `json_agg` subquery from Tejasva's (A) `searchContent`, copied) and
`maturityLevel` (`maturity_of(c.age_rating)`).

### 4.1 `recordProgress(profileId: number, input: ProgressInput): Promise<WatchHistory>`

Records how far a profile got in a title or episode. The player reports this on pause, seek, the 90% mark, the
end, every 10 s while playing, and on page hide (`keepalive`). **Hot path: one round trip plus the cheap
recommendation update.**

Steps:

1. Validate: clamp and round `progressPercent` to 0-100 (the CHECK is the backstop). The title must exist
   (`NotFoundError`). A **movie** stores `episode_id = NULL` whatever the client sent. A **series** needs an
   `episodeId` that belongs to the title (`episode` join `season` on `content_id`), otherwise `ValidationError` (422).
2. Upsert the single row for (profile, content, episode) and bump `watched_at`. Re-watching a finished title
   overwrites its progress (a fresh pass), so a re-watch moves to the top of History.
3. Feedback loop: if the title now counts as completed (progress >= 90) mark its recommendation `WATCHED`. (Any
   progress write on a recommended title also moves `SHOWN` -> `CLICKED`.)

```sql
SELECT content_type FROM content WHERE content_id = $1;                       -- NotFoundError when no row
SELECT 1 FROM episode AS e JOIN season AS s ON s.season_id = e.season_id
 WHERE e.episode_id = $2 AND s.content_id = $1;                               -- series only; no row -> 422
INSERT INTO watch_history (profile_id, content_id, episode_id, progress_percent)
VALUES ($profile, $content, $episode, $percent)                              -- $episode NULL for movies
ON CONFLICT (profile_id, content_id, episode_id)
DO UPDATE SET progress_percent = EXCLUDED.progress_percent, watched_at = now()
RETURNING history_id, profile_id, content_id, episode_id, watched_at, progress_percent;
-- feedback loop (after the upsert; never touches DISMISSED):
UPDATE recommendation
   SET rec_status = CASE WHEN $percent >= 90 THEN 'WATCHED' ELSE 'CLICKED' END::rec_status
 WHERE profile_id = $1 AND content_id = $2
   AND rec_status IN ('SHOWN', 'CLICKED');
```

|                          |                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables / keys            | `watch_history`, `content`, `episode`, `season`, `recommendation`. UNIQUE NULLS NOT DISTINCT `(profile_id, content_id, episode_id)` (constraint `watch_history_profile_content_episode_key`; PostgreSQL 15+, so the NULL episode of a movie still conflicts with itself), CHECK `progress_percent BETWEEN 0 AND 100`, FKs on `profile_id` / `content_id` / `episode_id`, PK `(profile_id, content_id)` on `recommendation` |
| Transaction / idempotent | yes (the upsert and the `rec_status` update commit together) / yes (same input -> same row; only `watched_at` moves)                                                                                                                                                                                                                                                                                                       |
| Edge cases               | a non-finite `progressPercent` is rejected by the route's zod; the episode-belongs-to-title check is a rule the schema cannot declare (SCHEMA.md "Known limits"); `ON CONFLICT (profile_id, content_id, episode_id)` works with the NULLS NOT DISTINCT key; if inference gives trouble use `ON CONFLICT ON CONSTRAINT watch_history_profile_content_episode_key`; episode rows also store `content_id`                     |
| Throws                   | `NotFoundError("Title not found.")`; `ValidationError` when a series has no `episodeId` or the episode belongs to another title                                                                                                                                                                                                                                                                                            |
| Called by                | `POST /api/profiles/:profileId/progress`                                                                                                                                                                                                                                                                                                                                                                                   |
| Mock today               | returns a plausible row (clamped/rounded percent, `historyId` = row count + 1, `watchedAt` = now), persists nothing, skips the title/episode checks                                                                                                                                                                                                                                                                        |

Return: `{ historyId, profileId, contentId, episodeId, watchedAt (ISO), progressPercent }`.

Drizzle for the upsert:

```ts
await tx
  .insert(watchHistory)
  .values({ profileId, contentId, episodeId, progressPercent: percent })
  .onConflictDoUpdate({
    target: [watchHistory.profileId, watchHistory.contentId, watchHistory.episodeId],
    set: { progressPercent: percent, watchedAt: sql`now()` },
  })
  .returning();
```

### 4.2 `listHistory(profileId: number): Promise<HistoryItem[]>`

The History page: everything the profile watched, newest first.

Steps: join each `watch_history` row with its title; `LEFT JOIN episode` (`episode_id` is NULL for movies) and
`season` for `season_number`; shape rows as `HistoryItem` (the row + `content` as a `ContentSummary` with genres + `episode`
(Episode + `seasonNumber`, or `null`)).

```sql
SELECT w.history_id, w.profile_id, w.content_id, w.episode_id, w.watched_at, w.progress_percent,
       c.*, e.*, s.season_number
  FROM watch_history AS w
  JOIN content       AS c ON c.content_id = w.content_id
  LEFT JOIN episode  AS e ON e.episode_id = w.episode_id
  LEFT JOIN season   AS s ON s.season_id  = e.season_id
 WHERE w.profile_id = $1
 ORDER BY w.watched_at DESC;                       -- watch_history_recent_idx (profile_id, watched_at DESC)
-- (+ the content's genres, as catalog.service builds a ContentSummary.)
```

(`c.*, e.*` collide on `title`, `description`, `release_date`, `duration_minutes`: select explicit aliased columns.)

|                          |                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tables / keys            | `watch_history`, `content`, `content_genre`, `genre`, `episode`, `season`; `watch_history_recent_idx`. One row per (profile, content, episode), so a re-watch moves its row to the top instead of adding one |
| Transaction / idempotent | no / yes                                                                                                                                                                                                     |
| Edge cases               | no history -> `[]`                                                                                                                                                                                           |
| Called by                | `GET /api/profiles/:profileId/history` (and the History page via `serverApi.getHistory`)                                                                                                                     |
| Mock today               | the profile's rows from `data/mock/watch-history.json` (already newest first), joined in memory                                                                                                              |

### 4.3 `removeHistoryEntry(profileId: number, historyId: number): Promise<void>`

Removes one entry from History (its interaction signal and Continue Watching card go with it).

```sql
DELETE FROM watch_history WHERE history_id = $2 AND profile_id = $1;       -- rowCount 0 -> 404
```

The `profile_id` predicate is the ownership check. Zero rows deleted (unknown id, or someone else's) ->
`NotFoundError("History entry not found.")` (the route uses that message for a bad id). Not idempotent (second delete = 404; the previous contract was a silent 204).
Deleting a series' episode row leaves the other episodes' rows and the title's other signals in place. Called by
`DELETE /api/profiles/:profileId/history/:historyId`. Mock today: does nothing and never throws (route answers 204).

### 4.4 `listMyList(profileId: number): Promise<MyListItem[]>`

The My List page: saved titles, most recently added first.

```sql
SELECT c.*, m.added_at
  FROM my_list AS m JOIN content AS c ON c.content_id = m.content_id
 WHERE m.profile_id = $1
 ORDER BY m.added_at DESC;
```

(+ genres per title.) Tables `my_list`, `content`, `content_genre`, `genre`; PK `(profile_id, content_id)`. Empty list -> `[]`. Called by
`GET /api/profiles/:profileId/my-list`. Mock today: the profile's rows from `my-list.json` in file order (not re-sorted), joined in memory.

### 4.5 `addToMyList(profileId: number, contentId: number): Promise<void>`

Saves a title for later. Adding the same title twice is a no-op.

```sql
INSERT INTO my_list (profile_id, content_id) VALUES ($1, $2)       -- added_at defaults to now()
ON CONFLICT (profile_id, content_id) DO NOTHING;
```

An unknown `content_id` violates the FK (SQLSTATE **23503**) -> `NotFoundError("Title not found.")`. Idempotent (`added_at`
keeps the first time); not a transaction. Called by `POST /api/profiles/:profileId/my-list` (the route answers 201
`{ contentId, inMyList: true }` either way). Mock today: does nothing and never throws.

### 4.6 `removeFromMyList(profileId: number, contentId: number): Promise<void>`

```sql
DELETE FROM my_list WHERE profile_id = $1 AND content_id = $2;
```

Idempotent (deleting nothing is fine); the title's other signals (rating, history) are untouched. Called by
`DELETE /api/profiles/:profileId/my-list/:contentId` (route answers 200 `{ contentId, inMyList: false }`). Mock today: does nothing.

### 4.7 `rateTitle(profileId: number, contentId: number, value: number): Promise<Rating>`

Rates a title 1-5 stars; re-rating replaces the old value. Feeds the home signals as `(value - 3) x 2`.

```sql
INSERT INTO rating (profile_id, content_id, value) VALUES ($1, $2, $3)
ON CONFLICT (profile_id, content_id)
DO UPDATE SET value = EXCLUDED.value, rated_at = now()
RETURNING profile_id, content_id, value, rated_at;
```

`value` is validated as an integer 1-5 by the route's zod (the CHECK `rating_value_check` is the backstop). Unknown
`content_id` (FK 23503) -> `NotFoundError("Title not found.")`. Idempotent (same value -> same row; `rated_at`
moves); nothing else needs updating: `interaction_score` is a view and always fresh, the `recommendation` table
catches up on the next refresh (section 7.1). Called by `PUT /api/profiles/:profileId/ratings/:contentId`.
Mock today: returns `{ profileId, contentId, value, ratedAt: now }`, persists nothing.

### 4.8 `removeRating(profileId: number, contentId: number): Promise<void>`

```sql
DELETE FROM rating WHERE profile_id = $1 AND content_id = $2;
```

Idempotent. Called by `DELETE /api/profiles/:profileId/ratings/:contentId` (204). Mock today: does nothing.

### 4.9 `getTitleActivity(profileId: number, contentId: number): Promise<TitleActivity>`

What this profile has done with one title: drives the title page (Play/Resume label, My List button, star rating)
and where the player starts.

Steps:

1. The title must exist (`getContentDetail` from `./catalog.service` -> `NotFoundError("Title not found.")`; a plain `SELECT 1 FROM content` with the same error is acceptable and cheaper).
2. `inMyList = isInMyList`, `rating = getRating`, `resume = getResumePoint` (run the three in parallel with `Promise.all`).
3. Optional feedback loop: opening the title page moves a SHOWN recommendation to CLICKED
   (`UPDATE recommendation SET rec_status = 'CLICKED' WHERE profile_id = $1 AND content_id = $2 AND rec_status = 'SHOWN';`):
   a write on a GET, so do it only if the team wants page-view granularity; `recordProgress` already covers the player (README 9.14).

|                          |                                                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables / keys            | `my_list`, `rating`, `watch_history`, `episode`, `season` (+ `content` for the existence check). PKs of `my_list` and `rating`, `watch_history_recent_idx` |
| Transaction / idempotent | no / yes (read)                                                                                                                                            |
| Edge cases               | a profile that never touched the title gets `{ inMyList: false, rating: null, resume: null }`                                                              |
| Throws                   | `NotFoundError("Title not found.")`                                                                                                                        |
| Called by                | `GET /api/profiles/:profileId/titles/:contentId` (and the title/player pages via `serverApi.getTitleActivity`)                                             |
| Mock today               | the same three answers read from the mock db; `resume` is only an unfinished latest row (completed rows give null: no "next episode" yet)                  |

### 4.10 Helpers of `getTitleActivity` (exported)

**`isInMyList(profileId: number, contentId: number): Promise<boolean>`**

```sql
SELECT EXISTS (SELECT 1 FROM my_list WHERE profile_id = $1 AND content_id = $2);
```

Mock today: looks the pair up in `my-list.json`.

**`getRating(profileId: number, contentId: number): Promise<number | null>`**

```sql
SELECT value FROM rating WHERE profile_id = $1 AND content_id = $2;
```

Mock today: looks the pair up in `ratings.json`.

**`getResumePoint(profileId: number, contentId: number): Promise<TitleActivity["resume"]>`**: where Play should start for this title.

Steps:

1. Take the latest `watch_history` row for the title (most recent `watched_at`).
2. Decide, by what it was:

| Latest row          | Result                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------- |
| movie, unfinished   | `{ episodeId: null, progressPercent, label: "Resume · 62%" }`                                               |
| movie, completed    | `null` (Play starts over)                                                                                   |
| episode, unfinished | that episode, label `"Resume S1:E3"` (`formatEpisodeCode(seasonNumber, episodeNumber)` from `@/lib/format`) |
| episode, completed  | `getNextEpisode(contentId, episodeId)` at 0%, label `"Play S1:E4"`; `null` after the finale                 |
| never watched       | `null`                                                                                                      |

"Completed" = `progress_percent >= 90` (`isCompleted`).

```sql
SELECT w.episode_id, w.progress_percent, s.season_number, e.episode_number
  FROM watch_history AS w
  LEFT JOIN episode AS e ON e.episode_id = w.episode_id
  LEFT JOIN season  AS s ON s.season_id  = e.season_id
 WHERE w.profile_id = $1 AND w.content_id = $2
 ORDER BY w.watched_at DESC LIMIT 1;                -- watch_history_recent_idx
```

Edge cases: a finale that is completed -> `null`; a series whose latest row is an unfinished earlier episode resumes that
one (latest by `watched_at`, not by episode order). Result shape: `{ episodeId: number | null, progressPercent: number, label: string }`; for the next-episode case `progressPercent` is 0.
Mock today: only the unfinished case (latest row, newest first in the mock file, with `!isCompleted`); completed titles return null, so "Play S1:E4" is not produced.

**`getNextEpisode(contentId: number, episodeId: number): Promise<Episode | null>`**: the episode that airs right after the given one, crossing into the next season; `null` after the finale.

```sql
SELECT e.*
  FROM episode AS e JOIN season AS s ON s.season_id = e.season_id
 WHERE s.content_id = $1
   AND (s.season_number, e.episode_number) >
       (SELECT s0.season_number, e0.episode_number
          FROM episode AS e0 JOIN season AS s0 ON s0.season_id = e0.season_id
         WHERE e0.episode_id = $2)
 ORDER BY s.season_number, e.episode_number
 LIMIT 1;
```

Tables `episode`, `season`; UNIQUE `(content_id, season_number)`, UNIQUE `(season_id, episode_number)`. An `episodeId` of another title -> `null` (the row comparison finds
nothing for this content). Note: the label "Play S1:E4" needs the next episode's **season number**, which `Episode` lacks:
keep this exported signature, and have `getResumePoint` use an internal variant of the query that also returns `s.season_number`.
Mock today: returns `null`.

---

## 5. `recommendations.service.ts`

Exports (signatures exact):

```ts
export const ROW_SIZE = 18;                        // items per row
export const WEIGHTS = {                           // the tunable numbers, in one place
  rating:    { centre: 3, scale: 2 },
  watch:     { completed: 3, half: 1.5, abandoned: -0.5 },
  myList:    1,
  genrePick: 2,
  blend:     { genre: 0.6, people: 0.4, affinity: 0.5, knn: 0.3, prior: 0.2 },
  match:     { floor: 55, span: 44 },
} as const;

getHomeFeed(profile: Profile): Promise<HomeFeed>
shouldRefreshRecommendations(profileId: number): Promise<boolean>
computeInteractionScores(profileId: number): Promise<InteractionScores>          // Map<contentId, score>
generateCandidates(profileId: number, scores: InteractionScores): Promise<Candidate[]>
rankCandidates(candidates: Candidate[], profile: Profile): Promise<RankedCandidate[]>
buildHomeRows(ranked: RankedCandidate[], profile: Profile, scores: InteractionScores): Promise<HomeBuild>
storeRecommendations(profileId: number, ranked: RankedCandidate[], rows: HomeRow[]): Promise<void>
refreshContentSimilarity(): Promise<void>
```

`REASONS` (private const in the file) holds the row reason strings, so `buildHomeRows` and the stub share one source:

| Key                             | Text                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `continueWatching`              | `Pick up where you left off.`                                                                    |
| `topPicks`                      | `Ranked from the genres and people you watch, what similar viewers enjoyed, and what's popular.` |
| `topPicksPickedGenres`          | `Popular in the genres you picked — rate a few to personalise this row.`                         |
| `topPicksNoSignals`             | `Popular titles to get you started — rate a few to personalise this row.`                        |
| `becauseKnn(anchor)`            | `Viewers who enjoyed ${anchor} also watched these.`                                              |
| `becauseSimilar(anchor)`        | `Shares genres and people with ${anchor}.`                                                       |
| `trending`                      | `The most-watched titles on Reelhouse right now.`                                                |
| `topRatedStrongest(genre)`      | `${genre} is your strongest genre — sorted by audience rating.`                                  |
| `topRatedPicked(genre)`         | `You picked ${genre} during setup — here are its best-reviewed titles.`                          |
| `morePerson(count, name, role)` | `You've enjoyed ${count} titles ${role === "DIRECTOR" ? "by" : "featuring"} ${name}.`            |
| `genrePicked(genre)`            | `You picked ${genre} during setup.`                                                              |
| `genreWatched(genre)`           | `You watch a lot of ${genre}.`                                                                   |
| `heroPick(name)`                | `Our top pick for ${name} tonight`                                                               |
| `heroPopular`                   | `Popular on Reelhouse`                                                                           |

Types (from `@/types`): `InteractionScores = Map<number, number>`; `Candidate { contentId, genreAffinity, peopleAffinity, itemKnn, popularityPrior }`
(all 0-1); `RankedCandidate = Candidate & { content: ContentSummary; affinity; score; match }`; `HomeBuild { hero: HomeHero | null; rows: HomeRow[] }`;
`HomeRow { id, kind: HomeRowKind, title, reason, anchor?: { contentId, title }, items: RowItem[] }`; `RowItem { content, match?, progress?: { progressPercent, episode } }`;
`HomeHero { content, reason, match? }`; `HomeFeed { profileId, hero, rows, generatedAt }`.

The pipeline concept, formulas, worked example and row catalogue are in [section 6](#6-deep-dive-the-recommendation-pipeline).
Per-function contracts follow.

### 5.1 `getHomeFeed(profile: Profile): Promise<HomeFeed>`: the orchestrator

The Home page for one profile (hero + shelves).

Steps:

1. `shouldRefreshRecommendations(profileId)`. If **false**, serve the stored rows: read `recommendation`
   (`rec_status <> 'DISMISSED'`) ordered by `relevance_score`, regroup by `row_type`, and run stage 4 again over them
   (reasons and the because-you-liked row are computed per request). Skip to 7. (How to rebuild `ranked` from stored rows: section 9.2.)
2. `computeInteractionScores(profileId)`: stage 1.
3. `generateCandidates(profileId, scores)`: stage 2.
4. `rankCandidates(candidates, profile)`: stage 3.
5. `buildHomeRows(ranked, profile, scores)`: stage 4.
6. `storeRecommendations(profileId, ranked, rows)`: stage 5.
7. Return `{ profileId, hero, rows, generatedAt }` (`generatedAt` = the newest `recommendation.generated_at`, or `now()` right after a refresh).

```sql
SELECT r.content_id, r.row_type, r.relevance_score, r.generated_at
  FROM recommendation AS r
 WHERE r.profile_id = $1 AND r.rec_status <> 'DISMISSED'
 ORDER BY r.relevance_score DESC;                       -- recommendation_rank_idx
```

|                          |                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables / keys            | `recommendation` (+ everything the stages read). PK `(profile_id, content_id)`, `recommendation_rank_idx`                                                                                                                                                                                                                                                                                                                 |
| Transaction / idempotent | no for the reads; `storeRecommendations` opens its own / yes (same activity -> same feed; only `generated_at` moves)                                                                                                                                                                                                                                                                                                      |
| Edge cases               | a profile with no signals and no picked genres still gets the popularity-ranked fallback (cold start); a failed store must **not** fail the request: catch, `console.error`, still return the feed                                                                                                                                                                                                                        |
| Throws                   | nothing of its own (the route has already 404'd an unknown profile)                                                                                                                                                                                                                                                                                                                                                       |
| Called by                | `GET /api/profiles/:profileId/home` (and the Home page via `serverApi.getHome`)                                                                                                                                                                                                                                                                                                                                           |
| Mock today               | no pipeline: fixed slices of the catalogue (18 each: top-picks 0, top-rated-genre 18, because-you-liked 36, trending 300, genre-picks 318), continue-watching from the profile's history filtered with `!isCompleted`, because-you-liked anchored on `history[0]` (only when the profile has history), `genres[0]`/`genres[1]` as the top-rated/genre-picks genres, hero = the first catalogue title, `generatedAt` = now |

### 5.2 `shouldRefreshRecommendations(profileId: number): Promise<boolean>`: the refresh policy

Should Home rerun the pipeline, or serve the stored recommendations? **Open decision** (README 9.1); recommended
default chosen in the service and implemented as: regenerate on Home load when the newest `generated_at` is older than
**15 minutes** OR older than the profile's latest activity. That keeps Home fresh right after a rating/watch/My List
change without recomputing on every request or on every 10-second progress ping, and needs no background worker.
`content_similarity` is refreshed separately and nightly.

Steps:

1. Newest `generated_at` for the profile; none stored -> `true`.
2. Latest activity time = `greatest(max(watch_history.watched_at), max(rating.rated_at), max(my_list.added_at), profile.onboarded_at)`.
3. `true` when `now() - generated_at > 15 minutes` or `generated_at < latest activity`.

```sql
SELECT (SELECT max(generated_at) FROM recommendation WHERE profile_id = $1) AS generated_at,
       greatest(
         (SELECT max(watched_at) FROM watch_history WHERE profile_id = $1),
         (SELECT max(rated_at)   FROM rating        WHERE profile_id = $1),
         (SELECT max(added_at)   FROM my_list       WHERE profile_id = $1),
         (SELECT onboarded_at    FROM profile       WHERE profile_id = $1)
       ) AS latest_activity;
```

|                          |                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tables / keys            | `recommendation`, `watch_history`, `rating`, `my_list`, `profile`. `recommendation_rank_idx` / PK, `watch_history_recent_idx`, `rating` and `my_list` PKs                                                                                                                                                                                                                                                                                                    |
| Transaction / idempotent | no / yes (read)                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Edge cases               | removing history/rating/My List rows lowers `max(...)` and does not trigger a refresh by itself: the 15-minute limit catches it. Progress pings on an unfinished title move `watched_at` every 10 seconds, so a profile mid-binge reruns the pipeline on each Home load; if that proves too costly, drop the "older than latest activity" rule for `watch_history` and keep it for ratings/My List/onboarding only. `greatest()` ignores NULLs in PostgreSQL |
| Throws                   | nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Called by                | `getHomeFeed`                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Mock today               | returns `false` (there is nothing stored)                                                                                                                                                                                                                                                                                                                                                                                                                    |

Evaluate in TS: `!generatedAt || Date.now() - generatedAt.getTime() > 15 * 60_000 || (latestActivity && generatedAt < latestActivity)`.

### 5.3 `computeInteractionScores(profileId: number): Promise<InteractionScores>`: stage 1

One interaction score per title this profile touched. Read the `interaction_score` view for the profile (weights in
`WEIGHTS`; the view was created by migration 0001 and already encodes them).

```sql
SELECT content_id, score FROM interaction_score WHERE profile_id = $1;
-- the view (docs/schema/SCHEMA.md, drizzle/0001_functions_and_views.sql):
--   SELECT profile_id, content_id, SUM(weight) AS score FROM (
--     SELECT profile_id, content_id, (value - 3) * 2.0 FROM rating
--     UNION ALL
--     SELECT profile_id, content_id,
--            CASE WHEN max(progress_percent) >= 90 THEN 3.0 WHEN max(progress_percent) >= 50 THEN 1.5
--                 WHEN max(progress_percent) < 10 THEN -0.5 ELSE 0 END
--       FROM watch_history GROUP BY profile_id, content_id
--     UNION ALL
--     SELECT profile_id, content_id, 1.0 FROM my_list
--   ) AS signals GROUP BY profile_id, content_id;
```

Return `Map<contentId, Number(score)>` (the view's `score` is numeric -> string unless typed `real`). Onboarding genres are not title signals
(they enter in stage 2a). Edge cases: a new profile -> empty map (cold start). The kNN step needs every other profile's
scores too: that is the same view without the profile filter, consumed by `content_similarity`. Tables `interaction_score` (view over
`rating`, `watch_history`, `my_list`); indexes `rating_content_idx`, `watch_history_recent_idx`, PKs of `rating` and `my_list`.
Called by `getHomeFeed`. Mock today: returns an empty map (`getHomeFeed` does not call it).

### 5.4 `generateCandidates(profileId: number, scores: InteractionScores): Promise<Candidate[]>`: stage 2

For each candidate title its four 0-1 parts. Every part is normalised to 0-1 by dividing by its max; negatives clamp to 0.

- **a. Genre affinity.** Spread each scored title's score over its genres (`score / #genres`), add +2 per genre in
  `profile_genre_preference`, sum per genre; a candidate's `genreAffinity` = `(max + mean)` of its genres' affinities `/ 2`.
- **b. People affinity.** The same spread over the title's `content_credit` rows: top-5 billed actors (`credit_order < 5`:
  x1 for the first three, x0.6 after) and directors (x1.5); a candidate's `peopleAffinity` = its strongest shared person +
  0.25 x the next two, capped at 1.
- **c. Item kNN.** For every candidate, the similarity-weighted average over the titles this profile scored positively,
  using `content_similarity` (refreshed on a schedule, not per request).
- **d. Popularity prior.** `ln(1 + distinct viewers in the last 30 days)`, min-max normalised over the catalogue (0 for a title nobody watched).
- **Cold start** (`scores` empty): the candidates are the titles in the picked genres with `genreAffinity` from the picks only,
  `peopleAffinity = itemKnn = 0`, so the prior orders them; with no picks either, every title.

```sql
-- a. genre affinity (then divide by max, in the app)
WITH n AS (SELECT content_id, COUNT(*) AS cnt FROM content_genre GROUP BY content_id),
     spread AS (
       SELECT cg.genre_id, SUM(s.score / n.cnt) AS a
         FROM interaction_score AS s
         JOIN content_genre AS cg ON cg.content_id = s.content_id
         JOIN n ON n.content_id = s.content_id
        WHERE s.profile_id = $1 GROUP BY cg.genre_id
       UNION ALL
       SELECT genre_id, 2.0 FROM profile_genre_preference WHERE profile_id = $1
     )
SELECT genre_id, SUM(a) AS affinity FROM spread GROUP BY genre_id;

-- b. people affinity (credits counted: ACTOR with credit_order < 5, and DIRECTOR)
WITH credits AS (
       SELECT content_id, person_id, role, credit_order FROM content_credit
        WHERE role = 'DIRECTOR' OR (role = 'ACTOR' AND credit_order < 5)),
     n AS (SELECT content_id, COUNT(*) AS cnt FROM credits GROUP BY content_id)
SELECT cr.person_id,
       SUM(s.score / n.cnt * CASE WHEN cr.role = 'DIRECTOR' THEN 1.5
                                  WHEN cr.credit_order < 3 THEN 1.0 ELSE 0.6 END) AS affinity
  FROM interaction_score AS s
  JOIN credits AS cr ON cr.content_id = s.content_id
  JOIN n ON n.content_id = s.content_id
 WHERE s.profile_id = $1 GROUP BY cr.person_id;

-- c. item kNN (then divide by max)
SELECT cs.content_b AS content_id, SUM(cs.score * s.score) / NULLIF(SUM(cs.score), 0) AS knn
  FROM interaction_score AS s
  JOIN content_similarity AS cs ON cs.content_a = s.content_id
 WHERE s.profile_id = $1 AND s.score > 0
 GROUP BY cs.content_b;

-- d. popularity prior (docs/schema/SCHEMA.md "Ranking")
WITH viewers AS (
  SELECT c.content_id, ln(1 + COUNT(DISTINCT w.profile_id)) AS v
    FROM content AS c
    LEFT JOIN watch_history AS w
           ON w.content_id = c.content_id AND w.watched_at > now() - interval '30 days'
   GROUP BY c.content_id)
SELECT content_id,
       COALESCE((v - MIN(v) OVER ()) / NULLIF(MAX(v) OVER () - MIN(v) OVER (), 0), 0) AS popularity_prior
  FROM viewers;
```

|                          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables / keys            | `interaction_score`, `content_genre`, `profile_genre_preference`, `content_credit`, `content_similarity`, `watch_history`, `content`. `content_genre_genre_idx`, `content_credit_person_idx`, `content_similarity_pair_key`, `watch_history_recent_idx`                                                                                                                                                                                                                                                                                   |
| Transaction / idempotent | no / yes (read)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Edge cases               | a title in no genre gets `genreAffinity` 0; fewer than three credits is fine (the "next two" are simply missing); an empty `content_similarity` (not refreshed yet) gives `itemKnn` 0 everywhere and the blend degrades gracefully; the genre/person tables are also what `buildHomeRows` reads for "strongest genre/person": return or recompute them as needed (section 9.1). Recommended: also clamp negative `cs.score` out of the kNN query (`AND cs.score > 0`) so a negative similarity cannot flip the sign of a weighted average |
| Throws                   | nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Called by                | `getHomeFeed`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Mock today               | returns an empty array (`getHomeFeed` does not call it)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

### 5.5 `rankCandidates(candidates: Candidate[], profile: Profile): Promise<RankedCandidate[]>`: stage 3

Blend the four parts into one score, filter, sort.

Steps:

1. `affinity = 0.6 x genreAffinity + 0.4 x peopleAffinity`; `score = 0.5 x affinity + 0.3 x itemKnn + 0.2 x popularityPrior` (`WEIGHTS.blend`).
2. Filter: `maturity_of(content.age_rating) <= profile.maturityLevel` (KIDS < TEEN < ADULT); drop finished titles (a completed
   movie, or a series whose every episode has progress >= 90); drop titles with `recommendation.rec_status = 'DISMISSED'` (feedback loop).
3. Sort by `score DESC`, ties by `content.release_date DESC`.
4. `match = round(55 + 44 x min(1, score / best score))`; a best score of 0 -> 55.

```sql
-- the filters, applied to the candidate ids
SELECT c.content_id, c.release_date
  FROM content AS c
 WHERE c.content_id = ANY($ids)
   AND maturity_of(c.age_rating) <= $maturity::maturity_level
   AND NOT (c.content_type = 'MOVIE' AND EXISTS (
         SELECT 1 FROM watch_history AS w
          WHERE w.profile_id = $1 AND w.content_id = c.content_id AND w.progress_percent >= 90))
   AND NOT (c.content_type = 'SERIES'
            AND EXISTS (SELECT 1 FROM season AS s JOIN episode AS e ON e.season_id = s.season_id
                         WHERE s.content_id = c.content_id)
            AND NOT EXISTS (
              SELECT 1 FROM season AS s JOIN episode AS e ON e.season_id = s.season_id
               WHERE s.content_id = c.content_id
                 AND NOT EXISTS (SELECT 1 FROM watch_history AS w
                                  WHERE w.profile_id = $1 AND w.episode_id = e.episode_id
                                    AND w.progress_percent >= 90)))
   AND NOT EXISTS (SELECT 1 FROM recommendation AS r
                    WHERE r.profile_id = $1 AND r.content_id = c.content_id AND r.rec_status = 'DISMISSED');
```

|                          |                                                                                                                                                                                                                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables / keys            | `content`, `watch_history`, `season`, `episode`, `recommendation`. `maturity_of()`, PK `(profile_id, content_id)` on `recommendation`                                                                                                                                                                                            |
| Transaction / idempotent | no / yes (pure over its inputs plus reads)                                                                                                                                                                                                                                                                                       |
| Edge cases               | the scoring is arithmetic in the app; only the filters need the database. Empty input -> `[]`. Candidates the profile has already watched or rated are **kept** here (top-picks drops them in stage 4; the person/genre rows reuse the ranking). Fill `RankedCandidate.content` (`ContentSummary` with genres) for the survivors |
| Throws                   | nothing                                                                                                                                                                                                                                                                                                                          |
| Called by                | `getHomeFeed`                                                                                                                                                                                                                                                                                                                    |
| Mock today               | returns an empty array                                                                                                                                                                                                                                                                                                           |

### 5.6 `buildHomeRows(ranked, profile, scores): Promise<HomeBuild>`: stage 4

Slices the ranking into shelves, each with its reason, and picks the hero. Rows in this order; a row with no
items is omitted; 18 items per row (`ROW_SIZE`):

1. `continue-watching`: latest `watch_history` row per title with 1-89% progress, newest first; items carry `{ progressPercent, episode (+ seasonNumber) }`. Title `Continue watching for <name>`.
2. `top-picks`: ranked candidates the profile has not watched or rated, each with its `match`. Title `Top picks for <name>`. Cold start: picked genres' titles (or every title) by popularity prior, with the cold-start reasons.
3. `because-you-liked`: for the 2 strongest anchors (interaction score >= 3, most recent first), unseen titles ordered by `0.65 x kNN similarity + 0.35 x content similarity` (genre/people overlap, as in `/api/content/:id/similar`). Title `Because you liked <anchor>`, `row.anchor = { contentId, title }`; id `because-you-liked-<anchor contentId>` so the two rows have distinct ids. Reason "Viewers who enjoyed X also watched these." when most items came from kNN, else "Shares genres and people with X.".
4. `trending`: most distinct viewers in the last 7 days, then `release_date DESC`; the same for everyone at this maturity level. Title `Trending now`.
5. `top-rated-genre`: the strongest genre, ordered by the Bayesian average. Title `Top rated in <Genre>`.
6. `more-with-person`: the strongest person with >= 3 titles of which >= 2 are unseen. Title `From <director>` / `More with <actor>`.
7. `genre-picks`: the 2nd and 3rd strongest genres, ranked by score (one row each, id `genre-picks-<genreId>`). Title `<Genre> for you`.
8. `hero`: the first top pick, reason `Our top pick for <name> tonight`, or `Popular on Reelhouse` when the profile has no signals yet; `hero.match` = that pick's match.

Reasons are computed here from the row kind plus context (genre name, person name, anchor title), see `REASONS`; there is no `recommendation.reason` column, so they cannot go stale.

```sql
-- continue-watching
SELECT * FROM (
  SELECT DISTINCT ON (w.content_id) w.*              -- latest row per title first,
    FROM watch_history AS w WHERE w.profile_id = $1
   ORDER BY w.content_id, w.watched_at DESC
) AS latest
WHERE progress_percent BETWEEN 1 AND 89              -- then the 1-89% filter
ORDER BY watched_at DESC LIMIT 18;

-- trending (maturity-filtered)
SELECT c.content_id, COUNT(DISTINCT w.profile_id) AS viewers
  FROM watch_history AS w JOIN content AS c ON c.content_id = w.content_id
 WHERE w.watched_at > now() - interval '7 days' AND maturity_of(c.age_rating) <= $maturity
 GROUP BY c.content_id, c.release_date
 ORDER BY viewers DESC, c.release_date DESC NULLS LAST LIMIT 18;

-- top-rated-genre ($genre = the strongest genre)
WITH stats AS (SELECT content_id, COUNT(*) AS v, AVG(value) AS r FROM rating GROUP BY content_id),
     overall AS (SELECT AVG(value) AS c FROM rating)
SELECT s.content_id, (s.v / (s.v + 5.0)) * s.r + (5.0 / (s.v + 5.0)) * o.c AS bayes
  FROM stats AS s CROSS JOIN overall AS o
  JOIN content AS c ON c.content_id = s.content_id
  JOIN content_genre AS cg ON cg.content_id = c.content_id AND cg.genre_id = $genre
 WHERE maturity_of(c.age_rating) <= $maturity
 ORDER BY bayes DESC, c.release_date DESC NULLS LAST LIMIT 18;

-- because-you-liked: kNN part for anchor $a (the content part is catalog.service getSimilarTitles)
SELECT content_b AS content_id, score FROM content_similarity
 WHERE content_a = $a ORDER BY score DESC;
```

|                          |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables / keys            | `watch_history`, `rating`, `content`, `content_genre`, `genre`, `content_credit`, `person`, `content_similarity`, `interaction_score`. `watch_history_recent_idx`, `rating_content_idx`, `content_similarity_pair_key`, `maturity_of()`                                                                                                                                                                                                                                                                                                                    |
| Transaction / idempotent | no / yes (read)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Edge cases               | "unseen" = no `watch_history` row and no rating for the profile; rows with no items are dropped (a new profile has no continue-watching or because-you-liked); "strongest" genre/person = highest stage-2 affinity; with only onboarding picks the top-rated reason is the "You picked ..." one and genre-picks says "You picked <Genre> during setup.", otherwise "You watch a lot of <Genre>."; `scores` is the stage-1 map (anchors need score >= 3). Seed-sized data has only 7 ratings, so use the LEFT JOIN form of the Bayesian query (section 9.3) |
| Throws                   | nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Called by                | `getHomeFeed`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Mock today               | returns `{ hero: null, rows: [] }` (`getHomeFeed` builds its fixed slices itself)                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |

### 5.7 `storeRecommendations(profileId, ranked, rows): Promise<void>`: stage 5

Persist the ranked picks in `recommendation` and drop the stale ones.

What is stored: the titles shown in the personalised shelves (`top-picks`, `more-with-person`, `top-rated-genre`,
`genre-picks`). `continue-watching`, `trending` and `because-you-liked` are **not** stored (the last is rebuilt
from `content_similarity` per request, anchor included). A title in several shelves is stored once, under the first of
them in row order. `relevance_score` = the candidate's blended score (store only titles present in `ranked`).

Steps (**one transaction**):

1. Upsert each picked title: `row_type`, `relevance_score`, `generated_at = now()`. `rec_status` is **not** in the DO UPDATE list, so it survives a refresh: DISMISSED stays DISMISSED (stage 3 keeps it out), CLICKED/WATCHED keep their history. Policy choice: a title re-ranked after the profile ignored it stays SHOWN; if the team wants "re-shown" to reset CLICKED -> SHOWN, add `rec_status = CASE WHEN recommendation.rec_status = 'CLICKED' THEN 'SHOWN' ELSE recommendation.rec_status END`.
2. Delete the rows this refresh no longer ranks (not DISMISSED, which must persist).

```sql
INSERT INTO recommendation (profile_id, content_id, row_type, relevance_score, generated_at)
VALUES ($1, $2, $3, $4, now()), ...
ON CONFLICT (profile_id, content_id)
DO UPDATE SET row_type = EXCLUDED.row_type,
              relevance_score = EXCLUDED.relevance_score,
              generated_at = now();                         -- rec_status deliberately left alone
DELETE FROM recommendation
 WHERE profile_id = $1 AND generated_at < $refreshStartedAt AND rec_status <> 'DISMISSED';
```

|                          |                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables / keys            | `recommendation`. PK `(profile_id, content_id)`, `recommendation_rank_idx`, FKs to `profile` and `content` (ON DELETE CASCADE)                                                                                                                                                                                                                                                                                |
| Transaction / idempotent | yes (`db.transaction`) / yes (ON CONFLICT upsert; reruns only move `generated_at`)                                                                                                                                                                                                                                                                                                                            |
| Edge cases               | empty `ranked` and `rows` -> only the delete runs (a profile whose picks all vanished); no `reason` / `source_content_id` columns exist (computed); `$refreshStartedAt` can simply be `now()`: inside one transaction `now()` is constant, every row upserted by this refresh has `generated_at = now()`, and every untouched row is strictly older, so `generated_at < now()` selects exactly the stale rows |
| Throws                   | nothing of its own                                                                                                                                                                                                                                                                                                                                                                                            |
| Called by                | `getHomeFeed`                                                                                                                                                                                                                                                                                                                                                                                                 |
| Mock today               | does nothing                                                                                                                                                                                                                                                                                                                                                                                                  |

Batch the VALUES (a few hundred rows is fine in one statement), or use `db.insert(recommendation).values(rows).onConflictDoUpdate({ target: [profileId, contentId], set: { rowType: sql.raw("excluded.row_type"), relevanceScore: sql.raw("excluded.relevance_score"), generatedAt: sql`now()` } })`.

### 5.8 `refreshContentSimilarity(): Promise<void>`

Refreshes `content_similarity` (the item-item kNN). Run nightly by a scheduled job, **not** per request.

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY content_similarity;
```

Readers keep using the old data meanwhile (needs the unique index `content_similarity_pair_key`, which migration 0001 created). Not a transaction
(the statement is atomic but cannot run inside a transaction block): call ``db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY content_similarity`)``
directly (or `db.refreshMaterializedView(contentSimilarity).concurrently()`). Idempotent. A first-ever refresh with CONCURRENTLY needs the view populated
once without it (`REFRESH MATERIALIZED VIEW content_similarity;`); the seed already did that. Called by: nothing yet: the
nightly job (section 7.2). Mock today: does nothing.

---

## 6. Deep dive: the recommendation pipeline

Four stages, each a query (or view) over the activity tables, so they can be built and checked one at a time, plus a
fifth that stores the result. Weights live in one const object (`WEIGHTS`).

```
interaction_score (view)        stage 1  signals            rating, watch_history, my_list  ->  score per (profile, title)
        │
        ▼
candidates                      stage 2  four 0-1 parts     genre affinity, people affinity, item kNN, popularity prior
        │
        ▼
ranking                         stage 3  blend + filters    score = 0.5·affinity + 0.3·kNN + 0.2·prior ; match %
        │
        ▼
rows + hero + reasons           stage 4  shelves            computed per request, never stored
        │
        ▼
recommendation (table)          stage 5  store              personalised shelves only; rec_status feedback loop
```

### 6.1 Stage 1: signals and weights

One interaction score per (profile, content), summed over three sources (`WEIGHTS`):

| Source                     | Rule                                                                                    | Weight                                                                                                          |
| -------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `rating`                   | `(stars - 3) x 2`                                                                       | 5 stars +4, 4 stars +2, 3 stars 0, 2 stars -2, 1 star -4 (`WEIGHTS.rating = { centre: 3, scale: 2 }`)           |
| `watch_history`            | aggregate **per title first** (a series has a row per episode): `max(progress_percent)` | `>= 90` completed **+3**; else `>= 50` **+1.5**; else `< 10` (abandoned) **-0.5**; 10-49 -> 0 (`WEIGHTS.watch`) |
| `my_list`                  | in the list                                                                             | **+1** (`WEIGHTS.myList`)                                                                                       |
| `profile_genre_preference` | **not** a title signal; enters stage 2a as +2 per picked genre (`WEIGHTS.genrePick`)    |                                                                                                                 |

The view (migration 0001), verbatim:

```sql
CREATE VIEW interaction_score AS
SELECT profile_id, content_id, SUM(weight) AS score
FROM (
  SELECT profile_id, content_id, (value - 3) * 2.0 AS weight FROM rating
  UNION ALL
  SELECT profile_id, content_id,
         CASE WHEN max(progress_percent) >= 90   THEN 3.0   -- completed
              WHEN max(progress_percent) >= 50   THEN 1.5
              WHEN max(progress_percent) < 10    THEN -0.5
              ELSE 0 END
  FROM watch_history
  GROUP BY profile_id, content_id                    -- a series has one row per episode
  UNION ALL
  SELECT profile_id, content_id, 1.0 FROM my_list
) AS signals
GROUP BY profile_id, content_id;
```

The weights are hard-coded in the view **and** in `WEIGHTS`: if you retune, change both (a migration for the view).
It is always fresh (a plain view), so ratings and watches show up immediately in stage 1.

### 6.2 Stage 2: candidates

Every part is divided by its max over the candidates (0-1). Candidates: for a profile with signals, every title that has any
non-zero part (in practice the whole 500-title catalogue is cheap to score); cold start: below.

**a. Genre affinity.** Spread each scored title's score evenly over its genres, add +2 per picked genre, sum per genre.
Worked example: Riya (picks Drama) scored title A = 4 (genres Action, Sci-Fi) and B = 3 (Sci-Fi):
Action 4/2 = 2, Sci-Fi 4/2 + 3/1 = 5, Drama 2 (pick) -> divide by the max 5: Action 0.4, Sci-Fi 1.0, Drama 0.4. A candidate in {Sci-Fi, Drama}:
`genreAffinity = (max + mean) / 2 = (1.0 + 0.7) / 2 = 0.85`. Negative genre sums clamp to 0 before normalising.

**b. People affinity.** The same spread over the title's counted credits (top-5 billed actors + directors), weighted by role/billing:
director x1.5, actors with `credit_order < 3` x1, `3-4` x0.6. For a scored title (score 4) with credits {actor 0, actor 3, director}:
`n = 3`; per person `4/3 x w`: actor 0 -> 1.33, actor 3 -> 0.80, director -> 2.00. Sum across all scored titles per person, divide by the max. A candidate's
`peopleAffinity` = its strongest shared person + 0.25 x the next two, capped at 1.

**c. Item-item kNN.** Treat each title as a vector of _every profile's_ stage-1 scores and take cosine similarity between titles,
shrunk by `common / (common + 2)` where `common` = number of profiles who scored both (`content_similarity`, materialized):

```sql
CREATE MATERIALIZED VIEW content_similarity AS
WITH norms AS (
  SELECT content_id, sqrt(SUM(score * score)) AS norm
  FROM interaction_score GROUP BY content_id
),
pairs AS (
  SELECT a.content_id AS content_a, b.content_id AS content_b,
         SUM(a.score * b.score) AS dot, COUNT(*) AS common
  FROM interaction_score AS a
  JOIN interaction_score AS b ON b.profile_id = a.profile_id AND b.content_id <> a.content_id
  GROUP BY a.content_id, b.content_id
)
SELECT p.content_a, p.content_b,
       (p.dot / (na.norm * nb.norm)) * (p.common::real / (p.common + 2)) AS score
FROM pairs AS p
JOIN norms AS na ON na.content_id = p.content_a
JOIN norms AS nb ON nb.content_id = p.content_b
WHERE na.norm > 0 AND nb.norm > 0;
CREATE UNIQUE INDEX content_similarity_pair_key ON content_similarity (content_a, content_b);
```

A candidate's kNN score for this profile = the similarity-weighted average of the profile's scores on titles it scored **positively**:
`knn(candidate) = SUM(sim(scored, candidate) x score(scored)) / SUM(sim(scored, candidate))` (the SQL in 5.4c), then divided by the max over candidates.

_Worked example._ Three profiles, three titles A, B, C. Stage-1 scores (how they arose: P1 rated A 5 stars (+4) and completed B (+3);
P2 rated A 4 stars (+2), rated B 5 stars (+4), completed C (+3); P3 has B on My List (+1) and rated C 5 stars (+4) and listed it (+1)):

|     | A      | B   | C      |
| --- | ------ | --- | ------ |
| P1  | 4      | 3   | (none) |
| P2  | 2      | 4   | 3      |
| P3  | (none) | 1   | 5      |

Norms (`sqrt(sum of squares)` over the profiles that scored the title): `|A| = sqrt(4² + 2²) = sqrt(20) = 4.4721`; `|B| = sqrt(3² + 4² + 1²) = sqrt(26) = 5.0990`; `|C| = sqrt(3² + 5²) = sqrt(34) = 5.8310`.

| Pair | Common profiles | `dot`          | cosine = dot / (norm x norm)                   | shrink `common/(common+2)` | similarity (`content_similarity.score`) |
| ---- | --------------- | -------------- | ---------------------------------------------- | -------------------------- | --------------------------------------- |
| A-B  | P1, P2 (2)      | 4x3 + 2x4 = 20 | 20 / (4.4721 x 5.0990) = 20 / 22.8035 = 0.8771 | 2/4 = 0.5                  | **0.4385**                              |
| A-C  | P2 (1)          | 2x3 = 6        | 6 / (4.4721 x 5.8310) = 6 / 26.0768 = 0.2301   | 1/3 = 0.3333               | **0.0767**                              |
| B-C  | P2, P3 (2)      | 4x3 + 1x5 = 17 | 17 / (5.0990 x 5.8310) = 17 / 29.7321 = 0.5718 | 2/4 = 0.5                  | **0.2859**                              |

(The view stores both directions: `(A,B)` and `(B,A)` with the same score.) Now P1's candidate **C** (P1 scored A = 4 and B = 3, both positive):

```
knn(C | P1) = (sim(A,C) x 4 + sim(B,C) x 3) / (sim(A,C) + sim(B,C))
            = (0.0767 x 4 + 0.2859 x 3) / (0.0767 + 0.2859)
            = (0.3068 + 0.8577) / 0.3626
            = 1.1645 / 0.3626 = 3.2115
```

It is a score on the same scale as the inputs (a weighted average of 4 and 3, pulled towards B because B-C is more similar than A-C). It is
then normalised: dividing by the largest raw kNN among all candidates. Here C is the only unseen candidate so `itemKnn(C) = 1.0`; suppose a
second candidate D had raw kNN 1.6058, then `itemKnn(D) = 1.6058 / 3.2115 = 0.5`. (From P3's side: candidate A = (0.4385 x 1 + 0.0767 x 5) / (0.4385 + 0.0767) = 0.8220 / 0.5152 = 1.5954.)
Note how the shrinkage matters: A-C is cosine 0.23 _and_ seen by one profile only, so it counts a third of its cosine.

**d. Popularity prior.** From our own viewing only: `ln(1 + distinct viewers over 30 days)`, min-max normalised over the catalogue. If nobody has
watched anything in 30 days the prior is 0 everywhere (ties then break on `release_date DESC`).

**Cold start.** A profile whose only signal is `profile_genre_preference` has no stage-1 rows, so people affinity and kNN are 0 and the
candidates are the titles in its picked genres (+2 per genre -> genre affinity 1.0 for picked genres), ranked by the prior. A profile with
neither signals nor picks: every title by prior. Ratings, watching and My List take over as they accumulate.

### 6.3 Stage 3: ranking, filters, match %

```
affinity = 0.6 x genre + 0.4 x people
score    = 0.5 x affinity + 0.3 x kNN + 0.2 x popularityPrior          ties: release_date DESC
```

Continuing the example: C has `genreAffinity 0.8`, `peopleAffinity 0.5`, `itemKnn 1.0`, `prior 0.4`:
`affinity = 0.6 x 0.8 + 0.4 x 0.5 = 0.68`; `score = 0.5 x 0.68 + 0.3 x 1.0 + 0.2 x 0.4 = 0.34 + 0.30 + 0.08 = 0.72`.
D has `0.5 / 0.2 / 0.5 / 0.3`: `affinity = 0.6 x 0.5 + 0.4 x 0.2 = 0.38`; `score = 0.19 + 0.15 + 0.06 = 0.40`.
Best score = 0.72, so `match(C) = round(55 + 44 x min(1, 0.72/0.72)) = 99` and `match(D) = round(55 + 44 x 0.40/0.72) = round(55 + 24.44) = 79`
(the "93% fit" chip; best score 0 -> 55).

Filters: maturity (`maturity_of(age_rating) <= profile.maturity_level`), already finished (completed movie / series with every episode >= 90), DISMISSED. Sort by score DESC, then `release_date DESC`.

### 6.4 Stage 4: the rows, in order, with their reasons (computed, not stored)

| #     | id                             | kind                             | Title                                   | Items                                                  | Reason                                                                                                                                                                                                                                                                               |
| ----- | ------------------------------ | -------------------------------- | --------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | `continue-watching`            | `continue-watching`              | `Continue watching for <name>`          | latest row per title with 1-89% progress, newest first | `Pick up where you left off.`                                                                                                                                                                                                                                                        |
| 2     | `top-picks`                    | `top-picks`                      | `Top picks for <name>`                  | ranked, not watched/rated, with `match`                | `Ranked from the genres and people you watch, what similar viewers enjoyed, and what's popular.`; cold start with picks `Popular in the genres you picked — rate a few to personalise this row.`; no picks `Popular titles to get you started — rate a few to personalise this row.` |
| 3a/3b | `because-you-liked-<anchorId>` | `because-you-liked` (+ `anchor`) | `Because you liked <anchor>`            | unseen, by 0.65 x kNN + 0.35 x content similarity      | kNN-dominated `Viewers who enjoyed X also watched these.` else `Shares genres and people with X.`                                                                                                                                                                                    |
| 4     | `trending`                     | `trending`                       | `Trending now`                          | most distinct viewers in 7 days, then release date     | `The most-watched titles on Reelhouse right now.`                                                                                                                                                                                                                                    |
| 5     | `top-rated-genre`              | `top-rated-genre`                | `Top rated in <Genre>`                  | strongest genre by Bayesian average (m = 5)            | `<Genre> is your strongest genre — sorted by audience rating.` or (only picks) `You picked <Genre> during setup — here are its best-reviewed titles.`                                                                                                                                |
| 6     | `more-with-person`             | `more-with-person`               | `From <director>` / `More with <actor>` | strongest person with >= 3 titles, >= 2 unseen         | `You've enjoyed N titles featuring/by <name>.`                                                                                                                                                                                                                                       |
| 7a/7b | `genre-picks-<genreId>`        | `genre-picks`                    | `<Genre> for you`                       | 2nd and 3rd strongest genres by score                  | `You picked <Genre> during setup.` or `You watch a lot of <Genre>.`                                                                                                                                                                                                                  |
| hero  |                                |                                  |                                         | the first top pick, `match`                            | `Our top pick for <name> tonight`, or `Popular on Reelhouse` with no signals                                                                                                                                                                                                         |

Rules: 18 items per row; empty rows are omitted; "unseen" = no history row and no rating; the because-you-liked anchors are the 2 titles with score >= 3
and the most recent activity (`greatest(max watched_at, rated_at, added_at)` for that title); "Bayesian average" is `(v/(v+m))·R + (m/(v+m))·C` with `v` = the title's rating count, `R` its average,
`C` the average over all ratings, `m = 5`.

### 6.5 Stage 5: storage

`recommendation(profile_id, content_id, row_type, relevance_score, generated_at, rec_status)`, PK `(profile_id, content_id)`. Stores the personalised shelves'
titles only; `rec_status` survives refreshes; see 5.7. Reasons and the because-you-liked anchor are never stored (SCHEMA.md normalisation notes).

---

## 7. Deep dive: refresh policy, `content_similarity` refresh, `rec_status` loop

### 7.1 When is `recommendation` regenerated? (OPEN DECISION, README 9.1)

| Option                                            | Pros                                   | Cons                                                  |
| ------------------------------------------------- | -------------------------------------- | ----------------------------------------------------- |
| After every activity write                        | always fresh                           | every 10-second progress ping would run the pipeline  |
| **On Home load when stale (recommended default)** | fresh after a change, no worker, cheap | first Home load after a change pays the pipeline cost |
| Nightly batch                                     | cheap per request                      | Home ignores today's ratings; needs a scheduler       |

**Recommended default, as written in the service** (`shouldRefreshRecommendations`): regenerate on Home load when the newest `generated_at` is older than 15 minutes
OR older than the profile's latest activity (`greatest(watched_at, rated_at, added_at, onboarded_at)`). The `continue-watching` row and the `because-you-liked` rows are
rebuilt on every request regardless (they are not stored), so the parts of Home that must be instant always are. If mid-binge reruns are too expensive, drop the
`watch_history` term of the activity check.

### 7.2 `content_similarity` refresh

- Run `REFRESH MATERIALIZED VIEW CONCURRENTLY content_similarity;` **nightly**, and after the seed or after you add test activity. It needs the unique index `content_similarity_pair_key` (exists) and an already populated view (the seed ran a first non-concurrent refresh).
- Cost is the self-join of `interaction_score` per profile (roughly the sum over profiles of titles-scored²): trivial for the demo data.
- Trigger options (pick one; default first): (1) an npm script `db:refresh-similarity` running a small `tsx` script that calls `refreshContentSimilarity()` (use after seeding/testing; a hosted cron can call it); (2) a route such as `POST /api/admin/jobs/refresh-similarity` guarded by a `CRON_SECRET` header for Vercel Cron; (3) `pg_cron` on the database (Neon supports it on paid plans). The service function itself does not care.
- A stale view is harmless: `itemKnn` is just older. Titles never interacted with have no rows and rank on genre/people/prior.

### 7.3 `rec_status`: the feedback loop

`SHOWN` (default when stored) -> `CLICKED` -> `WATCHED`, or `DISMISSED`.

| Event                                             | Where                  | Transition                                                                  |
| ------------------------------------------------- | ---------------------- | --------------------------------------------------------------------------- |
| Recommendation stored by `storeRecommendations`   | stage 5                | row inserted as `SHOWN`                                                     |
| Any progress write (< 90%) on a recommended title | `recordProgress`       | `SHOWN`/`CLICKED` -> `CLICKED`                                              |
| Progress >= 90%                                   | `recordProgress`       | `SHOWN`/`CLICKED` -> `WATCHED`                                              |
| Title page opened (optional)                      | `getTitleActivity`     | `SHOWN` -> `CLICKED` (README 9.14)                                          |
| Dismissed                                         | no route yet           | `DISMISSED` (README 9.13)                                                   |
| Refresh                                           | `storeRecommendations` | `rec_status` is **never** overwritten; stale non-dismissed rows are deleted |

`WATCHED` and `DISMISSED` never move back from `recordProgress` (its `WHERE rec_status IN ('SHOWN','CLICKED')`). Stage 3 drops `DISMISSED` titles, which is the loop's effect on ranking;
`WATCHED` titles are removed by the "already finished" filter. `CLICKED`/`WATCHED` are available for later tuning (e.g. down-weight shown-but-never-clicked) but nothing uses them yet.

---

## 8. Testing with the seeded data

### 8.1 Stage 1 expected values

The seed gives three profiles; with `SELECT * FROM interaction_score WHERE profile_id = 1 ORDER BY score DESC;` you should see (titles by name):

| Profile | Title                                                | Signals                                              | Score  |
| ------- | ---------------------------------------------------- | ---------------------------------------------------- | ------ |
| 1 Riya  | Interstellar                                         | rated 5 (+4), watched 100% (+3)                      | 7      |
| 1       | Inception                                            | rated 5 (+4), 100% (+3)                              | 7      |
| 1       | Gone Girl                                            | rated 4 (+2), 96% (+3)                               | 5      |
| 1       | Breaking Bad                                         | rated 4 (+2), S1E1/E2 100%, S1E3 41% -> max 100 (+3) | 5      |
| 1       | Stranger Things                                      | S1E1 100%, S1E2 23% -> +3                            | 3      |
| 1       | Dune                                                 | 62% (+1.5)                                           | 1.5    |
| 1       | The Office                                           | rated 2 (-2), S2E1 100% (+3)                         | 1      |
| 1       | Oppenheimer, Severance, Blade Runner 2049, Chernobyl | My List only                                         | 1 each |
| 1       | Parasite                                             | 6% watched (-0.5)                                    | -0.5   |
| 2 Kabir | The Dark Knight                                      | rated 5 (+4), 100% (+3)                              | 7      |
| 2       | Arcane                                               | rated 5 (+4), S1E3 100% / S1E4 55% -> +3             | 7      |
| 2       | Harry Potter and the Philosopher's Stone, Naruto     | My List only                                         | 1 each |
| 2       | Star Wars                                            | 34% (between 10 and 49)                              | 0      |
| 3 Mini  | Inside Out, Spirited Away                            | My List only                                         | 1 each |

Riya's because-you-liked anchors (score >= 3, most recent): the two most recently touched of Interstellar, Inception, Gone Girl, Breaking Bad, Stranger Things
(Breaking Bad: last watched 2026-10-18; Interstellar: rated 2026-10-12 / watched 10-12).

### 8.2 curl checks

```bash
curl -b jar $BASE/api/profiles/1/home | jq '.hero, (.rows[] | {id, title, reason, n: (.items|length)})'
curl -b jar -H 'content-type: application/json' -d '{"contentId":1,"episodeId":null,"progressPercent":95}' $BASE/api/profiles/1/progress
curl -b jar $BASE/api/profiles/1/titles/1                      # resume null (completed movie)
curl -b jar $BASE/api/profiles/3/home | jq '.rows[].id'        # Mini: KIDS only, cold start with no picks
```

Check, per profile: no row repeats a title the profile finished; Mini (KIDS) never sees PG-13+ items; rows have `reason`; `because-you-liked` rows carry `anchor`;
the same call twice within 15 minutes returns the same `generatedAt` (served from `recommendation`); rating a title then reloading Home changes it (`generated_at < latest activity`).
Create a brand-new profile (`POST /api/profiles`, Tejasva) and complete onboarding with 3 genres: Home must be the popular titles of those genres with the cold-start reasons.
The seed is small (15 history rows, 7 ratings), so to exercise kNN add activity for several profiles via curl, run the refresh (7.2), then recheck.

### 8.3 SQL spot checks

```sql
SELECT * FROM content_similarity ORDER BY score DESC LIMIT 10;
SELECT content_a, count(*) FROM content_similarity GROUP BY content_a ORDER BY 2 DESC LIMIT 5;
SELECT * FROM recommendation WHERE profile_id = 1 ORDER BY relevance_score DESC;
EXPLAIN ANALYZE <the stage-2 queries>;      -- all should be milliseconds at this size
```

---

## 9. Implementation notes and pitfalls

### 9.1 Share stage-2 results with stage 4

`buildHomeRows` needs the "strongest genre" and "strongest person" (and the picked-genre set) from stage 2, but `Candidate` only holds the four parts. Options:
(a) write two private helpers `genreAffinities(profileId)` and `peopleAffinities(profileId)` (the 5.4a/5.4b queries) used by both `generateCandidates` and `buildHomeRows`
(two extra cheap queries per refresh); (b) cache them in a module-level `WeakMap`/`Map` keyed by the `scores` object, or a per-call context object (keep the exported signatures). Prefer (a).
`profile_genre_preference` also tells stage 4 whether the profile has "only onboarding picks" (empty `scores`) for the reason wording.

### 9.2 Serving stored rows (cache hit)

`recommendation` only keeps `(content_id, row_type, relevance_score)` of the personalised shelves, but the row **titles** need context (which genre, which person) that is not stored. On a cache hit:
load the stored rows, hydrate them into `RankedCandidate[]` (`content` summaries via one query; `score = relevance_score`, `match = round(55 + 44 x min(1, score / maxStoredScore))`),
recompute `scores` (stage 1, cheap) and call `buildHomeRows(ranked, profile, scores)`, which recomputes the strongest genre/person with the cheap helpers of 9.1 and rebuilds the non-stored rows. That way the
reasons are always computed and the heavy part (candidates + kNN + filters) is skipped.

### 9.3 Seed-sized data and the Bayesian row

With 7 ratings, `JOIN stats` (inner) leaves `top-rated-genre` almost empty. Implement it as `LEFT JOIN stats` with `COALESCE(v, 0)`/`COALESCE(r, c)`: a title with no ratings gets `(0/(0+5))·R + (5/5)·C = C` (the global mean), which is exactly the Bayesian formula for `v = 0`, so
rated titles rise or fall around it and the row is still full. Same idea for `trending` when nobody watched anything this week: fall back to the popularity prior order.

### 9.4 Mapping and types

- `interaction_score.score`, kNN sums, Bayesian averages arrive as strings (numeric): `Number()`.
- `watched_at`, `added_at`, `rated_at`, `generated_at`: ISO strings in the API (README 3.7).
- Row ids: `because-you-liked-<contentId>`, `genre-picks-<genreId>`; the others are plain kind names.
- `HomeFeed.generatedAt` is an ISO string; `hero` is `null` only if the catalogue is empty/all filtered.

### 9.5 Performance guardrails

`recordProgress` is the hot write: no extra reads beyond the content-type lookup and, for series, the episode-belongs check; the `UPDATE recommendation` touches at most one row by PK. Home (cold) is ~8 queries; run independent ones with `Promise.all`.
Do not run the pipeline in `getTitleActivity`.

### 9.6 What not to do

- Do not store reasons or anchors (no column exists, by design).
- Do not call `refreshContentSimilarity` per request.
- Do not trust the client for `profileId` (the route already ties it to the session).
- Do not reintroduce a `completed` column or flag: use `progress_percent >= 90` / `isCompleted`.

---

## 10. Definition of done

- [ ] `activity.service.ts` and `recommendations.service.ts` import nothing from `@/server/mocks` (`grep -n "server/mocks" src/server/services/{activity,recommendations}.service.ts` is empty); `isCompleted`/`formatEpisodeCode` come from `@/lib/content/progress` and `@/lib/format`.
- [ ] Every function matches its SQL, errors, transaction and idempotency notes above; typed errors only.
- [ ] `getHomeFeed` runs the real pipeline: stage 1-5, refresh policy, stored-vs-recompute path, cold start; `store` failures do not break the response.
- [ ] `refreshContentSimilarity` works (concurrent, after a populated first refresh) and has a trigger (npm script or guarded route); documented in README 9.2.
- [ ] curl checks pass (README section 4 and 8.2): progress (movie, series, wrong episode 422, unknown title 404, idempotent); history list/delete (second delete 404); my-list add twice 201/201 and remove twice; ratings 1-5, 6 -> 422, delete twice; titles/:id resume labels incl. "Play S1:E4" and `null` after a finale; home for profiles 1, 2, 3 and a new profile; another user's profile -> 404.
- [ ] UI works: Home (hero, rows, reasons, match chips, continue-watching progress), the player's progress sync, History, My List, rating control, title page Play/Resume label.
- [ ] `WEIGHTS` and the view agree; any retune is a migration.
- [ ] `npm run lint` and `npm run build` pass; route header comments updated where behaviour changed (e.g. `DELETE .../history/:historyId` is 404 on a second call).
- [ ] PR(s) reviewed by Tejasva or Yash with curl evidence.
