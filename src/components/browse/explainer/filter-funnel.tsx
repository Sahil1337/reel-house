import type { HomeExplanation } from "@/types";

/** Step 2: which titles get a score at all. One bar per stage, all on the catalogue's scale. */
export function FilterFunnel({ filters, shown }: { filters: HomeExplanation["filters"]; shown: number }) {
  const allowed = filters.catalogue - filters.tooMature;
  const seen = allowed - filters.candidates;
  const stages = [
    { label: "In the catalogue", value: filters.catalogue, note: null },
    {
      label: `Allowed for ${filters.maturityLevel}`,
      value: allowed,
      note:
        filters.tooMature > 0
          ? `−${filters.tooMature} rated above ${filters.maturityLevel}`
          : "nothing is above this level",
    },
    {
      label: "Not seen yet → scored",
      value: filters.candidates,
      note: `−${seen} already watched (${filters.watched}), rated (${filters.rated}) or saved (${filters.saved})`,
    },
    { label: "Explained below", value: shown, note: "the best scores, ranked" },
  ];
  const max = Math.max(1, filters.catalogue);

  return (
    <ol className="flex flex-col gap-2.5">
      {stages.map((stage, index) => (
        <li key={stage.label} className="grid grid-cols-[minmax(0,9.5rem)_1fr] items-center gap-x-3 gap-y-0.5 text-xs">
          <span className="truncate text-muted-foreground">{stage.label}</span>
          <span className="flex items-center gap-2">
            <span
              className={
                index === stages.length - 1
                  ? "animate-bar-grow h-2.5 rounded-e-[3px] bg-foreground"
                  : "animate-bar-grow h-2.5 rounded-e-[3px] bg-foreground/28"
              }
              style={{ width: `${Math.max(0.6, (stage.value / max) * 82)}%`, animationDelay: `${120 + index * 70}ms` }}
            />
            <span className="font-mono font-semibold tabular-nums">{stage.value}</span>
          </span>
          {stage.note ? <span className="col-start-2 text-[11px] text-muted-foreground">{stage.note}</span> : null}
        </li>
      ))}
    </ol>
  );
}
