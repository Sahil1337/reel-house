/**
 * Viewing activity: what a profile has watched, saved and rated.
 *
 * Tables owned: watch_history, my_list, rating. (Reads content / episode / season through
 * catalog.service or joins; writes recommendation.rec_status as the feedback loop, see recordProgress.)
 *
 * "Completed" is not a column: a watch_history row is completed when `progress_percent >= 90`
 * (SQL) / `isCompleted(progressPercent)` from "@/lib/content/progress" (TS).
 *
 * Exported functions:
 *   recordProgress(profileId, input)            → WatchHistory      POST   /progress
 *   listHistory(profileId)                      → HistoryItem[]     GET    /history
 *   removeHistoryEntry(profileId, historyId)    → void              DELETE /history/:historyId
 *   listMyList(profileId)                       → MyListItem[]      GET    /my-list
 *   addToMyList(profileId, contentId)           → void              POST   /my-list
 *   removeFromMyList(profileId, contentId)      → void              DELETE /my-list/:contentId
 *   rateTitle(profileId, contentId, value)      → Rating            PUT    /ratings/:contentId
 *   removeRating(profileId, contentId)          → void              DELETE /ratings/:contentId
 *   getTitleActivity(profileId, contentId)      → TitleActivity     GET    /titles/:contentId
 *   isInMyList / getRating / getResumePoint / getNextEpisode        helpers of getTitleActivity
 *
 * All routes are under /api/profiles/:profileId and are ownership-checked by requireOwnedProfile
 * before these functions run, so `profileId` here is always the signed-in user's profile.
 */
import "server-only";

import { findContent, getMockDb, toHistoryItem, toSummary } from "@/server/mocks/db";
import { formatEpisodeCode } from "@/lib/format";
import { isCompleted } from "@/lib/content/progress";
import type { Episode, HistoryItem, MyListItem, ProgressInput, Rating, TitleActivity, WatchHistory } from "@/types";

import { getContentDetail } from "./catalog.service";

/**
 * Records how far a profile got in a title or episode (the player reports this on pause, seek, the
 * 90% mark, the end, every 10s while playing, and on page hide).
 *
 * Steps:
 *   1. Validate: clamp and round progressPercent to 0–100 (the CHECK is the backstop). The title
 *      must exist (NotFoundError). A movie stores episode_id = NULL whatever the client sent. A
 *      series needs an episodeId that belongs to the title (episode ⋈ season on content_id),
 *      otherwise ValidationError (422).
 *   2. Upsert the single row for (profile, content, episode) and bump watched_at. Re-watching a
 *      finished title overwrites its progress (a fresh pass), so a re-watch moves to the top of History.
 *   3. Feedback loop: if the title now counts as completed (progress >= 90), mark its recommendation
 *      WATCHED. (Any progress write on a recommended title also moves SHOWN → CLICKED.)
 * SQL:
 *   SELECT content_type FROM content WHERE content_id = $1;                       -- NotFoundError when no row
 *   SELECT 1 FROM episode AS e JOIN season AS s ON s.season_id = e.season_id
 *    WHERE e.episode_id = $2 AND s.content_id = $1;                               -- series only; no row → 422
 *   INSERT INTO watch_history (profile_id, content_id, episode_id, progress_percent)
 *   VALUES ($profile, $content, $episode, $percent)                              -- $episode NULL for movies
 *   ON CONFLICT (profile_id, content_id, episode_id)
 *   DO UPDATE SET progress_percent = EXCLUDED.progress_percent, watched_at = now()
 *   RETURNING history_id, profile_id, content_id, episode_id, watched_at, progress_percent;
 *   -- feedback loop (after the upsert; never touches DISMISSED):
 *   UPDATE recommendation
 *      SET rec_status = CASE WHEN $percent >= 90 THEN 'WATCHED' ELSE 'CLICKED' END::rec_status
 *    WHERE profile_id = $1 AND content_id = $2
 *      AND rec_status IN ('SHOWN', 'CLICKED');
 * Tables: watch_history, content, episode, season, recommendation  ·  Keys/constraints relied on:
 *   UNIQUE NULLS NOT DISTINCT (profile_id, content_id, episode_id) (PostgreSQL 15+, so the NULL
 *   episode of a movie still conflicts with itself), CHECK (progress_percent BETWEEN 0 AND 100),
 *   FKs on profile_id / content_id / episode_id, PK (profile_id, content_id) on recommendation.
 * Transaction: yes (the upsert and the rec_status update commit together)  ·  Idempotent: yes (same
 *   input → same row; only watched_at moves)
 * Edge cases: a non-finite progressPercent is rejected by the route's zod schema; the episode
 *   check is a rule the schema can't declare (docs/schema/SCHEMA.md "Known limits"); the player fires
 *   often, so keep this one round-trip plus the cheap recommendation update.
 * Throws: NotFoundError when the title doesn't exist; ValidationError when a series has no
 *   episodeId or the episode belongs to another title.
 * Called by: POST /api/profiles/:profileId/progress
 * Mock today: returns a plausible row (clamped/rounded percent, historyId = row count + 1,
 *   watchedAt = now), persists nothing, skips the title/episode checks.
 */
