/**
 * Viewing activity: what a profile has watched, saved and rated (tables watch_history, my_list, rating).
 * "Completed" is not a column: a history row is completed when progress_percent >= 90 (isCompleted).
 * Routes check profile ownership first, so `profileId` here is always the signed-in user's profile.
 *
 * Build guide and expected results: docs/backend/person-c-activity-recommendations.md section 4.
 */
import "server-only";

import { and, desc, eq, getTableColumns, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { content, db, episode, myList, rating, season, watchHistory } from "@/server/db";
import { loadEpisodeData, loadContentData, type EpisodeWithSeason } from "@/server/db/queries/content";
import { NotFoundError, ValidationError } from "@/server/errors";
import { formatEpisodeCode } from "@/lib/format";
import { isCompleted } from "@/lib/content/progress";
import type { Episode, HistoryItem, MyListItem, ProgressInput, Rating, TitleActivity, WatchHistory } from "@/types";

/** True for Postgres foreign_key_violation (23503), which Drizzle wraps in `cause`. */
function isForeignKeyViolation(error: unknown): boolean {
  return (error as { cause?: { code?: string } }).cause?.code === "23503";
}

/** Saves how far a profile got in a title or episode (the player calls this very often). */
export async function recordProgress(profileId: number, input: ProgressInput): Promise<WatchHistory> {
  const percent = Math.min(100, Math.max(0, Math.round(input.progressPercent)));

  const [title] = await db
    .select({ contentType: content.contentType })
    .from(content)
    .where(eq(content.contentId, input.contentId));
  if (!title) throw new NotFoundError("Title not found.");

  // Movies always store episode_id = NULL; a series needs an episode that belongs to this title.
  let episodeId: number | null = null;
  if (title.contentType === "SERIES") {
    if (input.episodeId === null) throw new ValidationError("Pick an episode to record progress for.");
    // The schema can't declare "episode belongs to this title", so check it here.
    const owned = await db
      .select({ episodeId: episode.episodeId })
      .from(episode)
      .innerJoin(season, eq(season.seasonId, episode.seasonId))
      .where(and(eq(episode.episodeId, input.episodeId), eq(season.contentId, input.contentId)));
    if (owned.length === 0) throw new ValidationError("That episode doesn't belong to this title.");
    episodeId = input.episodeId;
  }

  // The unique key is NULLS NOT DISTINCT, so a movie's NULL episode still conflicts with itself
  // (otherwise every save would add a new row). Re-watching just bumps watched_at.
  const [row] = await db
    .insert(watchHistory)
    .values({ profileId, contentId: input.contentId, episodeId, progressPercent: percent })
    .onConflictDoUpdate({
      target: [watchHistory.profileId, watchHistory.contentId, watchHistory.episodeId],
      set: { progressPercent: percent, watchedAt: sql`now()` },
    })
    .returning();
  return { ...row, watchedAt: row.watchedAt.toISOString() };
}

/** The History page: everything the profile watched, newest first. */
export async function listHistory(profileId: number): Promise<HistoryItem[]> {
  const rows = await db
    .select()
    .from(watchHistory)
    .where(eq(watchHistory.profileId, profileId))
    .orderBy(desc(watchHistory.watchedAt));

  // Hydrate titles and episodes with one query each, then stitch them on in the order above.
  const episodeIds = rows.flatMap((row) => (row.episodeId === null ? [] : [row.episodeId]));
  const [summaries, episodes] = await Promise.all([
    loadContentData(rows.map((row) => row.contentId)),
    loadEpisodeData(episodeIds),
  ]);

  return rows.flatMap((row) => {
    const summary = summaries.get(row.contentId);
    if (!summary) return [];
    return [
      {
        ...row,
        watchedAt: row.watchedAt.toISOString(),
        content: summary,
        episode: row.episodeId === null ? null : (episodes.get(row.episodeId) ?? null),
      },
    ];
  });
}

/** Removes one History entry; the profile_id predicate stops one profile deleting another's rows. */
export async function removeHistoryEntry(profileId: number, historyId: number): Promise<void> {
  const deleted = await db
    .delete(watchHistory)
    .where(and(eq(watchHistory.historyId, historyId), eq(watchHistory.profileId, profileId)))
    .returning({ historyId: watchHistory.historyId });
  if (deleted.length === 0) throw new NotFoundError("History entry not found.");
}

/** The My List page: saved titles, most recently added first. */
export async function listMyList(profileId: number): Promise<MyListItem[]> {
  const rows = await db
    .select({ contentId: myList.contentId, addedAt: myList.addedAt })
    .from(myList)
    .where(eq(myList.profileId, profileId))
    .orderBy(desc(myList.addedAt));
  const summaries = await loadContentData(rows.map((row) => row.contentId));
  return rows.flatMap((row) => {
    const summary = summaries.get(row.contentId);
    return summary ? [{ ...summary, addedAt: row.addedAt.toISOString() }] : [];
  });
}

/** Saves a title for later; adding it twice is a no-op. */
export async function addToMyList(profileId: number, contentId: number): Promise<void> {
  try {
    await db.insert(myList).values({ profileId, contentId }).onConflictDoNothing();
  } catch (error) {
    // An unknown content_id breaks the foreign key.
    if (isForeignKeyViolation(error)) throw new NotFoundError("Title not found.");
    throw error;
  }
}

/** Takes a title off My List (fine if it wasn't there). */
export async function removeFromMyList(profileId: number, contentId: number): Promise<void> {
  await db.delete(myList).where(and(eq(myList.profileId, profileId), eq(myList.contentId, contentId)));
}

/** Rates a title 1-5 stars; re-rating replaces the old value. */
export async function rateTitle(profileId: number, contentId: number, value: number): Promise<Rating> {
  try {
    const [row] = await db
      .insert(rating)
      .values({ profileId, contentId, value })
      .onConflictDoUpdate({
        target: [rating.profileId, rating.contentId],
        set: { value, ratedAt: sql`now()` },
      })
      .returning();
    return { ...row, ratedAt: row.ratedAt.toISOString() };
  } catch (error) {
    if (isForeignKeyViolation(error)) throw new NotFoundError("Title not found.");
    throw error;
  }
}

/** Clears a rating (fine if there wasn't one). */
export async function removeRating(profileId: number, contentId: number): Promise<void> {
  await db.delete(rating).where(and(eq(rating.profileId, profileId), eq(rating.contentId, contentId)));
}

/** What this profile did with one title: My List state, star rating and where Play should start. */
export async function getTitleActivity(profileId: number, contentId: number): Promise<TitleActivity> {
  const found = await db.select({ contentId: content.contentId }).from(content).where(eq(content.contentId, contentId));
  if (found.length === 0) throw new NotFoundError("Title not found.");

  const [inMyList, stars, resume] = await Promise.all([
    isInMyList(profileId, contentId),
    getRating(profileId, contentId),
    getResumePoint(profileId, contentId),
  ]);
  return { inMyList, rating: stars, resume };
}

/** Whether the title is on the profile's My List. */
export async function isInMyList(profileId: number, contentId: number): Promise<boolean> {
  const rows = await db
    .select({ contentId: myList.contentId })
    .from(myList)
    .where(and(eq(myList.profileId, profileId), eq(myList.contentId, contentId)));
  return rows.length > 0;
}

/** The profile's 1-5 rating of the title, or null. */
export async function getRating(profileId: number, contentId: number): Promise<number | null> {
  const [row] = await db
    .select({ value: rating.value })
    .from(rating)
    .where(and(eq(rating.profileId, profileId), eq(rating.contentId, contentId)));
  return row?.value ?? null;
}

/** Where Play should start: resume the latest unfinished item, or move on to the next episode. */
export async function getResumePoint(profileId: number, contentId: number): Promise<TitleActivity["resume"]> {
  // "Latest" is by watched_at, not by episode order.
  const [latest] = await db
    .select({
      episodeId: watchHistory.episodeId,
      progressPercent: watchHistory.progressPercent,
      seasonNumber: season.seasonNumber,
      episodeNumber: episode.episodeNumber,
    })
    .from(watchHistory)
    .leftJoin(episode, eq(episode.episodeId, watchHistory.episodeId))
    .leftJoin(season, eq(season.seasonId, episode.seasonId))
    .where(and(eq(watchHistory.profileId, profileId), eq(watchHistory.contentId, contentId)))
    .orderBy(desc(watchHistory.watchedAt))
    .limit(1);
  if (!latest) return null;

  const { episodeId, progressPercent, seasonNumber, episodeNumber } = latest;
  const unfinished = !isCompleted(progressPercent);

  if (episodeId === null || seasonNumber === null || episodeNumber === null) {
    // Movie: resume if unfinished, otherwise Play starts over.
    return unfinished ? { episodeId: null, progressPercent, label: `Resume · ${progressPercent}%` } : null;
  }
  if (unfinished) {
    return { episodeId, progressPercent, label: `Resume ${formatEpisodeCode(seasonNumber, episodeNumber)}` };
  }
  // Finished an episode: offer the next one from 0%, or nothing after the finale.
  const next = await findNextEpisode(contentId, episodeId);
  if (!next) return null;
  return {
    episodeId: next.episodeId,
    progressPercent: 0,
    label: `Play ${formatEpisodeCode(next.seasonNumber, next.episodeNumber)}`,
  };
}

/** The episode right after the given one (crossing into the next season), or null after the finale. */
export async function getNextEpisode(contentId: number, episodeId: number): Promise<Episode | null> {
  return findNextEpisode(contentId, episodeId);
}

/** Same as getNextEpisode but keeps the season number, which the "Play S1:E4" label needs. */
async function findNextEpisode(contentId: number, episodeId: number): Promise<EpisodeWithSeason | null> {
  const current = { episode: alias(episode, "current_episode"), season: alias(season, "current_season") };
  const currentPosition = db
    .select({ seasonNumber: current.season.seasonNumber, episodeNumber: current.episode.episodeNumber })
    .from(current.episode)
    .innerJoin(current.season, eq(current.season.seasonId, current.episode.seasonId))
    .where(eq(current.episode.episodeId, episodeId));

  // Comparing (season, episode) as a pair walks across season boundaries in one query.
  const [next] = await db
    .select({ ...getTableColumns(episode), seasonNumber: season.seasonNumber })
    .from(episode)
    .innerJoin(season, eq(season.seasonId, episode.seasonId))
    .where(
      and(
        eq(season.contentId, contentId),
        sql`(${season.seasonNumber}, ${episode.episodeNumber}) > ${currentPosition}`,
      ),
    )
    .orderBy(season.seasonNumber, episode.episodeNumber)
    .limit(1);
  return next ?? null;
}
