import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import type { Genre } from "@/types";

/** Large toggle chips, one per genre. */
export function GenreStep({
  genres,
  selected,
  onToggle,
}: {
  genres: Genre[];
  selected: number[];
  onToggle: (genreId: number) => void;
}) {
  return (
    <ul className="flex flex-wrap justify-center gap-2 sm:gap-3">
      {genres.map((genre, index) => {
        const pressed = selected.includes(genre.genreId);
        return (
          <li
            key={genre.genreId}
            className="animate-[fade-up_320ms_var(--ease-out-strong)_both] motion-reduce:animate-none"
            style={{ animationDelay: `${Math.min(index * 30, 360)}ms` }}
          >
            <button
              type="button"
              aria-pressed={pressed}
              onClick={() => onToggle(genre.genreId)}
              className={cn(
                "inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border px-5 text-base font-medium outline-none sm:h-12 sm:px-6",
                "transition-[background-color,border-color,color,transform] duration-150 ease-out-strong active:scale-[0.97] motion-reduce:active:scale-100",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                pressed
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-card text-foreground hover-fine:border-foreground/30 hover-fine:bg-accent",
              )}
            >
              {pressed ? (
                <HugeiconsIcon
                  icon={Tick02Icon}
                  strokeWidth={2.5}
                  className="-ml-1 size-4 animate-[pop-in_200ms_var(--ease-out-strong)_both] motion-reduce:animate-none"
                />
              ) : null}
              {genre.name}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
