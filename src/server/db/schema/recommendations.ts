import { relations } from "drizzle-orm";
import {
  doublePrecision,
  index,
  integer,
  numeric,
  pgMaterializedView,
  pgTable,
  pgView,
  primaryKey,
  real,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
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
    rowType: varchar({ length: 30 }).notNull(), // 'top-picks', 'because-you-liked', …
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

// The view and the materialized view are created by the custom migration
// (drizzle/*_functions_and_views.sql), which holds their SQL. They are declared
// here with .existing() only so queries are typed.
export const interactionScore = pgView("interaction_score", {
  profileId: integer().notNull(),
  contentId: integer().notNull(),
  score: numeric({ mode: "number" }).notNull(), // SUM(numeric) -> numeric
}).existing();

export const contentSimilarity = pgMaterializedView("content_similarity", {
  contentA: integer().notNull(),
  contentB: integer().notNull(),
  score: doublePrecision().notNull(),
}).existing();
