/**
 * Catalogue reads: search and browse, one title's full detail, the genre list and "More like this".
 *
 * Tables it reads: content, genre, content_genre, person, content_credit, season, episode — plus
 * watch_history (recent viewers, the tie-break for similar titles). Writes nothing; the catalogue is
 * written only by admin.service.importTitle.
 *
 * Maturity is never stored: every catalogue query that filters by profile uses the SQL function
 * maturity_of(c.age_rating) (docs/schema/SCHEMA.md), whose enum order is KIDS < TEEN < ADULT and which maps a
 * NULL certificate to TEEN. A null `maturityLevel` argument means "no profile selected, no filter".
 *
 * Exports:
 *   ContentSearch                                          the search filter (parsed by the route)
 *   searchContent(query)                                   GET /api/content
 *   getContentDetail(contentId)                            GET /api/content/:contentId
 *   listGenres()                                           GET /api/genres
 *   getSimilarTitles(contentId, maturityLevel, limit = 12) GET /api/content/:contentId/similar
 */
import "server-only";

import { sql } from "drizzle-orm";

import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import type {
  CastCredit,
  ContentDetail,
  ContentSummary,
  ContentType,
  Episode,
  Genre,
  MaturityLevel,
  Person,
  Season,
} from "@/types";

export interface ContentSearch {
  /** Trimmed free text; undefined/empty = browse. Matches title, or cast/director names. */
  q?: string;
  type?: ContentType;
  /** genre.genre_id */
  genreId?: number;
  /** 1–100, default 60. */
  limit: number;
  /** The selected profile's level; null = no maturity filter. */
  maturityLevel: MaturityLevel | null;
}

type GenreRow = {
  genre_id: number;
  name: string;
};

type ContentRow = {
  content_id: number;
  title: string;
  description: string;
  release_date: string | null;
  content_type: ContentType;
  duration_minutes: number | null;
  age_rating: string | null;
  maturity_level: MaturityLevel;
  poster_url: string | null;
  backdrop_url: string | null;
};

type ContentSummaryRow = ContentRow & {
  genres: Genre[] | string;
};

type CastRow = {
  person_id: number;
  name: string;
  date_of_birth: string | null;
  photo_url: string | null;
  character_name: string;
};

type DirectorRow = {
  person_id: number;
  name: string;
  date_of_birth: string | null;
  photo_url: string | null;
};

type SeasonRow = {
  season_id: number;
  content_id: number;
  season_number: number;
  name: string;
  release_date: string | null;
};

type EpisodeRow = {
  episode_id: number;
  season_id: number;
  episode_number: number;
  title: string;
  description: string;
  release_date: string | null;
  duration_minutes: number | null;
  still_url: string | null;
};

function parseGenres(genres: Genre[] | string | null | undefined): Genre[] {
  if (!genres) return [];
  if (Array.isArray(genres)) return genres;
  try {
    return JSON.parse(genres);
  } catch {
    return [];
  }
}

function mapSummary(row: ContentSummaryRow): ContentSummary {
  return {
    contentId: row.content_id,
    title: row.title,
    description: row.description,
    releaseDate: row.release_date,
    contentType: row.content_type,
    durationMinutes: row.duration_minutes,
    ageRating: row.age_rating,
    maturityLevel: row.maturity_level,
    posterUrl: row.poster_url,
    backdropUrl: row.backdrop_url,
    genres: parseGenres(row.genres),
  };
}

/**
 * Every genre, alphabetical (search filter, onboarding, genre pages).
 *
 * SQL:
 *   SELECT genre_id, name FROM genre ORDER BY name;
 */
export async function listGenres(): Promise<Genre[]> {
  const result = await db.execute<GenreRow>(sql`
    SELECT genre_id, name FROM genre ORDER BY name;
  `);
  return result.rows.map((row) => ({
    genreId: row.genre_id,
    name: row.name,
  }));
}

