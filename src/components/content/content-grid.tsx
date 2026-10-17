import { cn } from "@/lib/utils";
import type { ContentSummary } from "@/types";

import { ContentCard } from "./content-card";

/** Responsive poster grid for genre, search, and My List pages. */
export function ContentGrid({ items, className }: { items: ContentSummary[]; className?: string }) {
  return (
    <ul
      className={cn(
        "grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7",
        className,
      )}
    >
      {items.map((content, index) => (
        <li
          key={content.contentId}
          className="animate-[fade-up_360ms_var(--ease-out-strong)_both] motion-reduce:animate-none"
          style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}
        >
          <ContentCard content={content} />
        </li>
      ))}
    </ul>
  );
}

/** Skeleton matching ContentGrid, for loading.tsx files. */
export function ContentGridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-x-4 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="aspect-[2/3] animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      ))}
    </ul>
  );
}
