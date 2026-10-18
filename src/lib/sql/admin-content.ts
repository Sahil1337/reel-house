/**
 * The SQL behind the admin content table and its remove / edit dialogs, generated for DISPLAY (nothing
 * here touches a database). Each builder mirrors the statement specified in
 * src/server/services/admin-content.service.ts; keep the two in step.
 *
 * Names follow the README's "SQL naming" section: snake_case of the src/types fields.
 */
import { ADMIN_PAGE_SIZE } from "@/lib/validation/admin";
import type { AdminContentFilters, ContentDeletionImpact, SqlParam, SqlStatement, UpdateContentInput } from "@/types";

import { statement } from "./literal";

/** Escapes LIKE wildcards so a search for "100%" or "a_b" matches those characters literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

const GENRES_SUBQUERY = `COALESCE((
    SELECT json_agg(json_build_object('genreId', g.genre_id, 'name', g.name) ORDER BY g.name)
    FROM content_genre AS cg
    JOIN genre AS g ON g.genre_id = cg.genre_id
    WHERE cg.content_id = c.content_id
  ), '[]') AS genres`;

/** WHERE terms for the filters that are set; $n numbering starts at 1. */
function whereClause(filters: AdminContentFilters): { text: string; params: SqlParam[] } {
  const terms: string[] = [];
  const params: SqlParam[] = [];
  const q = filters.q?.trim();
  if (q) {
    params.push(`%${escapeLike(q)}%`);
    terms.push(`c.title ILIKE $${params.length} ESCAPE '\\'`);
  }
  if (filters.type) {
    params.push(filters.type);
    terms.push(`c.content_type = $${params.length}`);
  }
  if (filters.genre) {
    params.push(filters.genre);
    terms.push(
      `EXISTS (\n    SELECT 1 FROM content_genre AS cg\n    WHERE cg.content_id = c.content_id AND cg.genre_id = $${params.length}\n  )`,
    );
  }
  return { text: terms.length ? `WHERE ${terms.join("\n  AND ")}` : "", params };
}

/** The two queries the content table runs for these filters: the page of rows, and the total for the pager. */
export function buildListContentSql(filters: AdminContentFilters): SqlStatement[] {
  const pageSize = filters.pageSize ?? ADMIN_PAGE_SIZE;
  const page = Math.max(1, filters.page ?? 1);
  const where = whereClause(filters);
  const limitPlaceholder = where.params.length + 1;

  const rows = statement({
    step: 1,
    title: "Fetch this page of titles",
    explanation:
      "Genres, season and episode counts come from correlated subqueries, which run only for the rows that " +
      "survive LIMIT; joining content_genre, season and episode instead would multiply rows before they " +
      "could be counted. The ILIKE term escapes % and _ so they match literally. ORDER BY title, content_id " +
      "gives a stable page order.",
    sql: `SELECT
  c.content_id, c.title, c.content_type, c.release_date, c.age_rating, c.poster_url,
  ${GENRES_SUBQUERY},
  CASE WHEN c.content_type = 'SERIES'
       THEN (SELECT COUNT(*) FROM season AS s WHERE s.content_id = c.content_id) END AS season_count,
  CASE WHEN c.content_type = 'SERIES'
       THEN (SELECT COUNT(*) FROM episode AS e
             JOIN season AS s ON s.season_id = e.season_id
             WHERE s.content_id = c.content_id) END AS episode_count
FROM content AS c
${where.text ? `${where.text}\n` : ""}ORDER BY c.title, c.content_id
LIMIT $${limitPlaceholder} OFFSET $${limitPlaceholder + 1};`,
    params: [...where.params, pageSize, (page - 1) * pageSize],
    table: "content",
    rowCount: 0,
  });

  const count = statement({
    step: 2,
    title: "Count all matching titles",
    explanation:
      "The same WHERE without LIMIT, so the pager knows how many pages there are. Read-only; no transaction is " +
      "needed because a count that is one row off under concurrent writes is harmless.",
    sql: `SELECT COUNT(*) AS total
FROM content AS c${where.text ? `\n${where.text}` : ""};`,
    params: where.params,
    table: "content",
    rowCount: 0,
  });

  return [rows, count];
}

/** The DELETE the remove dialog confirms. */
export function buildDeleteContentSql(contentId: number, title: string): SqlStatement[] {
  return [
    statement({
      step: 1,
      title: `Delete "${title}"`,
      explanation:
        "One statement is atomic: the content row and every row below it in the cascade chain go together, or " +
        "none do. The child tables reference content with ON DELETE CASCADE (episodes through season), so no " +
        "separate deletes are needed. Person and genre rows are shared and stay.",
      sql: "DELETE FROM content WHERE content_id = $1;",
      params: [contentId],
      table: "content",
      rowCount: 1,
    }),
  ];
}

/** Editable column for each UpdateContentInput field, in the order the SET list is written. */
const UPDATE_COLUMNS = [
  ["title", "title"],
  ["description", "description"],
  ["releaseDate", "release_date"],
  ["ageRating", "age_rating"],
  ["posterUrl", "poster_url"],
  ["backdropUrl", "backdrop_url"],
] as const satisfies readonly (readonly [keyof UpdateContentInput, string])[];

/** The UPDATE the edit dialog runs: only the fields that changed. Empty when nothing changed. */
export function buildUpdateContentSql(contentId: number, changes: UpdateContentInput): SqlStatement[] {
  const assignments: string[] = [];
  const params: SqlParam[] = [];
  for (const [field, column] of UPDATE_COLUMNS) {
    const value = changes[field];
    if (value === undefined) continue;
    params.push(value);
    assignments.push(`${column} = $${params.length}`);
  }
  if (!assignments.length) return [];

  params.push(contentId);
  const touchesKey = "title" in changes || "releaseDate" in changes;
  return [
    statement({
      step: 1,
      title: "Update the changed columns",
      explanation:
        "The SET list is built from the fields that changed, never from request keys. The UNIQUE NULLS NOT " +
        "DISTINCT (title, content_type, release_date) key rejects a rename or re-date that collides with " +
        "another title (409). The row is then read back with its genres and season counts." +
        (touchesKey
          ? " Changing the title or release date also means a later TMDB import of the original title adds a new row."
          : ""),
      sql: `UPDATE content
SET ${assignments.join(",\n    ")}
WHERE content_id = $${params.length}
RETURNING content_id;`,
      params,
      table: "content",
      rowCount: 1,
    }),
  ];
}

/** One child table of content and how its rows go when a title is deleted. */
export interface CascadeRule {
  table: keyof ContentDeletionImpact["counts"];
  /** The foreign key column the cascade follows. */
  column: string;
  /** Plain-language description of the rows. */
  holds: string;
  /** Present when the row is reached through another table rather than directly from content. */
  via?: string;
}

export const CASCADE_RULES: CascadeRule[] = [
  { table: "content_genre", column: "content_id", holds: "the title's genre links (the genres themselves stay)" },
  { table: "content_credit", column: "content_id", holds: "cast and director credits (the people stay)" },
  { table: "season", column: "content_id", holds: "the seasons of a series" },
  { table: "episode", column: "season_id", via: "season", holds: "episodes, removed with their season" },
  { table: "watch_history", column: "content_id", holds: "every profile's viewing progress, episodes included" },
  { table: "my_list", column: "content_id", holds: "profiles' My List entries" },
  { table: "rating", column: "content_id", holds: "profiles' 1-5 ratings" },
];
