import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PAYMENT_MODE_LABELS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import type { PaymentWithPlan, SubscriptionWithPlan } from "@/types";

import { PaymentStatusBadge, SubscriptionStatusBadge } from "./status-badges";

/** Wide tables scroll sideways inside the card on small screens. */
const TABLE_CLASS = "min-w-[34rem]";

function HistoryCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle render={<h3 />}>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardPanel className="px-3 sm:px-4">{children}</CardPanel>
    </Card>
  );
}

function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-8 text-center text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  );
}

export function SubscriptionHistory({ subscriptions }: { subscriptions: SubscriptionWithPlan[] }) {
  return (
    <HistoryCard title="Subscriptions" description="Every plan this account has been on, newest first.">
      <Table className={TABLE_CLASS}>
        <TableHeader>
          <TableRow>
            <TableHead>Plan</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Ends</TableHead>
            <TableHead className="text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {subscriptions.length === 0 ? (
            <EmptyRow colSpan={4}>No subscriptions yet. Choose a plan above to start one.</EmptyRow>
          ) : (
            subscriptions.map((subscription) => (
              <TableRow key={subscription.subscriptionId}>
                <TableCell className="font-medium">{subscription.plan.name}</TableCell>
                <TableCell className="tabular-nums">{formatDate(subscription.startDate)}</TableCell>
                <TableCell className="tabular-nums">{formatDate(subscription.endDate)}</TableCell>
                <TableCell className="text-right">
                  <SubscriptionStatusBadge status={subscription.status} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </HistoryCard>
  );
}

export function PaymentHistory({ payments }: { payments: PaymentWithPlan[] }) {
  return (
    <HistoryCard title="Payments" description="Every Razorpay payment attempt, paid or failed.">
      <Table className={TABLE_CLASS}>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Plan</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead>Method</TableHead>
            <TableHead>Reference</TableHead>
            <TableHead className="text-right">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.length === 0 ? (
            <EmptyRow colSpan={6}>No payments yet.</EmptyRow>
          ) : (
            payments.map((payment) => (
              <TableRow key={payment.paymentId}>
                <TableCell className="tabular-nums">{formatDate(payment.paymentDate)}</TableCell>
                <TableCell>{payment.planName}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{formatCurrency(payment.amount)}</TableCell>
                <TableCell>{PAYMENT_MODE_LABELS[payment.paymentMode]}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{payment.transactionRef}</TableCell>
                <TableCell className="text-right">
                  <PaymentStatusBadge status={payment.status} />
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </HistoryCard>
  );
}
