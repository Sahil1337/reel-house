import { HugeiconsIcon } from "@hugeicons/react";
import { Database01Icon } from "@hugeicons/core-free-icons";

import type { TableRowCount } from "@/types";

/** "What will be stored": rows written per table, in the order the transaction writes them. */
export function StoredRows({ rowCounts }: { rowCounts: TableRowCount[] }) {
  const total = rowCounts.reduce((sum, entry) => sum + entry.rows, 0);

  return (
    <section aria-labelledby="stored-rows-heading" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="stored-rows-heading" className="flex items-center gap-2 text-sm font-medium">
          <HugeiconsIcon icon={Database01Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
          What will be stored
        </h3>
        <span className="text-xs text-muted-foreground">
          {total.toLocaleString("en-IN")} rows across {rowCounts.length} tables, at most
        </span>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {rowCounts.map((entry) => (
          <div key={entry.table} className="flex flex-col gap-1 rounded-lg border bg-background/60 px-3 py-2">
            <dt className="truncate font-mono text-xs text-muted-foreground">{entry.table}</dt>
            <dd className="text-lg leading-none font-semibold">{entry.rows.toLocaleString("en-IN")}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
