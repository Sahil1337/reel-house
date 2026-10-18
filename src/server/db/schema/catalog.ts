import { relations, sql } from "drizzle-orm";
import { check, date, index, integer, pgTable, primaryKey, smallint, text, unique, varchar } from "drizzle-orm/pg-core";
import { contentType, creditRole } from "./enums";
import { profileGenrePreference } from "./accounts";
import { myList, rating, watchHistory } from "./activity";

export const genre = pgTable("genre", {
  genreId: integer().primaryKey().generatedAlwaysAsIdentity(),
  name: varchar({ length: 50 }).notNull().unique(),
});

export const content = pgTable(
  "content",
  {
    contentId: integer().primaryKey().generatedAlwaysAsIdentity(),
    contentType: contentType().notNull(),
    title: varchar({ length: 255 }).notNull(),
    description: text().notNull().default(""),
    releaseDate: date(),
    durationMinutes: smallint(), // movies only; series carry it per episode
    ageRating: varchar({ length: 10 }), // US certificate; NULL = none (treated as TEEN)
    posterUrl: text(),
    backdropUrl: text(),
  },
  (t) => [
    unique("content_title_type_release_key").on(t.title, t.contentType, t.releaseDate).nullsNotDistinct(),
    check("content_duration_minutes_check", sql`${t.durationMinutes} > 0`),
    check("content_movie_duration_check", sql`${t.contentType} = 'MOVIE' OR ${t.durationMinutes} IS NULL`),
    check(
      "content_age_rating_check",
      sql`${t.ageRating} IN ('G', 'PG', 'PG-13', 'R', 'NC-17', 'NR', 'TV-Y', 'TV-Y7', 'TV-G', 'TV-PG', 'TV-14', 'TV-MA')`,
    ),
  ],
);

export const contentGenre = pgTable(
  "content_genre",
  {
    contentId: integer()
      .notNull()
      .references(() => content.contentId, { onDelete: "cascade" }),
    genreId: integer()
      .notNull()
      .references(() => genre.genreId, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.contentId, t.genreId] }), index("content_genre_genre_idx").on(t.genreId)],
);

export const season = pgTable(
  "season",
  {
    seasonId: integer().primaryKey().generatedAlwaysAsIdentity(),
    contentId: integer()
      .notNull()
      .references(() => content.contentId, { onDelete: "cascade" }),
    seasonNumber: smallint().notNull(),
    name: varchar({ length: 255 }).notNull(),
    releaseDate: date(),
  },
  (t) => [
    unique("season_content_number_key").on(t.contentId, t.seasonNumber),
    check("season_season_number_check", sql`${t.seasonNumber} > 0`),
  ],
);

export const episode = pgTable(
  "episode",
  {
    episodeId: integer().primaryKey().generatedAlwaysAsIdentity(),
    seasonId: integer()
      .notNull()
      .references(() => season.seasonId, { onDelete: "cascade" }),
    episodeNumber: smallint().notNull(),
    title: varchar({ length: 255 }).notNull(),
    description: text().notNull().default(""),
    releaseDate: date(),
    durationMinutes: smallint(),
    stillUrl: text(),
  },
  (t) => [
    unique("episode_season_number_key").on(t.seasonId, t.episodeNumber),
    check("episode_episode_number_check", sql`${t.episodeNumber} > 0`),
    check("episode_duration_minutes_check", sql`${t.durationMinutes} > 0`),
  ],
);

export const person = pgTable(
  "person",
  {
    personId: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar({ length: 255 }).notNull(),
    dateOfBirth: date(),
    photoUrl: text(),
  },
  (t) => [unique("person_name_dob_key").on(t.name, t.dateOfBirth).nullsNotDistinct()],
);

export const contentCredit = pgTable(
  "content_credit",
  {
    contentId: integer()
      .notNull()
      .references(() => content.contentId, { onDelete: "cascade" }),
    personId: integer()
      .notNull()
      .references(() => person.personId, { onDelete: "cascade" }),
    role: creditRole().notNull(),
    characterName: varchar({ length: 255 }), // actors only
    creditOrder: smallint().notNull().default(0), // 0 = top billed
  },
  (t) => [
    primaryKey({ columns: [t.contentId, t.personId, t.role] }),
    check("content_credit_character_check", sql`${t.role} = 'ACTOR' OR ${t.characterName} IS NULL`),
    index("content_credit_person_idx").on(t.personId),
  ],
);

export const genreRelations = relations(genre, ({ many }) => ({
  contentGenres: many(contentGenre),
  profilePreferences: many(profileGenrePreference),
}));

export const contentRelations = relations(content, ({ many }) => ({
  genres: many(contentGenre),
  seasons: many(season),
  credits: many(contentCredit),
  watchHistory: many(watchHistory),
  myListEntries: many(myList),
  ratings: many(rating),
}));

export const contentGenreRelations = relations(contentGenre, ({ one }) => ({
  content: one(content, {
    fields: [contentGenre.contentId],
    references: [content.contentId],
  }),
  genre: one(genre, {
    fields: [contentGenre.genreId],
    references: [genre.genreId],
  }),
}));

export const seasonRelations = relations(season, ({ one, many }) => ({
  content: one(content, {
    fields: [season.contentId],
    references: [content.contentId],
  }),
  episodes: many(episode),
}));

export const episodeRelations = relations(episode, ({ one, many }) => ({
  season: one(season, {
    fields: [episode.seasonId],
    references: [season.seasonId],
  }),
  watchHistory: many(watchHistory),
}));

export const personRelations = relations(person, ({ many }) => ({
  credits: many(contentCredit),
}));

export const contentCreditRelations = relations(contentCredit, ({ one }) => ({
  content: one(content, {
    fields: [contentCredit.contentId],
    references: [content.contentId],
  }),
  person: one(person, {
    fields: [contentCredit.personId],
    references: [person.personId],
  }),
}));
