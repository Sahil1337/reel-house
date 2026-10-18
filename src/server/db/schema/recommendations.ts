import { relations } from "drizzle-orm";
import { index, integer, numeric, pgTable, pgView, primaryKey, real, timestamp, varchar } from "drizzle-orm/pg-core";
import { recStatus } from "./enums";
import { profile } from "./accounts";
import { content } from "./catalog";

export const recommendation = pgTable(
  "recommendation",
  {
    profileId: integer()
      .notNull()
      .references(() => profile.profileId, { onDelete: "cascade" }),
    contentId: integer()
      .notNull()
      .references(() => content.contentId, { onDelete: "cascade" }),
    rowType: varchar({ length: 30 }).notNull(), // 'top-picks'
    relevanceScore: real().notNull(),
    generatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    recStatus: recStatus().notNull().default("SHOWN"),
  },
  (t) => [
    primaryKey({ columns: [t.profileId, t.contentId] }),
    index("recommendation_rank_idx").on(t.profileId, t.relevanceScore.desc().nullsFirst()),
  ],
);

export const recommendationRelations = relations(recommendation, ({ one }) => ({
  profile: one(profile, {
    fields: [recommendation.profileId],
    references: [profile.profileId],
  }),
  content: one(content, {
    fields: [recommendation.contentId],
    references: [content.contentId],
  }),
}));

export const genreTaste = pgView("genre_taste", {
  profileId: integer().notNull(),
  genreId: integer().notNull(),
  genre: varchar({ length: 50 }).notNull(),
  watchScore: numeric({ mode: "number" }).notNull(),
  ratingScore: numeric({ mode: "number" }).notNull(),
  myListScore: numeric({ mode: "number" }).notNull(),
  pickScore: numeric({ mode: "number" }).notNull(),
  tasteScore: numeric({ mode: "number" }).notNull(), // the total: what ranking uses
}).existing();