/**
 * One title with everything the title page and the player need: genres, billed cast with character
 * names, directors and, for series, every season with its episodes (seasons is [] for movies).
 *
 * SQL:
 *   SELECT content_id, title, description, release_date, content_type, duration_minutes, age_rating,
 *          maturity_of(age_rating) AS maturity_level, poster_url, backdrop_url
 *   FROM content WHERE content_id = $1;
 */
export async function getContentDetail(contentId: number): Promise<ContentDetail> {
  const contentResult = await db.execute<ContentRow>(sql`
    SELECT content_id, title, description, release_date, content_type, duration_minutes, age_rating,
           maturity_of(age_rating) AS maturity_level, poster_url, backdrop_url
    FROM content
    WHERE content_id = ${contentId};
  `);
  const content = contentResult.rows[0];
  if (!content) {
    throw new NotFoundError("Title not found.");
  }

  const isSeries = content.content_type === "SERIES";

  const [genresResult, castResult, directorsResult, seasonsResult] = await Promise.all([
    db.execute<GenreRow>(sql`
      SELECT g.genre_id, g.name
      FROM content_genre AS cg
      JOIN genre AS g ON g.genre_id = cg.genre_id
      WHERE cg.content_id = ${contentId}
      ORDER BY g.name;
    `),
    db.execute<CastRow>(sql`
      SELECT p.person_id, p.name, p.date_of_birth, p.photo_url, COALESCE(cc.character_name, '') AS character_name
      FROM content_credit AS cc
      JOIN person AS p ON p.person_id = cc.person_id
      WHERE cc.content_id = ${contentId} AND cc.role = 'ACTOR'
      ORDER BY cc.credit_order;
    `),
    db.execute<DirectorRow>(sql`
      SELECT p.person_id, p.name, p.date_of_birth, p.photo_url
      FROM content_credit AS cc
      JOIN person AS p ON p.person_id = cc.person_id
      WHERE cc.content_id = ${contentId} AND cc.role = 'DIRECTOR'
      ORDER BY cc.credit_order;
    `),
    isSeries
      ? db.execute<SeasonRow>(sql`
          SELECT season_id, content_id, season_number, name, release_date
          FROM season
          WHERE content_id = ${contentId} AND season_number > 0
          ORDER BY season_number;
        `)
      : Promise.resolve({ rows: [] as SeasonRow[] }),
  ]);

  const genres: Genre[] = genresResult.rows.map((row) => ({
    genreId: row.genre_id,
    name: row.name,
  }));

  const cast: CastCredit[] = castResult.rows.map((row) => ({
    person: {
      personId: row.person_id,
      name: row.name,
      dateOfBirth: row.date_of_birth,
      photoUrl: row.photo_url,
    },
    characterName: row.character_name,
  }));

  const directors: Person[] = directorsResult.rows.map((row) => ({
    personId: row.person_id,
    name: row.name,
    dateOfBirth: row.date_of_birth,
    photoUrl: row.photo_url,
  }));

  let seasons: Season[] = [];
  if (isSeries && seasonsResult.rows.length > 0) {
    const seasonIds = seasonsResult.rows.map((s) => s.season_id);
    const episodesResult = await db.execute<EpisodeRow>(sql`
      SELECT episode_id, season_id, episode_number, title, description, release_date, duration_minutes, still_url
      FROM episode
      WHERE season_id = ANY(${sql.param(seasonIds)})
      ORDER BY season_id, episode_number;
    `);

    const episodesBySeason = new Map<number, Episode[]>();
    for (const ep of episodesResult.rows) {
      const list = episodesBySeason.get(ep.season_id) ?? [];
      list.push({
        episodeId: ep.episode_id,
        seasonId: ep.season_id,
        episodeNumber: ep.episode_number,
        title: ep.title,
        description: ep.description,
        releaseDate: ep.release_date,
        durationMinutes: ep.duration_minutes,
        stillUrl: ep.still_url,
      });
      episodesBySeason.set(ep.season_id, list);
    }

    seasons = seasonsResult.rows.map((s) => ({
      seasonId: s.season_id,
      contentId: s.content_id,
      seasonNumber: s.season_number,
      name: s.name,
      releaseDate: s.release_date,
      episodes: episodesBySeason.get(s.season_id) ?? [],
    }));
  }

  return {
    contentId: content.content_id,
    title: content.title,
    description: content.description,
    releaseDate: content.release_date,
    contentType: content.content_type,
    durationMinutes: content.duration_minutes,
    ageRating: content.age_rating,
    maturityLevel: content.maturity_level,
    posterUrl: content.poster_url,
    backdropUrl: content.backdrop_url,
    genres,
    cast,
    directors,
    seasons,
  };
}

