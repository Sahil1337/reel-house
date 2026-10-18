/**
 * PATCH /api/admin/subscriptions/:subscriptionId — an admin action on one subscription.
 *
 * Request:  path subscriptionId · body, one of
 *             { action: "cancel" }                         status -> CANCELLED, end_date -> now (no refund)
 *             { action: "extend", months: 1-24 }           end_date + N calendar months (no payment)
 *             { action: "change_plan", planId }            plan_id -> planId (no payment; dates unchanged;
 *                                                          the new price applies from the next renewal)
 *           Every action needs the subscription to be ACTIVE.
 * Response: 200 { subscription: AdminSubscriptionRow } the row after the action
 *           400 body isn't JSON · 401 / 403 not an admin
 *           404 { error } no such subscription (or, for change_plan, no such plan)
 *           409 { error, code: "SUBSCRIPTION_NOT_ACTIVE" } the row is PENDING / CANCELLED / EXPIRED
 *           409 { error, code: "PLAN_UNCHANGED" } change_plan to the plan it is already on
 *           422 { error } unknown action, months out of range, planId not a positive integer
 *
 * Calls: requireAdmin → adminCancelSubscription / adminExtendSubscription / adminChangeSubscriptionPlan
 *        (admin-billing.service).
 */
import { requireAdmin } from "@/app/api/_lib/auth";
import { handleError, parseBody, parseId } from "@/app/api/_lib/http";
import { subscriptionActionSchema } from "@/lib/validation/admin";
import {
  adminCancelSubscription,
  adminChangeSubscriptionPlan,
  adminExtendSubscription,
} from "@/server/services/admin-billing.service";

export async function PATCH(request: Request, { params }: RouteContext<"/api/admin/subscriptions/[subscriptionId]">) {
  try {
    await requireAdmin();
    const subscriptionId = parseId((await params).subscriptionId, "Subscription not found.");
    const input = await parseBody(request, subscriptionActionSchema);
    switch (input.action) {
      case "cancel":
        return Response.json({ subscription: await adminCancelSubscription(subscriptionId) });
      case "extend":
        return Response.json({ subscription: await adminExtendSubscription(subscriptionId, input.months) });
      case "change_plan":
        return Response.json({ subscription: await adminChangeSubscriptionPlan(subscriptionId, input.planId) });
    }
  } catch (error) {
    return handleError(error);
  }
}
