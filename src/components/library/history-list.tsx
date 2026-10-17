"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { Clock01Icon, Delete02Icon, PlayIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { Backdrop, EpisodeStill } from "@/components/content/artwork";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useRemoveHistoryEntry, useRemovedHistoryIds } from "@/hooks/queries/activity";
import { formatEpisodeCode } from "@/lib/format";
import { isCompleted } from "@/lib/content/progress";

import type { HistoryEntry, HistoryGroup } from "./history-groups";
import { LibraryEmpty } from "./library-empty";

/** Day-grouped watch history with per-entry removal (optimistic, then a server refresh). */
export function HistoryList({ profileId, groups }: { profileId: number; groups: HistoryGroup[] }) {
  const removed = useRemovedHistoryIds(profileId);
  const { mutateAsync } = useRemoveHistoryEntry(profileId);

  const remove = async (entry: HistoryEntry, label: string) => {
    try {
      await mutateAsync(entry.historyId);
      toast.success(`Removed ${label} from your history`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't remove that entry. Try again.");
    }
  };

  const visible = groups
    .map((group) => ({ ...group, entries: group.entries.filter((entry) => !removed.has(entry.historyId)) }))
    .filter((group) => group.entries.length > 0);

  if (visible.length === 0) return <HistoryEmpty />;

  return (
    <div className="flex flex-col gap-10">
      {visible.map((group) => (
        <section key={group.day} aria-labelledby={`history-${group.day}`} className="flex flex-col gap-2">
          <h2 id={`history-${group.day}`} className="text-sm font-medium text-muted-foreground">
            {group.label}
          </h2>
          <ul className="flex flex-col divide-y divide-border/60">
            {group.entries.map((entry) => (
              <HistoryRow key={entry.historyId} entry={entry} onRemove={remove} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function HistoryEmpty() {
  return (
    <LibraryEmpty
      icon={Clock01Icon}
      title="Nothing watched yet"
      description="Titles you start will show up here, and they help tune what we recommend."
    />
  );
}

function HistoryRow({
  entry,
  onRemove,
}: {
  entry: HistoryEntry;
  onRemove: (entry: HistoryEntry, label: string) => void;
}) {
  const { content, episode } = entry;
  const completed = isCompleted(entry.progressPercent);
  const code = episode ? formatEpisodeCode(episode.seasonNumber, episode.episodeNumber) : null;
  const label = code ? `${content.title} ${code}` : content.title;
  const watchHref = `/watch/${content.contentId}${episode ? `?episode=${episode.episodeId}` : ""}`;

  return (
    <li className="flex items-center gap-3 py-3 sm:gap-5">
      <Link
        href={watchHref}
        aria-label={completed ? `Watch ${label} again` : `Resume ${label}`}
        className="group/thumb relative w-28 shrink-0 overflow-hidden rounded-md ring-1 ring-foreground/8 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-40"
      >
        {episode ? (
          <EpisodeStill episode={episode} seriesTitle={content.title} sizes="160px" />
        ) : (
          <Backdrop content={content} sizes="160px" className="aspect-video" />
        )}
        <span className="absolute inset-0 grid place-items-center bg-scrim/50 opacity-0 transition-opacity duration-200 group-hover/thumb:opacity-100 group-focus-visible/thumb:opacity-100">
          <HugeiconsIcon icon={PlayIcon} strokeWidth={2} className="size-5" />
        </span>
        {completed ? null : (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-foreground/15">
            <span className="block h-full bg-primary" style={{ width: `${entry.progressPercent}%` }} />
          </span>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <Link
          href={`/title/${content.contentId}`}
          className="w-fit max-w-full truncate rounded-sm font-medium outline-none hover-fine:underline hover-fine:underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring"
        >
          {content.title}
        </Link>
        {episode && code ? (
          <p className="truncate text-sm text-muted-foreground">
            <span className="font-mono">{code}</span> · {episode.title}
          </p>
        ) : null}
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          {completed ? (
            <Badge variant="success" size="sm">
              Watched
            </Badge>
          ) : (
            <span className="font-mono tabular-nums">{entry.progressPercent}% watched</span>
          )}
          <span aria-hidden>·</span>
          <time dateTime={entry.watchedAt}>{entry.watchedLabel}</time>
        </p>
      </div>

      <Button
        variant="ghost"
        size="icon"
        aria-label={`Remove ${label} from history`}
        title="Remove from history"
        className="shrink-0 text-muted-foreground transition-transform duration-150 hover:text-foreground active:scale-[0.97]"
        onClick={() => onRemove(entry, label)}
      >
        <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
      </Button>
    </li>
  );
}
