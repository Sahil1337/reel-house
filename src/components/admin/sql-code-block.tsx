"use client";

import { useMemo, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";

import { tokenizeSqlLines, type SqlTokenKind } from "@/lib/sql/highlight";
import { cn } from "@/lib/utils";

import { CopyButton } from "./copy-button";

/** Token colours: theme tokens only, so the block follows the palette. */
const TOKEN_CLASS: Record<SqlTokenKind, string> = {
  keyword: "text-info-foreground",
  string: "text-success-foreground",
  number: "text-warning-foreground",
  param: "font-semibold text-primary",
  comment: "italic text-muted-foreground",
  identifier: "text-foreground/90",
  punctuation: "text-muted-foreground",
  space: "",
};

/**
 * Read-only PostgreSQL with line numbers, highlighting and a copy button (adapted from the kit's
 * AI code block). Long statements can start collapsed to `collapsedLines` with a "show all" toggle.
 */
export function SqlCodeBlock({
  sql,
  label = "PostgreSQL",
  collapsedLines,
  className,
}: {
  sql: string;
  label?: string;
  /** Start folded to this many lines when the statement is longer. */
  collapsedLines?: number;
  className?: string;
}) {
  const lines = useMemo(() => tokenizeSqlLines(sql), [sql]);
  const foldable = collapsedLines !== undefined && lines.length > collapsedLines + 2;
  const [expanded, setExpanded] = useState(!foldable);
  const visible = foldable && !expanded ? lines.slice(0, collapsedLines) : lines;
  const gutter = String(lines.length).length;

  return (
    <div className={cn("overflow-hidden rounded-lg border bg-background/60", className)}>
      <div className="flex items-center justify-between gap-2 border-b px-3 py-1.5">
        <span className="flex items-baseline gap-2 text-xs">
          <span className="font-mono font-medium text-foreground">{label}</span>
          <span className="text-muted-foreground">{lines.length} lines</span>
        </span>
        <CopyButton text={sql} className="-me-1.5" />
      </div>

      <div className="relative">
        <pre
          className="no-scrollbar overflow-x-auto py-2.5 font-mono text-[12px] leading-[1.7]"
          tabIndex={0}
          aria-label={`${label} code`}
        >
          <code className="grid min-w-max">
            {visible.map((tokens, index) => (
              <span key={index} className="flex pe-4">
                <span
                  aria-hidden="true"
                  className="shrink-0 select-none ps-3 pe-3 text-end text-muted-foreground/50 tabular-nums"
                  style={{ width: `calc(${gutter}ch + 1.5rem)` }}
                >
                  {index + 1}
                </span>
                <span className="whitespace-pre">
                  {tokens.length === 0
                    ? " "
                    : tokens.map((token, tokenIndex) => (
                        <span key={tokenIndex} className={TOKEN_CLASS[token.kind]}>
                          {token.text}
                        </span>
                      ))}
                </span>
              </span>
            ))}
          </code>
        </pre>
        {foldable && !expanded ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-card to-transparent"
          />
        ) : null}
      </div>

      {foldable ? (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          className="flex w-full cursor-pointer items-center justify-center gap-1.5 border-t py-1.5 text-xs text-muted-foreground outline-none transition-colors duration-150 hover:bg-accent/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
        >
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            className={cn("size-3.5 transition-transform duration-200 ease-out-strong", expanded && "rotate-180")}
          />
          {expanded ? "Collapse" : `Show all ${lines.length} lines`}
        </button>
      ) : null}
    </div>
  );
}
