import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../schema";

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export const BATCH_SIZE = 800;

export function chunks<T>(rows: T[], size = BATCH_SIZE): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/** Counts rows per table for the final log. */
export const counts = new Map<string, number>();
export function logCount(table: string, n: number) {
  counts.set(table, n);
  console.log(`  ${table.padEnd(26)} ${n}`);
}

/** Notes about rows merged, nulled or dropped so the run can report them. */
export const notes: string[] = [];
export function note(message: string) {
  notes.push(message);
}

export function fail(message: string): never {
  throw new Error(`Seed failed: ${message}`);
}

export function lookup<K, V>(map: Map<K, V>, key: K, what: string): V {
  const v = map.get(key);
  if (v === undefined) fail(`unresolvable ${what}: ${String(key)}`);
  return v;
}

export function toDate(iso: string): Date {
  return new Date(iso);
}
