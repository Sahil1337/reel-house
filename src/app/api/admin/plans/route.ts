/**
 * GET  /api/admin/plans — every subscription plan with its subscriber counts.
 * POST /api/admin/plans — add a plan.
 *
 * GET request:   none (admin from the session)
 * GET response:  200 { plans: AdminPlan[] }  cheapest first; each has activeSubscribers (status ACTIVE) and
 *                totalSubscriptions (any status; > 0 blocks deleting the plan)
 *                401 / 403 not an admin
 * POST request:  body { name (1-50 chars, trimmed), priceMonthly (>= 0, at most 2 decimals),
 *                videoQuality ("720p" | "1080p" | "4K"), maxDevices (integer 1-32767),
 *                maxProfiles (integer 1-32767) }
 * POST response: 201 { plan: AdminPlan }  the new plan, with 0 subscribers
 *                400 body isn't JSON · 401 / 403 not an admin · 422 { error } a field breaks its rule
 *                409 { error, code: "PLAN_NAME_TAKEN" } another plan has that name
 *
 * Calls: requireAdmin → listPlansWithStats / createPlan (admin-billing.service).
 */
import { requireAdmin } from "@/app/api/_lib/auth";
import { handleError, parseBody } from "@/app/api/_lib/http";
import { planSchema } from "@/lib/validation/admin";
import { createPlan, listPlansWithStats } from "@/server/services/admin-billing.service";

export async function GET() {
  try {
    await requireAdmin();
    return Response.json({ plans: await listPlansWithStats() });
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdmin();
    const input = await parseBody(request, planSchema);
    return Response.json({ plan: await createPlan(input) }, { status: 201 });
  } catch (error) {
    return handleError(error);
  }
}
