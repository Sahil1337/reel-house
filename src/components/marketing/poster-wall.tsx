import type { CSSProperties } from "react";

import { Poster } from "@/components/content/artwork";
import { cn } from "@/lib/utils";
import type { ContentSummary } from "@/types";

const COLUMNS = 6;
/** Columns past the third only appear on wider screens, so phones load fewer images. */
const COLUMN_VISIBILITY = ["flex", "flex", "flex", "hidden md:flex", "hidden lg:flex", "hidden lg:flex"];
const DURATIONS = [110, 90, 125, 100, 135, 95];

/**
 * A tilted, masked wall of real posters drifting slowly in alternating
 * directions. Purely decorative: callers lay scrims and content over it.
 */
export function PosterWall({ items, className }: { items: ContentSummary[]; className?: string }) {
  const columns = Array.from({ length: COLUMNS }, (_, column) =>
    items.filter((_, index) => index % COLUMNS === column),
  ).filter((column) => column.length > 0);

  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="absolute -inset-x-[12%] -top-1/4 flex h-[150%] -rotate-[8deg] gap-3 sm:gap-4 [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_72%,transparent)]">
        {columns.map((column, index) => (
          <div key={index} className={cn("min-w-0 flex-1", COLUMN_VISIBILITY[index])}>
            <div
              className={cn(
                "flex w-full flex-col animate-[poster-drift_var(--drift-duration,90s)_linear_infinite] will-change-transform motion-reduce:animate-none",
                index % 2 === 1 && "[animation-direction:reverse]",
              )}
              style={{ "--drift-duration": `${DURATIONS[index]}s` } as CSSProperties}
            >
              {[...column, ...column].map((content, position) => (
                <div key={`${content.contentId}-${position}`} className="pb-3 sm:pb-4">
                  <Poster
                    content={content}
                    sizes="(min-width: 1024px) 16vw, (min-width: 768px) 25vw, 33vw"
                    className="rounded-md ring-1 ring-foreground/8"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
