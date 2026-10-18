/**
 * Reelhouse database seed.
 *
 * Loads the TMDB snapshot (data/tmdb/*.json) and the demo accounts/activity
 * (data/mock/*.json) into Postgres. Generated identity ids are never inserted:
 * rows are inserted, their new ids read back with RETURNING, and snapshot/mock
 * keys are mapped to those ids in memory.
 *
 * WARNING: this RESETS the database. All 16 tables are TRUNCATEd with
 * RESTART IDENTITY CASCADE first. Use on dev databases only. Everything runs
 * in a single transaction, so a failure leaves the database unchanged.
 *
 * Run (needs DATABASE_URL in .env):  npm run db:seed
 */
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "../schema";
import { seedActivity } from "./activity";
import { seedBilling, seedProfiles, seedUsers } from "./accounts";
import { seedContent, seedCredits, seedGenres, seedPeople, seedSeasonsAndEpisodes } from "./catalog";
import { loadAll } from "./data";
import { notes, type Tx } from "./util";

try {
  process.loadEnvFile(".env");
} catch {
  // .env is optional when DATABASE_URL is already in the environment.
}

const TABLES = [
  "rating",
  "my_list",
  "watch_history",
  "payment",
  "subscription",
  "subscription_plan",
  "profile_genre_preference",
  "profile",
  "users",
  "content_credit",
  "person",
  "episode",
  "season",
  "content_genre",
  "content",
  "genre",
];

async function resetTables(tx: Tx) {
  console.log("Resetting database: TRUNCATE ... RESTART IDENTITY CASCADE on all 16 tables");
  await tx.execute(sql.raw(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`));
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (add it to .env)");
  const started = Date.now();
  const data = loadAll();
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema, casing: "snake_case" });

  try {
    await db.transaction(async (tx) => {
      await resetTables(tx);
      console.log("Seeding:");
      const { genreByTmdb, genreByName } = await seedGenres(tx, data);
      const { contentByKey, unique } = await seedContent(tx, data, genreByTmdb);
      const personByTmdb = await seedPeople(tx, data);
      await seedCredits(tx, unique, contentByKey, personByTmdb);
      const episodeByKey = await seedSeasonsAndEpisodes(tx, unique, contentByKey);
      const userById = await seedUsers(tx, data);
      const profileById = await seedProfiles(tx, data, userById, genreByTmdb, genreByName);
      await seedBilling(tx, data, userById);
      await seedActivity(tx, data, { profileById, contentByKey, episodeByKey });
    });
    console.log("Notes:");
    for (const n of notes) console.log(`  - ${n}`);
    console.log(`Done in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