export async function recordProgress(profileId: number, input: ProgressInput): Promise<WatchHistory> {
  // TODO: implement
  return {
    ...input,
    progressPercent: Math.min(100, Math.max(0, Math.round(input.progressPercent))),
    historyId: getMockDb().watchHistory.length + 1,
    profileId,
    watchedAt: new Date().toISOString(),
  };
}

/**
 * The History page: everything the profile watched, newest first.
 *
 * Steps:
 *   1. Join each watch_history row with its title; LEFT JOIN episode (episode_id is NULL for
 *      movies) and season for season_number.
 *   2. Shape rows as HistoryItem: the row + `content` (ContentSummary, with genres) +
 *      `episode` (Episode + seasonNumber, or null).
 * SQL:
 *   SELECT w.history_id, w.profile_id, w.content_id, w.episode_id, w.watched_at, w.progress_percent,
 *          c.*, e.*, s.season_number
 *     FROM watch_history AS w
 *     JOIN content       AS c ON c.content_id = w.content_id
 *     LEFT JOIN episode  AS e ON e.episode_id = w.episode_id
 *     LEFT JOIN season   AS s ON s.season_id  = e.season_id
 *    WHERE w.profile_id = $1
 *    ORDER BY w.watched_at DESC;                       -- watch_history_recent_idx (profile_id, watched_at DESC)
 *   (+ the content's genres, as catalog.service builds a ContentSummary.)
 * Tables: watch_history, content, content_genre, genre, episode, season  ·  Keys/constraints relied
 *   on: watch_history_recent_idx. There is one row per (profile, content, episode), so a re-watch
 *   moves its row to the top rather than adding one.
 * Transaction: no  ·  Idempotent: yes (read)
 * Edge cases: no history → [].
 * Throws: nothing.
 * Called by: GET /api/profiles/:profileId/history (and the History page via src/lib/api/server.ts getHistory)
 * Mock today: the profile's rows from data/mock/watch-history.json (already newest first), joined
 *   in memory.
 */
export async function listHistory(profileId: number): Promise<HistoryItem[]> {
  // TODO: implement
  return getMockDb()
    .watchHistory.filter((row) => row.profileId === profileId)
    .map(toHistoryItem);
}

/**
 * Removes one entry from History (its interaction signal and Continue Watching card go with it).
 *
 * Steps:
 *   1. Delete the row, scoped by profile so one profile can't delete another's rows.
 *   2. No row deleted (unknown id, or someone else's) → NotFoundError.
 * SQL:
 *   DELETE FROM watch_history WHERE history_id = $2 AND profile_id = $1;       -- rowCount 0 → 404
 * Tables: watch_history  ·  Keys/constraints relied on: PK history_id; the profile_id predicate is the
 *   ownership check.
 * Transaction: no  ·  Idempotent: no (the second delete of the same id is a 404; the previous contract
 *   was a silent 204 — see the route)
 * Edge cases: deleting a series' episode row leaves the other episodes' rows (and the title's other
 *   signals) in place.
 * Throws: NotFoundError when no row with that id belongs to the profile.
 * Called by: DELETE /api/profiles/:profileId/history/:historyId
 * Mock today: does nothing and never throws (the route answers 204).
 */
