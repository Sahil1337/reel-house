"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon, Search01Icon } from "@hugeicons/core-free-icons";

import { Poster } from "@/components/content/artwork";
import { Badge } from "@/components/ui/badge";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { formatYear } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { TmdbMediaType, TmdbSearchResult } from "@/types";

const GRID = "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-2 2xl:grid-cols-3";

/** The poster grid of TMDB hits. Selecting one loads its preview. */
export function SearchResults({
  results,
  query,
  type,
  pending,
  selectedId,
  onSelect,
}: {
  results: TmdbSearchResult[];
  /** The query the visible results belong to. */
  query: string;
  type: TmdbMediaType;
  /** A newer search is in flight: keep showing these, dimmed. */
  pending: boolean;
  selectedId: number | null;
  onSelect: (result: TmdbSearchResult) => void;
}) {
  if (results.length === 0) {
    return (
      <Empty className={cn("rounded-xl border border-dashed transition-opacity duration-200", pending && "opacity-60")}>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>
            No {type === "movie" ? "movies" : "series"} match &ldquo;{query}&rdquo;
          </EmptyTitle>
          <EmptyDescription>
            Check the spelling, try the original title, or switch to {type === "movie" ? "Series" : "Movies"}.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <ul
      aria-label="TMDB results"
      aria-busy={pending}
      className={cn(GRID, "transition-opacity duration-200", pending && "opacity-60")}
    >
      {results.map((result, index) => {
        const selected = result.tmdbId === selectedId;
        return (
          <li
            key={result.tmdbId}
            className="animate-[fade-up_360ms_var(--ease-out-strong)_both] motion-reduce:animate-none"
            style={{ animationDelay: `${Math.min(index, 11) * 25}ms` }}
          >
            <button
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(result)}
              className={cn(
                "group flex w-full cursor-pointer flex-col gap-2 rounded-lg p-1.5 text-start outline-none transition-[background-color,box-shadow,transform] duration-150 ease-out-strong",
                "hover-fine:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] motion-reduce:active:scale-100",
                selected && "bg-accent/60 ring-2 ring-primary",
              )}
            >
              <div className="relative">
                <Poster
                  content={{
                    title: result.title,
                    posterUrl: result.posterUrl,
                    releaseDate: result.releaseDate,
                    contentType: result.contentType,
                  }}
                  sizes="(min-width: 1536px) 10vw, (min-width: 1280px) 14vw, (min-width: 768px) 22vw, 45vw"
                  className="rounded-md ring-1 ring-foreground/10"
                />
                {result.alreadyInCatalog ? (
                  <Badge variant="success" className="absolute start-1.5 top-1.5 shadow-sm/5 backdrop-blur-sm">
                    <HugeiconsIcon icon={CheckmarkCircle02Icon} strokeWidth={2} />
                    In catalogue
                  </Badge>
                ) : null}
              </div>
              <div className="flex min-w-0 flex-col gap-0.5 px-0.5">
                <span className="line-clamp-2 text-sm leading-snug font-medium">{result.title}</span>
                <span className="text-xs text-muted-foreground">
                  {formatYear(result.releaseDate) ?? "Year unknown"}
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function SearchResultsSkeleton() {
  return (
    <div aria-hidden="true" className={GRID}>
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="flex flex-col gap-2 p-1.5">
          <Skeleton className="aspect-[2/3] w-full rounded-md" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}
