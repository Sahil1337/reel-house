import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlayIcon } from "@hugeicons/core-free-icons";

import { formatEpisodeCode } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RowItem } from "@/types";

import { Backdrop } from "./artwork";

/** Landscape card with a progress bar; opens the player at the right episode. */
export function ContinueWatchingCard({ item, className }: { item: RowItem; className?: string }) {
  const { content, progress } = item;
  const episode = progress?.episode ?? null;
  const href = `/watch/${content.contentId}${episode ? `?episode=${episode.episodeId}` : ""}`;
  const percent = progress?.progressPercent ?? 0;

  return (
    <Link
      href={href}
      aria-label={`Resume ${content.title}${episode ? `, ${formatEpisodeCode(episode.seasonNumber, episode.episodeNumber)}` : ""}`}
      className={cn(
        "group/cw relative block overflow-hidden rounded-lg bg-card shadow-md ring-1 ring-foreground/8 outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className,
      )}
    >
      <div className="relative">
        <Backdrop
          content={content}
          sizes="(min-width: 1024px) 25vw, 70vw"
          className="aspect-video"
          imageClassName="transition-transform duration-300 ease-out-strong hover-fine:scale-[1.03] motion-reduce:transform-none"
        />
        <div className="absolute inset-0 bg-linear-to-t from-scrim/90 via-scrim/10 to-transparent" />
        <span className="absolute inset-0 m-auto grid size-11 place-items-center rounded-full bg-background/60 text-foreground opacity-0 ring-1 ring-foreground/20 backdrop-blur-sm transition-opacity duration-200 group-hover/cw:opacity-100 group-focus-visible/cw:opacity-100">
          <HugeiconsIcon icon={PlayIcon} className="size-5 translate-x-px" strokeWidth={2} />
        </span>
        <div className="absolute inset-x-3 bottom-3 flex flex-col gap-0.5">
          <p className="truncate font-display text-lg font-bold uppercase leading-none tracking-wide">
            {content.title}
          </p>
          {episode ? (
            <p className="truncate text-xs text-muted-foreground">
              <span className="font-mono">{formatEpisodeCode(episode.seasonNumber, episode.episodeNumber)}</span> ·{" "}
              {episode.title}
            </p>
          ) : null}
        </div>
      </div>
      <div
        className="h-1 bg-foreground/10"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Watched"
      >
        <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </Link>
  );
}
