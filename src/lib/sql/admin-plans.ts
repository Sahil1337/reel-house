/**
 * The SQL the admin Plans page runs, generated for DISPLAY (nothing here touches a database). The plan
 * dialogs show it live as the admin types; admin-billing.service documents the same statements.
 *
 * Inputs are whatever the form holds right now, possibly half-typed, so values that aren't usable yet
 * (an empty price, NaN) are shown as NULL instead of throwing.
 */
import type { SqlParam, SqlStatement, UpdatePlanInput } from "@/types";

import { statement } from "./literal";

const PLAN_COLUMNS = "plan_id, name, price_monthly, video_quality, max_devices";

/** Column per editable field, in the order the SET list and the INSERT use. */
const COLUMN_OF = {
  name: "name",
  priceMonthly: "price_monthly",
  videoQuality: "video_quality",
  maxDevices: "max_devices",
} as const;

type PlanField = keyof typeof COLUMN_OF;

const FIELDS: PlanField[] = ["name", "priceMonthly", "videoQuality", "maxDevices"];

/** A usable SQL parameter: finite numbers and strings pass, everything else shows as NULL. */
function param(value: string | number | null | undefined): SqlParam {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  return value ?? null;
}

/** INSERT for the Add plan dialog. `input` is the form's current values. */
export function buildCreatePlanSql(input: {
  name?: string;
  priceMonthly?: number;
  videoQuality?: string;
  maxDevices?: number;
}): SqlStatement[] {
  return [
    statement({
      step: 1,
      title: "Insert the plan",
      explanation:
        "plan_id is generated. UNIQUE (name) rejects a duplicate name (23505, answered as 409), and the CHECKs refuse a negative price or zero devices.",
      sql: `INSERT INTO subscription_plan (name, price_monthly, video_quality, max_devices)
VALUES ($1, $2, $3, $4)
RETURNING ${PLAN_COLUMNS};`,
      params: FIELDS.map((field) => param(input[field])),
      table: "subscription_plan",
      rowCount: 1,
    }),
  ];
}

/**
 * UPDATE for the Edit plan dialog: only the columns in `changes`. Returns no statements when nothing
 * changed (the dialog keeps Save disabled then).
 */
export function buildUpdatePlanSql(planId: number, changes: UpdatePlanInput): SqlStatement[] {
  const changed = FIELDS.filter((field) => changes[field] !== undefined);
  if (changed.length === 0) return [];

  const assignments = changed.map((field, index) => `${COLUMN_OF[field]} = $${index + 1}`);
  return [
    statement({
      step: 1,
      title: "Update the plan",
      explanation:
        "Only the changed columns are in the SET list. payment.amount is not touched, and subscribers keep their plan_id: a new price applies from their next renewal.",
      sql: `UPDATE subscription_plan
SET ${assignments.join(", ")}
WHERE plan_id = $${changed.length + 1}
RETURNING ${PLAN_COLUMNS};`,
      params: [...changed.map((field) => param(changes[field])), planId],
      table: "subscription_plan",
      rowCount: 1,
    }),
  ];
}

/**
 * DELETE for the Delete plan dialog. `inUseCount` is the plan's total subscriptions: above zero the
 * DELETE is refused by the foreign key, and the count query that builds the 409 message is shown too.
 */
export function buildDeletePlanSql(planId: number, inUseCount: number): SqlStatement[] {
  const blocked = inUseCount > 0;
  const statements = [
    statement({
      step: 1,
      title: "Delete the plan",
      explanation: blocked
        ? `subscription.plan_id references subscription_plan ON DELETE RESTRICT, and ${inUseCount} subscription${inUseCount === 1 ? "" : "s"} still point here, so PostgreSQL refuses with a foreign-key violation (23503) and the API answers 409.`
        : "No subscription references this plan, so the RESTRICT foreign key lets the delete through.",
      sql: "DELETE FROM subscription_plan\nWHERE plan_id = $1;",
      params: [planId],
      table: "subscription_plan",
      rowCount: blocked ? 0 : 1,
    }),
  ];
  if (blocked) {
    statements.push(
      statement({
        step: 2,
        title: "Count what blocks it",
        explanation:
          "Runs only after the 23503, to put the number in the error message. The foreign key decides, not this count, so a subscription created a moment ago cannot slip past.",
        sql: "SELECT COUNT(*) AS subscriptions\nFROM subscription\nWHERE plan_id = $1;",
        params: [planId],
        table: "subscription",
        rowCount: 0,
      }),
    );
  }
  return statements;
}
