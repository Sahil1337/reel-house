"use client";

import type { HomeExplanation } from "@/types";
import { cn } from "@/lib/utils";

import { type Focus, type Lit, num, ONBOARDING, points, SOURCES, sourceIndex, type Strand, titleNode } from "./model";
import { useWidth } from "./use-width";

/** Gap between nodes, smallest row a label fits in, node width. */
const GAP = 6;
const MIN_SLOT = 22;
const NODE_W = 8;

interface Placed {
  id: string;
  label: string;
  value: string;
  /** Positive points coming out (titles) or in (genres), by source. */
  blocks: { source: Strand["source"]; value: number }[];
  total: number;
  slotTop: number;
  slotH: number;
  y: number;
  h: number;
}

/** Stack nodes top to bottom: bar height = points × k, but every row stays tall enough for its label. */
function stack(nodes: Omit<Placed, "slotTop" | "slotH" | "y" | "h">[], k: number): Placed[] {
  let top = 0;
  return nodes.map((node) => {
    const h = node.total > 0 ? Math.max(node.total * k, 2) : 0;
    const slotH = Math.max(h, MIN_SLOT);
    const placed = { ...node, slotTop: top, slotH, y: top + (slotH - h) / 2, h };
    top += slotH + GAP;
    return placed;
  });
}

function blocksOf(list: Strand[]) {
  return SOURCES.map((s) => ({
    source: s.key,
    value: list.filter((x) => x.source === s.key && x.value > 0).reduce((t, x) => t + x.value, 0),
  })).filter((b) => b.value > 0);
}

/** A band of constant thickness from (x0, y0) to (x1, y1), curving in the middle. */
function band(x0: number, y0: number, x1: number, y1: number, thickness: number) {
  const xm = (x0 + x1) / 2;
  return `M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1} L${x1},${y1 + thickness} C${xm},${y1 + thickness} ${xm},${y0 + thickness} ${x0},${y0 + thickness} Z`;
}

interface FlowProps {
  data: HomeExplanation;
  strands: Strand[];
  lit: Lit | null;
  onHover: (focus: Focus | null) => void;
  onSelect: (focus: Focus) => void;
}

/** Step 1 as a flow: every title (left) sends its points to each of its genres (right); band thickness = points. */
export function TasteFlow(props: FlowProps) {
  const [ref, width] = useWidth<HTMLDivElement>();
  return (
    <div ref={ref} className="w-full">
      {width > 0 ? <FlowChart {...props} width={width} /> : <div className="h-80" />}
    </div>
  );
}

