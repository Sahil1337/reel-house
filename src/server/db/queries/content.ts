/** Shared reads that turn ids into the shapes cards and rows need. A fixed number of queries, whatever the id count. */
import "server-only";

import { eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { content, contentGenre, db, episode, genre, season } from "@/server/db";
import type { ContentSummary, Episode, Genre, MaturityLevel } from "@/types";

export type EpisodeWithSeason = Episode & { seasonNumber: number };

/** Content ids → ContentSummary (with genres). Unknown ids are simply missing from the map. */
export async function loadContentData(contentIds: number[]): Promise<Map<number, ContentSummary>> {
  if (contentIds.length === 0) return new Map();
  const [titles, genreRows] = await Promise.all([
    db
      .select({
        ...getTableColumns(content),
        maturityLevel: sql<MaturityLevel>`maturity_of(${content.ageRating})`, // derived, never stored
      })
      .from(content)
      .where(inArray(content.contentId, contentIds)),
    db
      .select({ contentId: contentGenre.contentId, genreId: genre.genreId, name: genre.name })
      .from(contentGenre)
      .innerJoin(genre, eq(genre.genreId, contentGenre.genreId))
      .where(inArray(contentGenre.contentId, contentIds))
      .orderBy(genre.name),
  ]);

  const genresByTitle = new Map<number, Genre[]>();
  for (const { contentId, genreId, name } of genreRows) {
    genresByTitle.set(contentId, [...(genresByTitle.get(contentId) ?? []), { genreId, name }]);
  }
  return new Map(
    titles.map((title) => [title.contentId, { ...title, genres: genresByTitle.get(title.contentId) ?? [] }]),
  );
}

/** Episode ids → Episode plus its season number (for "S1:E3" labels). Unknown ids are missing from the map. */
export async function loadEpisodeData(episodeIds: number[]): Promise<Map<number, EpisodeWithSeason>> {
  if (episodeIds.length === 0) return new Map();
  const rows = await db
    .select({ ...getTableColumns(episode), seasonNumber: season.seasonNumber })
    .from(episode)
    .innerJoin(season, eq(season.seasonId, episode.seasonId))
    .where(inArray(episode.episodeId, episodeIds));
  return new Map(rows.map((row) => [row.episodeId, row]));
}
