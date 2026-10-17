import { Spinner } from "@/components/ui/spinner";

export default function WatchLoading() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-scrim">
      <Spinner className="size-6 text-muted-foreground" aria-label="Loading player" />
    </div>
  );
}
