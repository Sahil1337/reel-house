import { ContentGridSkeleton } from "@/components/content/content-grid";
import { Skeleton } from "@/components/ui/skeleton";

export default function MyListLoading() {
  return (
    <div className="flex flex-col gap-8 px-4 pt-24 pb-16 sm:px-8 sm:pt-28 lg:px-12" aria-busy="true">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-12 w-52 sm:h-14" />
        <Skeleton className="h-4 w-48" />
      </div>
      <ContentGridSkeleton count={14} />
    </div>
  );
}
