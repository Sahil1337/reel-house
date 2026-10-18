/**
 * Empties the viewing activity (watch_history, my_list, rating) so every profile starts from a clean
 * slate: Home then runs on the onboarding genre picks alone. Users, profiles, the catalogue and billing
 * stay as seeded. `npm run db:seed` brings the demo activity back from data/mock.
 *
 * Run (needs DATABASE_URL in .env):  npm run db:clear-activity
 */
import { Pool } from "pg";

try {
  process.loadEnvFile(".env");
} catch {
  // .env is optional when DATABASE_URL is already in the environment.
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (add it to .env)");
  const pool = new Pool({ connectionString: url });
  try {
    // RESTART IDENTITY: new history rows start again from history_id 1.
    await pool.query("TRUNCATE watch_history, my_list, rating RESTART IDENTITY");
    console.log("Cleared watch_history, my_list and rating. Re-seed with: npm run db:seed");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
