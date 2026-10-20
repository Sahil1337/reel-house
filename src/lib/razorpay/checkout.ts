/**
 * Browser side of Razorpay Checkout (the server side is /api/account/subscriptions and /api/payments/*). The script is loaded with
 * next/script only where a plan can be bought (src/components/account/change-plan.tsx); it defines
 * window.Razorpay. Options and callbacks:
 * https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/
 */
import type { VerifyPaymentInput } from "@/types";

export const RAZORPAY_CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";

/** What the success handler receives — posted as-is to POST /api/payments/verify. */
export type RazorpaySuccessResponse = VerifyPaymentInput;

/** The `payment.failed` event. Checkout stays open after it, so the customer can retry. */
export interface RazorpayFailure {
  error: {
    code: string;
    description: string;
    source: string;
    step: string;
    reason: string;
    metadata: { order_id?: string; payment_id?: string };
  };
}

export interface RazorpayCheckoutOptions {
  key: string;
  order_id: string;
  /** In paise. */
  amount: number;
  currency: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: RazorpaySuccessResponse) => void;
  modal?: { ondismiss?: () => void };
}

export interface RazorpayInstance {
  open(): void;
  close(): void;
  on(event: "payment.failed", callback: (response: RazorpayFailure) => void): void;
}

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => RazorpayInstance;
  }
}

/** Razorpay's contact format: + and digits only ("+91 98765 43210" → "+919876543210"). */
export function toRazorpayContact(phone: string | null): string | undefined {
  const contact = phone?.replace(/[^\d+]/g, "");
  return contact || undefined;
}

/**
 * A CSS custom property (e.g. "--primary", an oklch() token) as the #rrggbb Razorpay's theme.color
 * wants. The canvas does the colour conversion; undefined leaves Razorpay's default.
 */
export function cssTokenToHex(token: string): string | undefined {
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const context = value ? document.createElement("canvas").getContext("2d", { willReadFrequently: true }) : null;
  if (!context) return undefined;
  context.fillStyle = value;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
  return `#${[red, green, blue].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}
