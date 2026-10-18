import "server-only";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, types } from "pg";
import * as schema from "./schema";

// pg returns bigint (COUNT, SUM of ints) and numeric (money) as strings, and dates as JS Dates.
// Parse them once here so queries stay plain SQL: no COUNT(*)::int, no release_date::text.
types.setTypeParser(types.builtins.INT8, Number);
types.setTypeParser(types.builtins.NUMERIC, Number);
types.setTypeParser(types.builtins.DATE, (value) => value); // keep 'YYYY-MM-DD'

export type Database = NodePgDatabase<typeof schema>;

// Cached on globalThis so dev hot reload doesn't open a new pool per reload.
const globalForDb = globalThis as unknown as { __reelhouseDb?: Database; __reelhousePool?: Pool };

function getPool(): Pool {
  if (!globalForDb.__reelhousePool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set. Add the Neon connection string to .env (see .env.example).");
    }
    globalForDb.__reelhousePool = new Pool({ connectionString, max: 10 });
  }
  return globalForDb.__reelhousePool;
}

function getDb(): Database {
  if (!globalForDb.__reelhouseDb) {
    const p = getPool();
    globalForDb.__reelhouseDb = drizzle(p, { schema, casing: "snake_case" });
  }
  return globalForDb.__reelhouseDb;
}

// Lazy: nothing connects (or throws on a missing DATABASE_URL) until the first query.
export const pool: Pool = new Proxy({} as Pool, {
  get(_target, prop) {
    const real = getPool();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export * from "./schema";
