/**
 * Billing: plans, subscriptions and the payment history.
 *
 * Tables owned: subscription_plan, subscription, payment (reads here; payment rows are WRITTEN by
 * payments.service — verify / webhook — never by these functions).
 *
 * Exports:
 *   listPlans · getPlan · getActiveSubscription · listSubscriptions · listPayments ·
 *   createPendingSubscription
 *
 * Schema: docs/schema/SCHEMA.md "Account & billing" and "Payment flow". One subscription = one Razorpay order;
 * many payment rows (attempts) point at it. A user has many subscriptions over time, but only one
 * ACTIVE at once (partial UNIQUE index subscription_one_active_per_user).
 */
import "server-only";

import { getMockDb, withPlan } from "@/server/mocks/db";
import { NotFoundError } from "@/server/errors";
import type { PaymentWithPlan, Subscription, SubscriptionPlan, SubscriptionWithPlan } from "@/types";

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
  // TODO: implement
  return getMockDb().plans;
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
  // TODO: implement
  const plan = getMockDb().plans.find((entry) => entry.planId === planId);
  if (!plan) throw new NotFoundError("Plan not found.");
  return plan;
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
  // TODO: implement
  const active = getMockDb().subscriptions.find(
    (subscription) => subscription.userId === userId && subscription.status === "ACTIVE",
  );
  return active ? withPlan(active) : null;
}

/**
 * The user's subscription history, newest first. Checkouts that were never paid (PENDING, or CANCELLED
 * before a capture — start_date still NULL) are NOT billing history and are left out.
 *
 * Steps:
 *   1. Select the user's subscriptions with a start_date, joined with the plan.
 * SQL:
 *   SELECT s.*, p.*
 *   FROM subscription s
 *   JOIN subscription_plan p USING (plan_id)
 *   WHERE s.user_id = $1 AND s.start_date IS NOT NULL
 *   ORDER BY s.start_date DESC;
 * Tables: subscription, subscription_plan
 * Keys/constraints relied on: CHECK (status = 'PENDING' OR (start_date IS NOT NULL AND end_date > start_date))
 *   — every paid subscription has dates; PENDING ones have none.
 * Transaction: no  ·  Idempotent: yes (read)
 * Edge cases: never paid → stays PENDING, is cancelled at the user's next checkout, never shown here.
 * Throws: nothing
 * Called by: GET /api/account/subscriptions
 * Mock today: every subscription of the user in file order (no start_date filter, no sort), with its plan.
 */
export async function listSubscriptions(userId: number): Promise<SubscriptionWithPlan[]> {
  // TODO: implement
  return getMockDb()
    .subscriptions.filter((subscription) => subscription.userId === userId)
    .map(withPlan);
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
  // TODO: implement
  const { subscriptions, payments } = getMockDb();
  const mine = subscriptions.filter((subscription) => subscription.userId === userId).map(withPlan);
  return payments.flatMap((payment) => {
    const subscription = mine.find((entry) => entry.subscriptionId === payment.subscriptionId);
    return subscription ? [{ ...payment, planName: subscription.plan.name }] : [];
  });
}

/**
 * Opens a checkout: a new PENDING subscription for the plan (which is the Razorpay order's local
 * counterpart). The subscription becomes ACTIVE later, when Razorpay reports the capture —
 * recordCapturedPayment in payments.service (via POST /api/payments/verify or the webhook).
 *
 * Steps (ONE transaction):
 *   1. Cancel the user's earlier abandoned checkouts. (A capture that still arrives for one of them is
 *      honoured by recordCapturedPayment — the money was taken.)
 *   2. Insert the new PENDING row; start_date / end_date stay NULL until payment.
 *   Renewal instead: if the user's ACTIVE subscription is already on this plan, no new row — return that
 *   ACTIVE row; the renewal order's notes carry its subscription_id and a capture extends end_date.
 *   (Open point for the implementer: the old route listed "409 already ACTIVE on that plan (unless
 *   renewing)"; today the account page offers renewal, so the same plan is treated as a renewal.)
 * SQL:
 *   BEGIN;
 *   UPDATE subscription SET status = 'CANCELLED' WHERE user_id = $1 AND status = 'PENDING';
 *   INSERT INTO subscription (user_id, plan_id, status) VALUES ($1, $2, 'PENDING') RETURNING *;
 *   COMMIT;
 *   -- renewal check, before the UPDATE/INSERT:
 *   SELECT * FROM subscription WHERE user_id = $1 AND plan_id = $2 AND status = 'ACTIVE';
 * Tables: subscription
 * Keys/constraints relied on: CHECK (status = 'PENDING' OR (start_date IS NOT NULL AND end_date > start_date))
 *   — a PENDING row with NULL dates is legal; FK user_id / plan_id (ON DELETE RESTRICT);
 *   subscription_one_active_per_user is untouched (PENDING rows don't count).
 * Transaction: yes (db.transaction) · Idempotent: no (each call is a new checkout)
 * Edge cases: if creating the Razorpay order fails afterwards, the PENDING row is harmless — GET
 *   history filters on start_date and the next checkout cancels it. Nothing else is written here:
 *   payment rows are created by verify / the webhook, failed attempts included.
 * Throws: NotFoundError when planId or userId doesn't exist (FK violation); ConflictError only if the
 *   renewal rule above is tightened.
 * Called by: POST /api/account/subscriptions
 * Mock today: returns a PENDING row with id = (number of mock subscriptions + 1) and NULL dates;
 *   persists nothing.
 */
export async function createPendingSubscription(userId: number, planId: number): Promise<Subscription> {
  // TODO: implement
  return {
    subscriptionId: getMockDb().subscriptions.length + 1,
    userId,
    planId,
    startDate: null,
    endDate: null,
    status: "PENDING",
    createdAt: new Date().toISOString(),
  };
}
