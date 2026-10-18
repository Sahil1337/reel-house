/**
 * PATCH  /api/admin/plans/:planId — edit a plan.
 * DELETE /api/admin/plans/:planId — delete a plan nobody has subscribed to.
 *
 * PATCH request:  path planId · body, any of { name, priceMonthly, videoQuality, maxDevices } (same rules as
 *                 POST /api/admin/plans); send only what changed, at least one field.
 *                 A price change affects future charges only: past payment.amount values are untouched and
 *                 existing subscribers keep their plan (the new price applies from their next renewal).
 * PATCH response: 200 { plan: AdminPlan } the updated plan with its counts
 *                 400 body isn't JSON · 401 / 403 not an admin · 404 { error } no such plan
 *                 409 { error, code: "PLAN_NAME_TAKEN" } another plan has that name
 *                 422 { error } a field breaks its rule
 * DELETE request:  path planId · no body
 * DELETE response: 204 no body (the plan row is gone)
 *                  401 / 403 not an admin · 404 { error } no such plan (also on a repeated delete)
 *                  409 { error, code: "PLAN_IN_USE" } subscriptions still reference the plan
 *                  (subscription.plan_id is ON DELETE RESTRICT, whatever their status)
 *
 * Calls: requireAdmin → updatePlan / deletePlan (admin-billing.service).
 */
import { requireAdmin } from "@/app/api/_lib/auth";
import { handleError, parseBody, parseId } from "@/app/api/_lib/http";
import { updatePlanSchema } from "@/lib/validation/admin";
import { deletePlan, updatePlan } from "@/server/services/admin-billing.service";

export async function PATCH(request: Request, { params }: RouteContext<"/api/admin/plans/[planId]">) {
  try {
    await requireAdmin();
    const planId = parseId((await params).planId, "Plan not found.");
    const input = await parseBody(request, updatePlanSchema);
    return Response.json({ plan: await updatePlan(planId, input) });
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteContext<"/api/admin/plans/[planId]">) {
  try {
    await requireAdmin();
    const planId = parseId((await params).planId, "Plan not found.");
    await deletePlan(planId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return handleError(error);
  }
}
