import { Card, CardAction, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/format";
import type { SubscriptionWithPlan } from "@/types";

import { PlanFeatureList } from "./plan-features";
import { SubscriptionStatusBadge } from "./status-badges";

export function CurrentPlanCard({ subscription }: { subscription: SubscriptionWithPlan | null }) {
  if (!subscription) {
    return (
      <Card>
        <CardHeader>
          <CardTitle render={<h2 />}>Current plan</CardTitle>
          <CardDescription>You don&rsquo;t have an active plan. Choose one below to keep watching.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const { plan } = subscription;
  return (
    <Card>
      <CardHeader>
        <CardTitle render={<h2 />}>Current plan</CardTitle>
        <CardDescription>
          Renews on <span className="text-foreground">{formatDate(subscription.endDate)}</span>
        </CardDescription>
        <CardAction>
          <SubscriptionStatusBadge status={subscription.status} />
        </CardAction>
      </CardHeader>
      <CardPanel className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="font-display text-3xl font-bold uppercase leading-none tracking-wide">{plan.name}</p>
          <p className="flex items-baseline gap-1">
            <span className="font-mono text-xl font-semibold tabular-nums">{formatCurrency(plan.priceMonthly)}</span>
            <span className="text-sm text-muted-foreground">/month</span>
          </p>
        </div>
        <PlanFeatureList plan={plan} />
      </CardPanel>
    </Card>
  );
}
