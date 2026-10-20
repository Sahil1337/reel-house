import { z } from "zod";

import { requireUser } from "@/app/api/_lib/auth";
import { handleError, parseBody } from "@/app/api/_lib/http";
import { createPendingSubscription, getPlan, listSubscriptions } from "@/server/services/billing.service";
import { createRazorpayOrder } from "@/server/services/payments.service";

const checkoutSchema = z.object({
  planId: z.number().int().positive("planId must be a positive integer."),
});

/**
 * GET /api/account/subscriptions — the user's subscription history.
 *
 * Request:  none (user from the session)
 * Response: 200 { subscriptions: SubscriptionWithPlan[] }, newest first (never-paid checkouts left out)
 *           401 { error } signed out
 *
 * Calls: requireUser → listSubscriptions (billing.service)
 */
export async function GET() {
  try {
    const user = await requireUser();
    return Response.json({
      subscriptions: await listSubscriptions(user.userId),
    });
  } catch (error) {
    return handleError(error);
  }
}

/**
 * POST /api/account/subscriptions — start checkout for a plan (new plan, plan change, or renewal).
 * Payment goes through Razorpay; this route only opens the order. The subscription becomes ACTIVE
 * later, once Razorpay reports the payment as captured — in POST /api/payments/verify (Checkout's
 * success handler) or POST /api/payments/webhook, whichever lands first (see "Payment flow" in
 * docs/schema/SCHEMA.md).
 *
 * Request:  body { planId: number }
 * Response: 201 CheckoutOrder { subscriptionId, orderId, amount (paise), currency: "INR", keyId }
 *             -> the client opens Razorpay Checkout with orderId + keyId (src/components/account/change-plan.tsx),
 *               posts the success response to /api/payments/verify, then polls GET /api/account until
 *               the plan shows ACTIVE.
 *           401 { error } signed out · 404 { error } unknown plan · 422 { error } planId isn't a positive integer
 *           409 { error } already ACTIVE on that plan (unless renewing)
 *           503 { error } RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set · 502 { error } Razorpay failed
 *
 * Calls: requireUser → getPlan → createPendingSubscription (billing.service) → createRazorpayOrder (payments.service)
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { planId } = await parseBody(request, checkoutSchema);
    const plan = await getPlan(planId);
    const subscription = await createPendingSubscription(user.userId, plan.planId);
    return Response.json(await createRazorpayOrder(subscription, plan), {
      status: 201,
    });
  } catch (error) {
    return handleError(error);
  }
}
