/**
 * Admin panel: subscription plans and every customer's subscription.
 *
 * Reads subscription_plan, subscription and users; writes subscription_plan (create / edit / delete) and
 * subscription (cancel, extend, change plan). It NEVER writes payment: an admin action changes what the
 * customer has, not what was charged (that is payments.service). Schema: docs/schema/SCHEMA.md "Account &
 * billing"; spec: docs/backend/person-b-billing-payments.md section 6.
 *
 * Exports:
 *   listPlansWithStats · createPlan · updatePlan · deletePlan ·
 *   listAllSubscriptions · adminCancelSubscription · adminExtendSubscription · adminChangeSubscriptionPlan
 *
 * The admin UI shows the SQL of each write before it runs; src/lib/sql/admin-plans.ts and
 * src/lib/sql/admin-subscriptions.ts generate that text. Keep the statements below and those builders in step.
 */
import "server-only";

import { and, count, desc, eq, ne, sql, type SQL } from "drizzle-orm";
import { ConflictError, NotFoundError } from "@/server/errors";
import { escapeLike } from "@/lib/sql/admin-subscriptions";
import { ADMIN_PAGE_SIZE } from "@/lib/validation/admin";
import type {
  AdminPage,
  AdminPlan,
  AdminSubscriptionFilters,
  AdminSubscriptionRow,
  CreatePlanInput,
  SubscriptionStatus,
  UpdatePlanInput,
} from "@/types";
import { db } from "../db";
import { users } from "../db/schema/accounts";
import { subscription, subscriptionPlan } from "../db/schema/billing";

/** Row of the subscription ⋈ users ⋈ subscription_plan select, as node-postgres returns it. */
type AdminSubscriptionDbRow = {
  subscription_id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  plan_id: number;
  plan_name: string;
  plan_price_monthly: number | string;
  start_date: Date | string | null;
  end_date: Date | string | null;
  status: SubscriptionStatus;
  created_at: Date | string;
};

/** The pg error code, whether node-postgres or Drizzle (which wraps it in `cause`) threw it. */
function pgErrorCode(error: unknown): string | undefined {
  const { code, cause } = error as { code?: string; cause?: { code?: string } };
  return code ?? cause?.code;
}

/** db.execute returns timestamptz as text ('2027-04-02 16:45:00+00'), not a Date. */
function toIso(value: Date | string): string {
  return new Date(value).toISOString();
}

function toAdminRow(row: AdminSubscriptionDbRow): AdminSubscriptionRow {
  return {
    subscriptionId: row.subscription_id,
    userId: row.user_id,
    userName: row.user_name,
    userEmail: row.user_email,
    planId: row.plan_id,
    planName: row.plan_name,
    planPriceMonthly: Number(row.plan_price_monthly),
    startDate: row.start_date ? toIso(row.start_date) : null,
    endDate: row.end_date ? toIso(row.end_date) : null,
    status: row.status,
    createdAt: toIso(row.created_at),
  };
}

// ─── Plans ───────────────────────────────────────────────────────────────────

/** The plan columns plus its ACTIVE and total subscription counts; callers add the WHERE. */
function selectPlansWithStats() {
  return db
    .select({
      planId: subscriptionPlan.planId,
      name: subscriptionPlan.name,
      priceMonthly: subscriptionPlan.priceMonthly,
      videoQuality: subscriptionPlan.videoQuality,
      maxDevices: subscriptionPlan.maxDevices,
      maxProfiles: subscriptionPlan.maxProfiles,
      activeSubscribers:
        sql<number>`count(${subscription.subscriptionId}) filter (where ${subscription.status} = 'ACTIVE')`.mapWith(
          Number,
        ),
      totalSubscriptions: count(subscription.subscriptionId),
    })
    .from(subscriptionPlan)
    .leftJoin(subscription, eq(subscription.planId, subscriptionPlan.planId))
    .groupBy(subscriptionPlan.planId);
}

/** One plan with its counts, or NotFoundError. */
async function getPlanWithStats(planId: number): Promise<AdminPlan> {
  const [plan] = await selectPlansWithStats().where(eq(subscriptionPlan.planId, planId));
  if (!plan) {
    throw new NotFoundError("Plan not found.");
  }
  return { ...plan, priceMonthly: Number(plan.priceMonthly) };
}

