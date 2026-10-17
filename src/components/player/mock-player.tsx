"use client";

import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import {
  ArrowLeft02Icon,
  Cancel01Icon,
  GoBackward10SecIcon,
  GoForward10SecIcon,
  MaximizeScreenIcon,
  MinimizeScreenIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  RepeatIcon,
  VolumeHighIcon,
  VolumeMute01Icon,
} from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { Backdrop } from "@/components/content/artwork";
import { Button } from "@/components/ui/button";
import { isCompleted } from "@/lib/content/progress";
import { cn } from "@/lib/utils";
import type { ContentSummary } from "@/types";

import { Scrubber } from "./scrubber";
import { formatTimecode } from "./timecode";
import { useProgressSync } from "@/hooks/use-progress-sync";

/** Playback is simulated; at 60× a 45-minute episode "plays" in about 45 seconds. */
const DEMO_SPEED = 60;
const SKIP_SECONDS = 10;
const HIDE_CONTROLS_AFTER_MS = 2500;
/** The "Up next" card appears for the last 5% of an episode. */
const UP_NEXT_PERCENT = 95;

export interface PlayerEpisode {
  episodeId: number;
  /** "S1:E3" */
  code: string;
  title: string;
}

export interface MockPlayerProps {
  profileId: number;
  content: Pick<ContentSummary, "contentId" | "title" | "backdropUrl">;
  /** Null for films. */
  episode: PlayerEpisode | null;
  nextEpisode: PlayerEpisode | null;
  durationMinutes: number;
  startPercent: number;
}

