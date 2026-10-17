import { Badge } from "@/components/ui/badge";
import { formatRuntime, formatYear } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ContentSummary } from "@/types";

/** "2014 · PG-13 · 2h 49m · Film" line used on cards, hero and title pages. */
export function ContentMeta({
  content,
  seasonCount,
  className,
}: {
  content: Pick<ContentSummary, "releaseDate" | "ageRating" | "durationMinutes" | "contentType">;
  seasonCount?: number;
  className?: string;
}) {
  const length =
    content.contentType === "MOVIE"
      ? formatRuntime(content.durationMinutes)
      : seasonCount
        ? `${seasonCount} ${seasonCount === 1 ? "season" : "seasons"}`
        : "Series";
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground", className)}>
      {formatYear(content.releaseDate) ? <span className="tabular-nums">{formatYear(content.releaseDate)}</span> : null}
      {content.ageRating ? (
        <Badge variant="outline" size="sm" className="font-mono">
          {content.ageRating}
        </Badge>
      ) : null}
      {length ? <span>{length}</span> : null}
    </div>
  );
}

/** Subtle "93% fit" chip for personalised rows. */
export function MatchBadge({ match, className }: { match: number; className?: string }) {
  return <span className={cn("font-mono text-xs font-medium tabular-nums text-primary", className)}>{match}% fit</span>;
}
