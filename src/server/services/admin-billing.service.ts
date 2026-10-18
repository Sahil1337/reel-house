/**
 * Admin panel: subscription plans and every customer's subscription.
 *
 * Tables it reads: subscription_plan, subscription, users. It writes subscription_plan (create / edit /
 * delete a plan) and subscription (cancel, extend, change plan). It NEVER writes payment: money movement is
 * recorded only by payments.service (verify / webhook); an admin action changes what the customer has, not
 * what was charged.
 *
 * Schema: docs/schema/SCHEMA.md "Account & billing" and "Payment flow". Constraints these functions rely on:
 *   - subscription_plan: PK plan_id, UNIQUE (name), CHECK (price_monthly >= 0), CHECK (max_devices > 0).
 *   - subscription: FK plan_id -> subscription_plan ON DELETE RESTRICT, FK user_id -> users ON DELETE RESTRICT,
 *     partial UNIQUE index subscription_one_active_per_user ON subscription (user_id) WHERE status = 'ACTIVE',
 *     and the dates CHECK (drizzle/0002_fix_subscription_check.sql):
 *       CHECK ((status IN ('PENDING', 'CANCELLED') AND start_date IS NULL AND end_date IS NULL)
 *              OR (start_date IS NOT NULL AND end_date > start_date))
 *     i.e. a never-paid row has no dates, a paid row (ACTIVE / EXPIRED / CANCELLED after a payment) has both
 *     and the period is non-empty.
 *   - payment: FK subscription_id -> subscription ON DELETE RESTRICT; amount is "what was charged", not a
 *     copy of the plan price, so it never follows a plan edit.
 *
 * Exports:
 *   listPlansWithStats()                              GET    /api/admin/plans
 *   createPlan(input)                                 POST   /api/admin/plans
 *   updatePlan(planId, input)                         PATCH  /api/admin/plans/:planId
 *   deletePlan(planId)                                DELETE /api/admin/plans/:planId
 *   listAllSubscriptions(filters)                     GET    /api/admin/subscriptions
 *   adminCancelSubscription(subscriptionId)           PATCH  /api/admin/subscriptions/:subscriptionId  { action: "cancel" }
 *   adminExtendSubscription(subscriptionId, months)   PATCH  ... { action: "extend", months }
 *   adminChangeSubscriptionPlan(subscriptionId, planId) PATCH ... { action: "change_plan", planId }
 *
 * The admin UI shows the SQL of each write before it runs; src/lib/sql/admin-plans.ts and
 * src/lib/sql/admin-subscriptions.ts generate that text. Keep the statements below and those builders in step.
 */
import "server-only";

import { getMockDb } from "@/server/mocks/db";
import { ConflictError, NotFoundError } from "@/server/errors";
import type {
  AdminPage,
  AdminPlan,
  AdminSubscriptionFilters,
  AdminSubscriptionRow,
  CreatePlanInput,
  Subscription,
  UpdatePlanInput,
} from "@/types";

const DEFAULT_PAGE_SIZE = 20;

/** The plan row with its subscription counts, from the mock rows. */
function toAdminPlan(planId: number): AdminPlan {
  const { plans, subscriptions } = getMockDb();
  const plan = plans.find((entry) => entry.planId === planId)!;
  const mine = subscriptions.filter((entry) => entry.planId === planId);
  return {
    ...plan,
    activeSubscribers: mine.filter((entry) => entry.status === "ACTIVE").length,
    totalSubscriptions: mine.length,
  };
}

/** subscription ⋈ users ⋈ subscription_plan, from the mock rows. */
function toAdminRow(subscription: Subscription): AdminSubscriptionRow {
  const { users, plans } = getMockDb();
  const user = users.find((entry) => entry.userId === subscription.userId)!;
  const plan = plans.find((entry) => entry.planId === subscription.planId)!;
  return {
    subscriptionId: subscription.subscriptionId,
    userId: subscription.userId,
    userName: user.name,
    userEmail: user.email,
    planId: plan.planId,
    planName: plan.name,
    planPriceMonthly: plan.priceMonthly,
    startDate: subscription.startDate,
    endDate: subscription.endDate,
    status: subscription.status,
    createdAt: subscription.createdAt,
  };
}

