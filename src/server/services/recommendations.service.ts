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

import { and, between, count, desc, eq, max, not, sql } from "drizzle-orm";
import { content, db, genre, genreTaste, myList, profileGenrePreference, rating, watchHistory } from "@/server/db";
import { loadEpisodeData, loadContentData } from "@/server/db/queries/content";
import type {
  GenreTaste,
  HomeExplanation,
  HomeFeed,
  HomeRow,
  MaturityLevel,
  PickExplanation,
  Profile,
  RowItem,
  TitleSignals,
  TopPick,
} from "@/types";

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

/** The genres this profile likes, strongest first, with where each score came from. */
export function getGenreTaste(profileId: number): Promise<GenreTaste[]> {
  return db
    .select({
      genreId: genreTaste.genreId,
      genre: genreTaste.genre,
      watchScore: genreTaste.watchScore,
      ratingScore: genreTaste.ratingScore,
      myListScore: genreTaste.myListScore,
      pickScore: genreTaste.pickScore,
      tasteScore: genreTaste.tasteScore,
    })
    .from(genreTaste)
    .where(eq(genreTaste.profileId, profileId))
    .orderBy(desc(genreTaste.tasteScore));
}

/** Titles this profile hasn't watched, rated or saved, best match first (optionally only one genre). */
export async function getTopPicks(profile: Profile, limit = ROW_SIZE, genreId?: number): Promise<TopPick[]> {
  // score = SUM(taste of the title's genres) / SQRT(number of genres it has)
  //   SUM alone: a title wins just by having many genres (6-genre series beat everything).
  //   AVG alone: extra genres you like don't help (Drama-only beats Drama + Sci-Fi).
  //   ÷ √n: every liked genre still adds to the score, but each extra one adds less.
  // A genre row keeps titles in that genre with EXISTS, not on the join: that would drop the title's other
  // genres from the score.
  const inGenre =
    genreId === undefined
      ? sql``
      : sql`AND EXISTS (SELECT 1 FROM content_genre WHERE content_id = c.content_id AND genre_id = ${genreId})`;

  const { rows } = await db.execute<TopPick>(sql`
    SELECT c.content_id AS "contentId",
           SUM(COALESCE(t.taste_score, 0)) / SQRT(COUNT(*)::numeric) AS score
    FROM content AS c
    JOIN content_genre AS cg ON cg.content_id = c.content_id      -- one row per (title, genre)
    LEFT JOIN genre_taste AS t ON t.genre_id = cg.genre_id        -- a genre with no taste counts as 0
                              AND t.profile_id = ${profile.profileId}
    WHERE maturity_of(c.age_rating) <= ${profile.maturityLevel}::maturity_level
      AND NOT EXISTS (SELECT 1 FROM watch_history AS w WHERE w.profile_id = ${profile.profileId} AND w.content_id = c.content_id)
      AND NOT EXISTS (SELECT 1 FROM rating        AS r WHERE r.profile_id = ${profile.profileId} AND r.content_id = c.content_id)
      AND NOT EXISTS (SELECT 1 FROM my_list       AS m WHERE m.profile_id = ${profile.profileId} AND m.content_id = c.content_id)
      ${inGenre}
    GROUP BY c.content_id, c.release_date
    ORDER BY score DESC, c.release_date DESC NULLS LAST            -- ties: newest first
    LIMIT ${limit}
  `);
  return rows;
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

/** Match %: the best pick is 99, others scale down towards 55; undefined when nothing scores above 0. */
function matchPercent(score: number, best: number): number | undefined {
  return best > 0 ? Math.round(55 + 44 * Math.min(1, score / best)) : undefined;
}

/** The Home page for one profile: hero + rows. */
export async function getHomeFeed(profile: Profile): Promise<HomeFeed> {
  const { profileId } = profile;
  // Independent queries run together; the genre rows need the taste result first.
  const [taste, picks, continueEntries] = await Promise.all([
    getGenreTaste(profileId),
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
  const [titles, episodes] = await Promise.all([
    loadContentData([...continueEntries.map((entry) => entry.contentId), ...shown]),
    loadEpisodeData(continueEntries.flatMap((entry) => (entry.episodeId === null ? [] : [entry.episodeId]))),
  ]);

  const best = picks[0]?.score ?? 0;
  const toItem = (pick: TopPick): RowItem[] => {
    const summary = titles.get(pick.contentId);
    if (!summary) return [];
    return [{ content: summary, match: matchPercent(pick.score, best) }];
  };

  const continueItems = continueEntries.flatMap((entry): RowItem[] => {
    const summary = titles.get(entry.contentId);
    if (!summary) return [];
    const episode = entry.episodeId === null ? null : (episodes.get(entry.episodeId) ?? null);
    return [{ content: summary, progress: { progressPercent: entry.progressPercent, episode } }];
  });

  // Where the taste came from picks the wording: real activity, only the onboarding picks, or nothing yet.
  const fromActivity = taste.some((genre) => genre.watchScore + genre.ratingScore + genre.myListScore > 0);
  const topReason =
    taste.length === 0 ? REASONS.topPicksNoSignals : fromActivity ? REASONS.topPicks : REASONS.topPicksPickedGenres;
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
      reason: fromActivity ? REASONS.genreWatched(genre.genre) : REASONS.genrePicked(genre.genre),
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
          reason: taste.length > 0 ? REASONS.heroPick(profile.name) : REASONS.heroPopular,
          match: hero.match,
        }
      : null,
    rows: rows.filter((row) => row.items.length > 0), // empty rows are left out
    generatedAt: new Date().toISOString(),
  };
}

/** Points for the best progress on a title; the same steps as the genre_taste view. */
function watchPoints(percent: number): number {
  if (percent < 10) return 0;
  if (percent < 30) return 0.25;
  if (percent < 50) return 0.5;
  if (percent < 80) return 0.75;
  return 1;
}

/** Everything behind the Home picks for one profile, in the order the pipeline runs (for the "Why these picks?" panel). */
export async function explainHomeFeed(profile: Profile): Promise<HomeExplanation> {
  const { profileId, maturityLevel } = profile;

  // Reuse the ranking code as is; only the raw signals and counts are read here.
  const [taste, topPicks, watched, rated, saved, pickRows, tooMature, catalogue] = await Promise.all([
    getGenreTaste(profileId),
    getTopPicks(profile, 10),
    db
      .select({ contentId: watchHistory.contentId, percent: max(watchHistory.progressPercent) })
      .from(watchHistory)
      .where(eq(watchHistory.profileId, profileId))
      .groupBy(watchHistory.contentId), // a series has one row per episode: keep the best
    db.select({ contentId: rating.contentId, stars: rating.value }).from(rating).where(eq(rating.profileId, profileId)),
    db.select({ contentId: myList.contentId }).from(myList).where(eq(myList.profileId, profileId)),
    db
      .select({ name: genre.name })
      .from(profileGenrePreference)
      .innerJoin(genre, eq(genre.genreId, profileGenrePreference.genreId))
      .where(eq(profileGenrePreference.profileId, profileId))
      .orderBy(genre.name),
    db
      .select({ n: count() })
      .from(content)
      .where(not(allowedFor(maturityLevel))),
    db.select({ n: count() }).from(content),
  ]);

  const titles = await loadContentData([
    ...watched.map((row) => row.contentId),
    ...rated.map((row) => row.contentId),
    ...saved.map((row) => row.contentId),
    ...topPicks.map((pick) => pick.contentId),
  ]);

  // Step 1: one entry per title, with the points each signal gives (to every genre of the title).
  const signalsById = new Map<number, TitleSignals>();
  const entry = (contentId: number): TitleSignals => {
    let signals = signalsById.get(contentId);
    if (!signals) {
      const summary = titles.get(contentId);
      signals = {
        contentId,
        title: summary?.title ?? `Title ${contentId}`,
        genres: summary?.genres.map((g) => g.name) ?? [],
        watched: null,
        rating: null,
        myList: null,
        totalPoints: 0,
      };
      signalsById.set(contentId, signals);
    }
    return signals;
  };
  for (const { contentId, percent } of watched) {
    entry(contentId).watched = { percent: percent ?? 0, points: watchPoints(percent ?? 0) };
  }
  for (const { contentId, stars } of rated) entry(contentId).rating = { stars, points: (stars - 3) / 2 };
  for (const { contentId } of saved) entry(contentId).myList = { points: 0.5 };
  const signals = [...signalsById.values()].map((s) => ({
    ...s,
    totalPoints: (s.watched?.points ?? 0) + (s.rating?.points ?? 0) + (s.myList?.points ?? 0),
  }));
  signals.sort((a, b) => b.totalPoints - a.totalPoints || a.title.localeCompare(b.title));

  // Step 3: redo the pick score by hand from the genre taste so every number can be shown.
  const tasteOf = new Map(taste.map((row) => [row.genreId, row.tasteScore]));
  const best = topPicks[0]?.score ?? 0;
  const explained = topPicks.map((pick): PickExplanation => {
    const summary = titles.get(pick.contentId);
    const genres = (summary?.genres ?? []).map((g) => ({
      genreId: g.genreId,
      name: g.name,
      taste: tasteOf.get(g.genreId) ?? 0,
    }));
    const sum = genres.reduce((total, g) => total + g.taste, 0);
    return {
      contentId: pick.contentId,
      title: summary?.title ?? `Title ${pick.contentId}`,
      releaseDate: summary?.releaseDate ?? null,
      genres,
      sum,
      genreCount: genres.length,
      sqrtN: Math.sqrt(genres.length),
      score: pick.score,
      match: matchPercent(pick.score, best),
    };
  });

  // Step 4: the funnel. Seen titles only leave the pool if this maturity level could see them anyway.
  const levels: MaturityLevel[] = ["KIDS", "TEEN", "ADULT"];
  const seenAllowed = [...signalsById.keys()].filter((id) => {
    const level = titles.get(id)?.maturityLevel;
    return level !== undefined && levels.indexOf(level) <= levels.indexOf(maturityLevel);
  }).length;
  const total = catalogue[0]?.n ?? 0;
  const hidden = tooMature[0]?.n ?? 0;

  return {
    signals,
    picks: pickRows.map((row) => row.name),
    taste,
    topPicks: explained,
    filters: {
      catalogue: total,
      candidates: total - hidden - seenAllowed, // every title has a genre, so all of these get a score
      maturityLevel,
      tooMature: hidden,
      watched: watched.length,
      rated: rated.length,
      saved: saved.length,
    },
  };
}
