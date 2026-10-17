/**
 * PostgreSQL literals for DISPLAY: turns a parameterized statement into a readable one.
 * The backend always sends `sql` + `params` separately; inlined text is only shown and copied.
 *
 * Strings are single-quoted with embedded quotes doubled (standard_conforming_strings is on by
 * default since PostgreSQL 9.1, so backslashes need no escaping).
 */
import type { SqlParam, SqlStatement } from "@/types";

export function quoteLiteral(value: SqlParam): string {
  if (value === null) return "NULL";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`Can't inline ${value} as a SQL literal.`);
    return String(value);
  }
  if (Array.isArray(value)) return value.length ? `ARRAY[${value.map(quoteLiteral).join(", ")}]` : "'{}'";
  return `'${value.replaceAll("'", "''")}'`;
}

/** Replaces each $n with the escaped literal of params[n - 1]; casts written after it (`$3::date`) stay. */
export function inlineParams(sql: string, params: SqlParam[]): string {
  return sql.replace(/\$(\d+)/g, (placeholder, index: string) => {
    const position = Number(index) - 1;
    if (position < 0 || position >= params.length) throw new Error(`No value for ${placeholder}.`);
    return quoteLiteral(params[position]);
  });
}

/** Builds a statement's display fields from its SQL and params. */
export function statement(fields: Omit<SqlStatement, "inlinedSql">): SqlStatement {
  return { ...fields, inlinedSql: inlineParams(fields.sql, fields.params) };
}

/** The whole script as one copyable text: inlined (runnable in psql) or parameterized with each statement's params. */
export function scriptText(statements: SqlStatement[], mode: "inlined" | "parameterized"): string {
  return statements
    .map((entry) => {
      const header = `-- ${entry.step}. ${entry.title}`;
      if (mode === "inlined") return `${header}\n${entry.inlinedSql}`;
      const params = entry.params.length ? `\n-- params: ${JSON.stringify(entry.params)}` : "";
      return `${header}\n${entry.sql}${params}`;
    })
    .join("\n\n");
}