export function MockPlayer({
  profileId,
  content,
  episode,
  nextEpisode,
  durationMinutes,
  startPercent,
}: MockPlayerProps) {
  const router = useRouter();
  const duration = durationMinutes * 60;
  const titleHref = `/title/${content.contentId}`;
  const nextHref = nextEpisode ? `/watch/${content.contentId}?episode=${nextEpisode.episodeId}` : null;

  const [position, setPosition] = useState(() => (startPercent / 100) * duration);
  const [playing, setPlaying] = useState(true);
  const [ended, setEnded] = useState(false);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(DEMO_SPEED);
  const [idle, setIdle] = useState(false);
  const [upNextDismissed, setUpNextDismissed] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  // Live values read by the animation loop and timers without re-subscribing.
  const positionRef = useRef(position);
  const scrubbing = useRef(false);
  const watchedToastShown = useRef(false);
  const hideTimer = useRef<number | undefined>(undefined);
  const saveTimer = useRef<number | undefined>(undefined);
  const rootRef = useRef<HTMLDivElement>(null);
  const chromeRef = useRef<HTMLDivElement>(null);

  const toPercent = useCallback((seconds: number) => (duration > 0 ? (seconds / duration) * 100 : 0), [duration]);
  const percent = toPercent(position);
  const controlsVisible = !playing || ended || !idle;
  const showUpNext = Boolean(nextEpisode) && !ended && !upNextDismissed && percent >= UP_NEXT_PERCENT;

  const saveProgress = useProgressSync({
    profileId,
    contentId: content.contentId,
    episodeId: episode?.episodeId ?? null,
    initialPercent: startPercent,
    playing,
    getPercent: () => toPercent(positionRef.current),
  });

  // ─── Controls visibility ────────────────────────────────────────────────

  const scheduleHide = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(function hide() {
      // Keep controls up while a keyboard user is working them.
      if (chromeRef.current?.querySelector(":focus-visible")) {
        hideTimer.current = window.setTimeout(hide, HIDE_CONTROLS_AFTER_MS);
        return;
      }
      setIdle(true);
    }, HIDE_CONTROLS_AFTER_MS);
  }, []);

  const wake = useCallback(() => {
    setIdle(false);
    scheduleHide();
  }, [scheduleHide]);

  useEffect(() => {
    scheduleHide();
    return () => {
      window.clearTimeout(hideTimer.current);
      window.clearTimeout(saveTimer.current);
    };
  }, [scheduleHide]);

  // ─── Playback ───────────────────────────────────────────────────────────

  const seekTo = (seconds: number) => {
    const next = Math.min(duration, Math.max(0, seconds));
    positionRef.current = next;
    setPosition(next);
    if (next < duration) setEnded(false);
    return next;
  };

  /** Milestones shared by playback and seeking: the 90% "watched" mark and the end. */
  const reached = (seconds: number, { fromPlayback }: { fromPlayback: boolean }) => {
    const reachedPercent = toPercent(seconds);
    if (isCompleted(reachedPercent) && !watchedToastShown.current) {
      watchedToastShown.current = true;
      saveProgress(reachedPercent);
      toast.success("Marked as watched");
    }
    if (seconds >= duration) {
      setPlaying(false);
      saveProgress(100);
      // Rolling straight into the next episode, unless the viewer waved "Up next" away.
      if (fromPlayback && nextHref && !upNextDismissed) router.replace(nextHref);
      else setEnded(true);
    }
  };

  const play = () => {
    if (positionRef.current >= duration) seekTo(0);
    setEnded(false);
    setPlaying(true);
    scheduleHide();
  };

  const pause = () => {
    setPlaying(false);
    saveProgress(toPercent(positionRef.current));
  };

  const togglePlay = () => (playing ? pause() : play());

  const skip = (delta: number) => {
    const next = seekTo(positionRef.current + delta);
    reached(next, { fromPlayback: false });
    // Repeated skips settle into one save.
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => saveProgress(toPercent(positionRef.current)), 800);
  };

  const restart = () => {
    seekTo(0);
    setUpNextDismissed(false);
    play();
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else rootRef.current?.requestFullscreen().catch(() => toast.error("Full screen isn't available in this browser."));
  };

  const advance = useEffectEvent((elapsedMs: number) => {
    const from = positionRef.current;
    if (scrubbing.current || from >= duration) return;
    const to = Math.min(duration, from + (elapsedMs / 1000) * speed);
    positionRef.current = to;
    setPosition(to);
    reached(to, { fromPlayback: true });
  });

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      advance(now - last);
      last = now;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // ─── Keyboard shortcuts ─────────────────────────────────────────────────

  const onShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("input, textarea, select, [contenteditable='true']")
    ) {
      return;
    }
    const actions: Record<string, () => void> = {
      " ": togglePlay,
      k: togglePlay,
      arrowleft: () => skip(-SKIP_SECONDS),
      j: () => skip(-SKIP_SECONDS),
      arrowright: () => skip(SKIP_SECONDS),
      l: () => skip(SKIP_SECONDS),
      m: () => setMuted((value) => !value),
      f: toggleFullscreen,
    };
    const action = actions[event.key.toLowerCase()];
    if (!action) return;
    event.preventDefault();
    action();
    wake();
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => onShortcut(event);
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────

  const onSurfaceClick = () => {
    // On touch, the first tap only brings the controls back.
    if (!controlsVisible) wake();
    else togglePlay();
  };

  return (
    <div
      ref={rootRef}
      className={cn(
        "fixed inset-0 overflow-hidden bg-scrim text-foreground select-none",
        !controlsVisible && "cursor-none",
      )}
      onPointerMove={(event) => {
        if (event.pointerType === "mouse") wake();
      }}
    >
      {/* The "picture": dimmed key art standing in for video. */}
      <Backdrop content={content} preload sizes="100vw" className="absolute inset-0 bg-scrim" />
      <div
        aria-hidden
        className={cn(
          "absolute inset-0 bg-scrim transition-opacity duration-300 ease-out-strong motion-reduce:transition-none",
          playing ? "opacity-45" : "opacity-65",
        )}
      />
      <div aria-hidden className="film-grain pointer-events-none absolute inset-0 opacity-[0.06]" />

      <div aria-hidden className="absolute inset-0" onClick={onSurfaceClick} onDoubleClick={toggleFullscreen} />

      {!playing && !ended ? (
        <button
          type="button"
          tabIndex={-1}
          aria-label="Play"
          onClick={play}
          className="absolute top-1/2 left-1/2 grid size-18 -translate-1/2 place-items-center rounded-full bg-background/50 ring-1 ring-foreground/20 backdrop-blur-md transition-transform duration-150 ease-out-strong animate-[pop-in_200ms_var(--ease-out-strong)_both] active:scale-[0.97] motion-reduce:animate-none sm:size-22"
        >
          <HugeiconsIcon icon={PlayIcon} strokeWidth={2} className="size-7 translate-x-0.5 sm:size-8" />
        </button>
      ) : null}

      {ended ? (
        <EndScreen
          title={content.title}
          episode={episode}
          nextEpisode={nextEpisode}
          nextHref={nextHref}
          titleHref={titleHref}
          onRestart={restart}
        />
      ) : null}

      {showUpNext && nextEpisode && nextHref ? (
        <aside
          aria-label="Up next"
          className="absolute right-4 bottom-32 z-10 w-[min(20rem,calc(100%-2rem))] animate-[fade-up_240ms_var(--ease-out-strong)_both] rounded-xl bg-popover/90 p-4 shadow-lg ring-1 ring-foreground/10 backdrop-blur-md motion-reduce:animate-none sm:right-8 sm:bottom-36"
        >
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">
                Next episode in{" "}
                <span className="font-mono text-foreground tabular-nums">{formatTimecode(duration - position)}</span>
              </p>
              <p className="mt-1 truncate text-sm font-medium">
                <span className="font-mono text-muted-foreground">{nextEpisode.code}</span> · {nextEpisode.title}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Dismiss up next"
              className="-me-1.5 -mt-1.5"
              onClick={() => setUpNextDismissed(true)}
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
            </Button>
          </div>
          <Button
            className="mt-3 w-full transition-transform duration-150 active:scale-[0.97]"
            render={<Link href={nextHref} replace />}
          >
            <HugeiconsIcon icon={PlayIcon} strokeWidth={2} />
            Play now
          </Button>
        </aside>
      ) : null}

      {/* Controls chrome */}
      <div
        ref={chromeRef}
        onFocus={(event) => {
          if (event.target.matches(":focus-visible")) wake();
        }}
        className={cn(
          "pointer-events-none absolute inset-0 flex flex-col justify-between transition-opacity duration-300 ease-out-strong motion-reduce:transition-none",
          controlsVisible ? "opacity-100" : "opacity-0",
        )}
      >
        <header
          className={cn(
            "flex items-start gap-2 bg-linear-to-b from-scrim/90 via-scrim/40 to-transparent px-3 pt-3 pb-16 sm:gap-3 sm:px-6 sm:pt-5",
            controlsVisible && "pointer-events-auto",
          )}
        >
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={`Back to ${content.title}`}
            title="Back"
            render={<Link href={titleHref} />}
          >
            <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={2} />
          </Button>
          <div className="min-w-0 flex-1 pt-1">
            <h1 className="truncate font-display text-2xl leading-none font-bold tracking-wide uppercase sm:text-3xl">
              {content.title}
            </h1>
            {episode ? (
              <p className="mt-1.5 truncate text-sm text-muted-foreground">
                <span className="font-mono">{episode.code}</span> · {episode.title}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setSpeed((value) => (value === 1 ? DEMO_SPEED : 1))}
            aria-label={
              speed === 1
                ? `Playing in real time. Switch to ${DEMO_SPEED}× demo speed`
                : `Demo speed ${DEMO_SPEED}×. Switch to real time`
            }
            title="Playback is simulated in this prototype"
            className="mt-1 shrink-0 rounded-full px-2.5 py-1 font-mono text-xs text-muted-foreground ring-1 ring-foreground/15 transition-colors duration-150 outline-none hover-fine:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {speed === 1 ? "Real time 1×" : `Demo speed ${DEMO_SPEED}×`}
          </button>
        </header>

        <footer
          className={cn(
            "bg-linear-to-t from-scrim via-scrim/60 to-transparent px-3 pt-16 pb-3 sm:px-6 sm:pb-5",
            controlsVisible && "pointer-events-auto",
          )}
        >
          <Scrubber
            position={position}
            duration={duration}
            onScrub={(seconds, dragging) => {
              scrubbing.current = dragging;
              seekTo(seconds);
            }}
            onCommit={(seconds) => {
              scrubbing.current = false;
              reached(seconds, { fromPlayback: false });
              saveProgress(toPercent(seconds));
            }}
          />
          <div className="mt-1 flex items-center gap-0.5 sm:gap-1.5">
            <ControlButton
              icon={playing ? PauseIcon : PlayIcon}
              label={playing ? "Pause" : "Play"}
              shortcut="Space"
              onClick={togglePlay}
            />
            <ControlButton
              icon={GoBackward10SecIcon}
              label="Back 10 seconds"
              shortcut="←"
              onClick={() => skip(-SKIP_SECONDS)}
            />
            <ControlButton
              icon={GoForward10SecIcon}
              label="Forward 10 seconds"
              shortcut="→"
              onClick={() => skip(SKIP_SECONDS)}
            />
            <ControlButton
              icon={muted ? VolumeMute01Icon : VolumeHighIcon}
              label={muted ? "Unmute" : "Mute"}
              shortcut="M"
              pressed={muted}
              onClick={() => setMuted((value) => !value)}
            />
            <p className="ms-1.5 font-mono text-xs whitespace-nowrap text-muted-foreground tabular-nums sm:ms-2 sm:text-sm">
              <span className="text-foreground">{formatTimecode(position)}</span> / {formatTimecode(duration)}
            </p>
            <div className="ms-auto flex items-center gap-0.5 sm:gap-1.5">
              {nextEpisode && nextHref ? (
                <Button
                  variant="ghost"
                  size="lg"
                  aria-label={`Next episode: ${nextEpisode.code}, ${nextEpisode.title}`}
                  className="px-2.5 transition-transform duration-150 active:scale-[0.97] sm:px-3"
                  render={<Link href={nextHref} replace />}
                >
                  <HugeiconsIcon icon={NextIcon} strokeWidth={2} />
                  <span className="hidden sm:inline">Next episode</span>
                </Button>
              ) : null}
              <ControlButton
                icon={fullscreen ? MinimizeScreenIcon : MaximizeScreenIcon}
                label={fullscreen ? "Exit full screen" : "Full screen"}
                shortcut="F"
                onClick={toggleFullscreen}
              />
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function ControlButton({
  icon,
  label,
  shortcut,
  pressed,
  onClick,
}: {
  icon: IconSvgElement;
  label: string;
  shortcut: string;
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant="ghost"
      size="icon-xl"
      aria-label={label}
      aria-pressed={pressed}
      title={`${label} (${shortcut})`}
      onClick={onClick}
      className="transition-transform duration-150 active:scale-[0.97]"
    >
      <HugeiconsIcon icon={icon} strokeWidth={2} />
    </Button>
  );
}

function EndScreen({
  title,
  episode,
  nextEpisode,
  nextHref,
  titleHref,
  onRestart,
}: {
  title: string;
  episode: PlayerEpisode | null;
  nextEpisode: PlayerEpisode | null;
  nextHref: string | null;
  titleHref: string;
  onRestart: () => void;
}) {
  return (
    <div className="absolute inset-0 grid animate-[fade-in_240ms_var(--ease-out-strong)_both] place-items-center bg-scrim/70 px-6 motion-reduce:animate-none">
      <div className="flex max-w-lg flex-col items-center gap-5 text-center">
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-muted-foreground">
            {episode ? (
              <>
                You finished <span className="font-mono">{episode.code}</span>
              </>
            ) : (
              "You finished"
            )}
          </p>
          <h2 className="font-display text-4xl leading-none font-bold tracking-wide text-balance uppercase sm:text-5xl">
            {title}
          </h2>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {nextEpisode && nextHref ? (
            <Button size="lg" className="active:scale-[0.97]" render={<Link href={nextHref} replace />}>
              <HugeiconsIcon icon={PlayIcon} strokeWidth={2} />
              Play {nextEpisode.code}
            </Button>
          ) : null}
          <Button size="lg" variant="outline" className="active:scale-[0.97]" onClick={onRestart}>
            <HugeiconsIcon icon={RepeatIcon} strokeWidth={2} />
            Watch again
          </Button>
          <Button size="lg" variant="ghost" className="active:scale-[0.97]" render={<Link href={titleHref} />}>
            Back to title
          </Button>
        </div>
      </div>
    </div>
  );
}
