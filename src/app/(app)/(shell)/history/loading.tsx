import { Skeleton } from "@/components/ui/skeleton";

export default function HistoryLoading() {
  return (
    <div className="flex w-full max-w-5xl flex-col gap-8 px-4 pt-24 pb-16 sm:px-8 sm:pt-28 lg:px-12" aria-busy="true">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-12 w-52 sm:h-14" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-20" />
        <ul className="flex flex-col">
          {Array.from({ length: 6 }, (_, index) => (
            <li key={index} className="flex items-center gap-3 py-3 sm:gap-5">
              <Skeleton className="aspect-video w-28 shrink-0 rounded-md sm:w-40" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-2/5" />
                <Skeleton className="h-3.5 w-3/5" />
                <Skeleton className="h-3 w-28" />
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
