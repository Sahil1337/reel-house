import type { Metadata } from "next";

import { GenreChart } from "@/components/admin/dashboard/genre-chart";
import { MostWatched } from "@/components/admin/dashboard/most-watched";
import { PlanChart } from "@/components/admin/dashboard/plan-chart";
import { RecentPayments } from "@/components/admin/dashboard/recent-payments";
import { StatTiles } from "@/components/admin/dashboard/stat-tiles";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Dashboard" };

/** Every widget comes from GET /api/admin/dashboard and carries the SQL that produces it. */
export default async function AdminDashboardPage() {
  const { widgets } = await serverApi.getAdminDashboard();

  return (
    <div className="flex flex-1 flex-col gap-6 px-4 py-6 lg:px-6">
      <StatTiles widgets={widgets} />
      <div className="grid gap-6 xl:grid-cols-5">
        <RecentPayments widget={widgets.recentPayments} className="xl:col-span-3" />
        <PlanChart widget={widgets.subscriptionsByPlan} className="xl:col-span-2" />
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <MostWatched widget={widgets.mostWatched} />
        <GenreChart widget={widgets.genreDistribution} />
      </div>
    </div>
  );
}
