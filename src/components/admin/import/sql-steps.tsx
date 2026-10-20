"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { SourceCodeIcon } from "@hugeicons/core-free-icons";

import { CopyButton } from "@/components/admin/copy-button";
import { SqlCodeBlock } from "@/components/admin/sql-code-block";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { scriptText } from "@/lib/sql/literal";
import { cn } from "@/lib/utils";
import type { SqlStatement } from "@/types";

/** Episode inserts run to hundreds of lines; they (and anything else that long) start folded. */
const FOLD_TO_LINES = 12;
const FOLD_OTHERS_OVER = 30;

/** The import's SQL as an ordered list of statements: why each runs, then the statement itself. */
export function SqlSteps({ statements, title }: { statements: SqlStatement[]; title: string }) {
  return (
    <Card className="animate-[fade-up_360ms_var(--ease-out-strong)_both] [animation-delay:80ms] motion-reduce:animate-none">
      <CardHeader className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="flex min-w-0 flex-col gap-1.5">
          <CardTitle render={<h2 />} className="flex items-center gap-2">
            <HugeiconsIcon icon={SourceCodeIcon} strokeWidth={2} className="size-5 text-muted-foreground" />
            The SQL behind it
          </CardTitle>
          <CardDescription className="text-pretty">
            Importing {title} runs these {statements.length} statements in order, as one PostgreSQL transaction.
          </CardDescription>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <CopyButton text={() => scriptText(statements)} label="Copy full transaction" variant="outline" size="sm" />
        </div>
      </CardHeader>

      <CardPanel className="px-4 pb-4 sm:px-6 sm:pb-6">
        <ol className="flex flex-col">
          {statements.map((entry, index) => (
            <Step key={entry.step} entry={entry} last={index === statements.length - 1} />
          ))}
        </ol>
      </CardPanel>
    </Card>
  );
}

function Step({ entry, last }: { entry: SqlStatement; last: boolean }) {
  const sql = entry.inlinedSql;
  const control = entry.table === null;
  const lineCount = sql.split("\n").length;
  const collapsedLines = entry.table === "episode" || lineCount > FOLD_OTHERS_OVER ? FOLD_TO_LINES : undefined;

  return (
    <li className="relative flex gap-3 sm:gap-4">
      {/* Step rail: number, then a hairline down to the next step. */}
      <div className="flex shrink-0 flex-col items-center">
        <span
          className={cn(
            "flex size-7 items-center justify-center rounded-full border font-mono text-xs tabular-nums",
            control ? "bg-muted text-muted-foreground" : "bg-background text-foreground",
          )}
        >
          {entry.step}
        </span>
        {!last ? <span aria-hidden="true" className="w-px flex-1 bg-border" /> : null}
      </div>

      <div className={cn("flex min-w-0 flex-1 flex-col gap-2", last ? "pb-0" : "pb-6")}>
        <div className="flex min-h-7 flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="text-sm font-medium">{entry.title}</h3>
          {entry.table ? (
            <Badge variant="outline" className="font-mono">
              {entry.table}
              <span className="text-muted-foreground">
                · {entry.rowCount} {entry.rowCount === 1 ? "row" : "rows"}
              </span>
            </Badge>
          ) : null}
        </div>
        <p className="max-w-prose text-sm leading-relaxed text-pretty text-muted-foreground">{entry.explanation}</p>

        {control ? (
          <code className="w-fit rounded-md border bg-background/60 px-2 py-1 font-mono text-xs text-info-foreground">
            {sql}
          </code>
        ) : (
          <SqlCodeBlock
            sql={sql}
            label={`${String(entry.step).padStart(2, "0")}-${entry.table}.sql`}
            collapsedLines={collapsedLines}
          />
        )}
      </div>
    </li>
  );
}