export async function removeHistoryEntry(profileId: number, historyId: number): Promise<void> {
  // TODO: implement
  void profileId;
  void historyId;
}

/**
 * The My List page: saved titles, most recently added first.
 *
 * Steps:
 *   1. Join my_list with content (and genres, as a ContentSummary).
 *   2. Return each ContentSummary plus `addedAt`.
 * SQL:
 *   SELECT c.*, m.added_at
 *     FROM my_list AS m JOIN content AS c ON c.content_id = m.content_id
 *    WHERE m.profile_id = $1
 *    ORDER BY m.added_at DESC;
 * Tables: my_list, content, content_genre, genre  ·  Keys/constraints relied on: PK (profile_id, content_id)
 * Transaction: no  ·  Idempotent: yes (read)
 * Edge cases: empty list → [].
 * Throws: nothing.
 * Called by: GET /api/profiles/:profileId/my-list (and the My List page via src/lib/api/server.ts getMyList)
 * Mock today: the profile's rows from data/mock/my-list.json in file order (not re-sorted), joined in memory.
 */
export async function listMyList(profileId: number): Promise<MyListItem[]> {
  // TODO: implement
  return getMockDb()
    .myList.filter((entry) => entry.profileId === profileId)
    .map((entry) => ({ ...toSummary(findContent(entry.contentId)!), addedAt: entry.addedAt }));
}

/**
 * Saves a title for later. Adding the same title twice is a no-op.
 *
 * Steps:
 *   1. Insert (profile, content); a conflict on the PK does nothing (idempotent).
 *   2. An unknown content_id violates the FK → NotFoundError("Title not found.").
 * SQL:
 *   INSERT INTO my_list (profile_id, content_id) VALUES ($1, $2)       -- added_at defaults to now()
 *   ON CONFLICT (profile_id, content_id) DO NOTHING;
 * Tables: my_list  ·  Keys/constraints relied on: PK (profile_id, content_id) (a title is in a list
 *   at most once), FK content_id → content (unknown title), FK profile_id → profile.
 * Transaction: no  ·  Idempotent: yes (ON CONFLICT DO NOTHING; added_at keeps the first time)
 * Edge cases: the FK error code is 23503 (foreign_key_violation) → map it to NotFoundError.
 * Throws: NotFoundError when the title doesn't exist.
 * Called by: POST /api/profiles/:profileId/my-list
 * Mock today: does nothing and never throws.
 */
export async function addToMyList(profileId: number, contentId: number): Promise<void> {
  // TODO: implement
  void profileId;
  void contentId;
}

/**
 * Takes a title off My List (also when it wasn't in the list).
 *
 * Steps:
 *   1. Delete the (profile, content) row if there is one.
 * SQL:
 *   DELETE FROM my_list WHERE profile_id = $1 AND content_id = $2;
 * Tables: my_list  ·  Keys/constraints relied on: PK (profile_id, content_id)
 * Transaction: no  ·  Idempotent: yes (deleting nothing is fine)
 * Edge cases: none; the title's other signals (rating, history) are untouched.
 * Throws: nothing.
 * Called by: DELETE /api/profiles/:profileId/my-list/:contentId
 * Mock today: does nothing.
 */
export async function removeFromMyList(profileId: number, contentId: number): Promise<void> {
  // TODO: implement
  void profileId;
  void contentId;
}

