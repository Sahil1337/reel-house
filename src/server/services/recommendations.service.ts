/**
 * Recommendations: the personalised Home page.
 *
 * Genre taste: the genre_taste view scores how much a profile likes each genre
 *   (drizzle/0001_genre_taste_view.sql). Titles are ranked from those genre scores.
 * Cold start: onboarding makes every profile pick 3+ genres, so a new profile already has a taste.
 * Home rows: continue-watching, top-picks (+ hero = first pick), and one row each for the 2 best genres.
 *
 * Build guide and expected results: plans/activity-recommendations/plan.md.
 */
import "server-only";

import { alias } from "drizzle-orm/pg-core";
import { and, between, desc, eq, exists, notExists, sql } from "drizzle-orm";
import {
  content,
  contentGenre,
  db,
  genreTaste,
  myList,
  profile as profileTable,
  profileGenrePreference,
  rating,
  watchHistory,
} from "@/server/db";
import { loadEpisodeData, loadContentData } from "@/server/db/queries/content";
import type { GenreTaste, HomeFeed, HomeRow, MaturityLevel, Profile, RowItem, TopPick } from "@/types";

/** Items per row. */
export const ROW_SIZE = 18;

/** Why each row is shown, displayed under its title. */
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

/** Titles this maturity level may see. */
function allowedFor(level: MaturityLevel) {
  return sql`maturity_of(${content.ageRating}) <= ${level}::maturity_level`;
}

/** The profile never watched, rated or saved the title. */
function unseenBy(profileId: number) {
  const one = { one: sql`1` };
  return and(
    notExists(
      db
        .select(one)
        .from(watchHistory)
        .where(and(eq(watchHistory.profileId, profileId), eq(watchHistory.contentId, content.contentId))),
    ),
    notExists(
      db
        .select(one)
        .from(rating)
        .where(and(eq(rating.profileId, profileId), eq(rating.contentId, content.contentId))),
    ),
    notExists(
      db
        .select(one)
        .from(myList)
        .where(and(eq(myList.profileId, profileId), eq(myList.contentId, content.contentId))),
    ),
  );
}

/** The genres this profile likes, strongest first. */
export function getGenreTaste(profileId: number): Promise<GenreTaste[]> {
  return db
    .select({ genreId: genreTaste.genreId, genre: genreTaste.genre, tasteScore: genreTaste.tasteScore })
    .from(genreTaste)
    .where(eq(genreTaste.profileId, profileId))
    .orderBy(desc(genreTaste.tasteScore));
}

/** Does the profile have any activity, and any onboarding genre picks? Chooses the reason wording. */
async function getSignalFlags(profileId: number): Promise<{ hasSignals: boolean; hasPicks: boolean }> {
  const one = { one: sql`1` };
  const [flags] = await db
    .select({
      hasSignals: sql<boolean>`${exists(db.select(one).from(watchHistory).where(eq(watchHistory.profileId, profileId)))}
        OR ${exists(db.select(one).from(rating).where(eq(rating.profileId, profileId)))}
        OR ${exists(db.select(one).from(myList).where(eq(myList.profileId, profileId)))}`,
      hasPicks: sql<boolean>`${exists(db.select(one).from(profileGenrePreference).where(eq(profileGenrePreference.profileId, profileId)))}`,
    })
    .from(profileTable)
    .where(eq(profileTable.profileId, profileId));
  return flags ?? { hasSignals: false, hasPicks: false };
}

/** Titles this profile hasn't watched, rated or saved, best match first (optionally only one genre). */
export async function getTopPicks(profile: Profile, limit = ROW_SIZE, genreId?: number): Promise<TopPick[]> {
  // score = SUM(taste of the title's genres) / SQRT(number of genres it has)
  //   SUM alone: a title wins just by having many genres (6-genre series beat everything).
  //   AVG alone: extra genres you like don't help (Drama-only beats Drama + Sci-Fi).
  //   ÷ √n: every liked genre still adds to the score, but each extra one adds less.
  const score = sql<number>`SUM(COALESCE(${genreTaste.tasteScore}, 0)) / SQRT(COUNT(*)::numeric)`;

  // A genre row filters with EXISTS, not on the join: that would drop the title's other genres from the score.
  const inGenre = alias(contentGenre, "in_genre");
  const genreFilter =
    genreId === undefined
      ? undefined
      : exists(
          db
            .select({ one: sql`1` })
            .from(inGenre)
            .where(and(eq(inGenre.contentId, content.contentId), eq(inGenre.genreId, genreId))),
        );

  return db
    .select({ contentId: content.contentId, score })
    .from(content)
    .innerJoin(contentGenre, eq(contentGenre.contentId, content.contentId)) // one row per (title, genre)
    .leftJoin(
      genreTaste, // a genre with no taste counts as 0
      and(eq(genreTaste.genreId, contentGenre.genreId), eq(genreTaste.profileId, profile.profileId)),
    )
    .where(and(allowedFor(profile.maturityLevel), unseenBy(profile.profileId), genreFilter))
    .groupBy(content.contentId, content.releaseDate)
    .orderBy(desc(score), sql`${content.releaseDate} DESC NULLS LAST`) // ties: newest first
    .limit(limit);
}

