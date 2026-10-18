import { SubscriptionStatusBadge } from "@/components/account/status-badges";
import { formatCurrency, formatDate } from "@/lib/format";
import type { AdminSubscriptionRow } from "@/types";

/** Who and what a subscription dialog is about: customer, plan, status and the paid period. */
export function SubscriptionSummary({ row }: { row: AdminSubscriptionRow }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 rounded-lg border bg-background/60 p-3 text-sm sm:grid-cols-2">
      <div className="flex flex-col">
        <dt className="text-xs text-muted-foreground">Customer</dt>
        <dd className="font-medium">{row.userName}</dd>
        <dd className="truncate text-xs text-muted-foreground">{row.userEmail}</dd>
      </div>
      <div className="flex flex-col">
        <dt className="text-xs text-muted-foreground">Plan</dt>
        <dd className="font-medium">{row.planName}</dd>
        <dd className="text-xs text-muted-foreground">{formatCurrency(row.planPriceMonthly)} / month</dd>
      </div>
      <div className="flex flex-col items-start gap-1">
        <dt className="text-xs text-muted-foreground">Status</dt>
        <dd>
          <SubscriptionStatusBadge status={row.status} />
        </dd>
      </div>
      <div className="flex flex-col">
        <dt className="text-xs text-muted-foreground">Paid period</dt>
        <dd className="tabular-nums">
          {formatDate(row.startDate)} to {formatDate(row.endDate)}
        </dd>
      </div>
    </dl>
  );
}

/** The two constraints every subscription action has to respect, as a note for the SQL preview. */
export const CONSTRAINT_NOTES: React.ReactNode[] = [
  <>
    <code className="font-mono">subscription_one_active_per_user</code> (a partial unique index on{" "}
    <code className="font-mono">user_id WHERE status = &apos;ACTIVE&apos;</code>) allows one ACTIVE row per customer.
    This statement never adds an ACTIVE row, so it can&apos;t break it.
  </>,
  <>
    The dates CHECK: a paid row needs{" "}
    <code className="font-mono">start_date IS NOT NULL AND end_date &gt; start_date</code>
    (only never-paid PENDING / CANCELLED rows have NULL dates), so the dates are kept, never cleared.
  </>,
  <>
    The UPDATE only matches <code className="font-mono">status = &apos;ACTIVE&apos;</code>: anything else gets a 409.
    The <code className="font-mono">payment</code> table is not touched.
  </>,
];
