/**
 * GET /api/admin/subscriptions — every customer's subscriptions with the user and the plan, newest first.
 *
 * Request:  query ?status=ACTIVE|CANCELLED|EXPIRED|PENDING &q=<email substring, case-insensitive>
 *           &page=<1-based, default 1> &pageSize=<default 20, max 100>; all optional, empty values ignored
 * Response: 200 AdminPage<AdminSubscriptionRow> { items, total, page, pageSize, pageCount }
 *             item: { subscriptionId, userId, userName, userEmail, planId, planName, planPriceMonthly,
 *                     startDate, endDate (both null while PENDING), status, createdAt }
 *           401 / 403 not an admin · 422 { error } a query value breaks its rule (unknown status, page 0, …)
 *
 * Calls: requireAdmin → listAllSubscriptions (admin-billing.service).
 */
import { requireAdmin } from "@/app/api/_lib/auth";
import { handleError, parseWith } from "@/app/api/_lib/http";
import { adminSubscriptionQuerySchema } from "@/lib/validation/admin";
import { listAllSubscriptions } from "@/server/services/admin-billing.service";

export async function GET(request: Request) {
  try {
    await requireAdmin();
    const filters = parseWith(adminSubscriptionQuerySchema, Object.fromEntries(new URL(request.url).searchParams));
    return Response.json(await listAllSubscriptions(filters));
  } catch (error) {
    return handleError(error);
  }
}
