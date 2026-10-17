import { handleError } from "@/app/api/_lib/http";
import { listPlans } from "@/server/services/billing.service";

/**
 * GET /api/plans — every subscription plan (public; landing page, sign-up, account).
 *
 * Request:  none
 * Response: 200 { plans: SubscriptionPlan[] }, cheapest first
 *
 * Calls: listPlans (billing.service)
 */
export async function GET() {
  try {
    return Response.json({ plans: await listPlans() });
  } catch (error) {
    return handleError(error);
  }
}