function FlowChart({ data, strands, lit, onHover, onSelect, width }: FlowProps & { width: number }) {
  const compact = width < 560;
  const leftW = Math.round(compact ? width * 0.4 : Math.min(240, width * 0.36));
  const rightW = Math.round(compact ? width * 0.34 : Math.min(190, width * 0.3));
  const xL = leftW + 8;
  const xR = width - rightW - 8 - NODE_W;

  // Left column: titles in the order the API sorts them (most points first), then the onboarding picks.
  const left = [
    ...data.signals.map((s) => {
      const mine = strands.filter((x) => x.from === titleNode(s.contentId));
      const blocks = blocksOf(mine);
      return {
        id: titleNode(s.contentId),
        label: s.title,
        value: points(s.totalPoints),
        blocks,
        total: blocks.reduce((t, b) => t + b.value, 0),
      };
    }),
    ...(data.picks.length > 0
      ? [
          {
            id: ONBOARDING,
            label: "Onboarding picks",
            value: "+1",
            blocks: [{ source: "pick" as const, value: data.picks.length }],
            total: data.picks.length,
          },
        ]
      : []),
  ];
  // Right column: the genre_taste rows, strongest first.
  const right = data.taste.map((row) => {
    const blocks = blocksOf(strands.filter((x) => x.genre === row.genre));
    return {
      id: row.genre,
      label: row.genre,
      value: num(row.tasteScore),
      blocks,
      total: blocks.reduce((t, b) => t + b.value, 0),
    };
  });

  // One scale (px per point) for both columns, so a band is equally thick at both ends.
  const target = compact ? 400 : 440;
  const scaleFor = (col: { total: number }[]) =>
    (target - GAP * Math.max(0, col.length - 1)) /
    Math.max(
      1,
      col.reduce((t, n) => t + n.total, 0),
    );
  const k = Math.max(4, Math.min(26, scaleFor(left), scaleFor(right)));
  const leftPlaced = stack(left, k);
  const rightPlaced = stack(right, k);
  const bottom = (col: Placed[]) => (col.length ? col[col.length - 1].slotTop + col[col.length - 1].slotH : 0);
  const height = Math.max(bottom(leftPlaced), bottom(rightPlaced), MIN_SLOT);

  // Where each band leaves a title and enters a genre: grouped by source at both ends, so a genre's bar
  // reads like its genre_taste row (watch, rating, My List, pick).
  const leftIndex = new Map(leftPlaced.map((n, i) => [n.id, i]));
  const rightIndex = new Map(rightPlaced.map((n, i) => [n.id, i]));
  const positive = strands.filter((s) => s.value > 0 && leftIndex.has(s.from) && rightIndex.has(s.genre));
  const startY = new Map<string, number>();
  const endY = new Map<string, number>();
  for (const node of leftPlaced) {
    let y = node.y;
    positive
      .filter((s) => s.from === node.id)
      .sort(
        (a, b) => sourceIndex(a.source) - sourceIndex(b.source) || rightIndex.get(a.genre)! - rightIndex.get(b.genre)!,
      )
      .forEach((s) => {
        startY.set(s.id, y);
        y += s.value * k;
      });
  }
  for (const node of rightPlaced) {
    let y = node.y;
    positive
      .filter((s) => s.genre === node.id)
      .sort((a, b) => sourceIndex(a.source) - sourceIndex(b.source) || leftIndex.get(a.from)! - leftIndex.get(b.from)!)
      .forEach((s) => {
        endY.set(s.id, y);
        y += s.value * k;
      });
  }
  // A low rating takes points away: drawn as a thin line, since a band can't be thinner than nothing.
  const negative = strands.filter((s) => s.value < 0 && leftIndex.has(s.from) && rightIndex.has(s.genre));

  const dimNode = (id: string) => lit !== null && !lit.nodes.has(id);
  const dimGenre = (name: string) => lit !== null && !lit.genres.has(name);
  const bandOpacity = (id: string) => (lit === null ? 0.5 : lit.strands.has(id) ? 0.9 : 0.06);
  const colorOf = (source: Strand["source"]) => SOURCES[sourceIndex(source)].color;

  const nodeRects = (node: Placed, x: number) => {
    let y = node.y;
    return node.blocks.map((b, i) => {
      const h = b.value * k;
      const rect = (
        <rect
          key={b.source}
          x={x}
          y={y}
          width={NODE_W}
          height={Math.max(1, h - (i < node.blocks.length - 1 ? 1 : 0))}
          rx={1.5}
          fill={colorOf(b.source)}
        />
      );
      y += h;
      return rect;
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        <span style={{ width: leftW }} className="text-end">
          Your titles · points
        </span>
        <span style={{ width: rightW }}>Genre · taste</span>
      </div>
      <div className="relative" style={{ height }}>
        {/* Bands, drawn left to right on open. */}
        <div className="animate-flow-draw absolute inset-0">
          <svg width={width} height={height} className="overflow-visible" aria-hidden="true">
            {positive.map((s) => (
              <path
                key={s.id}
                d={band(xL + NODE_W, startY.get(s.id)!, xR, endY.get(s.id)!, s.value * k)}
                fill={colorOf(s.source)}
                fillOpacity={bandOpacity(s.id)}
                className="cursor-pointer transition-[fill-opacity] duration-150"
                onPointerEnter={() => onHover({ kind: "strand", id: s.id })}
                onPointerLeave={() => onHover(null)}
                onClick={() => onSelect({ kind: "strand", id: s.id })}
              />
            ))}
            {negative.map((s) => {
              const from = leftPlaced[leftIndex.get(s.from)!];
              const to = rightPlaced[rightIndex.get(s.genre)!];
              const y0 = from.y + from.h;
              const y1 = to.y + to.h;
              const xm = (xL + NODE_W + xR) / 2;
              return (
                <path
                  key={s.id}
                  d={`M${xL + NODE_W},${y0} C${xm},${y0} ${xm},${y1} ${xR},${y1}`}
                  fill="none"
                  stroke={colorOf(s.source)}
                  strokeWidth={1.5}
                  strokeOpacity={lit === null ? 0.7 : lit.strands.has(s.id) ? 1 : 0.1}
                  className="transition-[stroke-opacity] duration-150"
                />
              );
            })}
          </svg>
        </div>
        {/* Nodes: a title's bar is its points × its genres; a genre's bar is its taste, split by source. */}
        <svg
          width={width}
          height={height}
          className="pointer-events-none absolute inset-0 overflow-visible"
          aria-hidden="true"
        >
          {leftPlaced.map((n) => (
            <g key={n.id} opacity={dimNode(n.id) ? 0.3 : 1} className="transition-opacity duration-150">
              {n.h > 0 ? (
                nodeRects(n, xL)
              ) : (
                <rect x={xL} y={n.y - 1} width={NODE_W} height={2} rx={1} className="fill-muted-foreground/50" />
              )}
            </g>
          ))}
          {rightPlaced.map((n) => (
            <g key={n.id} opacity={dimGenre(n.id) ? 0.3 : 1} className="transition-opacity duration-150">
              {nodeRects(n, xR)}
            </g>
          ))}
        </svg>
        {/* Labels are buttons: hover, focus or tap to trace. */}
        {leftPlaced.map((n) => (
          <button
            key={n.id}
            type="button"
            className={cn(
              "absolute left-0 flex items-center justify-end gap-2 rounded-sm pe-1 text-xs transition-opacity duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
              dimNode(n.id) && "opacity-35",
            )}
            style={{ top: n.slotTop, height: n.slotH, width: leftW }}
            onPointerEnter={() => onHover({ kind: "node", id: n.id })}
            onPointerLeave={() => onHover(null)}
            onFocus={() => onHover({ kind: "node", id: n.id })}
            onBlur={() => onHover(null)}
            onClick={() => onSelect({ kind: "node", id: n.id })}
          >
            <span className={cn("truncate", n.id === ONBOARDING ? "text-muted-foreground italic" : "font-medium")}>
              {n.label}
            </span>
            <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">{n.value}</span>
          </button>
        ))}
        {rightPlaced.map((n) => (
          <button
            key={n.id}
            type="button"
            className={cn(
              "absolute flex items-center gap-2 rounded-sm ps-1 text-xs transition-opacity duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring",
              dimGenre(n.id) && "opacity-35",
            )}
            style={{ top: n.slotTop, height: n.slotH, left: xR + NODE_W + 6, width: rightW }}
            onPointerEnter={() => onHover({ kind: "genre", name: n.id })}
            onPointerLeave={() => onHover(null)}
            onFocus={() => onHover({ kind: "genre", name: n.id })}
            onBlur={() => onHover(null)}
            onClick={() => onSelect({ kind: "genre", name: n.id })}
          >
            <span className="truncate font-medium">{n.label}</span>
            <span className="shrink-0 font-mono text-[11px] font-semibold tabular-nums">{n.value}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
