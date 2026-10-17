import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const PULSE_SAFE = "motion-reduce:animate-none";

/** Placeholder for the Home hero, matching its height and text rhythm. */
export function HeroSkeleton() {
  return (
    <div className="flex min-h-[68svh] items-end bg-linear-to-b from-muted/40 to-background sm:min-h-[76svh] lg:min-h-[85svh]">
      <div className="flex w-full max-w-xl flex-col gap-4 px-4 pt-28 pb-24 sm:px-8 sm:pb-28 lg:max-w-2xl lg:px-12 lg:pb-36">
        <Skeleton className={cn("h-3 w-56", PULSE_SAFE)} />
        <Skeleton className={cn("h-14 w-4/5 sm:h-20", PULSE_SAFE)} />
        <Skeleton className={cn("h-4 w-40", PULSE_SAFE)} />
        <div className="flex flex-col gap-2">
          <Skeleton className={cn("h-3.5 w-full", PULSE_SAFE)} />
          <Skeleton className={cn("h-3.5 w-11/12", PULSE_SAFE)} />
          <Skeleton className={cn("h-3.5 w-2/3", PULSE_SAFE)} />
        </div>
        <div className="mt-2 flex gap-3">
          <Skeleton className={cn("h-11 w-28 rounded-md sm:h-10", PULSE_SAFE)} />
          <Skeleton className={cn("h-11 w-32 rounded-md sm:h-10", PULSE_SAFE)} />
          <Skeleton className={cn("size-11 rounded-md sm:size-10", PULSE_SAFE)} />
        </div>
      </div>
    </div>
  );
}

/** One shelf placeholder with the same item widths as `ContentRow`. */
export function RowSkeleton({ variant = "poster" }: { variant?: "poster" | "landscape" }) {
  return (
    <div>
      <div className="mb-3 flex flex-col gap-2 px-4 sm:px-8 lg:px-12">
        <Skeleton className={cn("h-6 w-44", PULSE_SAFE)} />
        <Skeleton className={cn("h-3 w-64 max-w-full", PULSE_SAFE)} />
      </div>
      <div className="flex gap-3 overflow-hidden px-4 py-3 sm:gap-4 sm:px-8 lg:px-12">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton
            key={index}
            className={cn(
              "shrink-0 rounded-lg",
              PULSE_SAFE,
              variant === "poster"
                ? "aspect-[2/3] w-[38vw] sm:w-[24vw] md:w-[19vw] lg:w-[15vw] xl:w-[12.5vw] 2xl:w-[11vw]"
                : "aspect-video w-[72vw] sm:w-[44vw] md:w-[34vw] lg:w-[26vw] xl:w-[22vw]",
            )}
          />
        ))}
      </div>
    </div>
  );
}

export function RowsSkeleton({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-8 sm:gap-10", className)}>
      {Array.from({ length: count }, (_, index) => (
        <RowSkeleton key={index} />
      ))}
    </div>
  );
}
