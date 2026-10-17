import "server-only";

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

// Cached on globalThis so dev hot reload doesn't open a new pool per reload.
const globalForDb = globalThis as unknown as { __reelhouseDb?: Database };

function createDb(): Database {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Add the Neon connection string to .env (see .env.example).");
  }
  const pool = new Pool({ connectionString, max: 10 });
  return drizzle(pool, { schema, casing: "snake_case" });
}

function getDb(): Database {
  return (globalForDb.__reelhouseDb ??= createDb());
}

// Lazy: nothing connects (or throws on a missing DATABASE_URL) until the first query.
export const db: Database = new Proxy({} as Database, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export * from "./schema";
