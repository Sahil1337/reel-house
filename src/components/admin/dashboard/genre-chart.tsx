"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import type { DashboardWidget, GenreCountRow } from "@/types";

import { ChartCard, CHART_DEFAULTS } from "./dashboard-kit";
import { ViewSql } from "./view-sql";

const config = { titles: { label: "Titles", color: "var(--chart-1)" } } satisfies ChartConfig;

const ROW_HEIGHT = 26;
const AXIS_BAND = 28;

/** Titles per genre: magnitude across nominal categories, so one series in one colour, sorted. */
export function GenreChart({ widget, className }: { widget: DashboardWidget<GenreCountRow[]>; className?: string }) {
  const data = widget.data;

  return (
    <ChartCard
      title="Genres in the catalogue"
      description="content_genre ⋈ genre — a title counts once per genre it has"
      action={<ViewSql title="Genres in the catalogue" widget={widget} />}
      className={className}
    >
      <ChartContainer
        config={config}
        className="aspect-auto w-full"
        style={{ height: data.length * ROW_HEIGHT + AXIS_BAND }}
      >
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 8, top: 0, bottom: 0 }} barCategoryGap={4}>
          <CartesianGrid horizontal={false} {...CHART_DEFAULTS.grid} />
          <XAxis type="number" allowDecimals={false} {...CHART_DEFAULTS.axis} />
          <YAxis type="category" dataKey="name" width={112} interval={0} {...CHART_DEFAULTS.axis} />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", opacity: 0.5 }}
            content={<ChartTooltipContent indicator="line" />}
          />
          <Bar
            dataKey="titles"
            fill="var(--color-titles)"
            radius={CHART_DEFAULTS.barRadiusHorizontal}
            {...CHART_DEFAULTS.bar}
          />
        </BarChart>
      </ChartContainer>
    </ChartCard>
  );
}
