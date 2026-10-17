/**
 * The SQL that importing one TMDB title runs, generated for DISPLAY (nothing here touches a
 * database). The admin preview shows it step by step; POST /api/admin/content/import documents
 * running the same statements in one transaction.
 *
 * The database stores no TMDB ids. Every statement after the content upsert finds its rows by
 * natural key — content by (title, content_type, release_date), people by (name, date_of_birth),
 * genres by name, seasons by (content, season_number) — so the script needs no ids carried between
 * statements and can be pasted into psql as is. Every write is an upsert or ON CONFLICT DO NOTHING,
 * so re-running it is safe (idempotent).
 *
 * Names follow the README's "SQL naming" section: snake_case of the src/types fields.
 */
import type { SnapshotContent, SnapshotGenre, SnapshotPerson } from "@/lib/tmdb/types";
import type { SqlParam, SqlStatement, TableRowCount } from "@/types";

import { statement } from "./literal";

/**
 * Where this title's content row is, by natural key — every dependent statement starts with
 * $1, $2, $3 = title, content_type, release_date. IS NOT DISTINCT FROM lets a NULL release date
 * match, the same way the key's NULLS NOT DISTINCT does.
 */
const CONTENT_KEY = "c.title = $1 AND c.content_type = $2 AND c.release_date IS NOT DISTINCT FROM $3";

/** Matches a VALUES row `v` (name, date_of_birth, …) to its person row `p`, NULL birth dates included. */
const PERSON_JOIN = "JOIN person AS p ON p.name = v.name AND p.date_of_birth IS NOT DISTINCT FROM v.date_of_birth";

/**
 * Placeholder text for a multi-row VALUES list starting at $start, one row per line. In a derived
 * table (`… CROSS JOIN (VALUES …) AS v`) the first row carries `casts`, which fix each column's type
 * (later rows follow it) so dates and NULLs don't default to text; INSERT … VALUES needs none.
 */
function valuesList(
  rows: SqlParam[][],
  start: number,
  { casts, indent }: { casts?: string[]; indent: string },
): { text: string; params: SqlParam[] } {
  let next = start;
  const lines = rows.map((row, rowIndex) => {
    const cells = row.map((_, column) => `$${next++}${rowIndex === 0 && casts ? `::${casts[column]}` : ""}`);
    return `${indent}(${cells.join(", ")})`;
  });
  return { text: lines.join(",\n"), params: rows.flat() };
}

