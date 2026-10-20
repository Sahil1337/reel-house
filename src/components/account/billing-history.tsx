import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { PAYMENT_MODE_LABELS } from "@/lib/constants";
import { formatCurrency, formatDate } from "@/lib/format";
import type { PaymentWithPlan, SubscriptionWithPlan } from "@/types";

import { CancelSubscriptionButton } from "./cancel-subscription-button";
import { PaymentStatusBadge, SubscriptionStatusBadge } from "./status-badges";

/** Wide tables scroll sideways inside the panel on small screens; the columns people check come first. */
const TABLE_CLASS = "min-w-[36rem]";

function EmptyRow({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan} className="py-10 text-center text-muted-foreground">
        {children}
      </TableCell>
    </TableRow>
  );
}

function TabCount({ count }: { count: number }) {
  return <span className="font-mono text-xs text-muted-foreground tabular-nums">{count}</span>;
}

/** Payments and subscriptions in one panel, payments first: that's what people come here to check. */
export function BillingHistory({
  subscriptions,
  payments,
}: {
  subscriptions: SubscriptionWithPlan[];
  payments: PaymentWithPlan[];
}) {
  const paid = payments.filter((payment) => payment.status === "SUCCESS").reduce((sum, p) => sum + p.amount, 0);

  return (
    <section aria-labelledby="billing-history" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <h2 id="billing-history" className="font-display text-3xl leading-none font-bold tracking-wide uppercase">
          Billing history
        </h2>
        {paid > 0 ? (
          <p className="text-sm text-muted-foreground">
            <span className="font-mono text-foreground tabular-nums">{formatCurrency(paid)}</span> paid so far
          </p>
        ) : null}
      </div>

      <Tabs defaultValue="payments" className="gap-0 rounded-2xl border bg-card">
        <div className="border-b px-3 pt-2 sm:px-4">
          <TabsList variant="underline">
            <TabsTab value="payments">
              Payments <TabCount count={payments.length} />
            </TabsTab>
            <TabsTab value="subscriptions">
              Subscriptions <TabCount count={subscriptions.length} />
            </TabsTab>
          </TabsList>
        </div>

        <TabsPanel value="payments" className="px-3 pb-2 sm:px-4">
          <Table className={TABLE_CLASS}>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Reference</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.length === 0 ? (
                <EmptyRow colSpan={6}>No payments yet. Your first one shows up here once you pick a plan.</EmptyRow>
              ) : (
                payments.map((payment) => (
                  <TableRow key={payment.paymentId}>
                    <TableCell className="tabular-nums">{formatDate(payment.paymentDate)}</TableCell>
                    <TableCell className="font-medium">{payment.planName}</TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatCurrency(payment.amount)}
                    </TableCell>
                    <TableCell>
                      <PaymentStatusBadge status={payment.status} />
                    </TableCell>
                    <TableCell>{PAYMENT_MODE_LABELS[payment.paymentMode]}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {payment.transactionRef}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TabsPanel>

        <TabsPanel value="subscriptions" className="px-3 pb-2 sm:px-4">
          <Table className={TABLE_CLASS}>
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead>Started</TableHead>
                <TableHead>Ends</TableHead>
                <TableHead className="text-right">Status</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscriptions.length === 0 ? (
                <EmptyRow colSpan={5}>No subscriptions yet. Choose a plan above to start one.</EmptyRow>
              ) : (
                subscriptions.map((subscription) => (
                  <TableRow key={subscription.subscriptionId}>
                    <TableCell className="font-medium">{subscription.plan.name}</TableCell>
                    <TableCell className="tabular-nums">{formatDate(subscription.startDate)}</TableCell>
                    <TableCell className="tabular-nums">{formatDate(subscription.endDate)}</TableCell>
                    <TableCell className="text-right">
                      <SubscriptionStatusBadge status={subscription.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {subscription.status === "ACTIVE" && (
                        <CancelSubscriptionButton subscriptionId={subscription.subscriptionId} />
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TabsPanel>
      </Tabs>
    </section>
  );
}
