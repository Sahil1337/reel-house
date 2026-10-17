"use client";

import { useCallback, useEffect, useEffectEvent, useRef } from "react";
import { toast } from "sonner";

import { useRecordProgress } from "@/hooks/queries/activity";
import type { ProgressInput } from "@/types";

interface ProgressSyncOptions {
  profileId: number;
  contentId: number;
  episodeId: number | null;
  /** Where playback started, so opening the player doesn't write a row by itself. */
  initialPercent: number;
  playing: boolean;
  /** Reads the live playback percentage. */
  getPercent: () => number;
}

/** Fire-and-forget save that survives the page unloading (src/lib/api/client.ts can't pass `keepalive`). */
function postWithKeepalive(profileId: number, body: ProgressInput): Promise<void> {
  return fetch(`/api/profiles/${profileId}/progress`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).then((response) => {
    if (!response.ok) throw new Error(`Progress save failed (${response.status})`);
  });
}

/**
 * Saves watch progress: on demand (pause, seek, milestones), every 10s of wall time
 * while playing, and when the page is hidden or the player unmounts.
 * The same whole percentage is never sent twice in a row.
 */
export function useProgressSync({
  profileId,
  contentId,
  episodeId,
  initialPercent,
  playing,
  getPercent,
}: ProgressSyncOptions) {
  const lastSent = useRef<number | null>(Math.round(initialPercent));
  const warned = useRef(false);
  const { mutateAsync } = useRecordProgress();

  const save = useCallback(
    (percent: number, { keepalive = false }: { keepalive?: boolean } = {}) => {
      const progressPercent = Math.round(Math.min(100, Math.max(0, percent)));
      if (progressPercent === lastSent.current) return;

      const previous = lastSent.current;
      lastSent.current = progressPercent;
      const body: ProgressInput = { contentId, episodeId, progressPercent };
      const request = keepalive ? postWithKeepalive(profileId, body) : mutateAsync({ profileId, body });

      request.catch(() => {
        // Let the next attempt retry this value.
        if (lastSent.current === progressPercent) lastSent.current = previous;
        if (!keepalive && !warned.current) {
          warned.current = true;
          toast.error("Couldn't save your progress", { description: "We'll keep trying while you watch." });
        }
      });
    },
    [profileId, contentId, episodeId, mutateAsync],
  );

  const flush = useEffectEvent((keepalive: boolean) => save(getPercent(), { keepalive }));

  useEffect(() => {
    if (!playing) return;
    const interval = window.setInterval(() => flush(false), 10_000);
    return () => window.clearInterval(interval);
  }, [playing]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush(true);
    };
    const onPageHide = () => flush(true);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      flush(true);
    };
  }, []);

  return save;
}