/**
 * Rates a title 1–5 stars; re-rating replaces the old value. Feeds the home signals as (value − 3) × 2.
 *
 * Steps:
 *   1. Upsert on the primary key; value is validated as an integer 1–5 by the route's zod schema
 *      (the CHECK is the backstop).
 *   2. An unknown content_id violates the FK → NotFoundError("Title not found.").
 * SQL:
 *   INSERT INTO rating (profile_id, content_id, value) VALUES ($1, $2, $3)
 *   ON CONFLICT (profile_id, content_id)
 *   DO UPDATE SET value = EXCLUDED.value, rated_at = now()
 *   RETURNING profile_id, content_id, value, rated_at;
 * Tables: rating  ·  Keys/constraints relied on: PK (profile_id, content_id) (one rating per title),
 *   CHECK (value BETWEEN 1 AND 5), FK content_id → content.
 * Transaction: no  ·  Idempotent: yes (same value → same row; rated_at moves)
 * Edge cases: nothing else needs updating: Home reads rating directly, so the next Home load
 *   reflects the new value.
 * Throws: NotFoundError when the title doesn't exist.
 * Called by: PUT /api/profiles/:profileId/ratings/:contentId
 * Mock today: returns { profileId, contentId, value, ratedAt: now }, persists nothing.
 */
export async function rateTitle(profileId: number, contentId: number, value: number): Promise<Rating> {
  // TODO: implement
  return { profileId, contentId, value, ratedAt: new Date().toISOString() };
}

/**
 * Clears a rating (also when there wasn't one).
 *
 * Steps:
 *   1. Delete the (profile, content) row if there is one.
 * SQL:
 *   DELETE FROM rating WHERE profile_id = $1 AND content_id = $2;
 * Tables: rating  ·  Keys/constraints relied on: PK (profile_id, content_id)
 * Transaction: no  ·  Idempotent: yes
 * Edge cases: none.
 * Throws: nothing.
 * Called by: DELETE /api/profiles/:profileId/ratings/:contentId
 * Mock today: does nothing.
 */
export async function removeRating(profileId: number, contentId: number): Promise<void> {
  // TODO: implement
  void profileId;
  void contentId;
}

/**
 * What this profile has done with one title: drives the title page (Play/Resume label, My List
 * button, star rating) and where the player starts.
 *
 * Steps:
 *   1. The title must exist (catalog.service getContentDetail → NotFoundError "Title not found.").
 *   2. inMyList = isInMyList, rating = getRating, resume = getResumePoint (run the three in parallel).
 *   3. Optional feedback loop: opening the title page moves a SHOWN recommendation to CLICKED
 *      (UPDATE recommendation SET rec_status = 'CLICKED' WHERE profile_id = $1 AND content_id = $2
 *      AND rec_status = 'SHOWN';) — a write on a GET, so do it only if the team wants page-view
 *      granularity; recordProgress already covers the player.
 * SQL: see the helpers below.
 * Tables: my_list, rating, watch_history, episode, season (+ content for the existence check)
 * Keys/constraints relied on: PKs of my_list and rating, watch_history_recent_idx
 * Transaction: no  ·  Idempotent: yes (read)
 * Edge cases: a profile that never touched the title gets { inMyList: false, rating: null, resume: null }.
 * Throws: NotFoundError when the title doesn't exist.
 * Called by: GET /api/profiles/:profileId/titles/:contentId (and the title/player pages via src/lib/api/server.ts)
 * Mock today: same three answers read from the mock db; resume is only an unfinished latest row
 *   (completed rows give null — no "next episode" yet).
 */
export async function getTitleActivity(profileId: number, contentId: number): Promise<TitleActivity> {
  // TODO: implement
  await getContentDetail(contentId);
  const [inMyList, rating, resume] = await Promise.all([
    isInMyList(profileId, contentId),
    getRating(profileId, contentId),
    getResumePoint(profileId, contentId),
  ]);
  return { inMyList, rating, resume };
}

/**
 * Whether the title is on the profile's My List.
 *
 * SQL:
 *   SELECT EXISTS (SELECT 1 FROM my_list WHERE profile_id = $1 AND content_id = $2);
 * Tables: my_list  ·  Keys/constraints relied on: PK (profile_id, content_id)
 * Transaction: no  ·  Idempotent: yes (read)
 * Called by: getTitleActivity
 * Mock today: looks the pair up in data/mock/my-list.json.
 */
export async function isInMyList(profileId: number, contentId: number): Promise<boolean> {
  // TODO: implement
  return getMockDb().myList.some((row) => row.profileId === profileId && row.contentId === contentId);
}

