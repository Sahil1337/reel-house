import { integer, numeric, pgView, varchar } from "drizzle-orm/pg-core";

// genre_taste is created by drizzle/0001_genre_taste_view.sql (which holds its SQL); declared with
// .existing() only so queries against it are typed.
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
