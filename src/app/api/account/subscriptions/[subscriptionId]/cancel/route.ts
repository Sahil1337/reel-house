/**
 * POST /api/account/subscriptions/:subscriptionId/cancel — the signed-in user cancels one of their own
 * subscriptions (an unpaid PENDING checkout or their ACTIVE plan).
 *
 * Request:  the `session` cookie; no body
 * Response: 200 { subscription: SubscriptionWithPlan } (status CANCELLED)
 *           401 signed out · 404 not theirs / unknown · 409 already CANCELLED or EXPIRED
 *
 * Calls: cancelSubscription (billing.service)
 */
import { requireUser } from "@/app/api/_lib/auth";
import { handleError, parseId } from "@/app/api/_lib/http";
import { cancelSubscription } from "@/server/services/billing.service";

export async function POST(
  _request: Request,
  { params }: RouteContext<"/api/account/subscriptions/[subscriptionId]/cancel">,
) {
  try {
    const user = await requireUser();
    const subscriptionId = parseId((await params).subscriptionId, "Subscription not found.");
    return Response.json({ subscription: await cancelSubscription(user.userId, subscriptionId) });
  } catch (error) {
    return handleError(error);
  }
}