/** The UNIQUE on name is case-sensitive, so also reject "feature" vs "Feature" before writing. */
async function assertNameFree(name: string, exceptPlanId?: number): Promise<void> {
  const [taken] = await db
    .select({ planId: subscriptionPlan.planId })
    .from(subscriptionPlan)
    .where(
      and(
        sql`lower(${subscriptionPlan.name}) = lower(${name})`,
        exceptPlanId === undefined ? undefined : ne(subscriptionPlan.planId, exceptPlanId),
      ),
    )
    .limit(1);
  if (taken) {
    throw new ConflictError("A plan with this name already exists.", "PLAN_NAME_TAKEN");
  }
}

/**
 * Every plan with its ACTIVE and total subscription counts, cheapest first.
 *
 * SQL:
 *   SELECT p.plan_id, p.name, p.price_monthly, p.video_quality, p.max_devices, p.max_profiles,
 *          COUNT(s.subscription_id) FILTER (WHERE s.status = 'ACTIVE') AS active_subscribers,
 *          COUNT(s.subscription_id) AS total_subscriptions
 *   FROM subscription_plan AS p
 *   LEFT JOIN subscription AS s ON s.plan_id = p.plan_id
 *   GROUP BY p.plan_id
 *   ORDER BY p.price_monthly, p.plan_id;
 */
export async function listPlansWithStats(): Promise<AdminPlan[]> {
  const plans = await selectPlansWithStats().orderBy(subscriptionPlan.priceMonthly, subscriptionPlan.planId);
  // LEFT JOIN + COUNT(column) keeps a plan nobody chose in the list with 0 and 0.
  return plans.map((plan) => ({ ...plan, priceMonthly: Number(plan.priceMonthly) }));
}

/**
 * Adds a plan; a duplicate name (case-insensitive) answers 409 PLAN_NAME_TAKEN.
 *
 * SQL:
 *   INSERT INTO subscription_plan (name, price_monthly, video_quality, max_devices, max_profiles)
 *   VALUES ($1, $2, $3, $4, $5) RETURNING *;
 */
export async function createPlan(input: CreatePlanInput): Promise<AdminPlan> {
  const name = input.name.trim();
  await assertNameFree(name);

  try {
    const [created] = await db
      .insert(subscriptionPlan)
      .values({
        name,
        priceMonthly: String(input.priceMonthly),
        videoQuality: input.videoQuality,
        maxDevices: input.maxDevices,
        maxProfiles: input.maxProfiles,
      })
      .returning();

    // A brand-new plan cannot have subscribers yet.
    return { ...created, priceMonthly: Number(created.priceMonthly), activeSubscribers: 0, totalSubscriptions: 0 };
  } catch (error) {
    // Two admins adding the same name at once: the UNIQUE constraint decides, not the check above.
    if (pgErrorCode(error) === "23505") {
      throw new ConflictError("A plan with this name already exists.", "PLAN_NAME_TAKEN");
    }
    throw error;
  }
}

/**
 * Edits only the fields sent. A price change applies to future charges only: payment.amount and existing
 * subscribers' plan_id are untouched.
 *
 * SQL (columns depend on what changed):
 *   UPDATE subscription_plan SET name = $1, price_monthly = $2 WHERE plan_id = $3 RETURNING *;
 */
export async function updatePlan(planId: number, input: UpdatePlanInput): Promise<AdminPlan> {
  // Fixed whitelist of columns; request keys are never used as column names.
  const changes: Partial<typeof subscriptionPlan.$inferInsert> = {};
  const name = input.name?.trim();
  if (name !== undefined) changes.name = name;
  if (input.priceMonthly !== undefined) changes.priceMonthly = String(input.priceMonthly);
  if (input.videoQuality !== undefined) changes.videoQuality = input.videoQuality;
  if (input.maxDevices !== undefined) changes.maxDevices = input.maxDevices;
  if (input.maxProfiles !== undefined) changes.maxProfiles = input.maxProfiles;

  // Nothing to change (the route's schema already rejects this): answer with the current row.
  if (Object.keys(changes).length === 0) {
    return getPlanWithStats(planId);
  }

  if (name !== undefined) {
    await assertNameFree(name, planId);
  }

  try {
    const [updated] = await db
      .update(subscriptionPlan)
      .set(changes)
      .where(eq(subscriptionPlan.planId, planId))
      .returning({ planId: subscriptionPlan.planId });
    if (!updated) {
      throw new NotFoundError("Plan not found.");
    }
  } catch (error) {
    if (pgErrorCode(error) === "23505") {
      throw new ConflictError("A plan with this name already exists.", "PLAN_NAME_TAKEN");
    }
    throw error;
  }

  // Re-read with counts for the response.
  return getPlanWithStats(planId);
}

