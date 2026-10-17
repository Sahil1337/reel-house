import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, Key01Icon, Refresh01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { cn } from "@/lib/utils";

/** The server has no TMDB_API_KEY: nothing on this page can work until it's set. */
export function TmdbKeyMissing({ className }: { className?: string }) {
  return (
    <Empty className={cn("rounded-xl border border-dashed", className)}>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={Key01Icon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyTitle>TMDB isn&rsquo;t connected</EmptyTitle>
        <EmptyDescription>
          Set <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">TMDB_API_KEY</code> in{" "}
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground">.env</code> (a v4 read access
          token or a v3 key, see <span className="font-mono text-xs">.env.example</span>) and restart the server.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/** Inline, announced error with an optional retry. */
export function ErrorNotice({
  message,
  onRetry,
  className,
}: {
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg bg-destructive/8 px-3 py-2.5 text-sm text-destructive-foreground dark:bg-destructive/16",
        className,
      )}
    >
      <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry ? (
        <Button size="xs" variant="outline" onClick={onRetry}>
          <HugeiconsIcon icon={Refresh01Icon} strokeWidth={2} />
          Try again
        </Button>
      ) : null}
    </div>
  );
}
