# Person B: Yash — billing & payments

Yash, you own **what the user pays for**: plans, subscriptions and the full Razorpay flow (checkout order, verify,
webhook, payment history). Read [README.md](README.md) first (architecture, setup, conventions, curl testing);
this file is the complete spec for your two services. Schema: [`../schema/SCHEMA.md`](../schema/SCHEMA.md)
("Account & billing", "Payment flow"). The Neon database already has the migrations and the seeded data (3 plans,
2 subscriptions, 8 payments, plus the 2 users and 3 profiles they belong to), so your queries can run against real
rows as soon as you write them. Accounts, sessions, profiles and onboarding are Tejasva's (A); you consume them through the
guards.

## Table of contents

1. [Scope](#1-scope)
2. [Dependencies on A and C, and what to stub](#2-dependencies-on-a-and-c-and-what-to-stub)
3. [Ordered checklist](#3-ordered-checklist)
4. [`billing.service.ts`](#4-billingservicets)
5. [`payments.service.ts`](#5-paymentsservicets)
6. [Deep dive: the Razorpay flow end to end](#6-deep-dive-the-razorpay-flow-end-to-end)
7. [Definition of done](#7-definition-of-done)

---

## 1. Scope

| Files you own                             |                                                                                                                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/server/services/billing.service.ts`  | `listPlans`, `getPlan`, `getActiveSubscription`, `listSubscriptions`, `listPayments`, `createPendingSubscription`                                              |
| `src/server/services/payments.service.ts` | `createRazorpayOrder`, `verifyPaymentSignature`, `fetchPayment`, `verifyWebhookSignature`, `parseWebhookEvent`, `recordFailedPayment`, `recordCapturedPayment` |
| `.env.example`                            | add the Razorpay keys (`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`); `DATABASE_URL` is Tejasva's                                       |

| Routes                                 | Calls                                                                                              |
| -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `GET /api/plans`                       | `listPlans`                                                                                        |
| `GET /api/account`                     | `getActiveSubscription`                                                                            |
| `GET, POST /api/account/subscriptions` | `listSubscriptions`; POST: `getPlan` -> `createPendingSubscription` -> `createRazorpayOrder`       |
| `GET /api/account/payments`            | `listPayments`                                                                                     |
| `POST /api/payments/verify`            | `verifyPaymentSignature` -> `fetchPayment` -> `recordCapturedPayment`                              |
| `POST /api/payments/webhook`           | `verifyWebhookSignature` -> `parseWebhookEvent` -> `recordFailedPayment` / `recordCapturedPayment` |

Tables: write `subscription`, `payment`; read `subscription_plan`, `users`, `profile` (Tejasva's tables, read-only for you).
Your routes sit behind Tejasva's guards (`requireUser`, backed by `users.service`). You do not own sign-up, sign-in, profiles,
onboarding or auth hardening: those are Tejasva's (A).

---

## 2. Dependencies on A and C, and what to stub

| You need                                                          | From                                                                            | Until it lands                                                                                                                                                                                   |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `requireUser` (the user lookup; every account and checkout route) | Tejasva (A): `users.service`, and the guards in `src/app/api/_lib/auth.ts`      | The mock lookup finds the seeded users 1 and 2, because the seed uses the same ids. Keep working against the mock-backed guards until Tejasva merges the real ones; nothing to stub on your side |
| `users` / `profile` rows for the foreign keys of `subscription`   | Tejasva (A) writes new accounts later; the seed provides 2 users and 3 profiles | Real seeded rows are enough: test with users 1 and 2                                                                                                                                             |
| Nothing from Sahil (C)                                            |                                                                                 | Your tables do not depend on C's                                                                                                                                                                 |

Who depends on you: the dashboard's revenue and plan widgets (Tejasva's admin dashboard) read the `subscription` and
`payment` rows you write; the seed's 8 payments and 2 subscriptions are enough until yours land. Sahil (C) does not depend on
you.

---

## 3. Ordered checklist

- [ ] **0. Prep**: branch `feat/billing-payments`, own Neon branch in `.env`, `npm run dev`, `db:studio` to look at `subscription_plan`, `subscription`, `payment`. Sign in as the seeded users (mock-backed guards are fine until Tejasva's merge).
- [ ] **1. Billing reads**: `listPlans`, `getPlan`, `getActiveSubscription`, `listSubscriptions`, `listPayments`. Account page shows seeded plan and history.
- [x] **2. Schema CHECK fixed** (migration `0002`): `subscription_dates_check` now allows a CANCELLED row without dates, so cancelling unpaid checkouts works.
- [ ] **3. `createPendingSubscription`** (transaction, renewal rule).
- [ ] **4. Razorpay test-mode setup** (section 6.7): keys, webhook secret, tunnel.
- [ ] **5. `createRazorpayOrder`**: real order; the UI now opens Checkout (`keyId` non-null).
- [ ] **6. `verifyPaymentSignature`, `fetchPayment`**.
- [ ] **7. `recordCapturedPayment`** (the core transaction) and `recordFailedPayment`.
- [ ] **8. `verifyWebhookSignature`, `parseWebhookEvent`**; end-to-end test with test cards and UPI; replay a webhook (idempotency).
- [ ] **9. Cleanup**: remove `getMockDb`/`find*`/`withPlan` imports from your files; lint; build; update route comments that changed (`POST /api/account/subscriptions` 409 text).

---

## 4. `billing.service.ts`

Owns `subscription_plan`, `subscription`, `payment` for **reads**; `payment` rows are _written_ by
`payments.service` (verify/webhook), never here. Schema: one subscription = one Razorpay order; many `payment`
rows (attempts) point at it. A user has many subscriptions over time, but only one ACTIVE at once (partial
unique index `subscription_one_active_per_user`).

Money: `price_monthly` / `amount` are `numeric(10,2)` rupees and arrive as strings -> `Number()` in the mapper
(README 3.6).

### 4.1 `listPlans(): Promise<SubscriptionPlan[]>`

```sql
SELECT * FROM subscription_plan ORDER BY price_monthly;
```

Public (landing page, sign-up, account). PK `plan_id`, UNIQUE `name`. Edge cases: none; the table is small and seeded.
Called by `GET /api/plans`. Mock today: every plan in `data/mock/plans.json` order (not re-sorted).

### 4.2 `getPlan(planId: number): Promise<SubscriptionPlan>`

```sql
SELECT * FROM subscription_plan WHERE plan_id = $1;
```

No row -> `NotFoundError("Plan not found.")` (404). **The amount charged always comes from this row, never from the client.**
Called by `POST /api/account/subscriptions`. Mock today: finds the plan in `plans.json`; throws `NotFoundError` when unknown.

### 4.3 `getActiveSubscription(userId: number): Promise<SubscriptionWithPlan | null>`

The user's current plan, or `null` when they have none (the account page then offers plans).

```sql
SELECT s.*, p.*
FROM subscription s
JOIN subscription_plan p USING (plan_id)
WHERE s.user_id = $1 AND s.status = 'ACTIVE';
```

|                          |                                                                                                                                                                                                                                                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables / keys            | `subscription`, `subscription_plan`; partial UNIQUE index `subscription_one_active_per_user ON subscription (user_id) WHERE status = 'ACTIVE'` -> at most one row                                                                                                                                          |
| Transaction / idempotent | no / yes                                                                                                                                                                                                                                                                                                   |
| Edge cases               | an ACTIVE row whose `end_date` has passed is still returned until an expiry job (or the next capture) flips it to EXPIRED; the page shows `end_date` (open decision: lazy expiry, README 9.8). The `s.*, p.*` select returns duplicate column names (`plan_id`): select explicit columns / use the builder |
| Throws                   | nothing                                                                                                                                                                                                                                                                                                    |
| Called by                | `GET /api/account`                                                                                                                                                                                                                                                                                         |
| Mock today               | the first ACTIVE subscription of the user in `subscriptions.json`, with its plan                                                                                                                                                                                                                           |

Shape: `SubscriptionWithPlan = Subscription & { plan: SubscriptionPlan }`; `startDate`/`endDate` ISO or `null`.

### 4.4 `listSubscriptions(userId: number): Promise<SubscriptionWithPlan[]>`

The user's subscription history, newest first. Checkouts that were never paid (PENDING, or CANCELLED before a
capture: `start_date` still NULL) are **not** billing history and are left out.

```sql
SELECT s.*, p.*
FROM subscription s
JOIN subscription_plan p USING (plan_id)
WHERE s.user_id = $1 AND s.start_date IS NOT NULL
ORDER BY s.start_date DESC;
```

|               |                                                                                                                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables / keys | `subscription`, `subscription_plan`; CHECK `subscription_dates_check` (every paid subscription has dates; PENDING ones have none; PENDING or CANCELLED-before-payment rows have none — migration `0002`) |
| Edge cases    | never paid -> stays PENDING, is cancelled at the next checkout, never shown here                                                                                                                         |
| Called by     | `GET /api/account/subscriptions`                                                                                                                                                                         |
| Mock today    | every subscription of the user in file order (no `start_date` filter, no sort), with its plan                                                                                                            |

### 4.5 `listPayments(userId: number): Promise<PaymentWithPlan[]>`

The user's payment history, newest first, with the plan name each payment bought. FAILED and REFUNDED payments are included.

```sql
SELECT pay.*, p.name AS plan_name
FROM payment pay
JOIN subscription s      ON s.subscription_id = pay.subscription_id
JOIN subscription_plan p ON p.plan_id = s.plan_id
WHERE s.user_id = $1
ORDER BY pay.payment_date DESC;
```

|               |                                                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables / keys | `payment`, `subscription`, `subscription_plan`; index `payment_subscription_idx (subscription_id, payment_date DESC)`; `payment` has no `user_id`/`plan_id` of its own (3NF) |
| Edge cases    | a failed attempt on an abandoned (PENDING/CANCELLED) subscription still shows up                                                                                             |
| Called by     | `GET /api/account/payments`                                                                                                                                                  |
| Mock today    | payments of the user's subscriptions in file order, each with `planName`                                                                                                     |

Mapping: `Payment { paymentId, subscriptionId, paymentDate (ISO), amount (Number), paymentMode, transactionRef, gatewayOrderId, status }` + `planName`.

### 4.6 `createPendingSubscription(userId: number, planId: number): Promise<Subscription>`

Opens a checkout: a new PENDING subscription for the plan (the local counterpart of the Razorpay order). It
becomes ACTIVE later, when Razorpay reports the capture: `recordCapturedPayment` in `payments.service`.

Steps (**one transaction**):

1. Cancel the user's earlier abandoned checkouts. (A capture that still arrives for one of them is honoured by `recordCapturedPayment`: the money was taken.)
2. Insert the new PENDING row; `start_date` / `end_date` stay NULL until payment.

**Renewal instead:** if the user's ACTIVE subscription is already on this plan, no new row: return that ACTIVE
row; the renewal order's notes carry its `subscription_id` and a capture extends `end_date`. (Open point from
the service: the old route comment said "409 already ACTIVE on that plan (unless renewing)"; since the account
page offers renewal, the same plan is treated as a renewal. Update the route comment, README 9.7.)

```sql
BEGIN;
-- renewal check, before the UPDATE/INSERT:
SELECT * FROM subscription WHERE user_id = $1 AND plan_id = $2 AND status = 'ACTIVE';
UPDATE subscription SET status = 'CANCELLED' WHERE user_id = $1 AND status = 'PENDING';
INSERT INTO subscription (user_id, plan_id, status) VALUES ($1, $2, 'PENDING') RETURNING *;
COMMIT;
```

|                          |                                                                                                                                                                                                                                                                                     |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables / keys            | `subscription`; CHECK `subscription_dates_check` (a PENDING row with NULL dates is legal; so is a CANCELLED row that was never paid — migration `0002`); FK `user_id`/`plan_id` (`ON DELETE RESTRICT`); `subscription_one_active_per_user` is untouched (PENDING rows do not count) |
| Transaction / idempotent | yes (`db.transaction`) / no (each call is a new checkout)                                                                                                                                                                                                                           |
| Edge cases               | if creating the Razorpay order fails afterwards, the PENDING row is harmless (history filters on `start_date`, the next checkout cancels it). Nothing else is written here: `payment` rows are created by verify / the webhook, failed attempts included                            |
| Throws                   | `NotFoundError` when `planId` or `userId` does not exist (FK violation 23503); `ConflictError` only if the renewal rule is tightened                                                                                                                                                |
| Called by                | `POST /api/account/subscriptions`                                                                                                                                                                                                                                                   |
| Mock today               | returns a PENDING row with id = (number of mock subscriptions + 1) and NULL dates; persists nothing                                                                                                                                                                                 |

---

## 5. `payments.service.ts`

Owns `payment` (writes) and the status/date changes of `subscription` on capture. Environment:
`RAZORPAY_KEY_ID` (public, sent to the browser), `RAZORPAY_KEY_SECRET` (server only: Orders/Payments API basic
auth and Checkout signatures), `RAZORPAY_WEBHOOK_SECRET` (webhook signature). Use **test mode** keys. The
browser side is `src/lib/razorpay/checkout.ts` + `src/components/account/change-plan.tsx`. The whole flow with a
diagram is in [section 6](#6-deep-dive-the-razorpay-flow-end-to-end).

Helper to add (private to the file): `razorpayAuthHeader()` -> `Basic base64(key_id:key_secret)` or throw
`new ServiceError("Payments aren't configured.", 503, "PAYMENTS_NOT_CONFIGURED")`; and `signaturesEqual(a, b)`
using `crypto.timingSafeEqual` on equal-length buffers (different lengths = not equal).

### 5.1 `createRazorpayOrder(subscription: Subscription, plan: SubscriptionPlan): Promise<CheckoutOrder>`

Creates the Razorpay order that a PENDING subscription is paid through.

Steps:

1. Read `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`; either unset -> `ServiceError` 503 `"PAYMENTS_NOT_CONFIGURED"`.
2. `POST https://api.razorpay.com/v1/orders` with HTTP basic auth (`key_id:key_secret`) and JSON body
   ```json
   { "amount": <price_monthly x 100, paise>, "currency": "INR",
     "receipt": "sub_<subscriptionId>", "notes": { "subscription_id": <subscriptionId> } }
   ```
   Razorpay returns `{ id: "order_...", amount, currency, ... }`. The amount comes from our `subscription_plan` row,
   **never from the client**. `notes.subscription_id` is how verify / the webhook find the subscription again. A
   renewal order carries the ACTIVE subscription's id. (`receipt` max 40 chars; for renewals append a suffix such as `_<Date.now()>` if you want it unique.)
3. Respond `{ subscriptionId, orderId: order.id, amount: order.amount, currency, keyId: RAZORPAY_KEY_ID }`. The
   key id is public by design; the secret never leaves the server.

|                          |                                                                                                                                                                                                                                                                                  |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQL                      | none: nothing is written here                                                                                                                                                                                                                                                    |
| Transaction / idempotent | no / no (each call creates a new Razorpay order)                                                                                                                                                                                                                                 |
| Edge cases               | if the order call fails, the PENDING subscription is harmless                                                                                                                                                                                                                    |
| Throws                   | `ServiceError` 503 when the keys are not set; `ServiceError` 502 when Razorpay fails (non-2xx, network error, or a malformed body)                                                                                                                                               |
| Called by                | `POST /api/account/subscriptions`                                                                                                                                                                                                                                                |
| Mock today               | no Razorpay call; returns `orderId` `order_MOCK<Date.now()>`, `amount` = `round(priceMonthly x 100)`, `currency` `"INR"`, `keyId` `null`, which makes the client skip Checkout and go straight to the "payment received" state. **Keep `keyId` null until the real call exists** |

```ts
const paise = Math.round(plan.priceMonthly * 100); // plan.priceMonthly is already a number (mapped)
const response = await fetch("https://api.razorpay.com/v1/orders", {
  method: "POST",
  headers: { Authorization: razorpayAuthHeader(), "Content-Type": "application/json" },
  body: JSON.stringify({
    amount: paise,
    currency: "INR",
    receipt: `sub_${subscription.subscriptionId}`,
    notes: { subscription_id: subscription.subscriptionId },
  }),
});
if (!response.ok) throw new ServiceError("Couldn't start the payment. Try again.", 502, "RAZORPAY_ERROR");
const order = (await response.json()) as { id: string; amount: number; currency: string };
```

No SDK is needed (the three Razorpay calls are small); the `razorpay` npm package is optional.

### 5.2 `verifyPaymentSignature(input: VerifyPaymentInput): Promise<void>`

Verifies Checkout's success-handler response. A match proves Razorpay issued this payment for this order; it does
not carry the amount or the method (see `fetchPayment`).

Steps:

1. `expected = HMAC-SHA256(key = RAZORPAY_KEY_SECRET, message = `${razorpay_order_id}|${razorpay_payment_id}`)`, hex.
2. Compare with `razorpay_signature` using `crypto.timingSafeEqual` (equal-length buffers first; different lengths are a mismatch).
3. Mismatch -> `ServiceError(400, "INVALID_SIGNATURE")` (400 not 422: a forged or corrupted callback, not a form error). Match -> return.

```ts
import { createHmac, timingSafeEqual } from "node:crypto";
const expected = createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!).update(`${orderId}|${paymentId}`).digest("hex");
```

SQL none; pure; idempotent. A missing field is rejected earlier by the route's zod schema. Throws
`ServiceError(400, "INVALID_SIGNATURE")`; `ServiceError` 503 when `RAZORPAY_KEY_SECRET` is not set. Called by
`POST /api/payments/verify`. Mock today: accepts everything.

### 5.3 `fetchPayment(paymentId: string, expectedOrderId?: string): Promise<RazorpayPayment>`

Fetches a payment from Razorpay for what the Checkout callback does not carry: amount, currency, method, status
and `notes.subscription_id`.

Steps:

1. `GET https://api.razorpay.com/v1/payments/:paymentId` with basic auth.
2. Map the entity: `id` -> `paymentId`, `order_id` -> `orderId`, `amount` (paise), `currency`, `status`,
   `method` -> `paymentMode` (`card` -> CARD, `upi` -> UPI, `netbanking` -> NET_BANKING, `wallet` -> WALLET; other methods ->
   `ServiceError` 422, or add them to the `payment_mode` enum), `notes.subscription_id` -> `subscriptionId` (`Number(...)`).
3. If `expectedOrderId` is given, `order_id` must equal it -> `ServiceError` 400.

The caller acts only on `status === 'captured'`. `'authorized'` (not captured yet) -> the route answers 200 and
leaves it to the webhook's `payment.captured`.

SQL none; idempotent (read). Throws `ServiceError` 502 when Razorpay fails; 400 on an order mismatch; 503 when
the keys are not set. Called by `POST /api/payments/verify`. Mock today: no Razorpay call; returns a plausible
captured card payment of 49900 paise INR for subscription 1 (`orderId` = `expectedOrderId` when given).

### 5.4 `verifyWebhookSignature(rawBody: string, signature: string | null): Promise<void>`

Authenticates a webhook call: the signature is the **only** authentication (the route has no session;
`src/proxy.ts` skips `/api`).

Steps:

1. `rawBody` must be the RAW request text (`await request.text()`), read **before** any `JSON.parse`: re-serialised JSON would not match.
2. `expected = HMAC-SHA256(key = RAZORPAY_WEBHOOK_SECRET, message = rawBody)`, hex.
3. Compare with the `X-Razorpay-Signature` header using `timingSafeEqual` (equal-length buffers first). A missing
   header or a mismatch -> `ServiceError(400, "INVALID_SIGNATURE")` (Razorpay will not retry those usefully).

Throws `ServiceError(400, "INVALID_SIGNATURE")`; `ServiceError` 503 when `RAZORPAY_WEBHOOK_SECRET` is not set.
Called by `POST /api/payments/webhook`. Mock today: accepts everything.

### 5.5 `parseWebhookEvent(rawBody: string): Promise<WebhookEvent>`

Parses a webhook body into a typed event (`WebhookEvent = { type: "payment.captured" | "payment.failed"; payment: RazorpayPayment } | { type: "ignored"; event: string }`).

Steps:

1. `JSON.parse(rawBody)`; malformed -> `ServiceError(400, "MALFORMED_WEBHOOK")`.
2. Event name: `payment.captured` and `payment.failed` are handled (subscribe to both in the Razorpay dashboard);
   anything else -> `{ type: "ignored", event }` (the route answers 200).
3. `payload.payment.entity = { id: "pay_...", order_id: "order_...", amount (paise), currency, method: "card" | "upi" | "netbanking" | "wallet", notes: { subscription_id } }`
   is mapped to `RazorpayPayment`. `method` -> `payment_mode`: card -> CARD, upi -> UPI, netbanking -> NET_BANKING,
   wallet -> WALLET; other methods (`emi`, `paylater`, ...) -> log and `{ type: "ignored" }`, or add them to the enum.
4. `notes.subscription_id` -> `subscriptionId`; missing = a payment that did not come from our checkout ->
   `{ type: "ignored" }` (200).

`X-Razorpay-Event-Id` is unique per event, but we dedupe on `payment.transaction_ref` instead, so it is only useful for logs.
SQL none; pure. Throws `ServiceError(400, "MALFORMED_WEBHOOK")`. Called by `POST /api/payments/webhook`. Mock today:
ignores the body and returns `{ type: "ignored", event: "mock" }` (route answers 200 `{}`).

### 5.6 `recordFailedPayment(payment: RazorpayPayment): Promise<void>`

Records a failed attempt (webhook event `payment.failed`). The subscription stays PENDING so the user can retry
on the same order.

```sql
INSERT INTO payment (subscription_id, amount, payment_mode, transaction_ref, gateway_order_id, status)
VALUES ($subscriptionId, $amount::numeric / 100, $mode, $payId, $orderId, 'FAILED')
ON CONFLICT (transaction_ref) DO NOTHING;
```

|                          |                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables / keys            | `payment`; UNIQUE `(transaction_ref)` (idempotency key), FK `subscription_id`, CHECK `amount > 0`, `payment_mode` / `payment_status` enums                                                                                                                                                                                                                                                                                        |
| Transaction / idempotent | no (single statement) / yes (`ON CONFLICT (transaction_ref) DO NOTHING`)                                                                                                                                                                                                                                                                                                                                                          |
| Edge cases               | events can arrive more than once or out of order (a failed attempt may be followed by a successful retry on the same order: different `pay_` id, same `gateway_order_id`); never touches `subscription`; **cast `$amount::numeric / 100`** (integer division otherwise) or pass `(amount / 100).toFixed(2)`; an unknown `subscription_id` (FK 23503) should be logged and swallowed (200 to Razorpay) rather than retried forever |
| Throws                   | nothing for a duplicate; any other failure propagates (route answers 500 -> Razorpay retries, which is safe)                                                                                                                                                                                                                                                                                                                      |
| Called by                | `POST /api/payments/webhook` (`payment.failed`)                                                                                                                                                                                                                                                                                                                                                                                   |
| Mock today               | writes nothing                                                                                                                                                                                                                                                                                                                                                                                                                    |

### 5.7 `recordCapturedPayment(payment: RazorpayPayment, options: { expectedUserId?: number } = {}): Promise<void>`

Records a captured payment and activates or extends the subscription. The **same** function serves
`POST /api/payments/verify` (Checkout's success handler) and the webhook's `payment.captured`: one shared
module, not a copy. Whichever arrives first writes the payment and activates the subscription; the other finds
the payment row (`ON CONFLICT`) and stops.

Steps (**one transaction**):

1. Lock the subscription (serialises events for it):
   ```sql
   SELECT s.*, p.price_monthly FROM subscription s JOIN subscription_plan p USING (plan_id)
   WHERE s.subscription_id = $1 FOR UPDATE;
   ```
   No row -> a payment that did not come from our checkout -> log, nothing to record.
2. Ownership (verify only): when `options.expectedUserId` is given, `subscription.user_id` must equal it (the
   session user). Otherwise do not write (the webhook will still record it) and log it.
3. Insert the payment:
   ```sql
   INSERT INTO payment (subscription_id, amount, payment_mode, transaction_ref, gateway_order_id, status)
   VALUES ($1, $amount::numeric / 100, $mode, $payId, $orderId, 'SUCCESS')
   ON CONFLICT (transaction_ref) DO NOTHING RETURNING payment_id;
   ```
   No row returned -> this capture was already processed -> COMMIT and stop (verify and the webhook race
   safely; Razorpay redelivery is a no-op).
4. Check `amount / 100 = price_monthly` and `currency = 'INR'` (compare in paise: `payment.amount === Math.round(Number(price_monthly) * 100)`).
   On a mismatch keep the payment row, do not activate, and log it for a manual refund.
5. If the subscription is PENDING (or CANCELLED as an abandoned checkout: the money was taken, so honour it):
   ```sql
   UPDATE subscription SET status = 'CANCELLED', end_date = now()
     WHERE user_id = $user AND status = 'ACTIVE' AND subscription_id <> $1;
     -- plan change: must run first, the partial UNIQUE (user_id) WHERE status = 'ACTIVE' index allows only one ACTIVE row per user
   UPDATE subscription SET status = 'ACTIVE', start_date = now(), end_date = now() + interval '1 month'
     WHERE subscription_id = $1;
   ```
   If it is already ACTIVE (a renewal order on the same subscription):
   ```sql
   UPDATE subscription SET end_date = GREATEST(end_date, now()) + interval '1 month'
     WHERE subscription_id = $1;
   ```
6. COMMIT.

|                          |                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tables / keys            | `subscription` (FOR UPDATE, UPDATE), `subscription_plan` (price), `payment` (INSERT). UNIQUE `(transaction_ref)`; partial UNIQUE `subscription_one_active_per_user`; CHECK `subscription_dates_check`; FK `subscription_id`                                                                                                                                                                                                              |
| Transaction / idempotent | yes (`db.transaction`) / yes (`ON CONFLICT (transaction_ref) DO NOTHING`; the UNIQUE constraint is the last line of defence: if two deliveries of the same capture race, the second INSERT fails and its whole transaction rolls back; the row lock normally makes it wait and then find the conflict)                                                                                                                                   |
| Edge cases               | out-of-order events (a capture for a CANCELLED abandoned checkout is honoured); a failed verify-side ownership check leaves everything to the webhook; amount mismatch -> payment kept, plan not activated; ACTIVE with end_date in the past is extended from now (`GREATEST`); CANCELLED sub being activated: only set the dates if status was PENDING/CANCELLED, never reactivate a paid CANCELLED/EXPIRED row (it has a `start_date`) |
| Throws                   | any database failure propagates (route answers 500; the webhook is retried by Razorpay, which is safe)                                                                                                                                                                                                                                                                                                                                   |
| Called by                | `POST /api/payments/verify` (with `options.expectedUserId`), `POST /api/payments/webhook` (`payment.captured`)                                                                                                                                                                                                                                                                                                                           |
| Mock today               | writes nothing                                                                                                                                                                                                                                                                                                                                                                                                                           |

Reading the locked row in Drizzle: ``(await tx.execute(sql`SELECT s.subscription_id, s.user_id, s.status, p.price_monthly FROM subscription s JOIN subscription_plan p USING (plan_id) WHERE s.subscription_id = ${id} FOR UPDATE`)).rows[0]``.

---

## 6. Deep dive: the Razorpay flow end to end

### 6.1 Model

One Razorpay **order** -> many **payment attempts**. That maps onto one `subscription` -> many `payment` rows:

| Razorpay          | Our table                                          | Key                              |
| ----------------- | -------------------------------------------------- | -------------------------------- |
| order `order_...` | `subscription` (PENDING, then ACTIVE)              | `payment.gateway_order_id`       |
| payment `pay_...` | `payment` (one row per attempt: SUCCESS or FAILED) | `payment.transaction_ref` UNIQUE |

### 6.2 Sequence

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser (change-plan.tsx)
  participant S as Our API
  participant DB as PostgreSQL
  participant R as Razorpay

  B->>S: POST /api/account/subscriptions { planId }
  S->>DB: getPlan, then TX: cancel old PENDING, INSERT subscription PENDING
  S->>R: POST /v1/orders { amount (paise), currency INR, receipt, notes.subscription_id }
  R-->>S: { id: order_... }
  S-->>B: 201 { subscriptionId, orderId, amount, currency, keyId }
  B->>R: Checkout.open({ key, order_id, amount, handler })
  Note over B,R: customer pays (card / UPI / net banking / wallet); failures keep Checkout open for a retry
  R-->>B: handler({ razorpay_order_id, razorpay_payment_id, razorpay_signature })
  B->>S: POST /api/payments/verify (same three fields)
  S->>S: verifyPaymentSignature (HMAC order_id|payment_id)
  S->>R: GET /v1/payments/:id (amount, method, status, notes)
  S->>DB: recordCapturedPayment TX: lock subscription, INSERT payment ON CONFLICT DO NOTHING, activate
  S-->>B: 200 { verified: true }
  par webhook (source of truth)
    R->>S: POST /api/payments/webhook payment.captured / payment.failed (X-Razorpay-Signature)
    S->>S: verifyWebhookSignature (HMAC of raw body)
    S->>DB: recordCapturedPayment / recordFailedPayment (ON CONFLICT (transaction_ref) DO NOTHING)
    S-->>R: 200 {} (or 400 / 500 -> Razorpay retries on 5xx)
  end
  loop up to 5 times, 2 s apart
    B->>S: GET /api/account
    S-->>B: { subscription: ACTIVE? }
  end
```

ASCII version (same flow):

```
Pay click   POST /api/account/subscriptions -> INSERT subscription PENDING -> Razorpay order -> 201 { orderId, keyId }
Checkout    browser pays at Razorpay
Success     handler -> POST /api/payments/verify -> signature -> fetchPayment -> recordCapturedPayment
Webhook     Razorpay -> POST /api/payments/webhook -> signature -> recordCapturedPayment | recordFailedPayment
            whichever of verify/webhook arrives first writes the payment and activates; the other hits ON CONFLICT and stops
UI          polls GET /api/account until the subscription is ACTIVE
```

### 6.3 Step by step

1. **Checkout** (`POST /api/account/subscriptions`, body `{ planId }`): `requireUser` -> `getPlan` (404 unknown) ->
   `createPendingSubscription` (cancels earlier PENDING rows; returns the ACTIVE row for a same-plan renewal) ->
   `createRazorpayOrder` (amount from the plan row x 100). Response 201 `CheckoutOrder`.
2. **Browser** opens Checkout with `key`, `order_id`, `amount`, `currency`, prefill (name, email, phone), and
   posts the success response to `/api/payments/verify`; then polls `GET /api/account` 5 times, 2 seconds apart.
   While `keyId` is `null` (stub) the client skips Checkout and calls verify with a fake payload.
3. **Verify** (`requireUser` -> `verifyPaymentSignature` -> `fetchPayment` -> if `captured`: `recordCapturedPayment(payment, { expectedUserId })`).
   Authorized-only payments return 200 and wait for the webhook.
4. **Webhook** (public; signature only): `request.text()` first, `verifyWebhookSignature`, `parseWebhookEvent`, then
   `recordCapturedPayment(event.payment)` or `recordFailedPayment(event.payment)`; answer `200 {}`.
5. **`recordCapturedPayment`** is the one place that changes subscription state (section 5.7).

### 6.4 Idempotency and concurrency

- `UNIQUE (transaction_ref)` + `INSERT ... ON CONFLICT DO NOTHING RETURNING` makes verify, webhook, and every Razorpay redelivery a no-op after the first.
- `SELECT ... FOR UPDATE` on the subscription serialises racing events; the partial unique index
  `subscription_one_active_per_user` guarantees at most one ACTIVE plan per user even if code is wrong.
- Cancel the old ACTIVE row **before** activating the new one (the index allows only one).
- The webhook returns 5xx on unexpected failures so Razorpay retries (safe); it returns 200 for events it ignores or
  payments it cannot match, so Razorpay stops retrying.

### 6.5 Amount check, plan change, renewal, abandoned checkouts

| Case               | Behaviour                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Amount check       | `payment.amount (paise) === round(price_monthly x 100)` and `currency === 'INR'`, else keep the payment row, do not activate, log for a manual refund                                             |
| Plan change        | new PENDING subscription on the new plan; on capture the old ACTIVE row becomes CANCELLED with `end_date = now()` (remaining days are not prorated: README 9.9), the new one ACTIVE for one month |
| Renewal            | same plan: `createPendingSubscription` returns the ACTIVE row; the order's `notes.subscription_id` is that id; capture sets `end_date = GREATEST(end_date, now()) + 1 month`                      |
| Abandoned checkout | stays PENDING; the user's next checkout cancels it; never listed in billing history; a late capture for it (money taken) is still honoured                                                        |
| Failed attempt     | `payment` row FAILED, subscription stays PENDING; the user may retry in the same Checkout (same order, new `pay_` id)                                                                             |
| Refunds            | `REFUNDED` exists in the enum but nothing writes it (README 9.10)                                                                                                                                 |
| Expiry             | nothing flips ACTIVE to EXPIRED automatically (README 9.8)                                                                                                                                        |

### 6.6 Signature algorithms (both HMAC-SHA256, hex digest, compared with `timingSafeEqual`)

| What                                      | Key                       | Message                                      | Compared with                 |
| ----------------------------------------- | ------------------------- | -------------------------------------------- | ----------------------------- |
| Checkout success (`/api/payments/verify`) | `RAZORPAY_KEY_SECRET`     | `razorpay_order_id + "                       | " + razorpay_payment_id`      | `razorpay_signature` |
| Webhook (`/api/payments/webhook`)         | `RAZORPAY_WEBHOOK_SECRET` | the **raw request body** exactly as received | header `X-Razorpay-Signature` |

Shell versions for manual tests:

```bash
# Checkout signature
printf '%s' "order_XXXX|pay_YYYY" | openssl dgst -sha256 -hmac "$RAZORPAY_KEY_SECRET" -hex | sed 's/^.* //'

# Replay a webhook against your local server (body must be byte-identical to what you sign)
BODY='{"entity":"event","event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_TEST1","order_id":"order_TEST1","amount":39900,"currency":"INR","status":"captured","method":"upi","notes":{"subscription_id":"3"}}}}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$RAZORPAY_WEBHOOK_SECRET" -hex | sed 's/^.* //')
curl -i -X POST http://localhost:3000/api/payments/webhook -H 'content-type: application/json' -H "x-razorpay-signature: $SIG" -d "$BODY"
# run it twice: the second call changes nothing (idempotent); a wrong $SIG gives 400 INVALID_SIGNATURE
```

(`notes.subscription_id` must be a real PENDING subscription id of yours, and `amount` the plan price in paise, or
the amount check will refuse to activate.)

### 6.7 Test-mode setup

1. Razorpay Dashboard (<https://dashboard.razorpay.com>): switch the toggle to **Test Mode** (top). _Account & Settings -> API Keys -> Generate Test Key_. Put `RAZORPAY_KEY_ID` (`rzp_test_...`) and `RAZORPAY_KEY_SECRET` in `.env` (the secret is shown once). Never put live keys in `.env`.
2. Make sure payments are **auto-captured** (_Account & Settings -> Payment Capture_, default automatic) so `payment.captured` is sent.
3. Expose your local server for webhooks (section 6.8), then _Account & Settings -> Webhooks -> Add New Webhook_ (in test mode): URL `https://<tunnel-host>/api/payments/webhook`, a **secret you choose** (copy it into `RAZORPAY_WEBHOOK_SECRET`), active events `payment.captured` and `payment.failed`.
4. Restart `npm run dev` after editing `.env`.
5. Pay with Razorpay's test instruments (they change; use the docs):
   - Cards: <https://razorpay.com/docs/payments/payments/test-card-details/> (commonly `4111 1111 1111 1111` Visa / `5267 3181 8797 5449` Mastercard, any future expiry, any CVV; a test OTP/"Success"/"Failure" page follows).
   - UPI: <https://razorpay.com/docs/payments/payments/test-upi-details/> (commonly `success@razorpay` succeeds, `failure@razorpay` fails).
   - Net banking and wallets: a test bank page offers Success / Failure buttons.
6. Check: Studio shows a `payment` row (SUCCESS, `transaction_ref` = `pay_...`, `gateway_order_id` = `order_...`) and the subscription ACTIVE with dates; `GET /api/account` shows the plan; replaying the webhook adds nothing. A failed card gives a FAILED row and the subscription stays PENDING.

### 6.8 Tunnel for webhooks

Razorpay must reach your machine: Razorpay's guide <https://razorpay.com/docs/webhooks/validate-test/> suggests
**zrok**; **ngrok** (`ngrok http 3000`) or **cloudflared** (`cloudflared tunnel --url http://localhost:3000`) work too.
Use the `https://...` host they print in the webhook URL. The free tunnel hostnames change on every restart:
update the webhook URL in the dashboard when they do. Without a tunnel you can still test verify (Checkout calls
it from the browser) and replay webhooks by hand (section 6.6).

### 6.9 Frontend behaviour (already built, do not change)

- `src/components/account/change-plan.tsx` calls `api.startCheckout({ planId })` -> `CheckoutOrder`. If `keyId` is `null`
  (the stub) it skips Razorpay and calls `api.verifyPayment` with a fake payload, then polls; once the route returns a
  real `keyId` it loads `https://checkout.razorpay.com/v1/checkout.js` (`next/script`), opens Checkout with
  `key/order_id/amount/currency`, handles `payment.failed` (toast, Checkout stays open) and dismiss.
- The success `handler` posts `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }` to `/api/payments/verify`;
  a 400 shows "Razorpay took the payment, but its signature didn't check out on our side. Don't pay again: the webhook records it on its own".
- Then `waitForActivation(subscriptionId)` polls `GET /api/account` every 2 s up to 5 times for `subscription.subscriptionId === subscriptionId && status === 'ACTIVE'`;
  not found -> "payment received" state (the webhook will activate shortly). So `GET /api/account` must reflect an activation within a few seconds of verify.

---

## 7. Definition of done

- [ ] `billing` and `payments` services import nothing from `@/server/mocks` (`grep -n "server/mocks" src/server/services/{billing,payments}.service.ts` is empty; payments never did).
- [ ] Every function matches its SQL, errors, transaction and idempotency notes above; typed errors only (`ConflictError`, `NotFoundError`, `ValidationError`, `ServiceError`).
- [ ] Schema CHECK fix (README 7.3) merged; `.env.example` lists the Razorpay keys.
- [ ] curl checks pass (README section 4): plans; account; subscriptions/payments history order and filtering; checkout 201/404/422; verify 400 on a bad signature; webhook 400 on a bad signature, replay twice = same DB state.
- [ ] Razorpay test-mode run: card success, card failure, UPI success; plan change cancels the old plan; renewal extends `end_date`; abandoned checkout never shows in history.
- [ ] UI works: account page (current plan, history, billing history); buying a plan through Checkout ends in ACTIVE.
- [ ] `npm run lint` and `npm run build` pass; route comments updated (`POST /api/account/subscriptions` 409 text).
- [ ] PR(s) reviewed by Tejasva or Sahil with curl evidence.
