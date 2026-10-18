import Image from "next/image";

import type { DashboardWidget, MostWatchedRow } from "@/types";

import { ChartCard } from "./dashboard-kit";
import { ViewSql } from "./view-sql";

/** Top titles by distinct viewers: a ranked list with an inline share bar (one series, one colour). */
export function MostWatched({ widget, className }: { widget: DashboardWidget<MostWatchedRow[]>; className?: string }) {
  const top = Math.max(1, ...widget.data.map((row) => row.viewers));

  return (
    <ChartCard
      title="Most watched"
      href="/admin/content"
      description="Distinct profiles per title, from watch_history"
      action={<ViewSql title="Most watched" widget={widget} />}
      className={className}
    >
      {widget.data.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nobody has watched anything yet.</p>
      ) : (
        <ol className="flex flex-col">
          {widget.data.map((row, index) => (
            <li key={row.contentId} className="flex items-center gap-3 border-b py-2 last:border-b-0 last:pb-0">
              <span className="w-4 shrink-0 text-right font-mono text-xs text-muted-foreground tabular-nums">
                {index + 1}
              </span>
              <span className="relative h-10 w-7 shrink-0 overflow-hidden rounded-sm bg-muted">
                {row.posterUrl ? <Image src={row.posterUrl} alt="" fill sizes="28px" className="object-cover" /> : null}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm">
                    {row.title}
                    <span className="ms-2 text-xs text-muted-foreground">
                      {row.contentType === "MOVIE" ? "Film" : "Series"}
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                    {row.viewers} {row.viewers === 1 ? "viewer" : "viewers"} · {row.plays}{" "}
                    {row.plays === 1 ? "play" : "plays"}
                  </span>
                </div>
                <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-chart-1"
                    style={{ width: `${Math.round((row.viewers / top) * 100)}%` }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </ChartCard>
  );
}
