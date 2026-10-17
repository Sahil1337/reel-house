import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

/**
 * Generated artwork shown whenever an image URL is null: a print-like
 * "one-sheet" built from a palette token pair, a light leak and film grain,
 * seeded from the title so every title keeps the same look.
 * Colours come only from the --poster-N-{a,b} theme tokens.
 */

const PALETTES = 8;

function hash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type ArtKind = "poster" | "backdrop" | "still" | "person";

interface GeneratedArtProps {
  seed: string;
  kind: ArtKind;
  /** Printed on posters (and stills); backdrops stay textless so overlaid UI reads cleanly. */
  title?: string;
  /** Small caption printed on posters, e.g. "2014 · Film". */
  caption?: string;
  className?: string;
}

export function GeneratedArt({ seed, kind, title, caption, className }: GeneratedArtProps) {
  const h = hash(seed);
  const palette = (h % PALETTES) + 1;
  const angle = 140 + (h % 80);
  const leakX = 20 + ((h >> 4) % 60);
  const leakY = 10 + ((h >> 8) % 40);
  const layout = (h >> 12) % 3;

  const style = {
    "--art-a": `var(--poster-${palette}-a)`,
    "--art-b": `var(--poster-${palette}-b)`,
    backgroundImage: [
      `radial-gradient(ellipse 60% 45% at ${leakX}% ${leakY}%, color-mix(in oklab, var(--art-b) 85%, transparent), transparent 70%)`,
      `linear-gradient(${angle}deg, var(--art-a) 15%, color-mix(in oklab, var(--art-a) 55%, var(--art-b)) 70%, var(--art-b))`,
    ].join(","),
  } as CSSProperties;

  return (
    <div aria-hidden="true" className={cn("absolute inset-0 overflow-hidden", className)} style={style}>
      <div className="film-grain absolute inset-0 opacity-35" />
      {kind === "poster" && title ? (
        <>
          {/* Thin print frame */}
          <div className="absolute inset-[6%] rounded-[2px] border border-foreground/15" />
          <div
            className={cn(
              "absolute inset-x-[11%] flex flex-col gap-1.5",
              layout === 0 && "bottom-[11%]",
              layout === 1 && "top-1/2 -translate-y-1/2 items-center text-center",
              layout === 2 && "top-[11%]",
            )}
          >
            <span
              className={cn(
                "line-clamp-4 font-display font-extrabold uppercase leading-[0.88] tracking-tight text-foreground drop-shadow-sm",
                title.length > 22 ? "text-[clamp(0.95rem,9cqw,1.6rem)]" : "text-[clamp(1.15rem,13cqw,2.3rem)]",
              )}
            >
              {title}
            </span>
            {caption ? (
              <span className="font-mono text-[clamp(0.5rem,4.5cqw,0.7rem)] uppercase tracking-[0.18em] text-foreground/70">
                {caption}
              </span>
            ) : null}
          </div>
        </>
      ) : null}
      {kind === "still" && title ? (
        <span className="absolute bottom-[10%] left-[6%] font-display text-[clamp(0.8rem,7cqw,1.4rem)] font-bold uppercase leading-none tracking-tight text-foreground/85">
          {title}
        </span>
      ) : null}
      {kind === "person" && title ? (
        <span className="absolute inset-0 grid place-items-center font-display text-[clamp(1rem,30cqw,2.5rem)] font-bold uppercase text-foreground/90">
          {initials(title)}
        </span>
      ) : null}
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
}
