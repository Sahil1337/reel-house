import { RowSkeleton } from "@/components/browse/rows-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const PULSE_SAFE = "motion-reduce:animate-none";

/** Placeholder matching the title page: header with poster, then episodes/cast and a row. */
export function TitleSkeleton() {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        Loading title…
      </span>
      <div className="bg-linear-to-b from-muted/40 to-background px-4 pt-[34svh] pb-6 sm:px-8 md:pt-40 lg:px-12 lg:pt-48">
        <div className="flex items-end gap-8 lg:gap-12">
          <Skeleton
            className={cn("hidden aspect-[2/3] w-52 shrink-0 rounded-lg md:block lg:w-64 xl:w-72", PULSE_SAFE)}
          />
          <div className="flex w-full max-w-3xl flex-col gap-4">
            <Skeleton className={cn("h-3 w-16", PULSE_SAFE)} />
            <Skeleton className={cn("h-14 w-4/5 sm:h-20", PULSE_SAFE)} />
            <Skeleton className={cn("h-4 w-72 max-w-full", PULSE_SAFE)} />
            <div className="flex gap-2">
              {["w-16", "w-20", "w-14"].map((width) => (
                <Skeleton key={width} className={cn("h-7 rounded-full", width, PULSE_SAFE)} />
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className={cn("h-3.5 w-full", PULSE_SAFE)} />
              <Skeleton className={cn("h-3.5 w-11/12", PULSE_SAFE)} />
              <Skeleton className={cn("h-3.5 w-3/5", PULSE_SAFE)} />
            </div>
            <div className="mt-1 flex gap-3">
              <Skeleton className={cn("h-11 w-32 rounded-md sm:h-10", PULSE_SAFE)} />
              <Skeleton className={cn("h-11 w-32 rounded-md sm:h-10", PULSE_SAFE)} />
            </div>
            <Skeleton className={cn("mt-2 h-9 w-72 max-w-full", PULSE_SAFE)} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-14 pt-6 pb-16">
        <div className="flex flex-col gap-4 px-4 sm:px-8 lg:px-12">
          <Skeleton className={cn("h-6 w-40", PULSE_SAFE)} />
          <div className="flex gap-4 overflow-hidden">
            {Array.from({ length: 8 }, (_, index) => (
              <div key={index} className="flex w-24 shrink-0 flex-col items-center gap-2 sm:w-30">
                <Skeleton className={cn("size-20 rounded-full sm:size-24", PULSE_SAFE)} />
                <Skeleton className={cn("h-3 w-16", PULSE_SAFE)} />
              </div>
            ))}
          </div>
        </div>
        <RowSkeleton />
      </div>
    </div>
  );
}
