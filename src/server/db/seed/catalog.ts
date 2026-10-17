/** Catalog steps: genres, content, genre links, people, credits, seasons, episodes. */
import { content, contentCredit, contentGenre, episode, genre, person, season } from "../schema";
import type { SeedData, TmdbTitle } from "./data";
import { chunks, fail, logCount, lookup, note, type Tx } from "./util";

const AGE_RATINGS = new Set([
  "G",
  "PG",
  "PG-13",
  "R",
  "NC-17",
  "NR",
  "TV-Y",
  "TV-Y7",
  "TV-G",
  "TV-PG",
  "TV-14",
  "TV-MA",
]);

export interface CatalogMaps {
  genreByTmdb: Map<number, number>;
  genreByName: Map<string, number>;
  /** "MOVIE:<tmdbId>" / "SERIES:<tmdbId>" -> content_id */
  contentByKey: Map<string, number>;
  /** "<content_id>:<season>:<episode>" -> episode_id */
  episodeByKey: Map<string, number>;
}

export const titleKey = (type: string, tmdbId: number) => `${type}:${tmdbId}`;

export async function seedGenres(tx: Tx, data: SeedData) {
  const rows = await tx
    .insert(genre)
    .values(data.genres.map((g) => ({ name: g.name })))
    .returning({ id: genre.genreId });
  if (rows.length !== data.genres.length) fail("genre insert count mismatch");
  const genreByTmdb = new Map<number, number>();
  const genreByName = new Map<string, number>();
  data.genres.forEach((g, i) => {
    genreByTmdb.set(g.tmdbId, rows[i].id);
    genreByName.set(g.name.toLowerCase(), rows[i].id);
  });
  logCount("genre", rows.length);
  return { genreByTmdb, genreByName };
}

export async function seedContent(tx: Tx, data: SeedData, genreByTmdb: Map<number, number>) {
  const items: TmdbTitle[] = [...data.movies, ...data.series];
  // Natural key (title, type, release_date): first one wins.
  const idByNatural = new Map<string, number>();
  const unique: TmdbTitle[] = [];
  const naturalOf = (t: TmdbTitle) => JSON.stringify([t.title, t.contentType, t.releaseDate ?? null]);
  const dupes: TmdbTitle[] = [];
  const seen = new Set<string>();
  for (const t of items) {
    const k = naturalOf(t);
    if (seen.has(k)) dupes.push(t);
    else {
      seen.add(k);
      unique.push(t);
    }
  }
  let nulledRatings = 0;
  let nulledDurations = 0;
  const rows = unique.map((t) => {
    let ageRating = t.ageRating;
    if (ageRating !== null && !AGE_RATINGS.has(ageRating)) ageRating = null;
    if (ageRating === null) nulledRatings++;
    const duration = t.contentType === "MOVIE" && t.durationMinutes && t.durationMinutes > 0 ? t.durationMinutes : null;
    if (t.contentType === "MOVIE" && duration === null) nulledDurations++;
    return {
      contentType: t.contentType,
      title: t.title,
      description: t.description ?? "",
      releaseDate: t.releaseDate || null,
      durationMinutes: duration,
      ageRating,
      posterUrl: t.posterUrl,
      backdropUrl: t.backdropUrl,
    };
  });

  const ids: number[] = [];
  for (const batch of chunks(rows)) {
    const res = await tx.insert(content).values(batch).returning({ id: content.contentId });
    for (const r of res) ids.push(r.id);
  }
  if (ids.length !== unique.length) fail("content insert count mismatch");
  unique.forEach((t, i) => idByNatural.set(naturalOf(t), ids[i]));

  const contentByKey = new Map<string, number>();
  for (const t of items) {
    contentByKey.set(titleKey(t.contentType, t.tmdbId), idByNatural.get(naturalOf(t))!);
  }
  logCount("content", ids.length);
  note(
    `content: ${dupes.length} duplicate (title,type,release_date) merged; ${nulledRatings} age_rating nulled/empty; ${nulledDurations} movie durations null`,
  );

  // content_genre
  const pairs = new Set<string>();
  const linkRows: { contentId: number; genreId: number }[] = [];
  for (const t of unique) {
    const contentId = contentByKey.get(titleKey(t.contentType, t.tmdbId))!;
    for (const gid of t.genreIds) {
      const genreId = lookup(genreByTmdb, gid, `TMDB genre id (content ${t.tmdbId})`);
      const k = `${contentId}:${genreId}`;
      if (pairs.has(k)) continue;
      pairs.add(k);
      linkRows.push({ contentId, genreId });
    }
  }
  for (const batch of chunks(linkRows)) await tx.insert(contentGenre).values(batch);
  logCount("content_genre", linkRows.length);

  return { contentByKey, unique };
}

