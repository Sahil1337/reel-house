"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { StarIcon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useRating } from "@/hooks/queries/activity";
import { cn } from "@/lib/utils";

const STARS = [1, 2, 3, 4, 5] as const;
const LABELS = ["Not for me", "It was okay", "Liked it", "Really liked it", "Loved it"] as const;
/** Arrow keys change the value immediately but save once the user settles. */
const KEYBOARD_SAVE_DELAY = 600;

const KEY_STEPS: Record<string, (current: number) => number> = {
  ArrowRight: (current) => current + 1,
  ArrowUp: (current) => current + 1,
  ArrowLeft: (current) => current - 1,
  ArrowDown: (current) => current - 1,
  Home: () => 1,
  End: () => 5,
};

/**
 * 1–5 star rating as a radio group. Click a star to rate, click it again (or
 * "Clear") to remove the rating. Optimistic, with a toast and a server refresh.
 */
export function RatingControl({
  profileId,
  contentId,
  title,
  initialRating,
}: {
  profileId: number;
  contentId: number;
  title: string;
  initialRating: number | null;
}) {
  const labelId = useId();
  const hintId = useId();
  const [rating, setRating] = useState(initialRating);
  const [preview, setPreview] = useState<number | null>(null);
  const { getRating, setRating: save, isPending } = useRating(profileId, contentId, initialRating);
  const saveTimer = useRef<number | undefined>(undefined);
  const stars = useRef<(HTMLButtonElement | null)[]>([]);

  const persist = async (next: number | null) => {
    const startedFrom = getRating();
    try {
      if (!(await save(next))) return;
      toast.success(
        next === null ? `Cleared your rating for ${title}` : `Rated ${title} ${next} out of 5. Your picks will adjust.`,
      );
    } catch (error) {
      setRating(startedFrom);
      toast.error(error instanceof Error ? error.message : "Couldn't save your rating. Try again.");
    }
  };

  const choose = (next: number | null, deferSave = false) => {
    setRating(next);
    window.clearTimeout(saveTimer.current);
    if (deferSave) saveTimer.current = window.setTimeout(() => persist(next), KEYBOARD_SAVE_DELAY);
    else persist(next);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = KEY_STEPS[event.key];
    if (!step) return;
    event.preventDefault();
    const next = Math.min(5, Math.max(1, step(rating ?? 0)));
    stars.current[next - 1]?.focus();
    if (next !== rating) choose(next, true);
  };

  const shown = preview ?? rating ?? 0;
  const caption =
    preview !== null ? LABELS[preview - 1] : rating !== null ? `${rating}/5 · ${LABELS[rating - 1]}` : "Not rated yet";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span id={labelId} className="text-sm font-medium">
          Your rating
        </span>
        <div
          role="radiogroup"
          aria-labelledby={labelId}
          aria-describedby={hintId}
          onKeyDown={onKeyDown}
          onPointerLeave={() => setPreview(null)}
          className="-mx-1 flex items-center"
        >
          {STARS.map((value) => (
            <button
              key={value}
              ref={(element) => {
                stars.current[value - 1] = element;
              }}
              type="button"
              role="radio"
              aria-checked={rating === value}
              aria-label={`${value} ${value === 1 ? "star" : "stars"}, ${LABELS[value - 1]}`}
              tabIndex={value === (rating ?? 1) ? 0 : -1}
              onClick={() => choose(rating === value ? null : value)}
              onPointerEnter={(event) => {
                if (event.pointerType === "mouse") setPreview(value);
              }}
              className={cn(
                "grid size-9 cursor-pointer place-items-center rounded-md text-muted-foreground outline-none pointer-coarse:size-11",
                "transition-transform duration-150 ease-out focus-visible:ring-2 focus-visible:ring-ring active:scale-90 motion-reduce:transform-none",
              )}
            >
              <HugeiconsIcon
                icon={StarIcon}
                strokeWidth={1.5}
                className={cn(
                  "size-6 transition-colors duration-150",
                  value <= shown ? "fill-current text-primary" : "fill-transparent",
                )}
              />
            </button>
          ))}
        </div>
        <span className="min-w-28 text-sm text-muted-foreground tabular-nums" aria-hidden="true">
          {caption}
        </span>
        {rating !== null ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              choose(null);
              stars.current[0]?.focus();
            }}
            disabled={isPending}
            aria-label={`Clear your rating for ${title}`}
            className="text-muted-foreground"
          >
            Clear
          </Button>
        ) : null}
      </div>
      <p id={hintId} className="text-xs text-muted-foreground">
        Your ratings shape the picks on your Home page.
      </p>
    </div>
  );
}
