/**
 * The SQL the admin Subscriptions page runs, generated for DISPLAY (nothing here touches a database).
 * Each action dialog shows its statement with the real ids and values; admin-billing.service documents the
 * same statements.
 *
 * Every action is one UPDATE guarded by `status = 'ACTIVE'`: the WHERE both checks and writes in a single
 * atomic statement. When it matches no row, a second lookup tells "no such subscription" (404) from "not
 * ACTIVE" (409). The UPDATE sits in a CTE joined to users and subscription_plan so the same round trip
 * returns the table row.
 */
import type { AdminSubscriptionFilters, SqlParam, SqlStatement } from "@/types";

import { statement } from "./literal";

const ROW_COLUMNS = `s.subscription_id, s.user_id, u.name AS user_name, u.email AS user_email,
       s.plan_id, p.name AS plan_name, p.price_monthly AS plan_price_monthly,
       s.start_date, s.end_date, s.status, s.created_at`;

const JOINS = `JOIN users AS u ON u.user_id = s.user_id
JOIN subscription_plan AS p ON p.plan_id = s.plan_id`;

/** `UPDATE ... RETURNING *` inside a CTE, then joined to the user and the plan. */
function updateAndReturn(update: string): string {
  const body = update
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");
  return `WITH updated AS (
${body}
  RETURNING *
)
SELECT ${ROW_COLUMNS}
FROM updated AS s
${JOINS};`;
}

function whyNoRow(step: number, columns: string, subscriptionId: number): SqlStatement {
  return statement({
    step,
    title: "If no row came back",
    explanation:
      "Runs only when the UPDATE matched nothing, to tell the two cases apart: no row at all is a 404, a row that isn't ACTIVE is a 409.",
    sql: `SELECT ${columns}\nFROM subscription\nWHERE subscription_id = $1;`,
    params: [subscriptionId],
    table: "subscription",
    rowCount: 0,
  });
}

/** Cancel: status CANCELLED, period ends now (never later than it already was). No refund, no payment row. */
export function buildCancelSubscriptionSql(subscriptionId: number): SqlStatement[] {
  return [
    statement({
      step: 1,
      title: "Cancel the subscription",
      explanation:
        "Keeps start_date and ends the period now, so the dates CHECK (start_date IS NOT NULL AND end_date > start_date) still holds. LEAST() stops a lapsed row from being pushed forward to now. payment rows are not touched.",
      sql: updateAndReturn(
        `UPDATE subscription
SET status = 'CANCELLED', end_date = LEAST(end_date, now())
WHERE subscription_id = $1 AND status = 'ACTIVE'`,
      ),
      params: [subscriptionId],
      table: "subscription",
      rowCount: 1,
    }),
    whyNoRow(2, "status", subscriptionId),
  ];
}

/** Extend: end_date + N calendar months. No payment row; not idempotent. */
export function buildExtendSubscriptionSql(subscriptionId: number, months: number): SqlStatement[] {
  return [
    statement({
      step: 1,
      title: "Extend the paid period",
      explanation:
        "make_interval(months => n) adds calendar months (Jan 31 + 1 month = Feb 28/29). Only end_date grows, so the dates CHECK holds; status and user_id are unchanged, so subscription_one_active_per_user is not affected. No payment is recorded.",
      sql: updateAndReturn(
        `UPDATE subscription
SET end_date = end_date + make_interval(months => $2)
WHERE subscription_id = $1 AND status = 'ACTIVE'`,
      ),
      params: [subscriptionId, Number.isFinite(months) ? months : null],
      table: "subscription",
      rowCount: 1,
    }),
    whyNoRow(2, "status", subscriptionId),
  ];
}

/** Change plan (admin override): plan_id only, no payment, dates unchanged. */
export function buildChangePlanSql(subscriptionId: number, planId: number | null): SqlStatement[] {
  return [
    statement({
      step: 1,
      title: "Move the subscription to the new plan",
      explanation:
        "Only plan_id changes: no payment is recorded and start_date / end_date stay as they are, so the new price applies from the next renewal. An unknown plan fails the plan_id foreign key (23503, answered as 404); plan_id <> $2 refuses a no-op.",
      sql: updateAndReturn(
        `UPDATE subscription
SET plan_id = $2
WHERE subscription_id = $1 AND status = 'ACTIVE' AND plan_id <> $2`,
      ),
      params: [subscriptionId, planId],
      table: "subscription",
      rowCount: 1,
    }),
    whyNoRow(2, "status, plan_id", subscriptionId),
  ];
}

/** Escapes LIKE wildcards so "50%" or "a_b" match literally. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

const DEFAULT_PAGE_SIZE = 20;

/** The two reads behind the table: the page of rows and the count for pagination. */
export function buildListSubscriptionsSql(filters: AdminSubscriptionFilters): SqlStatement[] {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const q = filters.q?.trim();
  const where = `WHERE ($1::subscription_status IS NULL OR s.status = $1)
  AND ($2::text IS NULL OR u.email ILIKE '%' || $2 || '%' ESCAPE '\\')`;
  const filterParams: SqlParam[] = [filters.status ?? null, q ? escapeLike(q) : null];

  return [
    statement({
      step: 1,
      title: "Load the page",
      explanation:
        "subscription joined to its user and plan. A NULL parameter switches its filter off; the email search escapes % and _ so they match literally. The id breaks created_at ties so pages are stable.",
      sql: `SELECT ${ROW_COLUMNS}
FROM subscription AS s
${JOINS}
${where}
ORDER BY s.created_at DESC, s.subscription_id DESC
LIMIT $3 OFFSET $4;`,
      params: [...filterParams, pageSize, (page - 1) * pageSize],
      table: "subscription",
      rowCount: 0,
    }),
    statement({
      step: 2,
      title: "Count the matches",
      explanation: 'Same joins and filters without ORDER BY / LIMIT, for "21-40 of 312" and the page count.',
      sql: `SELECT COUNT(*)::int AS total
FROM subscription AS s
${JOINS}
${where};`,
      params: filterParams,
      table: "subscription",
      rowCount: 0,
    }),
  ];
}
