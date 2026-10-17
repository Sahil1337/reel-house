"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { SourceCodeIcon } from "@hugeicons/core-free-icons";

import { SqlCodeBlock } from "@/components/admin/sql-code-block";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetDescription,
  SheetHeader,
  SheetPanel,
  SheetPopup,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DashboardWidget } from "@/types";

/** camelCase field → the snake_case column the query returns. */
const toColumn = (key: string) => key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return value.toLocaleString("en-IN");
  return String(value);
}

/**
 * "View SQL" for a dashboard widget: a sheet with the query, its one-line explanation and the rows
 * behind the widget as a table (the chart's table view).
 */
export function ViewSql({ title, widget }: { title: string; widget: DashboardWidget<unknown> }) {
  const rows = (Array.isArray(widget.data) ? widget.data : [widget.data]) as Record<string, unknown>[];
  const columns = rows.length ? Object.keys(rows[0]) : [];

  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="xs"
            className="-me-1.5 -mt-1 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={`View SQL for ${title}`}
          />
        }
      >
        <HugeiconsIcon icon={SourceCodeIcon} strokeWidth={2} />
        SQL
      </SheetTrigger>
      <SheetPopup className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>{widget.explanation}</SheetDescription>
        </SheetHeader>
        <SheetPanel className="flex flex-col gap-6">
          <SqlCodeBlock sql={widget.sql} />
          <section className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-medium">Result</h3>
              <span className="text-xs text-muted-foreground">
                {rows.length} {rows.length === 1 ? "row" : "rows"} · mock data until the backend runs this query
              </span>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow>
                    {columns.map((column) => (
                      <TableHead key={column} className="font-mono text-xs">
                        {toColumn(column)}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={index}>
                      {columns.map((column) => (
                        <TableCell
                          key={column}
                          className="max-w-56 truncate font-mono tabular-nums"
                          title={formatCell(row[column])}
                        >
                          {formatCell(row[column])}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </SheetPanel>
      </SheetPopup>
    </Sheet>
  );
}
