import { TMDB_ATTRIBUTION } from "@/lib/constants";
import { cn } from "@/lib/utils";

import { LogoMark } from "./logo";

export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer className={cn("mt-auto border-t px-4 py-10 text-sm text-muted-foreground sm:px-8 lg:px-12", className)}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <LogoMark className="size-4" />
          <span>Reelhouse — a DBMS course project. Streaming is simulated.</span>
        </div>
        <p className="max-w-md text-xs sm:text-right">
          Film and series data from{" "}
          <a
            href="https://www.themoviedb.org"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline-offset-4 hover:underline"
          >
            TMDB
          </a>
          . {TMDB_ATTRIBUTION}
        </p>
      </div>
    </footer>
  );
}
