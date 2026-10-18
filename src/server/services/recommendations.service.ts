/**
 * Recommendations: the personalised Home page.
 *
 * Genre taste: the genre_taste view scores how much a profile likes each genre
 *   (drizzle/0001_genre_taste_view.sql). Titles are ranked from those genre scores.
 * Cold start: onboarding makes every profile pick 3+ genres, so a new profile already has a taste.
 *
 * Build guide and expected results: plans/activity-recommendations/plan.md.
 */
import "server-only";

import { sql } from "drizzle-orm";
import { db } from "@/server/db";
import { getMockDb, toHistoryItem, toSummary } from "@/server/mocks/db";
import { isAllowedFor } from "@/lib/content/maturity";
import { isCompleted } from "@/lib/content/progress";
import type { GenreTaste, HomeFeed, HomeRow, Profile, TopPick } from "@/types";

/** Items per row. */
export const ROW_SIZE = 18;

/** Why each row is shown, displayed under its title. */
const REASONS = {
  continueWatching: "Pick up where you left off.",
  topPicks: "Based on the genres you watch, rate and save.",
  genreWatched: (genre: string) => `You watch a lot of ${genre}.`,
  heroPick: (name: string) => `Our top pick for ${name} tonight`,
};

/** The genres this profile likes, strongest first. */
export async function getGenreTaste(profileId: number): Promise<GenreTaste[]> {
  const { rows } = await db.execute<{ genre_id: number; genre: string; taste_score: number }>(sql`
    SELECT genre_id, genre, taste_score
    FROM genre_taste
    WHERE profile_id = ${profileId}
    ORDER BY taste_score DESC
  `);
  return rows.map((row) => ({ genreId: row.genre_id, genre: row.genre, tasteScore: row.taste_score }));
}

/** Titles this profile hasn't watched, rated or saved, best match first. */
export async function getTopPicks(profile: Profile, limit = ROW_SIZE): Promise<TopPick[]> {
  // score = SUM(taste of the title's genres) / SQRT(number of genres it has)
  //   SUM alone: a title wins just by having many genres (6-genre series beat everything).
  //   AVG alone: extra genres you like don't help (Drama-only beats Drama + Sci-Fi).
  //   ÷ √n: every liked genre still adds to the score, but each extra one adds less.
  const { rows } = await db.execute<{ content_id: number; score: number }>(sql`
    SELECT c.content_id,
           SUM(COALESCE(t.taste_score, 0)) / SQRT(COUNT(*)::numeric) AS score
    FROM content AS c
    JOIN content_genre AS cg ON cg.content_id = c.content_id  -- one row per (title, genre)
    LEFT JOIN genre_taste AS t ON t.genre_id = cg.genre_id    -- a genre with no taste counts as 0
                              AND t.profile_id = ${profile.profileId}
    WHERE maturity_of(c.age_rating) <= ${profile.maturityLevel}::maturity_level
      AND NOT EXISTS (SELECT 1 FROM watch_history AS w WHERE w.profile_id = ${profile.profileId} AND w.content_id = c.content_id)
      AND NOT EXISTS (SELECT 1 FROM rating        AS r WHERE r.profile_id = ${profile.profileId} AND r.content_id = c.content_id)
      AND NOT EXISTS (SELECT 1 FROM my_list       AS m WHERE m.profile_id = ${profile.profileId} AND m.content_id = c.content_id)
    GROUP BY c.content_id, c.release_date
    ORDER BY score DESC, c.release_date DESC NULLS LAST                -- ties: newest first
    LIMIT ${limit}
  `);
  return rows.map((row) => ({ contentId: row.content_id, score: row.score }));
}

/** The Home page for one profile: hero + rows. */
export async function getHomeFeed(profile: Profile): Promise<HomeFeed> {
  // TODO: build the rows from getTopPicks etc. (plan step B8). Mock slices of the catalogue until then.
  const { contents: catalogue, watchHistory, genres } = getMockDb();
  const contents = catalogue.filter((content) => isAllowedFor(profile.maturityLevel, content.maturityLevel));
  const slice = (start: number) =>
    contents.slice(start, start + ROW_SIZE).map((content) => ({ content: toSummary(content) }));

  const history = watchHistory
    .filter((row) => row.profileId === profile.profileId)
    .map(toHistoryItem)
    .filter((item) => isAllowedFor(profile.maturityLevel, item.content.maturityLevel));
  const rows: HomeRow[] = [
    {
      id: "continue-watching",
      kind: "continue-watching",
      title: `Continue watching for ${profile.name}`,
      reason: REASONS.continueWatching,
      items: history
        .filter((item) => !isCompleted(item.progressPercent))
        .map((item) => ({
          content: item.content,
          progress: { progressPercent: item.progressPercent, episode: item.episode },
        })),
    },
    {
      id: "top-picks",
      kind: "top-picks",
      title: `Top picks for ${profile.name}`,
      reason: REASONS.topPicks,
      items: slice(0),
    },
    ...genres.slice(0, 2).map((genre, index) => ({
      id: `genre-picks-${genre.genreId}`,
      kind: "genre-picks" as const,
      title: `${genre.name} for you`,
      reason: REASONS.genreWatched(genre.name),
      items: slice(ROW_SIZE * (index + 1)),
    })),
  ];

  return {
    profileId: profile.profileId,
    hero: { content: toSummary(contents[0]), reason: REASONS.heroPick(profile.name) },
    rows,
    generatedAt: new Date().toISOString(),
  };
}