/** The mock subscription or NotFoundError (the mock stand-in for "UPDATE matched no row, and no row exists"). */
function findSubscription(subscriptionId: number): Subscription {
  const subscription = getMockDb().subscriptions.find((entry) => entry.subscriptionId === subscriptionId);
  if (!subscription) throw new NotFoundError("Subscription not found.");
  return subscription;
}

function requireActive(subscription: Subscription, verb: string): void {
  if (subscription.status !== "ACTIVE") {
    throw new ConflictError(`Only ACTIVE subscriptions can be ${verb}.`, "SUBSCRIPTION_NOT_ACTIVE");
  }
}

/** end_date + N calendar months, the way make_interval(months => N) moves a timestamptz (clamped at month end). */
function addMonths(iso: string, months: number): string {
  const date = new Date(iso);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}

// ─── Plans ───────────────────────────────────────────────────────────────────

/**
 * Every plan with how many subscriptions use it, cheapest first (the admin Plans page).
 *
 * Steps:
 *   1. subscription_plan LEFT JOIN subscription, grouped by plan; one pass counts the ACTIVE subscribers
 *      (FILTER) and every subscription ever (the number that blocks a delete).
 *   2. Map snake_case columns to the camelCase fields of AdminPlan; COUNT is cast to int in SQL because
 *      node-postgres returns bigint as a string, and price_monthly (numeric) needs Number() in TS.
 * SQL:
 *   SELECT p.plan_id, p.name, p.price_monthly, p.video_quality, p.max_devices,
 *          COUNT(s.subscription_id) FILTER (WHERE s.status = 'ACTIVE')::int AS active_subscribers,
 *          COUNT(s.subscription_id)::int                                    AS total_subscriptions
 *   FROM subscription_plan AS p
 *   LEFT JOIN subscription AS s ON s.plan_id = p.plan_id
 *   GROUP BY p.plan_id
 *   ORDER BY p.price_monthly, p.plan_id;
 * Tables: subscription_plan, subscription  ·  Keys/constraints relied on: PK plan_id (GROUP BY p.plan_id
 *   makes the other plan columns functionally dependent, so they need no aggregate); index on
 *   subscription (plan_id, status) keeps the join cheap as the table grows.
 * Transaction: no  ·  Idempotent: yes (read)
 * Edge cases: a plan nobody chose still appears, with 0 and 0 (LEFT JOIN + COUNT of a column, not COUNT(*)).
 * Throws: nothing (the route's requireAdmin has already run).
 * Called by: GET /api/admin/plans (and, server-side, the admin Plans page through serverApi.getAdminPlans)
 * Mock today: db.plans with counts computed from db.subscriptions, sorted by price.
 */
export async function listPlansWithStats(): Promise<AdminPlan[]> {
  // TODO: implement
  return getMockDb()
    .plans.map((plan) => toAdminPlan(plan.planId))
    .toSorted((a, b) => a.priceMonthly - b.priceMonthly || a.planId - b.planId);
}

/**
 * Adds a plan.
 *
 * Steps:
 *   1. INSERT the row; plan_id is generated. The input is already validated by planSchema (name 1-50
 *      characters, price >= 0 with at most two decimals, video quality one of 720p / 1080p / 4K, max devices
 *      1-32767); the CHECKs below are the backstop.
 *   2. Return the new row as an AdminPlan with 0 active and 0 total subscriptions (nobody can have chosen a
 *      plan that did not exist a moment ago).
 *   3. A unique violation on subscription_plan.name (pg 23505) becomes a ConflictError.
 * SQL:
 *   INSERT INTO subscription_plan (name, price_monthly, video_quality, max_devices)
 *   VALUES ($1, $2, $3, $4)
 *   RETURNING plan_id, name, price_monthly, video_quality, max_devices;
 * Tables: subscription_plan  ·  Keys/constraints relied on: UNIQUE (name) (the constraint decides, not a
 *   SELECT first: two admins adding "Family" at once cannot both win); CHECK (price_monthly >= 0);
 *   CHECK (max_devices > 0); name VARCHAR(50), video_quality VARCHAR(10).
 * Transaction: no (one statement)  ·  Idempotent: no (a repeat answers 409)
 * Edge cases: the UNIQUE is case-sensitive, so "feature" and "Feature" can coexist in the database. For the
 *   admin that reads as a duplicate, so the implementation may also reject a case-insensitive match first
 *   (SELECT 1 FROM subscription_plan WHERE lower(name) = lower($1)), or the schema can later gain a
 *   UNIQUE INDEX ON subscription_plan (lower(name)); the 23505 catch stays either way. Trim the name before
 *   inserting (planSchema already does).
 * Throws: ConflictError("A plan with this name already exists.", "PLAN_NAME_TAKEN") on 23505 for the name.
 * Called by: POST /api/admin/plans (201)
 * Mock today: ConflictError when a mock plan has the same name (case-insensitive); otherwise a plan with
 *   planId = highest id + 1 and 0 subscriptions. Nothing is persisted.
 */
