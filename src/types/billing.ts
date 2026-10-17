/** Billing — mirror subscription_plan / subscription / payment tables. */

export type SubscriptionStatus = "ACTIVE" | "CANCELLED" | "EXPIRED" | "PENDING";

export type PaymentMode = "CARD" | "UPI" | "NET_BANKING" | "WALLET";

/** One row per Razorpay payment attempt, written by the webhook — so there is no PENDING. */
export type PaymentStatus = "SUCCESS" | "FAILED" | "REFUNDED";

export interface SubscriptionPlan {
  planId: number;
  name: string;
  /** In rupees. */
  priceMonthly: number;
  videoQuality: string;
  maxDevices: number;
}

export interface Subscription {
  subscriptionId: number;
  userId: number;
  planId: number;
  /** NULL while PENDING (checkout started, not paid yet); set when the first payment is captured. */
  startDate: string | null;
  endDate: string | null;
  status: SubscriptionStatus;
  createdAt: string;
}

export interface SubscriptionWithPlan extends Subscription {
  plan: SubscriptionPlan;
}

export interface Payment {
  paymentId: number;
  subscriptionId: number;
  paymentDate: string;
  amount: number;
  paymentMode: PaymentMode;
  /** Razorpay payment id (pay_…), UNIQUE — the webhook's idempotency key. */
  transactionRef: string;
  /** Razorpay order id (order_…); one order can have several attempts. */
  gatewayOrderId: string;
  status: PaymentStatus;
}

export interface PaymentWithPlan extends Payment {
  planName: string;
}

/** POST /api/account/subscriptions — start Razorpay checkout. Razorpay Checkout picks the payment method. */
export interface ChangePlanInput {
  planId: number;
}

/** POST /api/account/subscriptions response: what the browser needs to open Razorpay Checkout. */
export interface CheckoutOrder {
  /** The PENDING subscription this order pays for (the order's notes.subscription_id). */
  subscriptionId: number;
  /** Razorpay order id (order_…). */
  orderId: string;
  /** In paise. */
  amount: number;
  currency: string;
  /** RAZORPAY_KEY_ID — public by design; the secret stays on the server. null while checkout is a stub. */
  keyId: string | null;
}

/** POST /api/payments/verify body: Razorpay Checkout's success-handler response, as is. */
export interface VerifyPaymentInput {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

/** Razorpay's payment `status` (GET /v1/payments/:id, webhook `payload.payment.entity.status`). */
export type RazorpayPaymentStatus = "created" | "authorized" | "captured" | "refunded" | "failed";

/**
 * The parts of a Razorpay payment entity we use, already mapped to our names and units. Comes from
 * GET /v1/payments/:id (Checkout verify) or the webhook's `payload.payment.entity`.
 */
export interface RazorpayPayment {
  /** Razorpay payment id (pay_…) → payment.transaction_ref. */
  paymentId: string;
  /** Razorpay order id (order_…) → payment.gateway_order_id. */
  orderId: string;
  /** In paise (payment.amount is amount / 100 rupees). */
  amount: number;
  /** "INR" — anything else is a mismatch. */
  currency: string;
  status: RazorpayPaymentStatus;
  /** Razorpay `method` mapped: card → CARD, upi → UPI, netbanking → NET_BANKING, wallet → WALLET. */
  paymentMode: PaymentMode;
  /** `notes.subscription_id`, set when we created the order. */
  subscriptionId: number;
}

/** A parsed Razorpay webhook body. Anything we don't act on is "ignored". */
export type WebhookEvent =
  | { type: "payment.captured"; payment: RazorpayPayment }
  | { type: "payment.failed"; payment: RazorpayPayment }
  | { type: "ignored"; event: string };
