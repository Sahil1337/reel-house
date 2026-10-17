import Link from "next/link";

import { segmentedControlItemVariants, segmentedControlRootClassName } from "@/lib/ui/segmented-control";
import { cn } from "@/lib/utils";
import type { ContentType } from "@/types";

const OPTIONS: { type: ContentType | null; label: string }[] = [
  { type: null, label: "All" },
  { type: "MOVIE", label: "Films" },
  { type: "SERIES", label: "Series" },
];

/** Server-side "All / Films / Series" switch rendered as plain links (`?type=`). */
export function TypeFilter({
  basePath,
  active,
  counts,
  className,
}: {
  basePath: string;
  active: ContentType | null;
  counts: Record<ContentType | "ALL", number>;
  className?: string;
}) {
  return (
    <nav aria-label="Filter by type" className={cn(segmentedControlRootClassName, className)}>
      {OPTIONS.map((option) => (
        <Link
          key={option.label}
          href={option.type ? `${basePath}?type=${option.type}` : basePath}
          scroll={false}
          aria-current={active === option.type ? "page" : undefined}
          className={segmentedControlItemVariants({ state: "current" })}
        >
          {option.label}
          <span className="font-mono text-xs text-muted-foreground tabular-nums">{counts[option.type ?? "ALL"]}</span>
        </Link>
      ))}
    </nav>
  );
}
