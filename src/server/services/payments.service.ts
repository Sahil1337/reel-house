/**
 * Razorpay payments: creating the order, verifying signatures, and recording payment attempts.
 *
 * Tables owned: payment (writes); subscription (status / start_date / end_date changes on capture).
 *
 * Exports:
 *   createRazorpayOrder · verifyPaymentSignature · fetchPayment · verifyWebhookSignature ·
 *   parseWebhookEvent · recordFailedPayment · recordCapturedPayment
 *
 * Payment flow (docs/schema/SCHEMA.md "Payment flow"): Razorpay's model is one order → many payment attempts,
 * which maps onto one `subscription` → many `payment` rows.
 *
 *   Click "Pay"        POST /api/account/subscriptions
 *                      INSERT subscription (status 'PENDING', dates NULL)   -- earlier PENDING ones → CANCELLED
 *                      create a Razorpay order { amount = price_monthly × 100, notes: { subscription_id } }
 *                      → Razorpay Checkout opens in the browser
 *   Checkout success   POST /api/payments/verify (Checkout's razorpay_signature verified)
 *                      same recordCapturedPayment as payment.captured below; whichever of the two arrives
 *                      first records the payment, the other hits ON CONFLICT and stops
 *   payment.failed     POST /api/payments/webhook (signature verified)
 *                      INSERT payment (…, 'FAILED') ON CONFLICT (transaction_ref) DO NOTHING
 *                      -- subscription stays PENDING; the user can retry on the same order
 *   payment.captured   POST /api/payments/webhook, one transaction: lock the subscription (FOR UPDATE);
 *                      INSERT payment 'SUCCESS' ON CONFLICT DO NOTHING (nothing inserted = already
 *                      processed → stop); check amount = plan price; old ACTIVE → CANCELLED (plan change;
 *                      first, because of the one-ACTIVE index); this one → ACTIVE, start_date = now(),
 *                      end_date = now() + 1 month (already ACTIVE = a renewal order → extend end_date)
 *   Never paid         stays PENDING, cancelled at the user's next checkout; never shown in billing history
 *   Renewal            a new order whose notes carry the ACTIVE subscription_id → extends end_date
 *
 * Idempotency comes from the database: UNIQUE (transaction_ref) makes a repeated webhook a no-op, and the
 * row lock plus the partial unique index stop two payments from creating two ACTIVE plans. The webhook is
 * the source of truth (it also covers a closed tab, a lost network, and failed attempts, which never reach
 * /api/payments/verify); Razorpay retries until it gets a 2xx and may deliver an event more than once or
 * out of order.
 *
 * Environment (.env.example): RAZORPAY_KEY_ID (public, sent to the browser), RAZORPAY_KEY_SECRET (server only;
 * Orders/Payments API basic auth and Checkout signatures), RAZORPAY_WEBHOOK_SECRET (webhook signature).
 * Use Razorpay Test Mode keys, test cards / test UPI ids, and a tunnel for webhooks; never put live keys in .env.
 * The browser side is src/lib/razorpay/checkout.ts + src/components/account/change-plan.tsx.
 */
import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, gt, ne, or, sql } from "drizzle-orm";

import { ServiceError } from "@/server/errors";
import type {
  CheckoutOrder,
  PaymentMode,
  RazorpayPayment,
  RazorpayPaymentStatus,
  Subscription,
  SubscriptionPlan,
  VerifyPaymentInput,
  WebhookEvent,
} from "@/types";
import { db } from "../db";
import { payment as paymentTable, subscription, subscriptionPlan } from "../db/schema/billing";

const RAZORPAY_API = "https://api.razorpay.com/v1";

const PAYMENT_MODES: Record<string, PaymentMode> = {
  card: "CARD",
  upi: "UPI",
  netbanking: "NET_BANKING",
  wallet: "WALLET",
};

/** Razorpay's payment entity, as the Payments API and the webhook send it (only the fields we use). */
interface RazorpayPaymentEntity {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: RazorpayPaymentStatus;
  method: string;
  notes?: { subscription_id?: string | number } | unknown[];
}

