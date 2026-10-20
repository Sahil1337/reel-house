import { Skeleton } from "@/components/ui/skeleton";

export default function AccountLoading() {
  return (
    <div
      className="flex flex-col gap-14 px-4 pt-24 pb-16 sm:px-8 lg:px-12"
      aria-busy="true"
      aria-label="Loading account"
    >
      <div className="flex flex-col gap-3">
        <Skeleton className="h-12 w-56 sm:h-14" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <Skeleton className="h-80 rounded-2xl" />
        <Skeleton className="h-80 rounded-2xl" />
      </div>
      <div className="flex flex-col gap-5">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(15rem,1fr))] gap-4 lg:gap-5">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-80 rounded-2xl" />
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-5">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-72 rounded-2xl" />
      </div>
    </div>
  );
}
