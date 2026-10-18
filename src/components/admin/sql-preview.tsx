"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { SourceCodeIcon } from "@hugeicons/core-free-icons";

import { CopyButton } from "@/components/admin/copy-button";
import { SqlCodeBlock } from "@/components/admin/sql-code-block";
import { scriptText } from "@/lib/sql/literal";
import type { SqlStatement } from "@/types";

/**
 * "The SQL behind it" for a dialog: one or more statements (built in src/lib/sql/admin-*.ts) with the
 * why of each, shown with their values filled in, and optional notes (constraints, what is NOT touched).
 * Same look as the import page's step list, sized for a dialog.
 */
export function SqlPreview({
  statements,
  notes,
  heading = "The SQL behind it",
}: {
  statements: SqlStatement[];
  /** Short bullet points under the statements: FK behaviour, constraints, edge cases. */
  notes?: React.ReactNode[];
  heading?: string;
}) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-medium">
          <HugeiconsIcon icon={SourceCodeIcon} strokeWidth={2} className="size-4 text-muted-foreground" />
          {heading}
        </h3>
        {statements.length > 1 ? (
          <CopyButton text={() => scriptText(statements)} label="Copy all" variant="outline" size="xs" />
        ) : null}
      </div>

      <ol className="flex flex-col gap-4">
        {statements.map((entry) => {
          const control = entry.table === null;
          return (
            <li key={entry.step} className="flex min-w-0 flex-col gap-1.5">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-xs text-muted-foreground tabular-nums">{entry.step}.</span>
                <h4 className="text-sm font-medium">{entry.title}</h4>
              </div>
              <p className="text-xs leading-relaxed text-pretty text-muted-foreground">{entry.explanation}</p>
              {control ? (
                <code className="w-fit rounded-md border bg-background/60 px-2 py-1 font-mono text-xs text-info-foreground">
                  {entry.sql}
                </code>
              ) : (
                <SqlCodeBlock
                  sql={entry.inlinedSql}
                  label={`${String(entry.step).padStart(2, "0")}-${entry.table}.sql`}
                  collapsedLines={14}
                />
              )}
            </li>
          );
        })}
      </ol>

      {notes?.length ? (
        <ul className="flex list-disc flex-col gap-1 ps-4 text-xs leading-relaxed text-pretty text-muted-foreground marker:text-muted-foreground/50">
          {notes.map((note, index) => (
            <li key={index}>{note}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
