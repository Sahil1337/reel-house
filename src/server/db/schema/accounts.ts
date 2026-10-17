import { relations, sql } from "drizzle-orm";
import { integer, pgTable, primaryKey, timestamp, uniqueIndex, varchar, text } from "drizzle-orm/pg-core";
import { maturityLevel, userRole } from "./enums";
import { genre } from "./catalog";
import { subscription } from "./billing";
import { myList, rating, watchHistory } from "./activity";
import { recommendation } from "./recommendations";

export const users = pgTable(
  "users",
  {
    userId: integer().primaryKey().generatedAlwaysAsIdentity(),
    name: varchar({ length: 100 }).notNull(),
    email: varchar({ length: 255 }).notNull(),
    passwordHash: text().notNull(), // "scrypt$<salt>$<hash>"
    phone: varchar({ length: 20 }),
    role: userRole().notNull().default("USER"),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("users_email_key").on(sql`lower(${t.email})`)],
);

export const profile = pgTable(
  "profile",
  {
    profileId: integer().primaryKey().generatedAlwaysAsIdentity(),
    userId: integer()
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    name: varchar({ length: 24 }).notNull(),
    avatar: varchar({ length: 20 }).notNull(),
    maturityLevel: maturityLevel().notNull().default("ADULT"),
    onboardedAt: timestamp({ withTimezone: true }), // NULL until onboarding is finished
  },
  (t) => [uniqueIndex("profile_user_name_key").on(t.userId, sql`lower(${t.name})`)],
);

export const profileGenrePreference = pgTable(
  "profile_genre_preference",
  {
    profileId: integer()
      .notNull()
      .references(() => profile.profileId, { onDelete: "cascade" }),
    genreId: integer()
      .notNull()
      .references(() => genre.genreId, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.profileId, t.genreId] })],
);

export const usersRelations = relations(users, ({ many }) => ({
  profiles: many(profile),
  subscriptions: many(subscription),
}));

export const profileRelations = relations(profile, ({ one, many }) => ({
  user: one(users, { fields: [profile.userId], references: [users.userId] }),
  genrePreferences: many(profileGenrePreference),
  watchHistory: many(watchHistory),
  myList: many(myList),
  ratings: many(rating),
  recommendations: many(recommendation),
}));

export const profileGenrePreferenceRelations = relations(profileGenrePreference, ({ one }) => ({
  profile: one(profile, {
    fields: [profileGenrePreference.profileId],
    references: [profile.profileId],
  }),
  genre: one(genre, {
    fields: [profileGenrePreference.genreId],
    references: [genre.genreId],
  }),
}));
