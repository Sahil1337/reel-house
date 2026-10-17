import { ContentGridSkeleton } from "@/components/content/content-grid";
import { Skeleton } from "@/components/ui/skeleton";

export default function GenreLoading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-8 px-4 pt-24 pb-16 sm:px-8 sm:pt-28 lg:px-12">
      <span className="sr-only" role="status">
        Loading genre…
      </span>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-3 w-28 motion-reduce:animate-none" />
        <Skeleton className="h-12 w-64 max-w-full sm:h-16 motion-reduce:animate-none" />
        <Skeleton className="h-4 w-56 motion-reduce:animate-none" />
      </div>
      <ContentGridSkeleton count={14} />
    </div>
  );
}