export async function createPlan(input: CreatePlanInput): Promise<AdminPlan> {
  // TODO: implement
  const { plans } = getMockDb();
  if (plans.some((plan) => plan.name.toLowerCase() === input.name.trim().toLowerCase())) {
    throw new ConflictError("A plan with this name already exists.", "PLAN_NAME_TAKEN");
  }
  return {
    planId: Math.max(0, ...plans.map((plan) => plan.planId)) + 1,
    name: input.name.trim(),
    priceMonthly: input.priceMonthly,
    videoQuality: input.videoQuality,
    maxDevices: input.maxDevices,
    activeSubscribers: 0,
    totalSubscriptions: 0,
  };
}

/**
 * Edits a plan. Send only the fields that changed.
 *
 * Business rule (put it in the UI copy too): a price change affects FUTURE charges only.
 *   - Past payment.amount values are untouched: payment.amount is the historical record of what was charged
 *     (SCHEMA.md: "what was charged, not a copy of the plan price"), so no UPDATE ever touches payment.
 *   - Existing subscribers keep their plan (subscription.plan_id does not change). The new price applies from
 *     their next renewal or checkout, when createPendingSubscription / the amount check read
 *     subscription_plan.price_monthly again.
 *   - Video quality and max devices are read live from the plan, so those changes take effect immediately for
 *     everyone on it.
 *
 * Steps:
 *   1. Build the SET list from the keys present in `input` (camelCase -> snake_case, a fixed whitelist of the
 *      four columns; never interpolate keys from the request). Zero keys is a 422 already caught by
 *      updatePlanSchema, but guard anyway.
 *   2. UPDATE ... WHERE plan_id = $n RETURNING the row; no row -> NotFoundError.
 *   3. Re-count subscribers for the response (same query as listPlansWithStats for this plan_id), or run the
 *      UPDATE in a CTE joined to that count.
 * SQL (columns depend on what changed; the admin dialog shows the real statement):
 *   UPDATE subscription_plan
 *   SET name = $1, price_monthly = $2          -- only the changed columns
 *   WHERE plan_id = $3
 *   RETURNING plan_id, name, price_monthly, video_quality, max_devices;
 * Tables: subscription_plan (writes), subscription (read for the counts)  ·  Keys/constraints relied on:
 *   UNIQUE (name) -> 23505; CHECK (price_monthly >= 0); CHECK (max_devices > 0); PK plan_id.
 * Transaction: no (one statement; the follow-up count is a read)  ·  Idempotent: yes (same input, same row)
 * Edge cases: renaming a plan to its own current name is not a conflict (UNIQUE ignores the row itself); a
 *   no-op change returns the row unchanged. Lowering max_devices below what a subscriber currently streams on
 *   is not checked here (enforcement happens at playback).
 * Throws: NotFoundError("Plan not found.") · ConflictError("A plan with this name already exists.",
 *   "PLAN_NAME_TAKEN") on 23505.
 * Called by: PATCH /api/admin/plans/:planId
 * Mock today: NotFoundError for an unknown plan, ConflictError when another mock plan has the new name
 *   (case-insensitive); otherwise the merged plan with real counts. Nothing is persisted.
 */
export async function updatePlan(planId: number, input: UpdatePlanInput): Promise<AdminPlan> {
  // TODO: implement
  const { plans } = getMockDb();
  const current = plans.find((plan) => plan.planId === planId);
  if (!current) throw new NotFoundError("Plan not found.");
  const name = input.name?.trim();
  if (name && plans.some((plan) => plan.planId !== planId && plan.name.toLowerCase() === name.toLowerCase())) {
    throw new ConflictError("A plan with this name already exists.", "PLAN_NAME_TAKEN");
  }
  return {
    ...toAdminPlan(planId),
    ...(name !== undefined && { name }),
    ...(input.priceMonthly !== undefined && { priceMonthly: input.priceMonthly }),
    ...(input.videoQuality !== undefined && { videoQuality: input.videoQuality }),
    ...(input.maxDevices !== undefined && { maxDevices: input.maxDevices }),
  };
}

