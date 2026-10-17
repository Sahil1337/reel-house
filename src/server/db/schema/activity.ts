import { relations, sql } from "drizzle-orm";
import { check, index, integer, pgTable, primaryKey, smallint, timestamp, unique } from "drizzle-orm/pg-core";
import { profile } from "./accounts";
import { content, episode } from "./catalog";

export const watchHistory = pgTable(
  "watch_history",
  {
    historyId: integer().primaryKey().generatedAlwaysAsIdentity(),
    profileId: integer()
      .notNull()
      .references(() => profile.profileId, { onDelete: "cascade" }),
    contentId: integer()
      .notNull()
      .references(() => content.contentId, { onDelete: "cascade" }),
    episodeId: integer().references(() => episode.episodeId, {
      onDelete: "cascade",
    }), // NULL for movies
    watchedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    // completed = progress_percent >= 90 (derived, never stored)
    progressPercent: smallint().notNull(),
  },
  (t) => [
    unique("watch_history_profile_content_episode_key").on(t.profileId, t.contentId, t.episodeId).nullsNotDistinct(),
    check("watch_history_progress_percent_check", sql`${t.progressPercent} BETWEEN 0 AND 100`),
    index("watch_history_recent_idx").on(t.profileId, t.watchedAt.desc().nullsFirst()),
  ],
);

export const myList = pgTable(
  "my_list",
  {
    profileId: integer()
      .notNull()
      .references(() => profile.profileId, { onDelete: "cascade" }),
    contentId: integer()
      .notNull()
      .references(() => content.contentId, { onDelete: "cascade" }),
    addedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.contentId] })],
);

export const rating = pgTable(
  "rating",
  {
    profileId: integer()
      .notNull()
      .references(() => profile.profileId, { onDelete: "cascade" }),
    contentId: integer()
      .notNull()
      .references(() => content.contentId, { onDelete: "cascade" }),
    value: smallint().notNull(),
    ratedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.profileId, t.contentId] }),
    check("rating_value_check", sql`${t.value} BETWEEN 1 AND 5`),
    index("rating_content_idx").on(t.contentId),
  ],
);

export const watchHistoryRelations = relations(watchHistory, ({ one }) => ({
  profile: one(profile, {
    fields: [watchHistory.profileId],
    references: [profile.profileId],
  }),
  content: one(content, {
    fields: [watchHistory.contentId],
    references: [content.contentId],
  }),
  episode: one(episode, {
    fields: [watchHistory.episodeId],
    references: [episode.episodeId],
  }),
}));

export const myListRelations = relations(myList, ({ one }) => ({
  profile: one(profile, {
    fields: [myList.profileId],
    references: [profile.profileId],
  }),
  content: one(content, {
    fields: [myList.contentId],
    references: [content.contentId],
  }),
}));

export const ratingRelations = relations(rating, ({ one }) => ({
  profile: one(profile, {
    fields: [rating.profileId],
    references: [profile.profileId],
  }),
  content: one(content, {
    fields: [rating.contentId],
    references: [content.contentId],
  }),
}));