/**
 * Searches and browses the catalogue: filters by maturity / type / genre / text, ranks, and returns the
 * card shape (no cast, directors or seasons).
 *
 * SQL:
 *   WITH popularity AS (
 *     SELECT content_id, COUNT(DISTINCT profile_id) AS viewers
 *     FROM watch_history
 *     WHERE watched_at > now() - interval '30 days'
 *     GROUP BY content_id
 *   )
 *   SELECT c.content_id, c.title, c.description, c.release_date, c.content_type, c.duration_minutes,
 *          c.age_rating, maturity_of(c.age_rating) AS maturity_level, c.poster_url, c.backdrop_url,
 *          COALESCE((SELECT json_agg(json_build_object('genreId', g.genre_id, 'name', g.name) ORDER BY g.name)
 *                    FROM content_genre AS cg JOIN genre AS g ON g.genre_id = cg.genre_id
 *                    WHERE cg.content_id = c.content_id), '[]') AS genres
 *   FROM content AS c
 *   LEFT JOIN popularity AS pop ON pop.content_id = c.content_id
 *   WHERE ...
 */
export async function searchContent(query: ContentSearch): Promise<ContentSummary[]> {
  const escapedQ = query.q?.trim() ? query.q.trim().replace(/[\\%_]/g, "\\$&") : null;

  const result = await db.execute<ContentSummaryRow>(sql`
    WITH popularity AS (
      SELECT content_id, COUNT(DISTINCT profile_id) AS viewers
      FROM watch_history
      WHERE watched_at > now() - interval '30 days'
      GROUP BY content_id
    )
    SELECT c.content_id, c.title, c.description, c.release_date, c.content_type, c.duration_minutes,
           c.age_rating, maturity_of(c.age_rating) AS maturity_level, c.poster_url, c.backdrop_url,
           COALESCE((SELECT json_agg(json_build_object('genreId', g.genre_id, 'name', g.name) ORDER BY g.name)
                     FROM content_genre AS cg JOIN genre AS g ON g.genre_id = cg.genre_id
                     WHERE cg.content_id = c.content_id), '[]') AS genres
    FROM content AS c
    LEFT JOIN popularity AS pop ON pop.content_id = c.content_id
    WHERE (${query.maturityLevel ? sql`maturity_of(c.age_rating) <= ${query.maturityLevel}::maturity_level` : sql`true`})
      AND (${query.type ? sql`c.content_type = ${query.type}::content_type` : sql`true`})
      AND (${query.genreId ? sql`EXISTS (SELECT 1 FROM content_genre AS cg WHERE cg.content_id = c.content_id AND cg.genre_id = ${query.genreId})` : sql`true`})
      AND (${
        escapedQ
          ? sql`(
              unaccent(c.title) ILIKE '%' || unaccent(${escapedQ}) || '%'
              OR EXISTS (
                SELECT 1 FROM content_credit AS cc
                JOIN person AS p ON p.person_id = cc.person_id
                WHERE cc.content_id = c.content_id
                  AND unaccent(p.name) ILIKE '%' || unaccent(${escapedQ}) || '%'
              )
            )`
          : sql`true`
      })
    ORDER BY ${
      escapedQ
        ? sql`CASE
                WHEN unaccent(c.title) ILIKE unaccent(${escapedQ}) THEN 4
                WHEN unaccent(c.title) ILIKE unaccent(${escapedQ}) || '%' THEN 3
                WHEN unaccent(c.title) ILIKE '%' || unaccent(${escapedQ}) || '%' THEN 2
                ELSE 1
              END DESC,`
        : sql``
    }
             COALESCE(pop.viewers, 0) DESC,
             c.release_date DESC NULLS LAST
    LIMIT ${query.limit};
  `);

  return result.rows.map(mapSummary);
}