/**
 * Deletes a plan nobody has ever used.
 *
 * subscription.plan_id references subscription_plan ON DELETE RESTRICT, so the database itself refuses to
 * delete a plan that any subscription (in ANY status, ACTIVE or long EXPIRED) still points at. Billing history
 * must keep its plan name, which is why this is RESTRICT and not CASCADE or SET NULL.
 *
 * Steps:
 *   1. DELETE the row. On success the plan had no subscriptions.
 *   2. Zero rows deleted -> NotFoundError.
 *   3. Foreign-key violation (pg 23503, constraint on subscription.plan_id) -> count the blocking rows, only to
 *      build the message, and throw ConflictError("This plan has N subscriptions, so it can't be deleted. …",
 *      "PLAN_IN_USE"). Catch the FK error rather than pre-counting and deciding from the count: a subscription
 *      created between "count = 0" and "DELETE" would otherwise surface as a 500. The count query is
 *      cosmetic and may be slightly stale.
 * SQL:
 *   DELETE FROM subscription_plan WHERE plan_id = $1;
 *   -- only after a 23503, for the message:
 *   SELECT COUNT(*)::int AS subscriptions FROM subscription WHERE plan_id = $1;
 * Tables: subscription_plan (writes), subscription (read for the message)  ·  Keys/constraints relied on:
 *   FK subscription.plan_id -> subscription_plan ON DELETE RESTRICT (23503); PK plan_id.
 * Transaction: no (the DELETE is atomic; the count is outside it)  ·  Idempotent: yes in effect (a second
 *   call answers 404)
 * Edge cases: a plan with only EXPIRED / CANCELLED / PENDING subscriptions is still blocked; "retire" a plan
 *   by renaming it or (later) with an archived flag, not by deleting it. Deleting leaves payment untouched
 *   (payment points at subscription, not at the plan).
 * Throws: NotFoundError("Plan not found.") · ConflictError("This plan has N subscriptions, so it can't be
 *   deleted. …", "PLAN_IN_USE") (409).
 * Called by: DELETE /api/admin/plans/:planId (204 with no body)
 * Mock today: NotFoundError for an unknown plan; ConflictError PLAN_IN_USE with the real mock subscription
 *   count when any mock subscription references the plan; otherwise resolves (nothing is deleted).
 */
export async function deletePlan(planId: number): Promise<void> {
  // TODO: implement
  const { plans, subscriptions } = getMockDb();
  if (!plans.some((plan) => plan.planId === planId)) throw new NotFoundError("Plan not found.");
  const count = subscriptions.filter((subscription) => subscription.planId === planId).length;
  if (count > 0) {
    throw new ConflictError(
      `This plan has ${count} subscription${count === 1 ? "" : "s"}, so it can't be deleted. ` +
        "Subscriptions keep pointing at their plan (ON DELETE RESTRICT) so billing history stays readable.",
      "PLAN_IN_USE",
    );
  }
}

// ─── Subscriptions ───────────────────────────────────────────────────────────

