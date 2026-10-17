"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";

import { EpisodeStill } from "@/components/content/artwork";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatDate, formatRuntime, formatYear } from "@/lib/format";
import type { SnapshotSeason } from "@/lib/tmdb/types";

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** Seasons as collapsible rows (all closed), each listing its episodes. */
export function SeasonList({ seriesTitle, seasons }: { seriesTitle: string; seasons: SnapshotSeason[] }) {
  return (
    <section aria-labelledby="seasons-heading" className="flex flex-col gap-3">
      <h3 id="seasons-heading" className="text-sm font-medium">
        Seasons and episodes
      </h3>
      <ul className="flex flex-col divide-y overflow-hidden rounded-lg border">
        {seasons.map((season) => (
          <li key={season.seasonNumber}>
            <Collapsible>
              <CollapsibleTrigger className="group flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-start text-sm outline-none transition-colors duration-150 hover-fine:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
                <span className="min-w-0 flex-1 truncate font-medium">{season.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {plural(season.episodes.length, "episode")}
                  {season.releaseDate ? ` · ${formatYear(season.releaseDate)}` : ""}
                </span>
                <HugeiconsIcon
                  icon={ArrowDown01Icon}
                  strokeWidth={2}
                  className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out-strong group-data-[panel-open]:rotate-180"
                />
              </CollapsibleTrigger>
              <CollapsiblePanel>
                <ol className="flex flex-col gap-3 border-t bg-background/40 px-3 py-3">
                  {season.episodes.map((episode) => {
                    const runtime = formatRuntime(episode.durationMinutes);
                    return (
                      <li key={episode.episodeNumber} className="flex gap-3">
                        <EpisodeStill
                          episode={episode}
                          seriesTitle={seriesTitle}
                          sizes="112px"
                          className="w-24 shrink-0 rounded-md sm:w-28"
                        />
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <p className="truncate text-sm">
                            <span className="me-1.5 font-mono text-xs text-muted-foreground tabular-nums">
                              E{String(episode.episodeNumber).padStart(2, "0")}
                            </span>
                            {episode.title}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {[episode.releaseDate ? formatDate(episode.releaseDate) : null, runtime]
                              .filter(Boolean)
                              .join(" · ") || "No air date yet"}
                          </p>
                          {episode.description ? (
                            <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                              {episode.description}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </CollapsiblePanel>
            </Collapsible>
          </li>
        ))}
      </ul>
    </section>
  );
}