/** Latest history row per title (1-89% watched), newest first. Episodes are hydrated by the caller. */
async function getContinueWatching(profile: Profile) {
  // DISTINCT ON keeps one row per title (a series has one row per episode); then re-sort by time.
  const latest = db
    .selectDistinctOn([watchHistory.contentId], {
      contentId: watchHistory.contentId,
      episodeId: watchHistory.episodeId,
      progressPercent: watchHistory.progressPercent,
      watchedAt: watchHistory.watchedAt,
    })
    .from(watchHistory)
    .where(eq(watchHistory.profileId, profile.profileId))
    .orderBy(watchHistory.contentId, desc(watchHistory.watchedAt))
    .as("latest");

  return db
    .select({ contentId: latest.contentId, episodeId: latest.episodeId, progressPercent: latest.progressPercent })
    .from(latest)
    .innerJoin(content, eq(content.contentId, latest.contentId))
    .where(and(between(latest.progressPercent, 1, 89), allowedFor(profile.maturityLevel)))
    .orderBy(desc(latest.watchedAt))
    .limit(ROW_SIZE);
}

/** The Home page for one profile: hero + rows. */
export async function getHomeFeed(profile: Profile): Promise<HomeFeed> {
  const { profileId } = profile;
  // Independent queries run together; the genre rows need the taste result first.
  const [taste, flags, picks, continueEntries] = await Promise.all([
    getGenreTaste(profileId),
    getSignalFlags(profileId),
    getTopPicks(profile),
    getContinueWatching(profile),
  ]);
  const topGenres = taste.slice(0, 2);
  // Fetch extra: titles already in top picks / the first genre row are skipped below.
  const genreCandidates = await Promise.all(
    topGenres.map((genre) => getTopPicks(profile, ROW_SIZE * 4, genre.genreId)),
  );

  // A title appears in at most one of top picks / genre rows.
  const shown = new Set(picks.map((pick) => pick.contentId));
  const genreRows = genreCandidates.map((candidates) => {
    const fresh = candidates.filter((pick) => !shown.has(pick.contentId)).slice(0, ROW_SIZE);
    fresh.forEach((pick) => shown.add(pick.contentId));
    return fresh;
  });

  // One round of queries for all cards and all continue-watching episodes.
  const [summaries, episodes] = await Promise.all([
    loadContentData([...continueEntries.map((entry) => entry.contentId), ...shown]),
    loadEpisodeData(continueEntries.flatMap((entry) => (entry.episodeId === null ? [] : [entry.episodeId]))),
  ]);

  // Match %: the best pick is 99, others scale down towards 55; no chip when there is no taste at all.
  const best = picks[0]?.score ?? 0;
  const toItem = (pick: TopPick): RowItem[] => {
    const summary = summaries.get(pick.contentId);
    if (!summary) return [];
    return [{ content: summary, match: best > 0 ? Math.round(55 + 44 * Math.min(1, pick.score / best)) : undefined }];
  };

  const continueItems = continueEntries.flatMap((entry): RowItem[] => {
    const summary = summaries.get(entry.contentId);
    if (!summary) return [];
    const episode = entry.episodeId === null ? null : (episodes.get(entry.episodeId) ?? null);
    return [{ content: summary, progress: { progressPercent: entry.progressPercent, episode } }];
  });

  const topReason = flags.hasSignals
    ? REASONS.topPicks
    : flags.hasPicks
      ? REASONS.topPicksPickedGenres
      : REASONS.topPicksNoSignals;
  const rows: HomeRow[] = [
    {
      id: "continue-watching",
      kind: "continue-watching",
      title: `Continue watching for ${profile.name}`,
      reason: REASONS.continueWatching,
      items: continueItems,
    },
    {
      id: "top-picks",
      kind: "top-picks",
      title: `Top picks for ${profile.name}`,
      reason: topReason,
      items: picks.flatMap(toItem),
    },
    ...topGenres.map((genre, index): HomeRow => ({
      id: `genre-picks-${genre.genreId}`,
      kind: "genre-picks",
      title: `${genre.genre} for you`,
      reason: flags.hasSignals ? REASONS.genreWatched(genre.genre) : REASONS.genrePicked(genre.genre),
      items: genreRows[index].flatMap(toItem),
    })),
  ];

  // Hero = the first top pick (it also stays first in the top-picks row).
  const [hero] = picks.length > 0 ? toItem(picks[0]) : [];
  return {
    profileId,
    hero: hero
      ? {
          content: hero.content,
          reason: flags.hasSignals || flags.hasPicks ? REASONS.heroPick(profile.name) : REASONS.heroPopular,
          match: hero.match,
        }
      : null,
    rows: rows.filter((row) => row.items.length > 0), // empty rows are left out
    generatedAt: new Date().toISOString(),
  };
}
