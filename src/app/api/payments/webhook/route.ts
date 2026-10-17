import { handleError } from "@/app/api/_lib/http";
import {
  parseWebhookEvent,
  recordCapturedPayment,
  recordFailedPayment,
  verifyWebhookSignature,
} from "@/server/services/payments.service";

/**
 * POST /api/payments/webhook — Razorpay calls this for every payment attempt. Public (no session):
 * the signature check is the authentication. src/proxy.ts skips every /api path, so it never redirects
 * this request to /sign-in. Razorpay retries until it gets a 2xx, and may deliver an event more than
 * once or out of order, so every step is idempotent.
 *
 * Request:  raw JSON body from Razorpay + header X-Razorpay-Signature; events handled: payment.captured,
 *           payment.failed (subscribe to both in the Razorpay dashboard)
 * Response: 200 {} processed, or already processed, or an event we ignore
 *           400 { error } bad signature or malformed body (Razorpay won't retry those usefully)
 *           500 on any other failure -> Razorpay retries, which is safe (idempotent on transaction_ref)
 *
 * Calls: verifyWebhookSignature → parseWebhookEvent → recordFailedPayment | recordCapturedPayment (payments.service)
 */
export async function POST(request: Request) {
  try {
    // The signature covers the raw bytes, so read the body as text BEFORE parsing it.
    const rawBody = await request.text();
    await verifyWebhookSignature(rawBody, request.headers.get("x-razorpay-signature"));
    const event = await parseWebhookEvent(rawBody);
    if (event.type === "payment.captured") await recordCapturedPayment(event.payment);
    else if (event.type === "payment.failed") await recordFailedPayment(event.payment);
    return Response.json({});
  } catch (error) {
    return handleError(error);
  }
}
