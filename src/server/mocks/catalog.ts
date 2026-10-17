/**
 * Builds the catalogue tables (genre, person, content, season, episode) from the
 * TMDB snapshot: assigns app ids and resolves TMDB cross-references into joined objects.
 * TMDB ids are used only here, in memory, and never end up on the rows (the schema has none).
 */
import "server-only";

import type { Content, ContentDetail, ContentType, Episode, Genre, Person, Season } from "@/types";

import type { SnapshotContent, SnapshotGenre, SnapshotPerson } from "./types";

export interface EpisodeContext {
  episode: Episode;
  season: Season;
  contentId: number;
}

export interface Catalog {
  genres: Genre[];
  people: Person[];
  /** Movies first, then series, in snapshot order. */
  contents: ContentDetail[];
  contentById: Map<number, ContentDetail>;
  episodeById: Map<number, EpisodeContext>;
  genreByName: Map<string, Genre>;
  /** By the content natural key (title, content_type, release_date). */
  findByKey(contentType: ContentType, title: string, releaseDate: string | null): ContentDetail | undefined;
  /** By a snapshot entry's TMDB id: resolves data/mock title references while loading. */
  findByTmdb(contentType: ContentType, tmdbId: number): ContentDetail | undefined;
}

export function buildCatalog(snapshot: {
  genres: SnapshotGenre[];
  people: SnapshotPerson[];
  movies: SnapshotContent[];
  series: SnapshotContent[];
}): Catalog {
  // Genres get ids in alphabetical order, like a seeded lookup table.
  const sortedGenres = [...snapshot.genres].sort((a, b) => a.name.localeCompare(b.name));
  const genres: Genre[] = sortedGenres.map((genre, index) => ({ genreId: index + 1, name: genre.name }));
  const genreByTmdbId = new Map(sortedGenres.map((genre, index) => [genre.tmdbId, genres[index]]));

  const people: Person[] = snapshot.people.map((person, index) => ({
    personId: index + 1,
    name: person.name,
    dateOfBirth: person.dateOfBirth,
    photoUrl: person.photoUrl,
  }));
  const personByTmdbId = new Map(snapshot.people.map((person, index) => [person.tmdbId, people[index]]));

  const contents: ContentDetail[] = [];
  const byTmdb = new Map<string, ContentDetail>();
  let seasonId = 0;
  let episodeId = 0;

  for (const item of [...snapshot.movies, ...snapshot.series]) {
    const contentId = contents.length + 1;
    const content: Content = {
      contentId,
      title: item.title,
      description: item.description,
      releaseDate: item.releaseDate,
      contentType: item.contentType,
      durationMinutes: item.contentType === "MOVIE" ? item.durationMinutes : null,
      ageRating: item.ageRating,
      maturityLevel: item.maturityLevel,
      posterUrl: item.posterUrl,
      backdropUrl: item.backdropUrl,
      genres: item.genreIds.flatMap((id) => genreByTmdbId.get(id) ?? []),
      cast: [...item.cast]
        .sort((a, b) => a.order - b.order)
        .flatMap((credit) => {
          const person = personByTmdbId.get(credit.personTmdbId);
          return person ? [{ person, characterName: credit.characterName }] : [];
        }),
      directors: item.directorIds.flatMap((id) => personByTmdbId.get(id) ?? []),
    };

    const seasons: Season[] = (item.seasons ?? [])
      .filter((season) => season.seasonNumber > 0 && season.episodes.length > 0)
      .sort((a, b) => a.seasonNumber - b.seasonNumber)
      .map((season) => {
        const id = ++seasonId;
        return {
          seasonId: id,
          contentId,
          seasonNumber: season.seasonNumber,
          name: season.name,
          releaseDate: season.releaseDate,
          episodes: [...season.episodes]
            .sort((a, b) => a.episodeNumber - b.episodeNumber)
            .map((episode) => ({
              episodeId: ++episodeId,
              seasonId: id,
              episodeNumber: episode.episodeNumber,
              title: episode.title,
              description: episode.description,
              releaseDate: episode.releaseDate,
              durationMinutes: episode.durationMinutes,
              stillUrl: episode.stillUrl,
            })),
        };
      });

    const detail = { ...content, seasons };
    contents.push(detail);
    byTmdb.set(`${item.contentType}:${item.tmdbId}`, detail);
  }

  const episodeById = new Map<number, EpisodeContext>();
  for (const content of contents) {
    for (const season of content.seasons) {
      for (const episode of season.episodes) {
        episodeById.set(episode.episodeId, { episode, season, contentId: content.contentId });
      }
    }
  }

  const naturalKey = (contentType: ContentType, title: string, releaseDate: string | null) =>
    `${contentType}\u0000${title}\u0000${releaseDate ?? ""}`;
  const byKey = new Map(
    contents.map((content) => [naturalKey(content.contentType, content.title, content.releaseDate), content]),
  );

  return {
    genres,
    people,
    contents,
    contentById: new Map(contents.map((content) => [content.contentId, content])),
    episodeById,
    genreByName: new Map(genres.map((genre) => [genre.name, genre])),
    findByKey: (contentType, title, releaseDate) => byKey.get(naturalKey(contentType, title, releaseDate)),
    findByTmdb: (contentType, tmdbId) => byTmdb.get(`${contentType}:${tmdbId}`),
  };
}
