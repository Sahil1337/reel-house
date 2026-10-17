/*
 * Shared dashboard pieces, adapted from the kit's dashboards/dashboard-kit.tsx so every widget
 * reads as one system. Mark specs (hairline grid, thin marks, ≤24px bars, 4px rounded data-ends,
 * 2px surface gaps) live in CHART_DEFAULTS; colours are the --chart-* tokens in fixed order.
 */
import { cn } from "@/lib/utils";

/** Recharts props reused by every chart so they're specced alike. */
export const CHART_DEFAULTS = {
  /** Solid hairline, one step off the surface. */
  grid: { stroke: "var(--border)" },
  axis: {
    tickLine: false,
    axisLine: false,
    tickMargin: 8,
    /** Axis text wears a text token, never a series colour. */
    tick: { fill: "var(--muted-foreground)", fontSize: 11 },
  },
  /** Bars: capped so the band keeps its air. */
  bar: { maxBarSize: 24 },
  /** 4px rounded data-end, square at the baseline (columns / horizontal bars). */
  barRadius: [4, 4, 0, 0] as [number, number, number, number],
  barRadiusHorizontal: [0, 4, 4, 0] as [number, number, number, number],
  /** Stacked segments and neighbours are separated by a 2px gap in the surface colour, never a border. */
  segmentGap: { stroke: "var(--card)", strokeWidth: 2 },
};

/** Compact 1,284 / 12.9K formatting for tile values. */
export function compact(value: number, prefix = ""): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${prefix}${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 10_000) return `${prefix}${(value / 1_000).toFixed(1)}K`;
  return `${prefix}${value.toLocaleString("en-IN")}`;
}

/** Stat tile: label, value (proportional figures, app sans), a detail line and an action slot. */
export function StatTile({
  label,
  value,
  detail,
  action,
}: {
  label: string;
  value: string;
  detail?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs/5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        {action}
      </div>
      <span className="text-2xl font-semibold leading-none">{value}</span>
      {detail ? <span className="text-xs text-muted-foreground">{detail}</span> : null}
    </div>
  );
}

/** Row of stat tiles. */
export function StatRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">{children}</div>;
}

/** Card wrapper for a widget. Chart heights include the axis band, so nothing clips. */
export function ChartCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs/5", className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <h2 className="text-sm font-medium">{title}</h2>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Legend row. Always rendered for two or more series. */
export function ChartLegendRow({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      {items.map((item) => (
        <span key={item.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="size-2 shrink-0 rounded-[2px]" style={{ backgroundColor: item.color }} />
          {item.label}
        </span>
      ))}
    </div>
  );
}
