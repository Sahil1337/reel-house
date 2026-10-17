/**
 * A small PostgreSQL tokenizer for syntax highlighting (display only). It knows the pieces our
 * generated statements and dashboard queries use: keywords, 'strings' (with '' escapes),
 * "quoted identifiers", numbers, $n placeholders, ::casts and -- comments.
 */

export type SqlTokenKind =
  "keyword" | "string" | "number" | "param" | "comment" | "identifier" | "punctuation" | "space";

export interface SqlToken {
  kind: SqlTokenKind;
  text: string;
}

const KEYWORDS = new Set(
  (
    "SELECT FROM WHERE AND OR NOT IN IS NULL AS ON JOIN LEFT RIGHT INNER OUTER CROSS FULL GROUP BY ORDER " +
    "HAVING LIMIT OFFSET INSERT INTO VALUES UPDATE SET DELETE RETURNING CONFLICT DO NOTHING BEGIN COMMIT " +
    "ROLLBACK WITH DISTINCT ASC DESC COUNT SUM COALESCE FILTER ANY ALL EXISTS BETWEEN CASE WHEN THEN ELSE END " +
    "INTERVAL TRUE FALSE ARRAY EXCLUDED NOW DATE_TRUNC TO_CHAR LIKE ILIKE UNION"
  ).split(" "),
);

const TYPES = new Set(["INT", "INTEGER", "TEXT", "DATE", "NUMERIC", "BOOLEAN", "TIMESTAMPTZ", "BIGINT"]);

const PATTERN =
  /(--[^\n]*)|('(?:[^']|'')*'?)|("(?:[^"]|"")*"?)|(\$\d+)|(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(\s+)|(::|[^\sA-Za-z0-9_'"$-]+|[\s\S])/g;

export function tokenizeSql(sql: string): SqlToken[] {
  const tokens: SqlToken[] = [];
  for (const match of sql.matchAll(PATTERN)) {
    const [text, comment, string, quoted, param, number, word, space] = match;
    if (comment) tokens.push({ kind: "comment", text });
    else if (string) tokens.push({ kind: "string", text });
    else if (quoted) tokens.push({ kind: "identifier", text });
    else if (param) tokens.push({ kind: "param", text });
    else if (number) tokens.push({ kind: "number", text });
    else if (word) {
      const upper = word.toUpperCase();
      tokens.push({ kind: KEYWORDS.has(upper) || TYPES.has(upper) ? "keyword" : "identifier", text });
    } else if (space) tokens.push({ kind: "space", text });
    else tokens.push({ kind: "punctuation", text });
  }
  return tokens;
}

/** Tokens split into lines, for a numbered code view. */
export function tokenizeSqlLines(sql: string): SqlToken[][] {
  const lines: SqlToken[][] = [[]];
  for (const token of tokenizeSql(sql)) {
    const parts = token.text.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines[lines.length - 1].push({ kind: token.kind, text: part });
    });
  }
  return lines;
}
