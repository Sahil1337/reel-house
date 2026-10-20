import type { HomeExplanation } from "@/types";
import { cn } from "@/lib/utils";

/** The whole engine in one line of numbers: what you did → genre taste → every unseen title scored → the picks. */
export function PipelineStrip({ data }: { data: HomeExplanation }) {
  const { signals, picks, taste, topPicks, filters } = data;
  return (
    <ol className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <Stat
        n={signals.length}
        label={signals.length === 1 ? "title you touched" : "titles you touched"}
        sub={picks.length > 0 ? `+ ${picks.length} setup ${picks.length === 1 ? "pick" : "picks"}` : undefined}
      />
      <Arrow />
      <Stat n={taste.length} label={taste.length === 1 ? "genre with taste" : "genres with taste"} />
      <Arrow />
      <Stat n={filters.candidates} label="unseen titles scored" sub={`of ${filters.catalogue}`} />
      <Arrow />
      <Stat n={topPicks.length} label="picks on Home" accent />
    </ol>
  );
}

function Stat({ n, label, sub, accent }: { n: number; label: string; sub?: string; accent?: boolean }) {
  return (
    <li className="flex items-baseline gap-2">
      <span className={cn("font-mono text-2xl leading-none font-semibold tabular-nums", accent && "text-primary")}>
        {n}
      </span>
      <span className="text-sm leading-none text-muted-foreground">
        {label}
        {sub ? <span className="ms-1.5 text-xs opacity-70">{sub}</span> : null}
      </span>
    </li>
  );
}

function Arrow() {
  return (
    <li aria-hidden="true" className="text-muted-foreground/50">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </li>
  );
}
