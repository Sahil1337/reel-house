import { Skeleton } from "@/components/ui/skeleton";

export default function ProfilesLoading() {
  return (
    <div className="flex min-h-dvh flex-col" aria-busy="true" aria-label="Loading profiles">
      <div className="h-16" />
      <div className="flex flex-1 flex-col items-center justify-center gap-10 px-4 pt-8 pb-20 sm:gap-14">
        <div className="flex flex-col items-center gap-3">
          <Skeleton className="h-12 w-72 sm:h-16 sm:w-96" />
          <Skeleton className="h-4 w-64" />
        </div>
        <div className="flex flex-wrap justify-center gap-4 sm:gap-8">
          {Array.from({ length: 3 }, (_, index) => (
            <div key={index} className="flex w-28 flex-col items-center gap-3 p-1 sm:w-36">
              <Skeleton className="aspect-square w-full rounded-xl" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
        <Skeleton className="h-10 w-44 rounded-md sm:h-9" />
      </div>
    </div>
  );
}