function uniqueBy<T>(items: T[], key: (item: T) => unknown): T[] {
  const seen = new Set<unknown>();
  return items.filter((item) => {
    const value = key(item);
    if (seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

/** person's natural key, (name, date_of_birth), as one string for de-duplicating. */
const personKey = (person: SnapshotPerson) => `${person.name}\u0000${person.dateOfBirth ?? ""}`;

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export interface ImportScript {
  statements: SqlStatement[];
  rowCounts: TableRowCount[];
}

export function buildImportScript({
  content,
  people,
  genres,
}: {
  content: SnapshotContent;
  people: SnapshotPerson[];
  genres: SnapshotGenre[];
}): ImportScript {
  const key: SqlParam[] = [content.title, content.contentType, content.releaseDate];
  const isSeries = content.contentType === "SERIES";

  // TMDB ids only resolve credits to people here; the SQL matches people by (name, date_of_birth).
  // Multi-row upserts may not touch the same row twice, so drop repeats of each key up front.
  const genreNames = [...new Set(genres.map((genre) => genre.name))];
  const personByTmdbId = new Map(people.map((person) => [person.tmdbId, person]));
  const persons = uniqueBy(people, personKey);
  const cast = uniqueBy(
    content.cast.flatMap((credit) => {
      const person = personByTmdbId.get(credit.personTmdbId);
      return person ? [{ person, characterName: credit.characterName, order: credit.order }] : [];
    }),
    (credit) => personKey(credit.person),
  );
  const directors = uniqueBy(
    content.directorIds.flatMap((id) => personByTmdbId.get(id) ?? []),
    personKey,
  );
  const seasons = (content.seasons ?? [])
    .filter((season) => season.seasonNumber > 0 && season.episodes.length > 0)
    .toSorted((a, b) => a.seasonNumber - b.seasonNumber);

  const drafts: Omit<SqlStatement, "inlinedSql" | "step">[] = [];

  drafts.push({
    title: "Begin the transaction",
    explanation:
      "Everything below runs as one transaction: if any statement fails (a bad episode row, a lost connection), " +
      "ROLLBACK undoes the lot and the catalogue never holds half a title.",
    sql: "BEGIN;",
    params: [],
    table: null,
    rowCount: 0,
  });

  drafts.push({
    title: `Upsert the ${isSeries ? "series" : "movie"} into content`,
    explanation:
      "The natural key is UNIQUE NULLS NOT DISTINCT (title, content_type, release_date): Dune (1984) and " +
      "Dune (2021) differ by date, and a title with no release date still matches itself, so a re-import " +
      "updates the existing row instead of duplicating it (a title TMDB later renames or re-dates comes in " +
      "as a new row). RETURNING hands back content_id, and xmax = 0 is true only when the row was freshly " +
      "inserted. age_rating is the plain certificate code (a CHECK limits it to the US codes); maturity " +
      "isn't stored, queries derive it with maturity_of(age_rating).",
    sql: `INSERT INTO content (
  title, content_type, release_date, description, duration_minutes, age_rating,
  poster_url, backdrop_url
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
ON CONFLICT (title, content_type, release_date) DO UPDATE
SET description = EXCLUDED.description,
    duration_minutes = EXCLUDED.duration_minutes,
    age_rating = EXCLUDED.age_rating,
    poster_url = EXCLUDED.poster_url,
    backdrop_url = EXCLUDED.backdrop_url
RETURNING content_id, (xmax = 0) AS created;`,
    params: [
      ...key,
      content.description,
      content.durationMinutes,
      content.ageRating,
      content.posterUrl,
      content.backdropUrl,
    ],
    table: "content",
    rowCount: 1,
  });

  if (genreNames.length) {
    drafts.push({
      title: "Make sure each genre exists",
      explanation:
        "genre.name is UNIQUE, so ON CONFLICT DO NOTHING skips genres the catalogue already has and only " +
        "inserts new ones. (TMDB's TV-only genres were folded into the shared movie genres before this point.)",
      sql: `INSERT INTO genre (name)
VALUES ${genreNames.map((_, index) => `($${index + 1})`).join(", ")}
ON CONFLICT (name) DO NOTHING;`,
      params: genreNames,
      table: "genre",
      rowCount: genreNames.length,
    });

    drafts.push({
      title: "Link the title to its genres",
      explanation:
        "content_genre is the many-to-many bridge; its primary key (content_id, genre_id) makes a repeated " +
        "link a no-op. Both ids are looked up by natural key, so nothing is carried over from earlier steps.",
      sql: `INSERT INTO content_genre (content_id, genre_id)
SELECT c.content_id, g.genre_id
FROM content AS c
JOIN genre AS g ON g.name = ANY ($4::text[])
WHERE ${CONTENT_KEY}
ON CONFLICT DO NOTHING;`,
      params: [...key, genreNames],
      table: "content_genre",
      rowCount: genreNames.length,
    });
  }

  if (persons.length) {
    const values = valuesList(
      persons.map((person) => [person.name, person.dateOfBirth, person.photoUrl]),
      1,
      { indent: "  " },
    );
    drafts.push({
      title: `Upsert ${plural(persons.length, "person")} (cast and ${isSeries ? "creators" : "directors"})`,
      explanation:
        "People are shared across titles, so each is upserted on UNIQUE NULLS NOT DISTINCT (name, " +
        "date_of_birth): someone already in the catalogue keeps their person_id and gets a refreshed photo. " +
        "Known trade-off: two different people with the same name and no birth date share one row.",
      sql: `INSERT INTO person (name, date_of_birth, photo_url)
VALUES
${values.text}
ON CONFLICT (name, date_of_birth) DO UPDATE
SET photo_url = EXCLUDED.photo_url;`,
      params: values.params,
      table: "person",
      rowCount: persons.length,
    });
  }

  if (cast.length) {
    const values = valuesList(
      cast.map((credit) => [credit.person.name, credit.person.dateOfBirth, credit.characterName, credit.order]),
      4,
      { casts: ["text", "date", "text", "int"], indent: "    " },
    );
    drafts.push({
      title: `Credit the top ${plural(cast.length, "cast member")}`,
      explanation:
        "content_credit holds every credit, told apart by role; actors are role 'ACTOR', with who they play " +
        "(NULL when TMDB doesn't say) in billing order (credit_order 0 is top-billed). The primary key " +
        "(content_id, person_id, role) means a re-import updates the character and order instead of adding a " +
        "row. Each person is found by (name, date_of_birth), the key the previous step upserted on.",
      sql: `INSERT INTO content_credit (content_id, person_id, role, character_name, credit_order)
SELECT c.content_id, p.person_id, 'ACTOR'::credit_role, NULLIF(v.character_name, ''), v.credit_order
FROM content AS c
CROSS JOIN (
  VALUES
${values.text}
) AS v (name, date_of_birth, character_name, credit_order)
${PERSON_JOIN}
WHERE ${CONTENT_KEY}
ON CONFLICT (content_id, person_id, role) DO UPDATE
SET character_name = EXCLUDED.character_name,
    credit_order = EXCLUDED.credit_order;`,
      params: [...key, ...values.params],
      table: "content_credit",
      rowCount: cast.length,
    });
  }

  if (directors.length) {
    const values = valuesList(
      directors.map((person, index) => [person.name, person.dateOfBirth, index]),
      4,
      { casts: ["text", "date", "int"], indent: "    " },
    );
    drafts.push({
      title: isSeries
        ? "Credit the creators as directors"
        : `Credit the ${directors.length === 1 ? "director" : "directors"}`,
      explanation:
        (isSeries ? "Series rarely credit one director, so the creators stand in. " : "") +
        "Directors go into the same content_credit table with role 'DIRECTOR' and no character_name (a CHECK " +
        "allows one only for actors). role is part of the key, so someone who also acts in the title keeps both " +
        "credits; a re-import only refreshes credit_order.",
      sql: `INSERT INTO content_credit (content_id, person_id, role, character_name, credit_order)
SELECT c.content_id, p.person_id, 'DIRECTOR'::credit_role, NULL, v.credit_order
FROM content AS c
CROSS JOIN (
  VALUES
${values.text}
) AS v (name, date_of_birth, credit_order)
${PERSON_JOIN}
WHERE ${CONTENT_KEY}
ON CONFLICT (content_id, person_id, role) DO UPDATE
SET credit_order = EXCLUDED.credit_order;`,
      params: [...key, ...values.params],
      table: "content_credit",
      rowCount: directors.length,
    });
  }

  if (seasons.length) {
    const values = valuesList(
      seasons.map((season) => [season.seasonNumber, season.name, season.releaseDate]),
      4,
      { casts: ["int", "text", "date"], indent: "    " },
    );
    drafts.push({
      title: `Upsert ${plural(seasons.length, "season")}`,
      explanation:
        'One row per season (season 0, "Specials", is skipped). UNIQUE (content_id, season_number) turns ' +
        "a re-import into an update of the name and air date.",
      sql: `INSERT INTO season (content_id, season_number, name, release_date)
SELECT c.content_id, v.season_number, v.name, v.release_date
FROM content AS c
CROSS JOIN (
  VALUES
${values.text}
) AS v (season_number, name, release_date)
WHERE ${CONTENT_KEY}
ON CONFLICT (content_id, season_number) DO UPDATE
SET name = EXCLUDED.name,
    release_date = EXCLUDED.release_date;`,
      params: [...key, ...values.params],
      table: "season",
      rowCount: seasons.length,
    });

    for (const season of seasons) {
      const episodes = uniqueBy(season.episodes, (episode) => episode.episodeNumber).toSorted(
        (a, b) => a.episodeNumber - b.episodeNumber,
      );
      const episodeValues = valuesList(
        episodes.map((episode) => [
          episode.episodeNumber,
          episode.title,
          episode.description,
          episode.releaseDate,
          episode.durationMinutes,
          episode.stillUrl,
        ]),
        5,
        { casts: ["int", "text", "text", "date", "int", "text"], indent: "    " },
      );
      drafts.push({
        title: `Upsert season ${season.seasonNumber}'s ${plural(episodes.length, "episode")}`,
        explanation:
          `All of season ${season.seasonNumber} in one multi-row INSERT, its season_id found by (content, ` +
          "season_number). UNIQUE (season_id, episode_number) makes a re-import update each episode in place.",
        sql: `INSERT INTO episode (season_id, episode_number, title, description, release_date, duration_minutes, still_url)
SELECT s.season_id, v.episode_number, v.title, v.description, v.release_date, v.duration_minutes, v.still_url
FROM season AS s
JOIN content AS c ON c.content_id = s.content_id
CROSS JOIN (
  VALUES
${episodeValues.text}
) AS v (episode_number, title, description, release_date, duration_minutes, still_url)
WHERE ${CONTENT_KEY} AND s.season_number = $4
ON CONFLICT (season_id, episode_number) DO UPDATE
SET title = EXCLUDED.title,
    description = EXCLUDED.description,
    release_date = EXCLUDED.release_date,
    duration_minutes = EXCLUDED.duration_minutes,
    still_url = EXCLUDED.still_url;`,
        params: [...key, season.seasonNumber, ...episodeValues.params],
        table: "episode",
        rowCount: episodes.length,
      });
    }
  }

  drafts.push({
    title: "Commit",
    explanation:
      "Makes every row above visible to other sessions at once; until now no reader could see a partial import.",
    sql: "COMMIT;",
    params: [],
    table: null,
    rowCount: 0,
  });

  const statements = drafts.map((draft, index) => statement({ ...draft, step: index + 1 }));

  const rowCounts = new Map<string, number>();
  for (const entry of statements) {
    if (entry.table) rowCounts.set(entry.table, (rowCounts.get(entry.table) ?? 0) + entry.rowCount);
  }

  return {
    statements,
    rowCounts: [...rowCounts].map(([table, rows]) => ({ table, rows })),
  };
}
