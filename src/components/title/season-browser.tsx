"use client";

import { useState } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlayIcon } from "@hugeicons/core-free-icons";

import { EpisodeStill } from "@/components/content/artwork";
import { Badge } from "@/components/ui/badge";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Episode fields pre-formatted on the server (dates/runtimes) so hydration is stable. */
export interface EpisodeView {
  episodeId: number;
  episodeNumber: number;
  title: string;
  description: string;
  stillUrl: string | null;
  runtime: string | null;
  airDate: string | null;
}

export interface SeasonView {
  seasonId: number;
  name: string;
  episodes: EpisodeView[];
}

export interface ResumeEpisode {
  episodeId: number;
  progressPercent: number;
}

/** Season picker + the selected season's episodes. Only one season renders at a time. */
export function SeasonBrowser({
  contentId,
  seriesTitle,
  seasons,
  resume,
}: {
  contentId: number;
  seriesTitle: string;
  /** Non-empty; seasons without episodes are filtered out upstream. */
  seasons: SeasonView[];
  resume: ResumeEpisode | null;
}) {
  const [seasonId, setSeasonId] = useState(
    () =>
      (
        seasons.find((season) => season.episodes.some((episode) => episode.episodeId === resume?.episodeId)) ??
        seasons[0]
      ).seasonId,
  );
  const season = seasons.find((entry) => entry.seasonId === seasonId) ?? seasons[0];
  const items = seasons.map((entry) => ({ value: entry.seasonId, label: entry.name }));
  const count = season.episodes.length;

  return (
    <section aria-labelledby="episodes-heading" className="px-4 sm:px-8 lg:px-12">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            id="episodes-heading"
            className="font-display text-2xl leading-none font-bold tracking-wide uppercase sm:text-[1.7rem]"
          >
            Episodes
          </h2>
          <p className="mt-1.5 text-xs text-muted-foreground sm:text-sm">
            {season.name} · {count} {count === 1 ? "episode" : "episodes"}
          </p>
        </div>
        {seasons.length > 1 ? (
          <Select items={items} value={seasonId} onValueChange={(value) => value !== null && setSeasonId(value)}>
            <SelectTrigger aria-label="Choose a season" className="w-auto min-w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {seasons.map((entry) => (
                <SelectItem key={entry.seasonId} value={entry.seasonId}>
                  {entry.name}
                  <span className="ml-2 font-mono text-xs text-muted-foreground tabular-nums">
                    {entry.episodes.length}
                  </span>
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        ) : null}
      </div>

      <ol
        key={season.seasonId}
        className="flex max-w-5xl flex-col gap-1 animate-[fade-in_200ms_var(--ease-out-strong)_both] motion-reduce:animate-none"
      >
        {season.episodes.map((episode) => (
          <EpisodeItem
            key={episode.episodeId}
            episode={episode}
            href={`/watch/${contentId}?episode=${episode.episodeId}`}
            seriesTitle={seriesTitle}
            resume={episode.episodeId === resume?.episodeId ? resume : null}
          />
        ))}
      </ol>
    </section>
  );
}

function EpisodeItem({
  episode,
  href,
  seriesTitle,
  resume,
}: {
  episode: EpisodeView;
  href: string;
  seriesTitle: string;
  resume: ResumeEpisode | null;
}) {
  const details = [episode.runtime, episode.airDate].filter(Boolean).join(" · ");
  const started = resume !== null && resume.progressPercent > 0;

  return (
    <li>
      <Link
        href={href}
        className={cn(
          "group/ep -mx-2 grid grid-cols-[7.5rem_1fr] items-start gap-3 rounded-lg p-2 outline-none sm:grid-cols-[12rem_1fr] sm:gap-5 lg:grid-cols-[14rem_1fr]",
          "transition-colors duration-150 hover-fine:bg-foreground/5 focus-visible:ring-2 focus-visible:ring-ring",
          resume && "bg-foreground/3",
        )}
      >
        <div className="relative overflow-hidden rounded-md ring-1 ring-foreground/8">
          <EpisodeStill
            episode={episode}
            seriesTitle={seriesTitle}
            sizes="(min-width: 1024px) 224px, (min-width: 640px) 192px, 120px"
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 m-auto grid size-9 place-items-center rounded-full bg-background/60 opacity-0 ring-1 ring-foreground/20 backdrop-blur-sm transition-opacity duration-200 group-hover/ep:opacity-100 group-focus-visible/ep:opacity-100"
          >
            <HugeiconsIcon icon={PlayIcon} className="size-4 translate-x-px fill-current" strokeWidth={2} />
          </span>
          {started ? (
            <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1 bg-foreground/20">
              <div className="h-full bg-primary" style={{ width: `${resume.progressPercent}%` }} />
            </div>
          ) : null}
        </div>

        <div className="min-w-0 py-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-sm font-semibold text-pretty sm:text-base">
              <span className="font-mono text-muted-foreground">E{episode.episodeNumber}</span> · {episode.title}
            </h3>
            {resume ? (
              <Badge size="sm">
                {started ? "Resume" : "Up next"}
                {started ? <span className="sr-only">, {resume.progressPercent}% watched</span> : null}
              </Badge>
            ) : null}
          </div>
          {details ? <p className="mt-1 font-mono text-xs text-muted-foreground tabular-nums">{details}</p> : null}
          {episode.description ? (
            <p className="mt-2 line-clamp-2 text-sm text-muted-foreground sm:line-clamp-3">{episode.description}</p>
          ) : null}
        </div>
      </Link>
    </li>
  );
}
