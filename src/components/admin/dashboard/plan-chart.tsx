"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatCurrency } from "@/lib/format";
import type { DashboardWidget, PlanSubscriptionRow } from "@/types";

import { ChartCard, ChartLegendRow, CHART_DEFAULTS } from "./dashboard-kit";
import { ViewSql } from "./view-sql";

const config = {
  active: { label: "Active", color: "var(--chart-1)" },
  ended: { label: "Cancelled or expired", color: "var(--chart-2)" },
} satisfies ChartConfig;

/** Subscriptions per plan as a stacked column: active on the baseline, the rest of the plan's history above. */
export function PlanChart({
  widget,
  className,
}: {
  widget: DashboardWidget<PlanSubscriptionRow[]>;
  className?: string;
}) {
  const data = widget.data.map((row) => ({
    plan: row.planName,
    price: formatCurrency(row.priceMonthly),
    active: row.active,
    ended: row.total - row.active,
  }));

  return (
    <ChartCard
      title="Subscriptions by plan"
      href="/admin/plans"
      description="subscription_plan ⟕ subscription, all time"
      action={<ViewSql title="Subscriptions by plan" widget={widget} />}
      className={className}
    >
      <ChartLegendRow
        items={[
          { label: config.active.label, color: config.active.color },
          { label: config.ended.label, color: config.ended.color },
        ]}
      />
      <ChartContainer config={config} className="aspect-auto h-56 w-full">
        <BarChart data={data} margin={{ left: -16, right: 8, top: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} {...CHART_DEFAULTS.grid} />
          <XAxis dataKey="plan" {...CHART_DEFAULTS.axis} />
          <YAxis allowDecimals={false} {...CHART_DEFAULTS.axis} />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={
              <ChartTooltipContent
                labelFormatter={(label, payload) => `${label} · ${payload?.[0]?.payload?.price}/mo`}
              />
            }
          />
          <Bar
            dataKey="active"
            stackId="plan"
            fill="var(--color-active)"
            {...CHART_DEFAULTS.segmentGap}
            {...CHART_DEFAULTS.bar}
          />
          <Bar
            dataKey="ended"
            stackId="plan"
            fill="var(--color-ended)"
            radius={CHART_DEFAULTS.barRadius}
            {...CHART_DEFAULTS.segmentGap}
            {...CHART_DEFAULTS.bar}
          />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}
