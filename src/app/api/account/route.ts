import { requireUser } from "@/app/api/_lib/auth";
import { handleError } from "@/app/api/_lib/http";
import { getActiveSubscription } from "@/server/services/billing.service";

/**
 * GET /api/account — the signed-in user and their active subscription.
 *
 * Request:  none (user comes from the session)
 * Response: 200 { user: User, subscription: SubscriptionWithPlan | null }
 *           401 { error } when there is no session
 *
 * Calls: requireUser → getActiveSubscription (billing.service)
 */
export async function GET() {
  try {
    const user = await requireUser();
    return Response.json({
      user,
      subscription: await getActiveSubscription(user.userId),
    });
  } catch (error) {
    return handleError(error);
  }
}
