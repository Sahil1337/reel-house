# Person C: Sahil — activity & recommendations

Sahil, you own two things. The first is **what a profile does**: watch progress, History, My List, ratings, and the state of a title page. The second is **what Home shows because of it**: a simple genre-taste recommendation engine.

Read [README.md](README.md) first (architecture, setup, conventions, curl testing). This file is the complete spec for `activity.service` and the overview of `recommendations.service`; the recommendations build guide is [`plans/activity-recommendations/plan.md`](../../plans/activity-recommendations/plan.md). The schema is in [`../schema/SCHEMA.md`](../schema/SCHEMA.md) (see "Viewing activity", "Recommendations" and "Ranking").

The Neon database already has the migrations (`drizzle/0000_schema.sql` for the tables, `drizzle/0001_genre_taste_view.sql` for the `genre_taste` view) and the seeded data. The one view, `genre_taste`, gives you each profile's genre taste scores; every other query reads the base tables directly. So you can run every query below against real rows right away.

## Table of contents

1. [Scope](#1-scope)
2. [Dependencies on A, and what to stub](#2-dependencies-on-a-and-what-to-stub)
3. [Ordered checklist](#3-ordered-checklist)
4. [`activity.service.ts`](#4-activityservicets)
5. [`recommendations.service.ts`: the genre-taste engine](#5-recommendationsservicets-the-genre-taste-engine)
6. [Deep dive: the `rec_status` feedback loop](#6-deep-dive-the-rec_status-feedback-loop)
7. [Testing with the seeded data](#7-testing-with-the-seeded-data)
8. [Implementation notes and pitfalls](#8-implementation-notes-and-pitfalls)
9. [Definition of done](#9-definition-of-done)

---

## 1. Scope

This section lists exactly what is yours: the files, the routes, and the tables.

### Files you own

- `src/server/services/activity.service.ts`
  - Functions: `recordProgress`, `listHistory`, `removeHistoryEntry`, `listMyList`, `addToMyList`, `removeFromMyList`, `rateTitle`, `removeRating`, `getTitleActivity`, `isInMyList`, `getRating`, `getResumePoint`, `getNextEpisode`.
- `src/server/services/recommendations.service.ts`
  - Exports: `ROW_SIZE`, `getHomeFeed`, `storeTopPicks`, plus the small query helpers described in the plan. Build it from [`plans/activity-recommendations/plan.md`](../../plans/activity-recommendations/plan.md).

### Routes you serve

All of these use `requireOwnedProfile` (the guard that checks the profile belongs to the signed-in user).

| Route                                                     | Service function            |
| --------------------------------------------------------- | --------------------------- |
| `POST /api/profiles/:profileId/progress`                  | `recordProgress`            |
| `GET /api/profiles/:profileId/history`                    | `listHistory`               |
| `DELETE /api/profiles/:profileId/history/:historyId`      | `removeHistoryEntry`        |
| `GET, POST /api/profiles/:profileId/my-list`              | `listMyList`, `addToMyList` |
| `DELETE /api/profiles/:profileId/my-list/:contentId`      | `removeFromMyList`          |
| `PUT, DELETE /api/profiles/:profileId/ratings/:contentId` | `rateTitle`, `removeRating` |
| `GET /api/profiles/:profileId/titles/:contentId`          | `getTitleActivity`          |
| `GET /api/profiles/:profileId/home`                       | `getHomeFeed`               |

### Tables

- **You own (you write them):** `watch_history`, `my_list`, `rating`, `recommendation`.
- **You only read:** `profile_genre_preference`, `profile`, `content`, `content_genre`, `genre`, `season`, `episode`, and the `genre_taste` view.
- **Onboarding is not yours.** `PUT .../onboarding` belongs to Tejasva (A). You only read what it stores: `profile_genre_preference` and `profile.onboarded_at`.

### Two rules to remember

- **"Completed" is not a column.** A `watch_history` row is completed when `progress_percent >= 90`. In SQL write that out. In TypeScript use `isCompleted(progressPercent)` from `@/lib/content/progress`, which uses `COMPLETED_THRESHOLD`.
- **Ownership is already checked.** `requireOwnedProfile` runs before your functions, so `profileId` is always the signed-in user's profile. Still filter every query by `profile_id`.

---

## 2. Dependencies on A, and what to stub

Some of your work needs things Tejasva (A) is still building. For each one, this is what you need and what to do until it lands.

- **`requireOwnedProfile` -> `getOwnedProfile`, `findUserById`** (from Tejasva)
  - Until it lands: the mock lookups find the seeded profiles 1-3 (user 1) because the seed uses the same ids.
  - Keep working against the mock-backed guards and test only with those until Tejasva merges the real ones.
- **`getContentDetail(contentId)`** (from Tejasva, `catalog.service`; used for the existence check in `getTitleActivity`)
  - Until it lands: the mock catalogue has the same 500 ids, so it works unchanged.
- **Catalogue rows** (`content`, `content_genre`, credits, seasons, episodes)
  - Seeded. No stub needed.
- **`profile_genre_preference` / `onboarded_at` writes** (from Tejasva, `saveGenrePreferences`)
  - The seed has picks for profiles 1 and 2. Profile 3 has none, which gives you a cold start without picks.

Who depends on you:

- Tejasva's (A) `getSimilarTitles` no longer depends on you: it self-joins `content_genre` and breaks ties on release date.
- The dashboard's `mostWatched` and the search popularity ranking read the `watch_history` rows you write.

---

## 3. Ordered checklist

Work through these in order. Each step builds on the one before.

- [ ] **0. Prep**: branch `feat/activity-recs`, own Neon branch in `.env`, `npm run dev`, `db:studio` to look at `watch_history`, `my_list`, `rating`; run the genre-taste query from the plan and compare with the expected values in section 7.1.
- [ ] **1. My List**: `listMyList`, `addToMyList`, `removeFromMyList` (+ `isInMyList`). curl add twice (201 both), list, remove twice.
- [ ] **2. Ratings**: `rateTitle`, `removeRating` (+ `getRating`). curl 5, then 3, value 6 -> 422, unknown title -> 404.
- [ ] **3. History**: `listHistory`, `removeHistoryEntry`. History page; second delete -> 404.
- [ ] **4. Progress**: `recordProgress` (validation, upsert, feedback loop in one transaction). Player in the UI; movie and series; wrong episode -> 422; 95% twice -> one row.
- [ ] **5. Title activity**: `getTitleActivity`, `getResumePoint`, `getNextEpisode`. Title page labels "Resume · 62%", "Resume S1:E3", "Play S1:E4"; finale completed -> null.
- [ ] **6. Genre taste**: `getGenreTaste` + `getSignalFlags` (read the `genre_taste` view with `WHERE profile_id = $1`; the CTEs inside it read `watch_history`, `rating`, `my_list`, `profile_genre_preference`); compare with section 7.1.
- [ ] **7. Home queries**: `getTopPicks`, `getContinueWatching`, `getGenreTitles` (the top-picks query filtered to one genre), all as in the plan.
- [ ] **8. `getHomeFeed`**: wire the rows together (dedupe, reasons, hero, match %), computed on every request.
- [ ] **9. `storeTopPicks`**: write the top picks to `recommendation`; never let a failure break the page.
- [ ] **10. Check** the three demo profiles' Home pages, cold start (profile 3, a brand new profile).
- [ ] **11. Cleanup**: remove `getMockDb`/`toHistoryItem`/`toSummary`/`findContent` imports; update the route header comments that change; lint; build.

---

## 4. `activity.service.ts`

This service records what a profile does (progress, My List, ratings) and reads it back (History, title page state). Every function here is small. The only tricky one is `recordProgress`, because the player calls it constantly.

### Types used in this file

- `WatchHistory { historyId, profileId, contentId, episodeId | null, watchedAt (ISO), progressPercent }`
- `HistoryItem = WatchHistory & { content: ContentSummary; episode: (Episode & { seasonNumber }) | null }`
- `MyListItem = ContentSummary & { addedAt }`
- `Rating { profileId, contentId, value, ratedAt }`
- `ProgressInput { contentId, episodeId | null, progressPercent }`
- `TitleActivity { inMyList, rating, resume }`

`ContentSummary` needs two extra things:

- `genres`: use the `json_agg` subquery (it packs the rows into one JSON array) from Tejasva's (A) `searchContent`, copied.
- `maturityLevel`: `maturity_of(c.age_rating)`.

### SQL terms used below

- **Upsert**: insert a row, or update the existing one if it is already there.
- **`ON CONFLICT`**: the Postgres clause that turns an `INSERT` into an upsert. It says what to do when the key already exists.
- **Idempotent**: running the same call twice leaves the data the same as running it once.
- **Transaction**: several statements that either all succeed or all roll back.
- **FK (foreign key)**: a column that must point at a real row in another table.
- **CHECK**: a rule on a column that the database enforces (for example, "between 0 and 100").
- **PK (primary key)**: the column(s) that uniquely identify a row.

### 4.1 `recordProgress(profileId: number, input: ProgressInput): Promise<WatchHistory>`

**What it does:** Records how far a profile got in a title or episode. The player reports this on pause, seek, the 90% mark, the end, every 10 s while playing, and on page hide (`keepalive`, so the browser still sends the request while the page closes). This is the hot path (called very often): keep it to one round trip plus the cheap recommendation update.

**Steps:**

1. Validate. Clamp and round `progressPercent` to 0-100 (the CHECK is the backstop). The title must exist, otherwise `NotFoundError`.
2. A **movie** stores `episode_id = NULL`, whatever the client sent. A **series** needs an `episodeId` that belongs to the title (`episode` joined to `season` on `content_id`), otherwise `ValidationError` (422).
3. Upsert the single row for (profile, content, episode) and bump `watched_at`. Re-watching a finished title overwrites its progress (a fresh pass), so a re-watch moves to the top of History.
4. Feedback loop: if the title now counts as completed (progress >= 90), mark its recommendation `WATCHED`. Any progress write on a recommended title also moves `SHOWN` -> `CLICKED`.

**SQL:**

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

Drizzle version of the upsert:

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

**Rules to respect:**

- Tables and keys: `watch_history`, `content`, `episode`, `season`, `recommendation`.
- `watch_history` has UNIQUE NULLS NOT DISTINCT `(profile_id, content_id, episode_id)`, constraint `watch_history_profile_content_episode_key`. This needs PostgreSQL 15+. It makes the NULL episode of a movie still conflict with itself (normally two NULLs count as different).
- Other constraints: CHECK `progress_percent BETWEEN 0 AND 100`; FKs on `profile_id` / `content_id` / `episode_id`; PK `(profile_id, content_id)` on `recommendation`.
- Transaction: yes. The upsert and the `rec_status` update commit together.
- Idempotent: yes. The same input gives the same row; only `watched_at` moves.
- A non-finite `progressPercent` is rejected by the route's zod (the request-validation library).
- "The episode belongs to the title" is a rule the schema cannot declare (SCHEMA.md "Known limits"), so the service checks it.
- `ON CONFLICT (profile_id, content_id, episode_id)` works with the NULLS NOT DISTINCT key. If inference gives trouble, use `ON CONFLICT ON CONSTRAINT watch_history_profile_content_episode_key`.
- Episode rows also store `content_id`.

**Errors:**

- `NotFoundError("Title not found.")` -> 404.
- `ValidationError` when a series has no `episodeId`, or the episode belongs to another title -> 422.

**Mock today:** Returns a plausible row (clamped/rounded percent, `historyId` = row count + 1, `watchedAt` = now), persists nothing, and skips the title/episode checks.

**Used by:** `POST /api/profiles/:profileId/progress`. Return value: `{ historyId, profileId, contentId, episodeId, watchedAt (ISO), progressPercent }`.

### 4.2 `listHistory(profileId: number): Promise<HistoryItem[]>`

**What it does:** Powers the History page: everything the profile watched, newest first.

**Steps:**

1. Join each `watch_history` row with its title.
2. `LEFT JOIN episode` (`episode_id` is NULL for movies) and `season` for `season_number`. (A LEFT JOIN keeps rows that have no match on the right side.)
3. Shape the rows as `HistoryItem`: the row, plus `content` as a `ContentSummary` with genres, plus `episode` (Episode + `seasonNumber`, or `null`).

**SQL:**

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

Note: `c.*, e.*` collide on `title`, `description`, `release_date`, `duration_minutes`. Select explicit aliased columns instead.

**Rules to respect:**

- Tables and keys: `watch_history`, `content`, `content_genre`, `genre`, `episode`, `season`; index `watch_history_recent_idx`.
- There is one row per (profile, content, episode), so a re-watch moves its row to the top instead of adding one.
- Transaction: no. Idempotent: yes (a read).
- No history -> `[]`.

**Errors:** None.

**Mock today:** The profile's rows from `data/mock/watch-history.json` (already newest first), joined in memory.

**Used by:** `GET /api/profiles/:profileId/history` (and the History page via `serverApi.getHistory`).

### 4.3 `removeHistoryEntry(profileId: number, historyId: number): Promise<void>`

**What it does:** Removes one entry from History. Its interaction signal and its Continue Watching card go with it.

**Steps:**

1. Delete the row for `historyId`, restricted to this `profileId`.
2. If zero rows were deleted, throw `NotFoundError`.

**SQL:**

```sql
DELETE FROM watch_history WHERE history_id = $2 AND profile_id = $1;       -- rowCount 0 -> 404
```

**Rules to respect:**

- The `profile_id` predicate is the ownership check.
- Zero rows deleted (unknown id, or someone else's) -> `NotFoundError("History entry not found.")`. The route uses that message for a bad id.
- Not idempotent: a second delete is 404. (The previous contract was a silent 204.)
- Deleting a series' episode row leaves the other episodes' rows and the title's other signals in place.

**Errors:**

- `NotFoundError("History entry not found.")` -> 404.

**Mock today:** Does nothing and never throws (the route answers 204).

**Used by:** `DELETE /api/profiles/:profileId/history/:historyId`.

### 4.4 `listMyList(profileId: number): Promise<MyListItem[]>`

**What it does:** Powers the My List page: saved titles, most recently added first.

**Steps:**

1. Join `my_list` with `content` for this profile.
2. Sort by `added_at` descending.
3. Attach genres per title.

**SQL:**

```sql
SELECT c.*, m.added_at
  FROM my_list AS m JOIN content AS c ON c.content_id = m.content_id
 WHERE m.profile_id = $1
 ORDER BY m.added_at DESC;
-- (+ genres per title.)
```

**Rules to respect:**

- Tables and keys: `my_list`, `content`, `content_genre`, `genre`; PK `(profile_id, content_id)`.
- Transaction: no. Idempotent: yes (a read).
- Empty list -> `[]`.

**Errors:** None.

**Mock today:** The profile's rows from `my-list.json` in file order (not re-sorted), joined in memory.

**Used by:** `GET /api/profiles/:profileId/my-list`.

### 4.5 `addToMyList(profileId: number, contentId: number): Promise<void>`

**What it does:** Saves a title for later. Adding the same title twice is a no-op.

**Steps:**

1. Insert `(profile_id, content_id)`. `added_at` defaults to `now()`.
2. If the pair already exists, do nothing.
3. If the title does not exist, translate the FK failure into `NotFoundError`.

**SQL:**

```sql
INSERT INTO my_list (profile_id, content_id) VALUES ($1, $2)       -- added_at defaults to now()
ON CONFLICT (profile_id, content_id) DO NOTHING;
```

**Rules to respect:**

- Idempotent: `added_at` keeps the first time.
- Not a transaction.
- An unknown `content_id` violates the FK (SQLSTATE **23503**, the Postgres error code for a foreign-key violation).
- The route answers 201 `{ contentId, inMyList: true }` either way.

**Errors:**

- FK violation 23503 -> `NotFoundError("Title not found.")` -> 404.

**Mock today:** Does nothing and never throws.

**Used by:** `POST /api/profiles/:profileId/my-list`.

### 4.6 `removeFromMyList(profileId: number, contentId: number): Promise<void>`

**What it does:** Removes a title from My List.

**Steps:**

1. Delete the `(profile_id, content_id)` row. If it was not there, nothing happens.

**SQL:**

```sql
DELETE FROM my_list WHERE profile_id = $1 AND content_id = $2;
```

**Rules to respect:**

- Idempotent: deleting nothing is fine.
- The title's other signals (rating, history) are untouched.
- The route answers 200 `{ contentId, inMyList: false }`.

**Errors:** None.

**Mock today:** Does nothing.

**Used by:** `DELETE /api/profiles/:profileId/my-list/:contentId`.

### 4.7 `rateTitle(profileId: number, contentId: number, value: number): Promise<Rating>`

**What it does:** Rates a title 1-5 stars; re-rating replaces the old value. The rating feeds the home signals as `(value - 3) / 2` (5 stars +1 down to 1 star -1).

**Steps:**

1. Upsert `(profile_id, content_id, value)`.
2. On a repeat, replace `value` and move `rated_at` to now.
3. Return the row. Nothing else needs updating (see the rules).

**SQL:**

```sql
INSERT INTO rating (profile_id, content_id, value) VALUES ($1, $2, $3)
ON CONFLICT (profile_id, content_id)
DO UPDATE SET value = EXCLUDED.value, rated_at = now()
RETURNING profile_id, content_id, value, rated_at;
```

**Rules to respect:**

- `value` is validated as an integer 1-5 by the route's zod. The CHECK `rating_value_check` is the backstop.
- Idempotent: the same value gives the same row; `rated_at` moves.
- Nothing else needs updating. Ratings are read directly from `rating`, so Home reflects the change on the next load.

**Errors:**

- Unknown `content_id` (FK 23503) -> `NotFoundError("Title not found.")` -> 404.
- A value outside 1-5 -> 422 (from the route's zod).

**Mock today:** Returns `{ profileId, contentId, value, ratedAt: now }`, persists nothing.

**Used by:** `PUT /api/profiles/:profileId/ratings/:contentId`.

### 4.8 `removeRating(profileId: number, contentId: number): Promise<void>`

**What it does:** Deletes this profile's rating for a title.

**Steps:**

1. Delete the `(profile_id, content_id)` row. If it was not there, nothing happens.

**SQL:**

```sql
DELETE FROM rating WHERE profile_id = $1 AND content_id = $2;
```

**Rules to respect:**

- Idempotent.
- The route answers 204.

**Errors:** None.

**Mock today:** Does nothing.

**Used by:** `DELETE /api/profiles/:profileId/ratings/:contentId`.

### 4.9 `getTitleActivity(profileId: number, contentId: number): Promise<TitleActivity>`

**What it does:** Reports what this profile has done with one title. It drives the title page (Play/Resume label, My List button, star rating) and where the player starts.

**Steps:**

1. Check the title exists. Use `getContentDetail` from `./catalog.service` -> `NotFoundError("Title not found.")`. A plain `SELECT 1 FROM content` with the same error is acceptable and cheaper.
2. Compute `inMyList = isInMyList`, `rating = getRating`, `resume = getResumePoint`. Run the three in parallel with `Promise.all` (JavaScript's "run these at the same time and wait for all").
3. Optional feedback loop: opening the title page moves a SHOWN recommendation to CLICKED.

**SQL:**

```sql
-- optional step 3 (a write on a GET, so only if the team wants page-view granularity):
UPDATE recommendation SET rec_status = 'CLICKED'
 WHERE profile_id = $1 AND content_id = $2 AND rec_status = 'SHOWN';
```

The other three queries are in the helpers (sections 4.10 to 4.12).

**Rules to respect:**

- Tables and keys: `my_list`, `rating`, `watch_history`, `episode`, `season` (+ `content` for the existence check). PKs of `my_list` and `rating`, index `watch_history_recent_idx`.
- Transaction: no. Idempotent: yes (a read).
- A profile that never touched the title gets `{ inMyList: false, rating: null, resume: null }`.
- Step 3 is a write on a GET, so do it only if the team wants page-view granularity. `recordProgress` already covers the player (README 9.12).

**Errors:**

- `NotFoundError("Title not found.")` -> 404.

**Mock today:** The same three answers read from the mock db. `resume` is only an unfinished latest row (completed rows give null: no "next episode" yet).

**Used by:** `GET /api/profiles/:profileId/titles/:contentId` (and the title/player pages via `serverApi.getTitleActivity`).

### 4.10 `isInMyList(profileId: number, contentId: number): Promise<boolean>`

This is the first of four exported helpers of `getTitleActivity` (4.10 to 4.13).

**What it does:** Says whether the title is on this profile's My List.

**Steps:**

1. Check whether a `my_list` row exists for the pair.

**SQL:**

```sql
SELECT EXISTS (SELECT 1 FROM my_list WHERE profile_id = $1 AND content_id = $2);
```

**Rules to respect:**

- A read; idempotent.

**Errors:** None.

**Mock today:** Looks the pair up in `my-list.json`.

**Used by:** `getTitleActivity`.

### 4.11 `getRating(profileId: number, contentId: number): Promise<number | null>`

**What it does:** Returns this profile's star rating for the title, or `null` if it has none.

**Steps:**

1. Select `value` from `rating` for the pair.

**SQL:**

```sql
SELECT value FROM rating WHERE profile_id = $1 AND content_id = $2;
```

**Rules to respect:**

- A read; idempotent.

**Errors:** None.

**Mock today:** Looks the pair up in `ratings.json`.

**Used by:** `getTitleActivity`.

### 4.12 `getResumePoint(profileId: number, contentId: number): Promise<TitleActivity["resume"]>`

**What it does:** Decides where Play should start for this title. The result is `{ episodeId: number | null, progressPercent: number, label: string }`, or `null`.

**Steps:**

1. Take the latest `watch_history` row for the title (most recent `watched_at`).
2. Decide by what that row was (see the list below).
3. "Completed" means `progress_percent >= 90` (`isCompleted`).

What to return for each kind of latest row:

- **Movie, unfinished:** `{ episodeId: null, progressPercent, label: "Resume · 62%" }`.
- **Movie, completed:** `null` (Play starts over).
- **Episode, unfinished:** that episode, label `"Resume S1:E3"`. Build the code with `formatEpisodeCode(seasonNumber, episodeNumber)` from `@/lib/format`.
- **Episode, completed:** `getNextEpisode(contentId, episodeId)` at 0%, label `"Play S1:E4"`. Return `null` after the finale.
- **Never watched:** `null`.

**SQL:**

```sql
SELECT w.episode_id, w.progress_percent, s.season_number, e.episode_number
  FROM watch_history AS w
  LEFT JOIN episode AS e ON e.episode_id = w.episode_id
  LEFT JOIN season  AS s ON s.season_id  = e.season_id
 WHERE w.profile_id = $1 AND w.content_id = $2
 ORDER BY w.watched_at DESC LIMIT 1;                -- watch_history_recent_idx
```

**Rules to respect:**

- A finale that is completed -> `null`.
- A series whose latest row is an unfinished earlier episode resumes that one. "Latest" means by `watched_at`, not by episode order.
- For the next-episode case, `progressPercent` is 0.
- A read; idempotent.

**Errors:** None.

**Mock today:** Only the unfinished case (latest row, newest first in the mock file, with `!isCompleted`). Completed titles return null, so "Play S1:E4" is not produced.

**Used by:** `getTitleActivity`.

### 4.13 `getNextEpisode(contentId: number, episodeId: number): Promise<Episode | null>`

**What it does:** Finds the episode that airs right after the given one, crossing into the next season when needed. Returns `null` after the finale.

**Steps:**

1. Look up the season number and episode number of the given episode.
2. Among this title's episodes, keep those whose (season number, episode number) pair is greater. (Postgres can compare two-column "row values" like this directly.)
3. Order by season then episode and take the first.

**SQL:**

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

**Rules to respect:**

- Tables and keys: `episode`, `season`; UNIQUE `(content_id, season_number)`, UNIQUE `(season_id, episode_number)`.
- An `episodeId` of another title -> `null` (the row comparison finds nothing for this content).
- The label "Play S1:E4" needs the next episode's **season number**, which `Episode` lacks. Keep this exported signature, and have `getResumePoint` use an internal variant of the query that also returns `s.season_number`.

**Errors:** None.

**Mock today:** Returns `null`.

**Used by:** `getResumePoint`.

---

## 5. `recommendations.service.ts`: the genre-taste engine

This service builds the Home page. The build guide, with every query run against the seeded data and its expected result, is [`plans/activity-recommendations/plan.md`](../../plans/activity-recommendations/plan.md). Follow that plan for the code. This section only states the idea.

**Genre taste.** It is read from the `genre_taste` view (`drizzle/0001_genre_taste_view.sql`): `SELECT genre_id, taste_score FROM genre_taste WHERE profile_id = $1`. The view covers all profiles, so always filter by `profile_id` (Postgres pushes that filter into the view, so it stays fast). Inside the view, each signal is scored on a 0-1 scale and the four are summed per genre into `taste_score`:

- **Watched:** `watch_history` collapsed to one row per title with `MAX(progress_percent) ... GROUP BY content_id` (a series has one row per episode). Under 10% scores 0, under 30% scores 0.25, under 50% scores 0.5, under 80% scores 0.75, otherwise 1.
- **Rating:** `(value - 3) / 2` (5 stars +1, 4 stars +0.5, 3 stars 0, 2 stars -0.5, 1 star -1).
- **My List:** +0.5.
- **Onboarding picks:** +1 straight to each picked genre in `profile_genre_preference`.
- Each title's points are copied to all of its genres and summed per genre. The view returns only genres with `taste_score > 0`, and its `watch_score`, `rating_score`, `my_list_score` and `pick_score` columns show where the total came from.
- A title's score is the **sum** of its genres' `taste_score` divided by **√(number of genres)**: a plain sum lets 5-6-genre series win on genre count, and a plain average ties every single-genre title with multi-genre ones. Ties break on `release_date DESC` (newest first).
- It drives the top picks, the hero (the first top pick), the two genre rows and the match %.

**Not ranked, just shown:** continue-watching (the latest history row per title at 1-89%).

**Genre rows** reuse the top-picks query: the profile's top 2 genres from `genre_taste`, and for each, the same score query with `AND EXISTS (SELECT 1 FROM content_genre WHERE content_id = c.content_id AND genre_id = $genre)`. So a genre row is ranked by the profile's taste (not just newest first), and a title already shown in an earlier row is skipped.

**Other rules**

- Home is computed on every request. There is no cache, no refresh policy and no reading back from `recommendation`.
- Cold start needs no special code: onboarding makes every profile pick at least 3 genres before it reaches Home (`ONBOARDING_MIN_GENRES = 3`; the profile picker sends un-onboarded profiles to `/onboarding`), so a new profile already has a genre taste and no popularity fallback is needed. A profile with nothing at all (only possible in seed data) gets every score 0, ordered newest first.
- The top picks are also written to `recommendation` (`storeTopPicks`, one transaction, never failing the page), so `recordProgress` can move `rec_status` and the table is used.
- The service exports `ROW_SIZE` and `getHomeFeed`. The helpers and the row catalogue are in the plan.

---

## 6. Deep dive: the `rec_status` feedback loop

`rec_status` records what the profile did with a stored recommendation. The normal path is `SHOWN` (default when stored) -> `CLICKED` -> `WATCHED`. The other end state is `DISMISSED`.

- **Top pick stored** (`storeTopPicks`, on a Home load): the row is inserted as `SHOWN`.
- **Any progress write (< 90%) on a recommended title** (`recordProgress`): `SHOWN`/`CLICKED` -> `CLICKED`.
- **Progress >= 90%** (`recordProgress`): `SHOWN`/`CLICKED` -> `WATCHED`.
- **Title page opened, optional** (`getTitleActivity`): `SHOWN` -> `CLICKED` (README 9.12).
- **Dismissed**: no route yet. -> `DISMISSED` (README 9.11).
- **Home reload** (`storeTopPicks`): `rec_status` is **never** overwritten. Picks that dropped out are deleted unless `DISMISSED`.

Notes:

- `WATCHED` and `DISMISSED` never move back from `recordProgress`, because of its `WHERE rec_status IN ('SHOWN','CLICKED')`.
- A watched title leaves the top picks on the next load, because the "unseen" filter hides anything with a `watch_history`, `rating` or `my_list` row.
- Ratings and progress are read straight from the base tables, so Home reflects them on the next load.
- `CLICKED`/`WATCHED` are available for later tuning, but nothing ranks on them yet.

---

## 7. Testing with the seeded data

The seed gives three demo profiles, so you can check each query against known numbers. The plan has the full list of expected results per query. Use these checks while you build and again before opening your PR.

### 7.1 Expected values

The numbers below come from the plan, run against the seed with the `genre_taste` view:

- **Genre taste, Riya (profile 1):** Drama 8, Science Fiction 7.75, Adventure 3.75, Crime 3.5, Action 3, Mystery 3, Thriller 2.5, Fantasy 1.5, Comedy 0.5, History 0.5.
- **Genre taste, Kabir (2) / Mini (3):** Kabir Action 6, Adventure 4.5, Animation 3.5; Mini Animation 1, Family 1 (My List only).
- **Top picks, Riya:** The Martian 11.26, The 100 11.23, Ex Machina 11.14, then Logan / Arrival / The Prestige 10.83.
- **Top picks, Kabir (profile 2, TEEN):** What If...?, Super Dragon Ball Heroes, My Hero Academia, Dragon Ball Super, ... at 8.94.
- **Top picks, Mini (profile 3, KIDS):** Shrek 1.57, then Moana, Zootopia, Frozen, Wreck-It Ralph at 1.5; only KIDS titles. Inside Out must not appear, because it is on her My List.
- **Continue watching, Riya:** Breaking Bad S1:E3 41%, Dune 62%, Parasite 6%, Stranger Things S1:E2 23%.
- **Signal flags:** Riya has signals and picks; Mini has signals but no picks (her My List counts as a signal).

### 7.2 curl checks

```bash
curl -b jar $BASE/api/profiles/1/home | jq '.hero.content.title, (.rows[] | {id, title, reason, n: (.items|length)})'
curl -b jar -H 'content-type: application/json' -d '{"contentId":1,"episodeId":null,"progressPercent":95}' $BASE/api/profiles/1/progress
curl -b jar $BASE/api/profiles/1/titles/1                      # resume null (completed movie)
curl -b jar $BASE/api/profiles/3/home | jq '[.rows[].items[].content.maturityLevel] | unique'   # ["KIDS"] only
```

Check, per profile:

- Riya's rows come in order: continue-watching, top-picks, then 2 genre rows. The hero is a Drama title.
- No title appears in two of top-picks / genre rows.
- No row except continue-watching contains a title the profile watched, rated or saved.
- Mini (KIDS) never sees PG-13+ items, and her top-picks reason is the "based on what you watch" wording.
- Every row has a `reason`.
- Rating a title then reloading Home changes the genre rows straight away (no cache).

Also:

- Create a brand-new profile (`POST /api/profiles`, Tejasva) and complete onboarding with 3 genres. Top picks must come only from those genres, with the "picked genres" reason.
- A brand-new profile with nothing: every score is 0, so top picks are the newest allowed titles and the hero says "Picked for you". This is only reachable with seed data, since onboarding forces 3 genres.

### 7.3 SQL spot checks

```sql
SELECT * FROM recommendation WHERE profile_id = 1 ORDER BY relevance_score DESC;   -- the stored top picks
EXPLAIN ANALYZE <the genre-taste / top-picks query>;                               -- should be milliseconds at this size
```

Watch a recommended title to 95%: its `rec_status` becomes `WATCHED`, and it is gone from top picks on the next Home load.

---

## 8. Implementation notes and pitfalls

These are the traps you are most likely to hit while building Home. The plan's section 7 lists more.

### 8.1 Mapping and types

- `SUM`/`AVG` results and counts can arrive as strings (numeric): use `Number()`.
- `watched_at`, `added_at`, `rated_at`, `generated_at` are ISO strings in the API (README 3.7).
- Row ids: only `genre-picks-<genreId>` has a suffix; the others are plain kind names.
- `HomeFeed.generatedAt` is an ISO string. `hero` is `null` only if the catalogue is empty or all filtered.

### 8.2 Performance guardrails

- `recordProgress` is the hot write. Make no extra reads beyond the content-type lookup and, for series, the episode-belongs check. The `UPDATE recommendation` touches at most one row by PK.
- Home is a handful of queries (the plan measured top picks at about 4 ms). Run independent ones with `Promise.all`, and load all the `ContentSummary` rows in one `loadSummaries` call at the end.
- Do not run Home's queries in `getTitleActivity`.

### 8.3 What not to do

- Do not store reasons (no column exists, by design).
- Do not use a plain sum or a plain average of a title's genre points: divide the sum by √(number of genres), or titles with many genres win every time.
- Do not trust the client for `profileId` (the route already ties it to the session).
- Do not reintroduce a `completed` column or flag: use `progress_percent >= 90` / `isCompleted`.

---

## 9. Definition of done

Tick every box before you ask for review.

- [ ] `activity.service.ts` and `recommendations.service.ts` import nothing from `@/server/mocks` (`grep -n "server/mocks" src/server/services/{activity,recommendations}.service.ts` is empty); `isCompleted`/`formatEpisodeCode` come from `@/lib/content/progress` and `@/lib/format`.
- [ ] Every function matches its SQL, errors, transaction and idempotency notes above; typed errors only.
- [ ] `getHomeFeed` runs the genre-taste engine from the plan (top picks, continue-watching, the 2 genre rows, cold start via the onboarding picks); `storeTopPicks` failures do not break the response.
- [ ] curl checks pass (README section 4 and 7.2 here): progress (movie, series, wrong episode 422, unknown title 404, idempotent); history list/delete (second delete 404); my-list add twice 201/201 and remove twice; ratings 1-5, 6 -> 422, delete twice; titles/:id resume labels incl. "Play S1:E4" and `null` after a finale; home for profiles 1, 2, 3 and a new profile; another user's profile -> 404.
- [ ] UI works: Home (hero, rows, reasons, match chips, continue-watching progress), the player's progress sync, History, My List, rating control, title page Play/Resume label.
- [ ] The header comments of `recommendations.service.ts` and the Home route describe the real algorithm.
- [ ] `npm run lint` and `npm run build` pass; route header comments updated where behaviour changed (e.g. `DELETE .../history/:historyId` is 404 on a second call).
- [ ] PR(s) reviewed by Tejasva or Yash with curl evidence.
