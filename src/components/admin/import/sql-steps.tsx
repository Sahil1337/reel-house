"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { SourceCodeIcon } from "@hugeicons/core-free-icons";

import { CopyButton } from "@/components/admin/copy-button";
import { SqlCodeBlock } from "@/components/admin/sql-code-block";
import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { quoteLiteral, scriptText } from "@/lib/sql/literal";
import { cn } from "@/lib/utils";
import type { SqlParam, SqlStatement } from "@/types";

type SqlMode = "parameterized" | "inlined";

const MODE_OPTIONS: { value: SqlMode; label: string }[] = [
  { value: "parameterized", label: "Parameterized" },
  { value: "inlined", label: "Inlined" },
];

/** Episode inserts run to hundreds of lines; they (and anything else that long) start folded. */
const FOLD_TO_LINES = 12;
const FOLD_OTHERS_OVER = 30;
const MAX_PARAM_CHIPS = 8;

/** The import's SQL as an ordered list of statements: why each runs, then the statement itself. */
export function SqlSteps({ statements, title }: { statements: SqlStatement[]; title: string }) {
  const [mode, setMode] = useState<SqlMode>("parameterized");

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
            Parameterized is what the backend sends; inlined is for reading and pasting into psql.
          </CardDescription>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <ToggleGroup
            variant="outline"
            size="sm"
            aria-label="SQL format"
            value={[mode]}
            onValueChange={(value: string[]) => {
              if (value[0] === "parameterized" || value[0] === "inlined") setMode(value[0]);
            }}
          >
            {MODE_OPTIONS.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value} className="px-2.5">
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <CopyButton
            text={() => scriptText(statements, mode)}
            label="Copy full transaction"
            variant="outline"
            size="sm"
          />
        </div>
      </CardHeader>

      <CardPanel className="px-4 pb-4 sm:px-6 sm:pb-6">
        <ol className="flex flex-col">
          {statements.map((entry, index) => (
            <Step key={entry.step} entry={entry} mode={mode} last={index === statements.length - 1} />
          ))}
        </ol>
      </CardPanel>
    </Card>
  );
}

function Step({ entry, mode, last }: { entry: SqlStatement; mode: SqlMode; last: boolean }) {
  const sql = mode === "inlined" ? entry.inlinedSql : entry.sql;
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
          <>
            {mode === "parameterized" && entry.params.length ? <ParamChips params={entry.params} /> : null}
            <SqlCodeBlock
              sql={sql}
              label={`${String(entry.step).padStart(2, "0")}-${entry.table}.sql`}
              collapsedLines={collapsedLines}
            />
          </>
        )}
      </div>
    </li>
  );
}

/** "$1 = 27205" for the first few params, then "+N more". */
export function ParamChips({ params }: { params: SqlParam[] }) {
  const shown = params.slice(0, MAX_PARAM_CHIPS);
  const rest = params.length - shown.length;
  return (
    <ul aria-label="Parameters" className="flex flex-wrap gap-1.5">
      {shown.map((value, index) => (
        <li
          key={index}
          className="flex max-w-full items-center gap-1 rounded-md border bg-background/60 px-1.5 py-0.5 font-mono text-xs"
        >
          <span className="font-semibold text-primary">${index + 1}</span>
          <span className="text-muted-foreground">=</span>
          <span className="max-w-48 truncate text-foreground/90" title={quoteLiteral(value)}>
            {quoteLiteral(value)}
          </span>
        </li>
      ))}
      {rest > 0 ? (
        <li className="rounded-md px-1.5 py-0.5 text-xs text-muted-foreground">+{rest.toLocaleString("en-IN")} more</li>
      ) : null}
    </ul>
  );
}
