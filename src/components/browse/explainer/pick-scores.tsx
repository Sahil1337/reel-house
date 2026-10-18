"use client";

import type { CSSProperties } from "react";

import type { GenreTaste, PickExplanation } from "@/types";
import { cn } from "@/lib/utils";

import { type Focus, isTied, type Lit, num, SOURCES } from "./model";
import { useWidth } from "./use-width";

/** Room on the right of the bars for "19.5" / "÷ √3 = 11.26". */
const TIP_ROOM = 92;

interface PickScoresProps {
  picks: PickExplanation[];
  taste: GenreTaste[];
  lit: Lit | null;
  onHover: (focus: Focus | null) => void;
  onSelect: (focus: Focus) => void;
}

/**
 * Step 3: each top pick as two bars on one scale. Top: its genres' taste laid end to end (the SUM).
 * Bottom: the score, which starts at the sum's length and shrinks as it is divided by √(number of genres).
 */
export function PickScores({ picks, taste, lit, onHover, onSelect }: PickScoresProps) {
  const [ref, width] = useWidth<HTMLOListElement>();
  const maxSum = Math.max(...picks.map((p) => p.sum), 0.0001);
  // Bars live between the rank column (1.5rem + gap) and the match column (3rem + gap).
  const barMax = Math.max(80, width - 24 - 48 - 24 - TIP_ROOM);
  const px = (value: number) => (value / maxSum) * barMax;
  const tasteRow = new Map(taste.map((row) => [row.genreId, row]));

  return (
    <ol ref={ref} className="flex flex-col">
      {picks.map((pick, index) => {
        const dim = lit !== null && !lit.picks.has(pick.contentId);
        const year = pick.releaseDate?.slice(0, 4);
        const sumPx = px(pick.sum);
        const scorePx = px(pick.score);
        const delay = 260 + index * 45;
        return (
          <li key={pick.contentId}>
            <button
              type="button"
              className={cn(
                "grid w-full grid-cols-[1.5rem_1fr_3rem] items-start gap-x-3 rounded-lg px-1 py-2.5 text-start transition-opacity duration-150 outline-none hover-fine:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring",
                dim && "opacity-30",
              )}
              onPointerEnter={() => onHover({ kind: "pick", contentId: pick.contentId })}
              onPointerLeave={() => onHover(null)}
              onFocus={() => onHover({ kind: "pick", contentId: pick.contentId })}
              onBlur={() => onHover(null)}
              onClick={() => onSelect({ kind: "pick", contentId: pick.contentId })}
            >
              <span className="pt-0.5 font-mono text-xs text-muted-foreground tabular-nums">{index + 1}</span>
              <span className="flex min-w-0 flex-col gap-1.5">
                <span className="flex min-w-0 items-baseline gap-2 text-sm">
                  <span className="truncate font-medium">{pick.title}</span>
                  {year ? <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{year}</span> : null}
                  {isTied(picks, index) ? (
                    <span className="shrink-0 rounded-sm border px-1 text-[10px] leading-4 text-muted-foreground">
                      tie<span className="max-sm:hidden"> · newer first</span>
                    </span>
                  ) : null}
                </span>
                {/* SUM: one segment per genre, its length = that genre's taste. */}
                <span className="relative flex h-4 items-center">
                  <span
                    className="animate-bar-grow flex h-4 gap-0.5"
                    style={{ width: sumPx, animationDelay: `${delay}ms` }}
                  >
                    {pick.genres
                      .filter((g) => g.taste > 0)
                      .map((g) => {
                        const segment = px(g.taste);
                        // Name if it fits, else just the number; never clipped (the readout and table have both).
                        const label =
                          segment >= g.name.length * 5.4 + 10
                            ? g.name
                            : segment >= num(g.taste).length * 6 + 8
                              ? num(g.taste)
                              : null;
                        const faded = lit !== null && !lit.genres.has(g.name);
                        return (
                          <span
                            key={g.genreId}
                            className={cn(
                              "relative flex h-full min-w-0 shrink-0 items-start overflow-hidden rounded-[3px] bg-foreground/14 transition-opacity duration-150",
                              faded && "opacity-40",
                            )}
                            style={{ width: Math.max(2, segment - 2) }}
                          >
                            {label ? (
                              <span className="px-1 text-[10px] leading-[13px] whitespace-nowrap text-foreground/85">
                                {label}
                              </span>
                            ) : null}
                            <SourceStrip row={tasteRow.get(g.genreId)} />
                          </span>
                        );
                      })}
                  </span>
                  <span
                    className="absolute font-mono text-[11px] text-muted-foreground tabular-nums"
                    style={{ left: sumPx + 6 }}
                  >
                    {num(pick.sum)}
                  </span>
                </span>
                {/* SCORE = SUM ÷ √n */}
                <span className="relative flex h-3 items-center">
                  <span
                    className="animate-bar-shrink h-1.5 rounded-e-[3px] bg-foreground"
                    style={
                      {
                        width: Math.max(2, scorePx),
                        "--from": pick.score > 0 ? pick.sum / pick.score : 1,
                        animationDelay: `${delay + 380}ms`,
                      } as CSSProperties
                    }
                  />
                  <span
                    className="absolute font-mono text-[11px] whitespace-nowrap tabular-nums"
                    style={{ left: scorePx + 6 }}
                  >
                    <span className="text-muted-foreground">÷ √{pick.genreCount} = </span>
                    <span className="font-semibold">{pick.score.toFixed(2)}</span>
                  </span>
                </span>
              </span>
              <span className="flex flex-col items-end leading-none">
                <span className="text-base font-semibold">{pick.match ?? "–"}%</span>
                <span className="mt-1 text-[10px] text-muted-foreground">match</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** A 3px strip along the bottom of a genre segment: where that genre's taste came from. */
function SourceStrip({ row }: { row?: GenreTaste }) {
  if (!row) return null;
  const parts = [row.watchScore, row.ratingScore, row.myListScore, row.pickScore].map((v) => Math.max(0, v));
  const total = parts.reduce((t, v) => t + v, 0);
  if (total <= 0) return null;
  return (
    <span className="absolute inset-x-0 bottom-0 flex h-[3px]">
      {parts.map((v, i) =>
        v > 0 ? (
          <span key={SOURCES[i].key} className={SOURCES[i].swatch} style={{ width: `${(v / total) * 100}%` }} />
        ) : null,
      )}
    </span>
  );
}