/**
 * The profile's 1–5 rating of the title, or null.
 *
 * SQL:
 *   SELECT value FROM rating WHERE profile_id = $1 AND content_id = $2;
 * Tables: rating  ·  Keys/constraints relied on: PK (profile_id, content_id)
 * Transaction: no  ·  Idempotent: yes (read)
 * Called by: getTitleActivity
 * Mock today: looks the pair up in data/mock/ratings.json.
 */
export async function getRating(profileId: number, contentId: number): Promise<number | null> {
  // TODO: implement
  return getMockDb().ratings.find((row) => row.profileId === profileId && row.contentId === contentId)?.value ?? null;
}

/**
 * Where Play should start for this title.
 *
 * Steps:
 *   1. Take the latest watch_history row for the title (most recent watched_at).
 *   2. Decide, by what it was:
 *        movie, unfinished    → { episodeId: null, progressPercent, label "Resume · 62%" }
 *        movie, completed     → null (Play starts over)
 *        episode, unfinished  → that episode, label "Resume S1:E3"   (formatEpisodeCode)
 *        episode, completed   → getNextEpisode(contentId, episodeId) at 0%, label "Play S1:E4";
 *                               null after the finale
 *        never watched        → null
 *      "completed" = progress_percent >= 90 (isCompleted).
 * SQL:
 *   SELECT w.episode_id, w.progress_percent, s.season_number, e.episode_number
 *     FROM watch_history AS w
 *     LEFT JOIN episode AS e ON e.episode_id = w.episode_id
 *     LEFT JOIN season  AS s ON s.season_id  = e.season_id
 *    WHERE w.profile_id = $1 AND w.content_id = $2
 *    ORDER BY w.watched_at DESC LIMIT 1;                -- watch_history_recent_idx
 * Tables: watch_history, episode, season  ·  Keys/constraints relied on: watch_history_recent_idx
 * Transaction: no  ·  Idempotent: yes (read)
 * Edge cases: a finale that's completed → null; a series whose latest row is an unfinished earlier
 *   episode resumes that one (latest by watched_at, not by episode order).
 * Called by: getTitleActivity
 * Mock today: only the unfinished case (latest row, newest first in the mock file, with
 *   !isCompleted); completed titles return null, so the "Play S1:E4" next-episode case isn't produced.
 */
export async function getResumePoint(profileId: number, contentId: number): Promise<TitleActivity["resume"]> {
  // TODO: implement
  const latest = getMockDb().watchHistory.find((row) => row.profileId === profileId && row.contentId === contentId);
  const item = latest && !isCompleted(latest.progressPercent) ? toHistoryItem(latest) : null;
  if (!item) return null;
  return {
    episodeId: item.episodeId,
    progressPercent: item.progressPercent,
    label: item.episode
      ? `Resume ${formatEpisodeCode(item.episode.seasonNumber, item.episode.episodeNumber)}`
      : `Resume · ${item.progressPercent}%`,
  };
}

/**
 * The episode that airs right after the given one, crossing into the next season; null after the finale.
 *
 * SQL:
 *   SELECT e.*
 *     FROM episode AS e JOIN season AS s ON s.season_id = e.season_id
 *    WHERE s.content_id = $1
 *      AND (s.season_number, e.episode_number) >
 *          (SELECT s0.season_number, e0.episode_number
 *             FROM episode AS e0 JOIN season AS s0 ON s0.season_id = e0.season_id
 *            WHERE e0.episode_id = $2)
 *    ORDER BY s.season_number, e.episode_number
 *    LIMIT 1;
 * Tables: episode, season  ·  Keys/constraints relied on: UNIQUE (content_id, season_number),
 *   UNIQUE (season_id, episode_number)
 * Transaction: no  ·  Idempotent: yes (read)
 * Edge cases: episodeId of another title → null (the row comparison finds nothing for this content).
 * Called by: getResumePoint
 * Mock today: returns null (the mock resume never needs it).
 */
export async function getNextEpisode(contentId: number, episodeId: number): Promise<Episode | null> {
  // TODO: implement
  void contentId;
  void episodeId;
  return null;
}
