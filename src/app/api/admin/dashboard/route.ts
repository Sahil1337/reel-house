/**
 * GET /api/admin/dashboard — every widget on the admin dashboard, each with the query that produces it.
 *
 * Request:  none (admin from the session)
 * Response: 200 AdminDashboard { widgets: { [key]: { data, sql, explanation } }, generatedAt }
 *             totalUsers           { count }                       customer accounts
 *             activeSubscriptions  { count }
 *             titles               { movies, series }
 *             episodes             { count }
 *             revenueThisMonth     { amount, payments, month }     successful payments this calendar month
 *             recentPayments       RecentPaymentRow[]              10 newest, with user and plan
 *             mostWatched          MostWatchedRow[]                top 10 by distinct viewers
 *             genreDistribution    GenreCountRow[]                 titles per genre
 *             subscriptionsByPlan  PlanSubscriptionRow[]           active / total per plan
 *           401 / 403 not an admin
 *
 * Calls: requireAdmin → getDashboard (admin.service)
 */
import { requireAdmin } from "@/app/api/_lib/auth";
import { handleError } from "@/app/api/_lib/http";
import { getDashboard } from "@/server/services/admin.service";

export async function GET() {
  try {
    await requireAdmin();
    return Response.json(await getDashboard());
  } catch (error) {
    return handleError(error);
  }
}
