import { cn } from "@/lib/utils";

/** Page heading for My List and History: marquee title, a count, and a quiet note. */
export function LibraryHeader({
  title,
  count,
  description,
  className,
}: {
  title: string;
  count?: string;
  description?: string;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h1 className="font-display text-5xl leading-none font-bold tracking-wide uppercase sm:text-6xl">{title}</h1>
        {count ? <p className="font-mono text-sm text-muted-foreground tabular-nums">{count}</p> : null}
      </div>
      {description ? <p className="max-w-prose text-sm text-pretty text-muted-foreground">{description}</p> : null}
    </header>
  );
}
