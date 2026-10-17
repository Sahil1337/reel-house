import { HeroSkeleton, RowsSkeleton } from "@/components/browse/rows-skeleton";

export default function BrowseLoading() {
  return (
    <div aria-busy="true">
      <span className="sr-only" role="status">
        Loading your picks…
      </span>
      <HeroSkeleton />
      <RowsSkeleton className="relative z-10 -mt-16 pb-16 sm:-mt-20 lg:-mt-28" />
    </div>
  );
}
