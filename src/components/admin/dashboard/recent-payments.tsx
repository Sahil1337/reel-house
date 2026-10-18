import { PaymentStatusBadge } from "@/components/account/status-badges";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PAYMENT_MODE_LABELS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import type { DashboardWidget, RecentPaymentRow } from "@/types";

import { ChartCard } from "./dashboard-kit";
import { ViewSql } from "./view-sql";

/** The newest payments, joined with who paid and for which plan. */
export function RecentPayments({
  widget,
  className,
}: {
  widget: DashboardWidget<RecentPaymentRow[]>;
  className?: string;
}) {
  return (
    <ChartCard
      title="Recent payments"
      href="/admin/subscriptions"
      description="payment ⋈ subscription ⋈ user ⋈ subscription_plan, newest first"
      action={<ViewSql title="Recent payments" widget={widget} />}
      className={className}
    >
      <div className="-mx-1 overflow-x-auto">
        <Table className="min-w-[40rem]">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Mode</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {widget.data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No payments yet.
                </TableCell>
              </TableRow>
            ) : (
              widget.data.map((payment) => (
                <TableRow key={payment.paymentId}>
                  <TableCell className="tabular-nums">{formatDate(payment.paymentDate)}</TableCell>
                  <TableCell>
                    <span className="flex flex-col">
                      <span className="font-medium">{payment.userName}</span>
                      <span className="text-xs text-muted-foreground">{payment.userEmail}</span>
                    </span>
                  </TableCell>
                  <TableCell>{payment.planName}</TableCell>
                  <TableCell>{PAYMENT_MODE_LABELS[payment.paymentMode]}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(payment.amount)}</TableCell>
                  <TableCell className="text-right">
                    <PaymentStatusBadge status={payment.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </ChartCard>
  );
}
