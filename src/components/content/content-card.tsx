import Link from "next/link";

import { formatYear } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ContentSummary } from "@/types";

import { Poster } from "./artwork";
import { MatchBadge } from "./content-meta";

/**
 * Poster card. On fine-pointer hover the poster lifts slightly and an info
 * panel slides up; touch devices just tap through. Pure CSS — no client JS.
 */
export function ContentCard({
  content,
  match,
  preload,
  className,
}: {
  content: ContentSummary;
  match?: number;
  preload?: boolean;
  className?: string;
}) {
  const year = formatYear(content.releaseDate);
  return (
    <Link
      href={`/title/${content.contentId}`}
      aria-label={`${content.title}${year ? ` (${year})` : ""}`}
      className={cn(
        "group/card relative block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-lg shadow-md ring-1 ring-foreground/8",
          "transition-transform duration-200 ease-out-strong will-change-transform",
          "hover-fine:scale-[1.04] group-focus-visible/card:scale-[1.04] motion-reduce:transform-none",
        )}
      >
        <Poster content={content} preload={preload} />
        {/* Hover preview */}
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 flex translate-y-2 flex-col gap-1 bg-linear-to-t from-scrim via-scrim/90 to-transparent p-3 pt-10 opacity-0",
            "transition-[opacity,transform] duration-200 ease-out-strong",
            "group-hover/card:translate-y-0 group-hover/card:opacity-100 group-focus-visible/card:translate-y-0 group-focus-visible/card:opacity-100",
            "[@media(hover:none)]:hidden",
          )}
        >
          <p className="line-clamp-2 text-sm font-semibold leading-tight text-foreground">{content.title}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {match !== undefined ? <MatchBadge match={match} /> : null}
            {year ? <span className="tabular-nums">{year}</span> : null}
            {content.ageRating ? <span className="font-mono">{content.ageRating}</span> : null}
          </div>
          <p className="line-clamp-1 text-[0.7rem] text-muted-foreground">
            {content.genres
              .slice(0, 2)
              .map((genre) => genre.name)
              .join(" · ")}
          </p>
        </div>
      </div>
    </Link>
  );
}