/**
 * Every customer's subscriptions, newest first, with the user and the plan; filterable and paginated.
 *
 * Steps:
 *   1. Build the WHERE from the filters: status = $n when given; users.email ILIKE '%' || $n || '%' ESCAPE '\'
 *      when q is given. Escape the user's text first (replace \ % _ with \\ \% \_) so "50%" or "a_b" match
 *      literally instead of acting as wildcards.
 *   2. Page query: ORDER BY s.created_at DESC, s.subscription_id DESC (the id breaks ties so pages are stable)
 *      LIMIT pageSize OFFSET (page - 1) * pageSize. pageSize defaults to 20, max 100 (schema-validated).
 *   3. Count query with the same WHERE (no ORDER/LIMIT) for `total`; pageCount = max(1, ceil(total / pageSize)).
 *      Run both in one transaction (or in parallel; a count that is off by one during a concurrent write is
 *      harmless).
 * SQL:
 *   SELECT s.subscription_id, s.user_id, u.name AS user_name, u.email AS user_email,
 *          s.plan_id, p.name AS plan_name, p.price_monthly AS plan_price_monthly,
 *          s.start_date, s.end_date, s.status, s.created_at
 *   FROM subscription AS s
 *   JOIN users AS u ON u.user_id = s.user_id
 *   JOIN subscription_plan AS p ON p.plan_id = s.plan_id
 *   WHERE ($1::subscription_status IS NULL OR s.status = $1)
 *     AND ($2::text IS NULL OR u.email ILIKE '%' || $2 || '%' ESCAPE '\')
 *   ORDER BY s.created_at DESC, s.subscription_id DESC
 *   LIMIT $3 OFFSET $4;
 *   -- and the same FROM / JOIN / WHERE with  SELECT COUNT(*)::int AS total  for the page count.
 * Tables: subscription, users, subscription_plan  ·  Keys/constraints relied on: FKs make both joins
 *   inner-join safe (every subscription has a user and a plan); users has UNIQUE INDEX users_email_key
 *   (lower(email)), which serves equality lookups but NOT a leading-wildcard ILIKE, so the search is a scan
 *   (fine at this size; add a pg_trgm GIN index on lower(email) if it ever hurts); subscription (created_at DESC)
 *   index for the ORDER BY.
 * Transaction: optional (one read-only snapshot for rows + count)  ·  Idempotent: yes (read)
 * Edge cases: page beyond pageCount returns items: [] with the real total; PENDING rows have NULL
 *   start_date / end_date, so the table shows "—"; an empty q means no email filter.
 * Throws: nothing (filters are validated by adminSubscriptionQuerySchema in the route).
 * Called by: GET /api/admin/subscriptions
 * Mock today: filters (status, case-insensitive email substring), sorts by createdAt desc then id desc, and
 *   slices the mock subscriptions in memory.
 */
export async function listAllSubscriptions(
  filters: AdminSubscriptionFilters,
): Promise<AdminPage<AdminSubscriptionRow>> {
  // TODO: implement
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = filters.pageSize ?? DEFAULT_PAGE_SIZE;
  const needle = filters.q?.trim().toLowerCase();

  const rows = getMockDb()
    .subscriptions.map(toAdminRow)
    .filter((row) => (filters.status ? row.status === filters.status : true))
    .filter((row) => (needle ? row.userEmail.toLowerCase().includes(needle) : true))
    .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt) || b.subscriptionId - a.subscriptionId);

  return {
    items: rows.slice((page - 1) * pageSize, page * pageSize),
    total: rows.length,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(rows.length / pageSize)),
  };
}