export async function seedPeople(tx: Tx, data: SeedData) {
  const naturalOf = (p: { name: string; dateOfBirth: string | null }) =>
    JSON.stringify([p.name, p.dateOfBirth ?? null]);
  const firstByNatural = new Map<string, number>(); // natural -> index in unique
  const unique: typeof data.people = [];
  for (const p of data.people) {
    const k = naturalOf(p);
    if (!firstByNatural.has(k)) {
      firstByNatural.set(k, unique.length);
      unique.push(p);
    }
  }
  const ids: number[] = [];
  for (const batch of chunks(unique)) {
    const res = await tx
      .insert(person)
      .values(
        batch.map((p) => ({
          name: p.name,
          dateOfBirth: p.dateOfBirth || null,
          photoUrl: p.photoUrl,
        })),
      )
      .returning({ id: person.personId });
    for (const r of res) ids.push(r.id);
  }
  if (ids.length !== unique.length) fail("person insert count mismatch");
  const personByTmdb = new Map<number, number>();
  for (const p of data.people) {
    personByTmdb.set(p.tmdbId, ids[firstByNatural.get(naturalOf(p))!]);
  }
  logCount("person", ids.length);
  note(`person: ${data.people.length - unique.length} duplicate (name,date_of_birth) merged`);
  return personByTmdb;
}

export async function seedCredits(
  tx: Tx,
  titles: TmdbTitle[],
  contentByKey: Map<string, number>,
  personByTmdb: Map<number, number>,
) {
  const best = new Map<string, typeof contentCredit.$inferInsert>();
  let merged = 0;
  const add = (row: typeof contentCredit.$inferInsert) => {
    const k = `${row.contentId}:${row.personId}:${row.role}`;
    const prev = best.get(k);
    if (prev) {
      merged++;
      if ((row.creditOrder ?? 0) >= (prev.creditOrder ?? 0)) return;
    }
    best.set(k, row);
  };
  for (const t of titles) {
    const contentId = contentByKey.get(titleKey(t.contentType, t.tmdbId))!;
    for (const c of t.cast) {
      add({
        contentId,
        personId: lookup(personByTmdb, c.personTmdbId, `cast person ${c.personTmdbId} (content ${t.tmdbId})`),
        role: "ACTOR",
        characterName: c.characterName || null,
        creditOrder: c.order,
      });
    }
    t.directorIds.forEach((pid, i) =>
      add({
        contentId,
        personId: lookup(personByTmdb, pid, `director person ${pid} (content ${t.tmdbId})`),
        role: "DIRECTOR",
        characterName: null,
        creditOrder: i,
      }),
    );
  }
  const rows = [...best.values()];
  for (const batch of chunks(rows)) await tx.insert(contentCredit).values(batch);
  logCount("content_credit", rows.length);
  note(`content_credit: ${merged} duplicate (content,person,role) merged`);
}

export async function seedSeasonsAndEpisodes(tx: Tx, titles: TmdbTitle[], contentByKey: Map<string, number>) {
  const seasonRows: { contentId: number; seasonNumber: number; name: string; releaseDate: string | null }[] = [];
  const seasonSources: TmdbTitle["seasons"] = [];
  const seenSeason = new Set<string>();
  for (const t of titles) {
    if (t.contentType !== "SERIES") continue;
    const contentId = contentByKey.get(titleKey("SERIES", t.tmdbId))!;
    for (const s of t.seasons ?? []) {
      const k = `${contentId}:${s.seasonNumber}`;
      if (seenSeason.has(k)) continue;
      seenSeason.add(k);
      seasonRows.push({
        contentId,
        seasonNumber: s.seasonNumber,
        name: s.name,
        releaseDate: s.releaseDate || null,
      });
      seasonSources.push(s);
    }
  }
  const seasonIds: number[] = [];
  for (const batch of chunks(seasonRows)) {
    const res = await tx.insert(season).values(batch).returning({ id: season.seasonId });
    for (const r of res) seasonIds.push(r.id);
  }
  if (seasonIds.length !== seasonRows.length) fail("season insert count mismatch");
  logCount("season", seasonIds.length);

  const episodeRows: (typeof episode.$inferInsert)[] = [];
  const episodeKeys: string[] = [];
  let nulledDurations = 0;
  seasonSources.forEach((s, i) => {
    const seenEp = new Set<number>();
    for (const e of s.episodes) {
      if (seenEp.has(e.episodeNumber)) continue;
      seenEp.add(e.episodeNumber);
      const duration = e.durationMinutes && e.durationMinutes > 0 ? e.durationMinutes : null;
      if (duration === null) nulledDurations++;
      episodeRows.push({
        seasonId: seasonIds[i],
        episodeNumber: e.episodeNumber,
        title: e.title,
        description: e.description ?? "",
        releaseDate: e.releaseDate || null,
        durationMinutes: duration,
        stillUrl: e.stillUrl,
      });
      episodeKeys.push(`${seasonRows[i].contentId}:${s.seasonNumber}:${e.episodeNumber}`);
    }
  });
  const episodeByKey = new Map<string, number>();
  let n = 0;
  for (const batch of chunks(episodeRows)) {
    const res = await tx.insert(episode).values(batch).returning({ id: episode.episodeId });
    res.forEach((r, j) => episodeByKey.set(episodeKeys[n + j], r.id));
    n += res.length;
  }
  if (n !== episodeRows.length) fail("episode insert count mismatch");
  logCount("episode", n);
  note(`episode: ${nulledDurations} durations null (missing/zero runtime)`);
  return episodeByKey;
}