function requireEnv(name: "RAZORPAY_KEY_ID" | "RAZORPAY_KEY_SECRET" | "RAZORPAY_WEBHOOK_SECRET"): string {
  const value = process.env[name];
  if (!value) throw new ServiceError("Payments aren't set up yet. Try again later.", 503, "PAYMENTS_NOT_CONFIGURED");
  return value;
}

/** Calls the Razorpay REST API with HTTP basic auth (key_id:key_secret). */
async function razorpayRequest<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const auth = Buffer.from(`${requireEnv("RAZORPAY_KEY_ID")}:${requireEnv("RAZORPAY_KEY_SECRET")}`).toString("base64");
  let response: Response;
  try {
    response = await fetch(`${RAZORPAY_API}${path}`, {
      method: init.method ?? "GET",
      headers: { authorization: `Basic ${auth}`, "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[razorpay] request failed", path, error);
    throw new ServiceError("Couldn't reach Razorpay. Try again.", 502, "RAZORPAY_UNAVAILABLE");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error("[razorpay]", path, response.status, data);
    throw new ServiceError("Razorpay couldn't process the request. Try again.", 502, "RAZORPAY_ERROR");
  }
  return data as T;
}

/** HMAC-SHA256 hex of `message`, compared with `signature` in constant time. */
function signatureMatches(secret: string, message: string, signature: string): boolean {
  const expected = Buffer.from(createHmac("sha256", secret).update(message).digest("hex"));
  const received = Buffer.from(signature);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/** notes.subscription_id → number, or null when missing (Razorpay sends empty notes as []). */
function noteSubscriptionId(notes: RazorpayPaymentEntity["notes"]): number | null {
  const value = Array.isArray(notes) ? undefined : notes?.subscription_id;
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/** Maps a Razorpay payment entity to RazorpayPayment; null when the method or subscription id is unusable. */
function toRazorpayPayment(entity: RazorpayPaymentEntity): RazorpayPayment | null {
  const paymentMode = PAYMENT_MODES[entity.method];
  const subscriptionId = noteSubscriptionId(entity.notes);
  if (!paymentMode || subscriptionId === null) return null;
  return {
    paymentId: entity.id,
    orderId: entity.order_id,
    amount: entity.amount,
    currency: entity.currency,
    status: entity.status,
    paymentMode,
    subscriptionId,
  };
}

/**
 * Creates the Razorpay order that a PENDING subscription is paid through.
 *
 * Steps:
 *   1. Read RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET; either unset → ServiceError 503 "PAYMENTS_NOT_CONFIGURED".
 *   2. POST https://api.razorpay.com/v1/orders with HTTP basic auth (key_id:key_secret) and JSON body
 *        { "amount": <price_monthly × 100, paise>, "currency": "INR",
 *          "receipt": "sub_<subscriptionId>", "notes": { "subscription_id": <subscriptionId> } }
 *      (Razorpay returns { id: "order_…", amount, currency, … }). The amount comes from our
 *      subscription_plan row, NEVER from the client. notes.subscription_id is how verify / the webhook
 *      find the subscription again. A renewal order carries the ACTIVE subscription's id.
 *   3. Respond { subscriptionId, orderId: order.id, amount: order.amount, currency, keyId: RAZORPAY_KEY_ID }.
 *      The key id is public by design; the secret never leaves the server.
 * SQL: none — nothing is written here. payment rows are created by verify / the webhook, failed attempts included.
 * Tables: none  ·  Keys/constraints relied on: none
 * Transaction: no  ·  Idempotent: no (each call creates a new Razorpay order)
 * Edge cases: if the order call fails, the PENDING subscription is harmless (billing history filters on
 *   start_date, and the next checkout cancels it).
 * Throws: ServiceError 503 when the Razorpay keys are not set; ServiceError 502 when Razorpay fails.
 * Called by: POST /api/account/subscriptions
 */
export async function createRazorpayOrder(subscription: Subscription, plan: SubscriptionPlan): Promise<CheckoutOrder> {
  const keyId = requireEnv("RAZORPAY_KEY_ID");
  const order = await razorpayRequest<{ id: string; amount: number; currency: string }>("/orders", {
    method: "POST",
    body: {
      amount: Math.round(plan.priceMonthly * 100),
      currency: "INR",
      receipt: `sub_${subscription.subscriptionId}`,
      notes: { subscription_id: subscription.subscriptionId },
    },
  });
  return {
    subscriptionId: subscription.subscriptionId,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    keyId,
  };
}

/**
 * Verifies Checkout's success-handler response. A match proves Razorpay issued this payment for this order;
 * it does not carry the amount or the method (see fetchPayment).
 *
 * Steps:
 *   1. expected = HMAC-SHA256(key = RAZORPAY_KEY_SECRET, message = `${razorpay_order_id}|${razorpay_payment_id}`), hex.
 *   2. Compare with razorpay_signature using crypto.timingSafeEqual (equal-length buffers first; different
 *      lengths are a mismatch).
 *   3. Mismatch → ServiceError 400 "INVALID_SIGNATURE" (the old route contract: 400, not 422 — it is a
 *      forged or corrupted callback, not a form error). Match → return.
 * SQL: none
 * Tables: none  ·  Keys/constraints relied on: none
 * Transaction: no  ·  Idempotent: yes (pure)
 * Edge cases: a missing field is rejected earlier by the route's zod schema.
 * Throws: ServiceError(400, "INVALID_SIGNATURE") when the signature doesn't match; ServiceError 503 when
 *   RAZORPAY_KEY_SECRET isn't set.
 * Called by: POST /api/payments/verify
 */
export async function verifyPaymentSignature(input: VerifyPaymentInput): Promise<void> {
  const secret = requireEnv("RAZORPAY_KEY_SECRET");
  const message = `${input.razorpay_order_id}|${input.razorpay_payment_id}`;
  if (!signatureMatches(secret, message, input.razorpay_signature)) {
    throw new ServiceError("The payment signature didn't match.", 400, "INVALID_SIGNATURE");
  }
}

/**
 * Fetches a payment from Razorpay for what the Checkout callback doesn't carry: amount, currency, method,
 * status and notes.subscription_id.
 *
 * Steps:
 *   1. GET https://api.razorpay.com/v1/payments/:paymentId with HTTP basic auth (key_id:key_secret).
 *   2. Map the entity: id → paymentId, order_id → orderId, amount (paise), currency, status,
 *      method → paymentMode (card → CARD, upi → UPI, netbanking → NET_BANKING, wallet → WALLET; other
 *      methods → ServiceError 422, or add them to the payment_mode enum), notes.subscription_id → subscriptionId.
 *   3. If expectedOrderId is given, order_id must equal it → ServiceError 400.
 *   The caller acts only on status 'captured'. 'authorized' (not captured yet) → the route answers 200 and
 *   leaves it to the webhook's payment.captured.
 * SQL: none
 * Tables: none  ·  Keys/constraints relied on: none
 * Transaction: no  ·  Idempotent: yes (read)
 * Throws: ServiceError 502 when Razorpay fails; ServiceError 400 on an order mismatch; ServiceError 503 when
 *   the keys aren't set.
 * Called by: POST /api/payments/verify
 */
export async function fetchPayment(paymentId: string, expectedOrderId?: string): Promise<RazorpayPayment> {
  const entity = await razorpayRequest<RazorpayPaymentEntity>(`/payments/${encodeURIComponent(paymentId)}`);
  if (expectedOrderId !== undefined && entity.order_id !== expectedOrderId) {
    throw new ServiceError("The payment doesn't belong to this order.", 400, "ORDER_MISMATCH");
  }
  const payment = toRazorpayPayment(entity);
  if (!payment) {
    throw new ServiceError("This payment method isn't supported.", 422, "UNSUPPORTED_PAYMENT");
  }
  return payment;
}

/**
 * Authenticates a webhook call: the signature is the only authentication (the route has no session).
 *
 * Steps:
 *   1. rawBody must be the RAW request text (`await request.text()`), read BEFORE any JSON.parse —
 *      re-serialised JSON would not match.
 *   2. expected = HMAC-SHA256(key = RAZORPAY_WEBHOOK_SECRET, message = rawBody), hex.
 *   3. Compare with the X-Razorpay-Signature header using crypto.timingSafeEqual (equal-length buffers
 *      first). A missing header or a mismatch → ServiceError 400 "INVALID_SIGNATURE" (Razorpay won't retry
 *      those usefully).
 * SQL: none
 * Tables: none  ·  Keys/constraints relied on: none
 * Transaction: no  ·  Idempotent: yes (pure)
 * Throws: ServiceError(400, "INVALID_SIGNATURE") on a missing or wrong signature; ServiceError 503 when
 *   RAZORPAY_WEBHOOK_SECRET isn't set.
 * Called by: POST /api/payments/webhook
 */
export async function verifyWebhookSignature(rawBody: string, signature: string | null): Promise<void> {
  const secret = requireEnv("RAZORPAY_WEBHOOK_SECRET");
  if (!signature || !signatureMatches(secret, rawBody, signature)) {
    throw new ServiceError("Invalid webhook signature.", 400, "INVALID_SIGNATURE");
  }
}

/**
 * Parses a webhook body into a typed event.
 *
 * Steps:
 *   1. JSON.parse(rawBody); a malformed body → ServiceError 400 "MALFORMED_WEBHOOK".
 *   2. event name: "payment.captured" and "payment.failed" are handled (subscribe to both in the Razorpay
 *      dashboard); anything else → { type: "ignored" } (the route answers 200).
 *   3. payload.payment.entity = { id: "pay_…", order_id: "order_…", amount (paise), currency,
 *      method: "card" | "upi" | "netbanking" | "wallet", notes: { subscription_id } } is mapped to
 *      RazorpayPayment. method → payment_mode: card → CARD, upi → UPI, netbanking → NET_BANKING,
 *      wallet → WALLET; other methods (emi, paylater, …) → log and { type: "ignored" }, or add them to
 *      the enum.
 *   4. notes.subscription_id → subscriptionId; missing = a payment that didn't come from our checkout →
 *      { type: "ignored" } (200).
 *   X-Razorpay-Event-Id is unique per event, but we dedupe on payment.transaction_ref instead, so it is only
 *   useful for logs.
 * SQL: none
 * Tables: none  ·  Keys/constraints relied on: none
 * Transaction: no  ·  Idempotent: yes (pure)
 * Throws: ServiceError(400, "MALFORMED_WEBHOOK") for a body that isn't the expected JSON.
 * Called by: POST /api/payments/webhook
 */
export async function parseWebhookEvent(rawBody: string): Promise<WebhookEvent> {
  let body: { event?: unknown; payload?: { payment?: { entity?: RazorpayPaymentEntity } } };
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new ServiceError("Malformed webhook body.", 400, "MALFORMED_WEBHOOK");
  }
  if (typeof body?.event !== "string") {
    throw new ServiceError("Malformed webhook body.", 400, "MALFORMED_WEBHOOK");
  }

  const event = body.event;
  if (event !== "payment.captured" && event !== "payment.failed") return { type: "ignored", event };

  const entity = body.payload?.payment?.entity;
  if (!entity?.id || !entity.order_id) {
    throw new ServiceError("Malformed webhook body.", 400, "MALFORMED_WEBHOOK");
  }
  const payment = toRazorpayPayment(entity);
  if (!payment) {
    console.warn("[razorpay webhook] ignored", event, entity.id, "method:", entity.method, "notes:", entity.notes);
    return { type: "ignored", event };
  }
  return { type: event, payment };
}

/**
 * Records a failed attempt (webhook event payment.failed). The subscription stays PENDING so the user can
 * retry on the same order.
 *
 * Steps:
 *   1. Insert one payment row, FAILED; a repeated delivery changes nothing.
 * SQL:
 *   INSERT INTO payment (subscription_id, amount, payment_mode, transaction_ref, gateway_order_id, status)
 *   VALUES ($subscriptionId, $amount / 100, $mode, $payId, $orderId, 'FAILED')
 *   ON CONFLICT (transaction_ref) DO NOTHING;
 * Tables: payment  ·  Keys/constraints relied on: UNIQUE (transaction_ref) (idempotency key), FK
 *   subscription_id, CHECK (amount > 0), payment_mode / payment_status enums
 * Transaction: no (single statement) · Idempotent: yes (ON CONFLICT (transaction_ref) DO NOTHING)
 * Edge cases: events can arrive more than once or out of order (a failed attempt may be followed by a
 *   successful retry on the same order — different pay_ id, same gateway_order_id); never touches subscription.
 * Throws: nothing for a duplicate; any other failure propagates (route answers 500 → Razorpay retries, safe).
 * Called by: POST /api/payments/webhook (payment.failed)
 */
export async function recordFailedPayment(payment: RazorpayPayment): Promise<void> {
  const [existing] = await db
    .select({ subscriptionId: subscription.subscriptionId })
    .from(subscription)
    .where(eq(subscription.subscriptionId, payment.subscriptionId))
    .limit(1);
  if (!existing) {
    console.warn("[razorpay] failed payment for unknown subscription", payment.subscriptionId, payment.paymentId);
    return;
  }

  await db
    .insert(paymentTable)
    .values({
      subscriptionId: payment.subscriptionId,
      amount: String(payment.amount / 100),
      paymentMode: payment.paymentMode,
      transactionRef: payment.paymentId,
      gatewayOrderId: payment.orderId,
      status: "FAILED",
    })
    .onConflictDoNothing({ target: paymentTable.transactionRef });
}

/**
 * Records a captured payment and activates or extends the subscription. The SAME function serves
 * POST /api/payments/verify (Checkout's success handler) and the webhook's payment.captured — one shared
 * module, not a copy. Whichever arrives first writes the payment and activates the subscription; the other
 * finds the payment row (ON CONFLICT) and stops.
 *
 * Steps (ONE transaction):
 *   1. Lock the subscription — serialises events for it:
 *        SELECT s.*, p.price_monthly FROM subscription s JOIN subscription_plan p USING (plan_id)
 *        WHERE s.subscription_id = $1 FOR UPDATE;
 *      No row → payment that didn't come from our checkout → log, nothing to record.
 *   2. Ownership (verify only): when options.expectedUserId is given, subscription.user_id must equal it
 *      (the session user). Otherwise don't write (the webhook will still record it) and log it.
 *   3. Insert the payment:
 *        INSERT INTO payment (subscription_id, amount, payment_mode, transaction_ref, gateway_order_id, status)
 *        VALUES ($1, $amount / 100, $mode, $payId, $orderId, 'SUCCESS')
 *        ON CONFLICT (transaction_ref) DO NOTHING RETURNING payment_id;
 *      No row returned → this capture was already processed → COMMIT and stop (verify and the webhook race
 *      safely; Razorpay redelivery is a no-op).
 *   4. Check amount / 100 = price_monthly and currency = 'INR'. On a mismatch keep the payment row, don't
 *      activate, and log it for a manual refund.
 *   5. If the subscription is PENDING (or CANCELLED as an abandoned checkout — the money was taken, so
 *      honour it):
 *        UPDATE subscription SET status = 'CANCELLED', end_date = LEAST(end_date, now())
 *          WHERE user_id = $user AND subscription_id <> $1
 *            AND (status = 'ACTIVE' OR (status = 'CANCELLED' AND end_date > now()));
 *          -- plan change: must run first, the partial UNIQUE (user_id) WHERE status = 'ACTIVE' index
 *          -- allows only one ACTIVE row per user; a cancelled plan still in its paid period ends too
 *        UPDATE subscription SET status = 'ACTIVE', start_date = now(), end_date = now() + interval '1 month'
 *          WHERE subscription_id = $1;
 *      If it is already ACTIVE (a renewal order on the same subscription):
 *        UPDATE subscription SET end_date = GREATEST(end_date, now()) + interval '1 month'
 *          WHERE subscription_id = $1;
 *   6. COMMIT.
 * Tables: subscription (FOR UPDATE, UPDATE), subscription_plan (price), payment (INSERT)
 * Keys/constraints relied on: UNIQUE (transaction_ref); partial UNIQUE index subscription_one_active_per_user;
 *   CHECK (status = 'PENDING' OR (start_date IS NOT NULL AND end_date > start_date)); FK subscription_id
 * Transaction: yes (db.transaction) · Idempotent: yes (ON CONFLICT (transaction_ref) DO NOTHING; the
 *   UNIQUE constraint is the last line of defence: if two deliveries of the same capture race, the second
 *   INSERT fails and its whole transaction rolls back)
 * Edge cases: out-of-order events (a capture for a CANCELLED abandoned checkout is honoured); a failed
 *   verify-side ownership check leaves everything to the webhook; amount mismatch → payment kept, plan not
 *   activated.
 * Throws: any database failure propagates (route answers 500; the webhook is retried by Razorpay, which is safe).
 * Called by: POST /api/payments/verify (with options.expectedUserId), POST /api/payments/webhook (payment.captured)
 */
export async function recordCapturedPayment(
  payment: RazorpayPayment,
  options: { expectedUserId?: number } = {},
): Promise<void> {
  await db.transaction(async (tx) => {
    // 1. Lock the subscription so verify and the webhook for it run one after the other.
    const [locked] = await tx
      .select({
        subscriptionId: subscription.subscriptionId,
        userId: subscription.userId,
        status: subscription.status,
        priceMonthly: subscriptionPlan.priceMonthly,
      })
      .from(subscription)
      .innerJoin(subscriptionPlan, eq(subscription.planId, subscriptionPlan.planId))
      .where(eq(subscription.subscriptionId, payment.subscriptionId))
      .for("update", { of: subscription });

    if (!locked) {
      console.warn("[razorpay] captured payment for unknown subscription", payment.subscriptionId, payment.paymentId);
      return;
    }

    // 2. Ownership (verify only): leave anything suspicious to the webhook.
    if (options.expectedUserId !== undefined && locked.userId !== options.expectedUserId) {
      console.warn("[razorpay] verify by user", options.expectedUserId, "for subscription of user", locked.userId);
      return;
    }

    // 3. Record the payment; nothing inserted = this capture was already processed.
    const [inserted] = await tx
      .insert(paymentTable)
      .values({
        subscriptionId: locked.subscriptionId,
        amount: String(payment.amount / 100),
        paymentMode: payment.paymentMode,
        transactionRef: payment.paymentId,
        gatewayOrderId: payment.orderId,
        status: "SUCCESS",
      })
      .onConflictDoNothing({ target: paymentTable.transactionRef })
      .returning({ paymentId: paymentTable.paymentId });
    if (!inserted) return;

    // 4. Amount check: keep the payment row, but don't activate on a mismatch.
    if (payment.currency !== "INR" || payment.amount !== Math.round(Number(locked.priceMonthly) * 100)) {
      console.error("[razorpay] amount mismatch — refund manually", {
        paymentId: payment.paymentId,
        subscriptionId: locked.subscriptionId,
        paid: `${payment.amount} ${payment.currency}`,
        price: locked.priceMonthly,
      });
      return;
    }

    // 5. Activate (PENDING, or an abandoned CANCELLED checkout — the money was taken) or extend (renewal).
    if (locked.status === "PENDING" || locked.status === "CANCELLED") {
      // The old plan ends first: only one ACTIVE row per user is allowed, and a cancelled plan still in its
      // paid period would otherwise keep running alongside the new one.
      await tx
        .update(subscription)
        .set({ status: "CANCELLED", endDate: sql`LEAST(${subscription.endDate}, now())` })
        .where(
          and(
            eq(subscription.userId, locked.userId),
            ne(subscription.subscriptionId, locked.subscriptionId),
            or(
              eq(subscription.status, "ACTIVE"),
              and(eq(subscription.status, "CANCELLED"), gt(subscription.endDate, sql`now()`)),
            ),
          ),
        );
      await tx
        .update(subscription)
        .set({ status: "ACTIVE", startDate: sql`now()`, endDate: sql`now() + interval '1 month'` })
        .where(eq(subscription.subscriptionId, locked.subscriptionId));
    } else if (locked.status === "ACTIVE") {
      await tx
        .update(subscription)
        .set({ endDate: sql`GREATEST(${subscription.endDate}, now()) + interval '1 month'` })
        .where(eq(subscription.subscriptionId, locked.subscriptionId));
    } else {
      console.warn("[razorpay] captured payment for", locked.status, "subscription", locked.subscriptionId);
    }
  });
}
