/**
 * Billing: plans, subscriptions and the payment history.
 *
 * Tables owned: subscription_plan, subscription, payment (reads here; payment rows are WRITTEN by
 * payments.service — verify / webhook — never by these functions).
 *
 * Exports:
 *   listPlans · getPlan · getActiveSubscription · listSubscriptions · listPayments ·
 *   createPendingSubscription · cancelSubscription
 *
 * Schema: docs/schema/SCHEMA.md "Account & billing" and "Payment flow". One subscription = one Razorpay order;
 * many payment rows (attempts) point at it. A user has many subscriptions over time, but only one
 * ACTIVE at once (partial UNIQUE index subscription_one_active_per_user).
 */
import "server-only";

import { ConflictError, NotFoundError } from "@/server/errors";
import type { PaymentWithPlan, Subscription, SubscriptionPlan, SubscriptionWithPlan } from "@/types";
import { db } from "../db";
import { subscriptionPlan, subscription, payment } from "../db/schema/billing";
import { and, desc, eq } from "drizzle-orm";

type SubscriptionRow = typeof subscription.$inferSelect;

/** DB row (Date timestamps) → API shape (ISO strings). */
function toSubscription(row: SubscriptionRow): Subscription {
  return {
    ...row,
    startDate: row.startDate?.toISOString() ?? null,
    endDate: row.endDate?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Every subscription plan, cheapest first (public: landing page, sign-up, account).
 *
 * Steps:
 *   1. Select all plans ordered by price.
 * SQL:
 *   SELECT * FROM subscription_plan ORDER BY price_monthly;
 * Tables: subscription_plan  ·  Keys/constraints relied on: PK plan_id, UNIQUE (name)
 * Transaction: no  ·  Idempotent: yes (read)
 * Edge cases: none; the table is small and seeded.
 * Throws: nothing
 * Called by: GET /api/plans
 * Mock today: returns every plan in data/mock/plans.json order (not re-sorted).
 */
export async function listPlans(): Promise<SubscriptionPlan[]> {
  const plans = await db.select().from(subscriptionPlan).orderBy(subscriptionPlan.priceMonthly);
  return plans.map((plan) => ({ ...plan, priceMonthly: Number(plan.priceMonthly) }));
}

/**
 * One plan by id.
 *
 * Steps:
 *   1. Select the plan; no row → NotFoundError.
 * SQL:
 *   SELECT * FROM subscription_plan WHERE plan_id = $1;
 * Tables: subscription_plan  ·  Keys/constraints relied on: PK plan_id
 * Transaction: no  ·  Idempotent: yes (read)
 * Edge cases: the amount charged always comes from this row, never from the client.
 * Throws: NotFoundError("Plan not found.") when there is no such plan (the old route contract: 404).
 * Called by: POST /api/account/subscriptions
 * Mock today: finds the plan in data/mock/plans.json; throws NotFoundError when unknown (the old stub
 *   did not check and answered with amount 0).
 */
export async function getPlan(planId: number): Promise<SubscriptionPlan> {
  const [plan] = await db.select().from(subscriptionPlan).where(eq(subscriptionPlan.planId, planId)).limit(1);

  if (!plan) {
    throw new NotFoundError("Plan not found.");
  }
  return { ...plan, priceMonthly: Number(plan.priceMonthly) };
}

/**
 * The user's current plan, or null when they have none (the account page then offers plans).
 *
 * Steps:
 *   1. Select the user's ACTIVE subscription joined with its plan.
 * SQL:
 *   SELECT s.*, p.*
 *   FROM subscription s
 *   JOIN subscription_plan p USING (plan_id)
 *   WHERE s.user_id = $1 AND s.status = 'ACTIVE';
 * Tables: subscription, subscription_plan
 * Keys/constraints relied on: partial UNIQUE index subscription_one_active_per_user
 *   ON subscription (user_id) WHERE status = 'ACTIVE' — at most one row.
 * Transaction: no  ·  Idempotent: yes (read)
 * Edge cases: an ACTIVE row whose end_date has passed is still returned until an expiry job (or the
 *   next capture) flips it to EXPIRED; the page shows end_date.
 * Throws: nothing
 * Called by: GET /api/account
 * Mock today: the first ACTIVE subscription of the user in data/mock/subscriptions.json, with its plan.
 */
export async function getActiveSubscription(userId: number): Promise<SubscriptionWithPlan | null> {
  const [active] = await db
    .select()
    .from(subscription)
    .innerJoin(subscriptionPlan, eq(subscription.planId, subscriptionPlan.planId))
    .where(and(eq(subscription.userId, userId), eq(subscription.status, "ACTIVE")))
    .limit(1);

  if (!active) {
    return null;
  }

  return {
    ...toSubscription(active.subscription),
    plan: {
      ...active.subscription_plan,
      priceMonthly: Number(active.subscription_plan.priceMonthly),
    },
  };
}
/**
 * The user's subscription history, newest first — every checkout, including ones never paid (PENDING:
 * Checkout closed, payment failed or timed out) and ones the user cancelled.
 *
 * Steps:
 *   1. Select all of the user's subscriptions, joined with the plan.
 * SQL:
 *   SELECT s.*, p.*
 *   FROM subscription s
 *   JOIN subscription_plan p USING (plan_id)
 *   WHERE s.user_id = $1
 *   ORDER BY s.created_at DESC;
 * Tables: subscription, subscription_plan
 * Keys/constraints relied on: CHECK (status = 'PENDING' OR (start_date IS NOT NULL AND end_date > start_date))
 *   — every paid subscription has dates; PENDING ones have none.
 * Transaction: no  ·  Idempotent: yes (read)
 * Edge cases: never paid → stays PENDING (start/end dates NULL) until paid or cancelled by the user.
 * Throws: nothing
 * Called by: GET /api/account/subscriptions
 * Mock today: every subscription of the user in file order (no start_date filter, no sort), with its plan.
 */
export async function listSubscriptions(userId: number): Promise<SubscriptionWithPlan[]> {
  const rows = await db
    .select()
    .from(subscription)
    .innerJoin(subscriptionPlan, eq(subscription.planId, subscriptionPlan.planId))
    .where(eq(subscription.userId, userId))
    .orderBy(desc(subscription.createdAt));

  return rows.map((row) => ({
    ...toSubscription(row.subscription),
    plan: {
      ...row.subscription_plan,
      priceMonthly: Number(row.subscription_plan.priceMonthly),
    },
  }));
}

/**
 * The user's payment history, newest first, with the plan name each payment bought. FAILED and REFUNDED
 * payments are included — the UI shows the status.
 *
 * Steps:
 *   1. payment ⋈ subscription (owned by the user) ⋈ subscription_plan, newest payment first.
 * SQL:
 *   SELECT pay.*, p.name AS plan_name
 *   FROM payment pay
 *   JOIN subscription s      ON s.subscription_id = pay.subscription_id
 *   JOIN subscription_plan p ON p.plan_id = s.plan_id
 *   WHERE s.user_id = $1
 *   ORDER BY pay.payment_date DESC;
 * Tables: payment, subscription, subscription_plan
 * Keys/constraints relied on: index payment_subscription_idx ON payment (subscription_id, payment_date DESC);
 *   payment has no user_id/plan_id of its own — both are reached through the subscription (3NF).
 * Transaction: no  ·  Idempotent: yes (read)
 * Edge cases: a failed attempt on an abandoned (PENDING/CANCELLED) subscription still shows up.
 * Throws: nothing
 * Called by: GET /api/account/payments
 * Mock today: payments of the user's subscriptions in file order, each with planName.
 */
export async function listPayments(userId: number): Promise<PaymentWithPlan[]> {
  const rows = await db
    .select({
      payment,
      planName: subscriptionPlan.name,
    })
    .from(payment)
    .innerJoin(subscription, eq(subscription.subscriptionId, payment.subscriptionId))
    .innerJoin(subscriptionPlan, eq(subscriptionPlan.planId, subscription.planId))
    .where(eq(subscription.userId, userId))
    .orderBy(desc(payment.paymentDate));

  return rows.map((row) => ({
    ...row.payment,
    amount: Number(row.payment.amount),
    paymentDate: row.payment.paymentDate.toISOString(),
    planName: row.planName,
  }));
}

/**
 * Opens a checkout: a new PENDING subscription for the plan (which is the Razorpay order's local
 * counterpart). Every click on checkout creates its own row. It becomes ACTIVE later, when Razorpay
 * reports the capture — recordCapturedPayment in payments.service (via POST /api/payments/verify or the
 * webhook). If Checkout is closed, the payment fails or times out, it stays PENDING (shown in history)
 * until the user cancels it.
 *
 * Steps:
 *   1. Insert the new PENDING row; start_date / end_date stay NULL until payment.
 * SQL:
 *   INSERT INTO subscription (user_id, plan_id, status) VALUES ($1, $2, 'PENDING') RETURNING *;
 * Tables: subscription
 * Keys/constraints relied on: subscription_dates_check — a PENDING row with NULL dates is legal;
 *   FK user_id / plan_id (ON DELETE RESTRICT); subscription_one_active_per_user is untouched (PENDING
 *   rows don't count).
 * Transaction: no (single statement) · Idempotent: no (each call is a new checkout)
 * Edge cases: if creating the Razorpay order fails afterwards, the PENDING row stays and can be cancelled.
 *   Nothing else is written here: payment rows are created by verify / the webhook, failed attempts included.
 * Throws: NotFoundError when planId or userId doesn't exist (FK violation).
 * Called by: POST /api/account/subscriptions
 */
export async function createPendingSubscription(userId: number, planId: number): Promise<Subscription> {
  try {
    const [created] = await db.insert(subscription).values({ userId, planId, status: "PENDING" }).returning();

    return toSubscription(created);
  } catch (error) {
    const code =
      (error as { code?: string; cause?: { code?: string } }).code ??
      (error as { cause?: { code?: string } }).cause?.code;
    if (code === "23503") {
      throw new NotFoundError("Plan not found.");
    }
    throw error;
  }
}

/**
 * The user cancels their current plan (ACTIVE). Its paid dates are kept. Unpaid checkouts (PENDING) can't
 * be cancelled — they stay PENDING.
 *
 * Steps:
 *   1. Update the row if it belongs to the user and is ACTIVE.
 *   2. Nothing updated → the row doesn't exist / isn't theirs (404) or isn't ACTIVE (409).
 * SQL:
 *   UPDATE subscription SET status = 'CANCELLED'
 *   WHERE subscription_id = $2 AND user_id = $1 AND status = 'ACTIVE'
 *   RETURNING *;
 * Tables: subscription
 * Keys/constraints relied on: PK subscription_id; subscription_dates_check (CANCELLED allows both
 *   a paid period, so the dates can stay).
 * Transaction: no (single statement) · Idempotent: no (a second call answers 409)
 * Throws: NotFoundError("Subscription not found."); ConflictError when it isn't ACTIVE.
 * Called by: POST /api/account/subscriptions/:subscriptionId/cancel
 */
export async function cancelSubscription(userId: number, subscriptionId: number): Promise<SubscriptionWithPlan> {
  const [cancelled] = await db
    .update(subscription)
    .set({ status: "CANCELLED" })
    .where(
      and(
        eq(subscription.subscriptionId, subscriptionId),
        eq(subscription.userId, userId),
        eq(subscription.status, "ACTIVE"),
      ),
    )
    .returning();

  if (!cancelled) {
    const [existing] = await db
      .select({ status: subscription.status })
      .from(subscription)
      .where(and(eq(subscription.subscriptionId, subscriptionId), eq(subscription.userId, userId)))
      .limit(1);

    if (!existing) {
      throw new NotFoundError("Subscription not found.");
    }
    throw new ConflictError("Only an active plan can be cancelled.", "NOT_CANCELLABLE");
  }

  return {
    ...toSubscription(cancelled),
    plan: await getPlan(cancelled.planId),
  };
}