/**
 * Deletes a plan no subscription (in any status) has ever used; otherwise 409 PLAN_IN_USE.
 *
 * SQL:
 *   DELETE FROM subscription_plan WHERE plan_id = $1;
 *   -- only after the FK error, for the message:
 *   SELECT COUNT(*) FROM subscription WHERE plan_id = $1;
 */
export async function deletePlan(planId: number): Promise<void> {
  try {
    const deleted = await db
      .delete(subscriptionPlan)
      .where(eq(subscriptionPlan.planId, planId))
      .returning({ planId: subscriptionPlan.planId });
    if (deleted.length === 0) {
      throw new NotFoundError("Plan not found.");
    }
  } catch (error) {
    // Let the FK (ON DELETE RESTRICT) decide, so a subscription created mid-request can't slip through.
    // RESTRICT reports 23001 (restrict_violation); 23503 is what NO ACTION would report.
    const code = pgErrorCode(error);
    if (code === "23001" || code === "23503") {
      // The count is only for the message, so it may be slightly stale.
      const [{ total }] = await db.select({ total: count() }).from(subscription).where(eq(subscription.planId, planId));
      throw new ConflictError(
        `This plan has ${total} subscription${total === 1 ? "" : "s"}, so it can't be deleted. ` +
          "Subscriptions keep pointing at their plan (ON DELETE RESTRICT) so billing history stays readable.",
        "PLAN_IN_USE",
      );
    }
    throw error;
  }
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

/**
 * Every customer's subscriptions, newest first, with user and plan; filterable by status and email, paginated.
 *
 * SQL:
 *   SELECT s.subscription_id, s.user_id, u.name AS user_name, u.email AS user_email,
 *          s.plan_id, p.name AS plan_name, p.price_monthly AS plan_price_monthly,
 *          s.start_date, s.end_date, s.status, s.created_at
 *   FROM subscription AS s
 *   JOIN users AS u ON u.user_id = s.user_id
 *   JOIN subscription_plan AS p ON p.plan_id = s.plan_id
 *   WHERE s.status = $1 AND u.email ILIKE $2 ESCAPE '\'   -- each only when filtered
 *   ORDER BY s.created_at DESC, s.subscription_id DESC
 *   LIMIT $3 OFFSET $4;
 *   -- plus the same FROM / JOIN / WHERE with SELECT COUNT(*) for the total.
 */
export async function listAllSubscriptions(
  filters: AdminSubscriptionFilters,
): Promise<AdminPage<AdminSubscriptionRow>> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? ADMIN_PAGE_SIZE;
  const q = filters.q?.trim();

  const where = and(
    filters.status ? eq(subscription.status, filters.status) : undefined,
    // Escape the user's text so "50%" or "a_b" match literally instead of acting as wildcards.
    q ? sql`${users.email} ILIKE ${`%${escapeLike(q)}%`} ESCAPE '\\'` : undefined,
  );

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        subscriptionId: subscription.subscriptionId,
        userId: subscription.userId,
        userName: users.name,
        userEmail: users.email,
        planId: subscription.planId,
        planName: subscriptionPlan.name,
        planPriceMonthly: subscriptionPlan.priceMonthly,
        startDate: subscription.startDate,
        endDate: subscription.endDate,
        status: subscription.status,
        createdAt: subscription.createdAt,
      })
      .from(subscription)
      .innerJoin(users, eq(users.userId, subscription.userId))
      .innerJoin(subscriptionPlan, eq(subscriptionPlan.planId, subscription.planId))
      .where(where)
      // The id breaks created_at ties so pages are stable.
      .orderBy(desc(subscription.createdAt), desc(subscription.subscriptionId))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db
      .select({ total: count() })
      .from(subscription)
      .innerJoin(users, eq(users.userId, subscription.userId))
      .where(where),
  ]);

  return {
    items: rows.map((row) => ({
      ...row,
      planPriceMonthly: Number(row.planPriceMonthly),
      startDate: row.startDate?.toISOString() ?? null,
      endDate: row.endDate?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  };
}

/** Runs an `UPDATE subscription ... RETURNING *` in a CTE joined to the user and plan; null when it matched no row. */
async function updateSubscriptionRow(update: SQL): Promise<AdminSubscriptionRow | null> {
  const result = await db.execute<AdminSubscriptionDbRow>(sql`
    WITH updated AS (
      ${update}
      RETURNING *
    )
    SELECT s.subscription_id, s.user_id, u.name AS user_name, u.email AS user_email,
           s.plan_id, p.name AS plan_name, p.price_monthly AS plan_price_monthly,
           s.start_date, s.end_date, s.status, s.created_at
    FROM updated AS s
    JOIN users AS u ON u.user_id = s.user_id
    JOIN subscription_plan AS p ON p.plan_id = s.plan_id;
  `);
  return result.rows[0] ? toAdminRow(result.rows[0]) : null;
}

/** After an UPDATE matched nothing: 404 when the subscription doesn't exist, otherwise 409. */
async function explainMiss(subscriptionId: number, verb: string, planId?: number): Promise<never> {
  const [existing] = await db
    .select({ status: subscription.status, planId: subscription.planId })
    .from(subscription)
    .where(eq(subscription.subscriptionId, subscriptionId))
    .limit(1);

  if (!existing) {
    throw new NotFoundError("Subscription not found.");
  }
  if (existing.status === "ACTIVE" && existing.planId === planId) {
    throw new ConflictError("The subscription is already on this plan.", "PLAN_UNCHANGED");
  }
  throw new ConflictError(`Only ACTIVE subscriptions can be ${verb}.`, "SUBSCRIPTION_NOT_ACTIVE");
}

/**
 * Cancels an ACTIVE subscription now; the dates stay (end_date is capped at now). No refund, no payment row.
 *
 * SQL:
 *   WITH updated AS (
 *     UPDATE subscription SET status = 'CANCELLED', end_date = LEAST(end_date, now())
 *     WHERE subscription_id = $1 AND status = 'ACTIVE' RETURNING *
 *   )
 *   SELECT ... FROM updated AS s JOIN users AS u ... JOIN subscription_plan AS p ...;
 *   -- no row back:  SELECT status FROM subscription WHERE subscription_id = $1;
 */
export async function adminCancelSubscription(subscriptionId: number): Promise<AdminSubscriptionRow> {
  // LEAST keeps a lapsed row's earlier end_date; the dates CHECK needs end_date > start_date, so never null them.
  const row = await updateSubscriptionRow(sql`
      UPDATE subscription
      SET status = 'CANCELLED', end_date = LEAST(end_date, now())
      WHERE subscription_id = ${subscriptionId} AND status = 'ACTIVE'
  `);
  return row ?? explainMiss(subscriptionId, "cancelled");
}

/**
 * Adds `months` calendar months to an ACTIVE subscription's end_date at no charge. Not idempotent.
 *
 * SQL:
 *   UPDATE subscription SET end_date = end_date + make_interval(months => $2)
 *   WHERE subscription_id = $1 AND status = 'ACTIVE' RETURNING *;   -- inside the same CTE
 */
export async function adminExtendSubscription(subscriptionId: number, months: number): Promise<AdminSubscriptionRow> {
  const row = await updateSubscriptionRow(sql`
      UPDATE subscription
      SET end_date = end_date + make_interval(months => ${months})
      WHERE subscription_id = ${subscriptionId} AND status = 'ACTIVE'
  `);
  return row ?? explainMiss(subscriptionId, "extended");
}

/**
 * Moves an ACTIVE subscription to another plan with no payment and no date change; the new price applies from
 * the next renewal.
 *
 * SQL:
 *   UPDATE subscription SET plan_id = $2
 *   WHERE subscription_id = $1 AND status = 'ACTIVE' AND plan_id <> $2 RETURNING *;   -- inside the same CTE
 */
export async function adminChangeSubscriptionPlan(
  subscriptionId: number,
  planId: number,
): Promise<AdminSubscriptionRow> {
  try {
    const row = await updateSubscriptionRow(sql`
      UPDATE subscription
      SET plan_id = ${planId}
      WHERE subscription_id = ${subscriptionId} AND status = 'ACTIVE' AND plan_id <> ${planId}
    `);
    return row ?? (await explainMiss(subscriptionId, "moved to another plan", planId));
  } catch (error) {
    // Only the plan FK is written here, so a foreign-key violation means the plan doesn't exist.
    if (pgErrorCode(error) === "23503") {
      throw new NotFoundError("Plan not found.");
    }
    throw error;
  }
}
