import { z } from "zod";

import { requireUser } from "@/app/api/_lib/auth";
import { handleError, parseBody } from "@/app/api/_lib/http";
import { fetchPayment, recordCapturedPayment, verifyPaymentSignature } from "@/server/services/payments.service";

const verifySchema = z.object({
  razorpay_order_id: z.string().min(1, "razorpay_order_id is required."),
  razorpay_payment_id: z.string().min(1, "razorpay_payment_id is required."),
  razorpay_signature: z.string().min(1, "razorpay_signature is required."),
});

/**
 * POST /api/payments/verify — Razorpay Checkout's success handler posts its response here, so the
 * plan can activate without waiting for the webhook.
 *
 * Verify and POST /api/payments/webhook (payment.captured) record the same capture through the same
 * recordCapturedPayment(); it is idempotent on payment.transaction_ref, so whichever arrives first
 * writes the payment and activates the subscription, and the other is a no-op. The webhook stays the
 * source of truth: it also covers a closed tab, a lost network, and failed attempts, which never reach
 * this route.
 *
 * Request:  body VerifyPaymentInput { razorpay_order_id, razorpay_payment_id, razorpay_signature }
 * Response: 200 { verified: true }  (also when the payment is only 'authorized': the webhook's
 *             payment.captured will activate the plan)
 *           400 { error } the signature doesn't match
 *           401 { error } signed out
 *           422 { error } a field is missing (request-shape validation)
 *
 * Calls: requireUser → verifyPaymentSignature → fetchPayment → recordCapturedPayment (payments.service),
 *        which checks that the subscription belongs to the session user
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = await parseBody(request, verifySchema);
    await verifyPaymentSignature(input);
    const payment = await fetchPayment(input.razorpay_payment_id, input.razorpay_order_id);
    // Not captured yet ('authorized'): leave it to the webhook's payment.captured.
    if (payment.status === "captured") await recordCapturedPayment(payment, { expectedUserId: user.userId });
    return Response.json({ verified: true });
  } catch (error) {
    return handleError(error);
  }
}
