import { formatCurrency } from "@/lib/format";
import type { AdminDashboard } from "@/types";

import { compact, StatRow, StatTile } from "./dashboard-kit";
import { ViewSql } from "./view-sql";

const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric" }).format(new Date(`${month}-01T00:00:00Z`));

/** The headline numbers, one query each. */
export function StatTiles({ widgets }: { widgets: AdminDashboard["widgets"] }) {
  const { totalUsers, activeSubscriptions, titles, episodes, revenueThisMonth } = widgets;
  const revenue = revenueThisMonth.data;

  return (
    <StatRow>
      <StatTile
        label="Total users"
        value={compact(totalUsers.data.count)}
        detail="Customer accounts (admins excluded)"
        action={<ViewSql title="Total users" widget={totalUsers} />}
      />
      <StatTile
        label="Active subscriptions"
        href="/admin/subscriptions"
        value={compact(activeSubscriptions.data.count)}
        detail="Status ACTIVE and not yet ended"
        action={<ViewSql title="Active subscriptions" widget={activeSubscriptions} />}
      />
      <StatTile
        label="Titles"
        href="/admin/content"
        value={compact(titles.data.movies + titles.data.series)}
        detail={`${titles.data.movies.toLocaleString("en-IN")} films · ${titles.data.series.toLocaleString("en-IN")} series`}
        action={<ViewSql title="Titles" widget={titles} />}
      />
      <StatTile
        label="Episodes"
        value={compact(episodes.data.count)}
        detail="Across every season of every series"
        action={<ViewSql title="Episodes" widget={episodes} />}
      />
      <StatTile
        label="Revenue this month"
        value={formatCurrency(revenue.amount)}
        detail={`${revenue.payments} successful ${revenue.payments === 1 ? "payment" : "payments"} · ${monthLabel(revenue.month)}`}
        action={<ViewSql title="Revenue this month" widget={revenueThisMonth} />}
      />
    </StatRow>
  );
}