/**
 * Cancels an ACTIVE subscription on the customer's behalf, effective now.
 *
 * Steps:
 *   1. UPDATE the row to CANCELLED and end the period now, only if it is ACTIVE (the WHERE makes the check and
 *      the write one atomic statement, so two admins cannot both "win"). Wrap it in a CTE joined to users and
 *      subscription_plan to return the AdminSubscriptionRow in the same round trip.
 *   2. No row came back: SELECT status FROM subscription WHERE subscription_id = $1. No row -> NotFoundError;
 *      a row that is not ACTIVE -> ConflictError (SUBSCRIPTION_NOT_ACTIVE).
 * SQL:
 *   WITH updated AS (
 *     UPDATE subscription
 *     SET status = 'CANCELLED', end_date = LEAST(end_date, now())
 *     WHERE subscription_id = $1 AND status = 'ACTIVE'
 *     RETURNING *
 *   )
 *   SELECT s.subscription_id, s.user_id, u.name AS user_name, u.email AS user_email, s.plan_id,
 *          p.name AS plan_name, p.price_monthly AS plan_price_monthly, s.start_date, s.end_date, s.status,
 *          s.created_at
 *   FROM updated AS s
 *   JOIN users AS u ON u.user_id = s.user_id
 *   JOIN subscription_plan AS p ON p.plan_id = s.plan_id;
 *   -- no row back:  SELECT status FROM subscription WHERE subscription_id = $1;
 * Tables: subscription (writes), users, subscription_plan (read)  ·  Keys/constraints relied on:
 *   the dates CHECK
 *     CHECK ((status IN ('PENDING', 'CANCELLED') AND start_date IS NULL AND end_date IS NULL)
 *            OR (start_date IS NOT NULL AND end_date > start_date))
 *   A paid row that becomes CANCELLED keeps start_date, so the first branch (which demands NULL dates for
 *   CANCELLED) is false and the second must hold: start_date IS NOT NULL (it is: ACTIVE rows were paid) and
 *   end_date > start_date. Setting end_date to now() is legal as long as start_date < now(), which is always
 *   true for a period that has started. Never null the dates: that would violate the second branch.
 *   Partial UNIQUE index subscription_one_active_per_user: cancelling removes a row from the index (status
 *   leaves 'ACTIVE'), it can never create a second ACTIVE row, so it cannot conflict.
 * Transaction: no (one atomic statement; the follow-up SELECT only explains a miss)  ·  Idempotent: no (the
 *   second call answers 409 because the row is no longer ACTIVE)
 * Edge cases: LEAST(end_date, now()) rather than a bare now(): an ACTIVE row whose period already lapsed (the
 *   expiry job has not flipped it yet) keeps its earlier end_date instead of being "extended" to now. No
 *   refund is issued and payment rows are not touched; refunds are a Razorpay action and a payment.status
 *   change handled by payments.service. The customer loses access immediately (access is derived from
 *   ACTIVE + end_date > now()).
 * Throws: NotFoundError("Subscription not found.") · ConflictError("Only ACTIVE subscriptions can be
 *   cancelled.", "SUBSCRIPTION_NOT_ACTIVE")
 * Called by: PATCH /api/admin/subscriptions/:subscriptionId  { action: "cancel" }
 * Mock today: NotFoundError for an unknown id, ConflictError when the mock row is not ACTIVE; otherwise the row
 *   as it would be afterwards (CANCELLED, endDate = min(endDate, now)). Nothing is persisted.
 */
export async function adminCancelSubscription(subscriptionId: number): Promise<AdminSubscriptionRow> {
  // TODO: implement
  const subscription = findSubscription(subscriptionId);
  requireActive(subscription, "cancelled");
  const now = new Date().toISOString();
  const endDate = subscription.endDate && subscription.endDate < now ? subscription.endDate : now;
  return toAdminRow({ ...subscription, status: "CANCELLED", endDate });
}

/**
 * Gives an ACTIVE subscription extra months at no charge (goodwill, support fix).
 *
 * Steps:
 *   1. UPDATE end_date = end_date + make_interval(months => $2) for the row, only while ACTIVE (CTE + joins
 *      to return the AdminSubscriptionRow, as in adminCancelSubscription).
 *   2. No row back: SELECT status FROM subscription WHERE subscription_id = $1 -> NotFoundError / ConflictError.
 * SQL:
 *   WITH updated AS (
 *     UPDATE subscription
 *     SET end_date = end_date + make_interval(months => $2)
 *     WHERE subscription_id = $1 AND status = 'ACTIVE'
 *     RETURNING *
 *   )
 *   SELECT … FROM updated AS s JOIN users … JOIN subscription_plan …;   -- same select list as the list query
 *   -- no row back:  SELECT status FROM subscription WHERE subscription_id = $1;
 * Tables: subscription (writes), users, subscription_plan (read)  ·  Keys/constraints relied on: the dates
 *   CHECK holds because start_date is untouched and end_date only grows (end_date > start_date stays true);
 *   the partial UNIQUE index subscription_one_active_per_user is unaffected (user_id and status do not change,
 *   so no second ACTIVE row can appear). months is validated by extendMonthsSchema (whole number, 1 to 24).
 * Transaction: no (one atomic statement)  ·  Idempotent: NO: every call adds months again. The UI sends one
 *   request per click; do not retry automatically.
 * Edge cases: interval math is calendar-aware (Jan 31 + 1 month = Feb 28/29). Extending a lapsed-but-still-
 *   ACTIVE row (end_date in the past, expiry job not run) adds on top of the OLD end_date, so the customer may
 *   still be expired afterwards; the UI shows the new end date before the admin confirms. No payment row is
 *   written: an extension is a gift, not revenue, and payment.amount must keep meaning "what was charged".
 * Throws: NotFoundError("Subscription not found.") · ConflictError("Only ACTIVE subscriptions can be
 *   extended.", "SUBSCRIPTION_NOT_ACTIVE")
 * Called by: PATCH /api/admin/subscriptions/:subscriptionId  { action: "extend", months }
 * Mock today: NotFoundError / ConflictError against the mock row; otherwise the row with endDate moved forward
 *   by `months` calendar months. Nothing is persisted.
 */
