import { ContentGridSkeleton } from "@/components/content/content-grid";
import { Skeleton } from "@/components/ui/skeleton";

export default function SearchLoading() {
  return (
    <div className="flex flex-col gap-8 px-4 pt-24 pb-16 sm:px-8 sm:pt-28 lg:px-12" aria-busy="true">
      <div className="flex flex-col gap-5">
        <Skeleton className="h-12 w-48 sm:h-14" />
        <Skeleton className="h-12 w-full max-w-3xl rounded-xl sm:h-13" />
        <div className="flex gap-3">
          <Skeleton className="h-9 w-48 rounded-md sm:h-8" />
          <Skeleton className="h-9 w-40 rounded-md sm:h-8" />
        </div>
      </div>
      <ContentGridSkeleton count={14} />
    </div>
  );
}