/**
 * "More like this": up to `limit` titles that share the most genres with this one. Never the title itself.
 * Ties break on 7-day distinct watch_history viewers, then release_date DESC.
 *
 * SQL:
 *   SELECT c.content_id, COUNT(*) AS shared_genres
 *     FROM content_genre AS a
 *     JOIN content_genre AS b ON b.genre_id = a.genre_id AND b.content_id <> a.content_id
 *     JOIN content AS c ON c.content_id = b.content_id
 *     LEFT JOIN (SELECT content_id, COUNT(DISTINCT profile_id) AS viewers
 *                  FROM watch_history
 *                 WHERE watched_at > now() - interval '7 days'
 *                 GROUP BY content_id) AS p ON p.content_id = c.content_id
 *    WHERE a.content_id = $1
 *      AND ($2::maturity_level IS NULL OR maturity_of(c.age_rating) <= $2)
 *    GROUP BY c.content_id, c.release_date, p.viewers
 *    ORDER BY shared_genres DESC, COALESCE(p.viewers, 0) DESC, c.release_date DESC NULLS LAST
 *    LIMIT $3;
 */
export async function getSimilarTitles(
  contentId: number,
  maturityLevel: MaturityLevel | null,
  limit = 12,
): Promise<ContentSummary[]> {
  const existsResult = await db.execute<{ content_id: number }>(sql`
    SELECT content_id FROM content WHERE content_id = ${contentId};
  `);
  if (!existsResult.rows[0]) {
    throw new NotFoundError("Title not found.");
  }

  const similarResult = await db.execute<{ content_id: number; shared_genres: number }>(sql`
    SELECT c.content_id, COUNT(*) AS shared_genres
    FROM content_genre AS a
    JOIN content_genre AS b ON b.genre_id = a.genre_id AND b.content_id <> a.content_id
    JOIN content AS c ON c.content_id = b.content_id
    LEFT JOIN (
      SELECT content_id, COUNT(DISTINCT profile_id) AS viewers
      FROM watch_history
      WHERE watched_at > now() - interval '7 days'
      GROUP BY content_id
    ) AS p ON p.content_id = c.content_id
    WHERE a.content_id = ${contentId}
      AND (${maturityLevel ? sql`maturity_of(c.age_rating) <= ${maturityLevel}::maturity_level` : sql`true`})
    GROUP BY c.content_id, c.release_date, p.viewers
    ORDER BY shared_genres DESC, COALESCE(p.viewers, 0) DESC, c.release_date DESC NULLS LAST
    LIMIT ${limit};
  `);

  if (similarResult.rows.length === 0) {
    return [];
  }

  const similarIds = similarResult.rows.map((r) => r.content_id);

  const hydratedResult = await db.execute<ContentSummaryRow>(sql`
    SELECT c.content_id, c.title, c.description, c.release_date, c.content_type, c.duration_minutes,
           c.age_rating, maturity_of(c.age_rating) AS maturity_level, c.poster_url, c.backdrop_url,
           COALESCE((SELECT json_agg(json_build_object('genreId', g.genre_id, 'name', g.name) ORDER BY g.name)
                     FROM content_genre AS cg JOIN genre AS g ON g.genre_id = cg.genre_id
                     WHERE cg.content_id = c.content_id), '[]') AS genres
    FROM content AS c
    WHERE c.content_id = ANY(${sql.param(similarIds)});
  `);

  const summaryMap = new Map<number, ContentSummary>();
  for (const row of hydratedResult.rows) {
    summaryMap.set(row.content_id, mapSummary(row));
  }

  // Preserve the ranked order from similarResult
  return similarIds.map((id) => summaryMap.get(id)!).filter(Boolean);
}