export async function adminExtendSubscription(subscriptionId: number, months: number): Promise<AdminSubscriptionRow> {
  // TODO: implement
  const subscription = findSubscription(subscriptionId);
  requireActive(subscription, "extended");
  const endDate = subscription.endDate ? addMonths(subscription.endDate, months) : subscription.endDate;
  return toAdminRow({ ...subscription, endDate });
}

/**
 * Admin override: moves an ACTIVE subscription to another plan without a payment.
 *
 * This is NOT the customer upgrade flow (that is a new checkout: PENDING subscription + Razorpay order +
 * payment). Here:
 *   - NO payment row is recorded and nobody is charged or refunded;
 *   - start_date and end_date stay as they are (no proration);
 *   - the new plan's price applies from the next renewal;
 *   - the new plan's video quality and device limit apply immediately (they are read from the plan).
 *
 * Steps:
 *   1. UPDATE plan_id for the row, only while ACTIVE and only if the plan actually changes (CTE + joins to
 *      return the AdminSubscriptionRow).
 *   2. No row back: SELECT status, plan_id FROM subscription WHERE subscription_id = $1. No row ->
 *      NotFoundError("Subscription not found."); not ACTIVE -> ConflictError SUBSCRIPTION_NOT_ACTIVE; same
 *      plan_id -> ConflictError("The subscription is already on this plan.", "PLAN_UNCHANGED").
 *   3. A foreign-key violation on subscription.plan_id (pg 23503) means the plan does not exist ->
 *      NotFoundError("Plan not found."). (Check the constraint name so a user_id violation is never
 *      misreported; user_id is not written here, so only the plan FK can fire.)
 * SQL:
 *   WITH updated AS (
 *     UPDATE subscription
 *     SET plan_id = $2
 *     WHERE subscription_id = $1 AND status = 'ACTIVE' AND plan_id <> $2
 *     RETURNING *
 *   )
 *   SELECT … FROM updated AS s JOIN users … JOIN subscription_plan …;   -- same select list as the list query
 *   -- no row back:  SELECT status, plan_id FROM subscription WHERE subscription_id = $1;
 * Tables: subscription (writes), users, subscription_plan (read)  ·  Keys/constraints relied on: FK plan_id ->
 *   subscription_plan (23503 for an unknown plan); the dates CHECK is unaffected (dates untouched); the
 *   partial UNIQUE index subscription_one_active_per_user is unaffected (user_id and status do not change). The
 *   other two actions respect it for the same reason: cancel only moves a row OUT of ACTIVE, extend changes
 *   end_date, so no action here can ever create a second ACTIVE row for a user.
 * Transaction: no (one atomic statement)  ·  Idempotent: yes (repeat answers 409 PLAN_UNCHANGED, state is the
 *   same)
 * Edge cases: downgrading mid-period gives the customer a cheaper plan for the rest of the paid period (the
 *   admin chose that); the payment history still shows what they paid, under the plan name of the
 *   subscription row as it is now (payments join through subscription).
 * Throws: NotFoundError("Subscription not found.") · NotFoundError("Plan not found.") · ConflictError(…,
 *   "SUBSCRIPTION_NOT_ACTIVE") · ConflictError("The subscription is already on this plan.", "PLAN_UNCHANGED")
 * Called by: PATCH /api/admin/subscriptions/:subscriptionId  { action: "change_plan", planId }
 * Mock today: the same four checks against the mock rows; otherwise the row with the new plan's id, name and
 *   price. Nothing is persisted.
 */
export async function adminChangeSubscriptionPlan(
  subscriptionId: number,
  planId: number,
): Promise<AdminSubscriptionRow> {
  // TODO: implement
  const subscription = findSubscription(subscriptionId);
  requireActive(subscription, "moved to another plan");
  if (!getMockDb().plans.some((plan) => plan.planId === planId)) throw new NotFoundError("Plan not found.");
  if (subscription.planId === planId) {
    throw new ConflictError("The subscription is already on this plan.", "PLAN_UNCHANGED");
  }
  return toAdminRow({ ...subscription, planId });
}
