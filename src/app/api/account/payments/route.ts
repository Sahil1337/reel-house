import { requireUser } from "@/app/api/_lib/auth";
import { handleError } from "@/app/api/_lib/http";
import { listPayments } from "@/server/services/billing.service";

/**
 * GET /api/account/payments — the user's payment history.
 *
 * Request:  none (user from the session)
 * Response: 200 { payments: PaymentWithPlan[] }, newest first (failed and refunded payments included)
 *           401 { error } signed out
 *
 * Calls: requireUser → listPayments (billing.service)
 */
export async function GET() {
  try {
    const user = await requireUser();
    return Response.json({ payments: await listPayments(user.userId) });
  } catch (error) {
    return handleError(error);
  }
}
