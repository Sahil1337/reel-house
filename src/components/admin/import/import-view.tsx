"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CursorPointer02Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { toast } from "sonner";

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { useImportTitle, useTmdbSearch, useTmdbTitle } from "@/hooks/queries/admin";
import { ApiError } from "@/lib/api/client";
import { TMDB_ATTRIBUTION } from "@/lib/constants";
import type { TmdbMediaType, TmdbSearchResult, TmdbTitlePreview } from "@/types";

import { ErrorNotice, TmdbKeyMissing } from "./import-errors";
import { SearchResults, SearchResultsSkeleton } from "./search-results";
import { SqlSteps } from "./sql-steps";
import { TitlePreview, TitlePreviewSkeleton } from "./title-preview";
import { TmdbSearch } from "./tmdb-search";

const DEBOUNCE_MS = 300;

interface Selection {
  type: TmdbMediaType;
  tmdbId: number;
}

type PreviewState =
  | { status: "idle" }
  | { status: "loading"; selection: Selection }
  | { status: "error"; selection: Selection; message: string }
  | { status: "ready"; selection: Selection; data: TmdbTitlePreview };

const mediaTypeOf = (result: TmdbSearchResult): TmdbMediaType => (result.contentType === "MOVIE" ? "movie" : "tv");

function messageOf(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

const isKeyMissing = (error: unknown) => error instanceof ApiError && error.code === "TMDB_KEY_MISSING";

/**
 * The import page: search TMDB as you type, pick a result, review what an import stores and the
 * SQL it runs, then import. Owns all request state; the pieces below it are presentational.
 */
export function ImportView() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<TmdbMediaType>("movie");
  /** The search being shown (trimmed query); null until something is searched. */
  const [committed, setCommitted] = useState<{ query: string; type: TmdbMediaType } | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);

  const searchQuery = useTmdbSearch(committed?.query ?? "", committed?.type ?? type, { enabled: committed !== null });
  const previewQuery = useTmdbTitle(selection);
  const importTitle = useImportTitle();

  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const debounce = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Desktop only: focusing on touch would throw the keyboard over the page.
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
    return () => window.clearTimeout(debounce.current);
  }, []);

  // Clearing the box clears the results even though keepPreviousData holds the old ones.
  const data = committed ? searchQuery.data : undefined;
  const results = data?.results ?? null;
  /** The search the visible results belong to. */
  const resultsFor = data ? { query: data.query, type: data.type } : null;
  const searching = committed !== null && searchQuery.isFetching;
  const searchError =
    committed && searchQuery.isError
      ? messageOf(searchQuery.error, "Search failed. Check your connection and try again.")
      : null;
  const keyMissing = isKeyMissing(searchQuery.error) || isKeyMissing(previewQuery.error);

  const preview: PreviewState = !selection
    ? { status: "idle" }
    : previewQuery.isError
      ? { status: "error", selection, message: messageOf(previewQuery.error, "Couldn't load this title from TMDB.") }
      : previewQuery.data
        ? { status: "ready", selection, data: previewQuery.data }
        : { status: "loading", selection };
  const importing = importTitle.isPending;

  const search = (nextQuery: string, nextType: TmdbMediaType) => {
    window.clearTimeout(debounce.current);
    const q = nextQuery.trim();
    if (!q) {
      setCommitted(null);
      return;
    }
    if (committed && committed.query === q && committed.type === nextType) void searchQuery.refetch();
    else setCommitted({ query: q, type: nextType });
  };

  const onQueryChange = (value: string) => {
    setQuery(value);
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => search(value, type), DEBOUNCE_MS);
  };

  const onTypeChange = (value: TmdbMediaType) => {
    setType(value);
    search(query, value);
  };

  const onSelect = (result: TmdbSearchResult) => {
    setSelection({ type: mediaTypeOf(result), tmdbId: result.tmdbId });
    // Stacked layout: bring the preview into view; side by side it's already there.
    if (!window.matchMedia("(min-width: 1280px)").matches) {
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      requestAnimationFrame(() =>
        previewRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" }),
      );
    }
  };

  const onImport = async () => {
    if (preview.status !== "ready" || importing) return;
    const { selection, data } = preview;
    try {
      const result = await importTitle.mutateAsync(selection);
      if (result.created)
        toast.success(`Imported ${data.content.title}`, { description: `content_id ${result.contentId}` });
      else
        toast.success(`Refreshed ${data.content.title}`, {
          description: "It was already in the catalogue; the upserts updated it.",
        });
    } catch (error) {
      toast.error(messageOf(error, `Couldn't import ${data.content.title}. Try again.`));
    }
  };

  const selectedId = preview.status === "idle" ? null : preview.selection.tmdbId;
  const selectedType = preview.status === "idle" ? null : preview.selection.type;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] xl:items-start">
        <section
          aria-label="Search TMDB"
          className="flex min-w-0 flex-col gap-4 xl:sticky xl:top-[calc(var(--header-height,3rem)+1.5rem)]"
        >
          <TmdbSearch
            ref={inputRef}
            query={query}
            type={type}
            pending={searching}
            onQueryChange={onQueryChange}
            onTypeChange={onTypeChange}
            onSubmit={() => search(query, type)}
          />

          {resultsFor && results && !searchError ? (
            <p className="text-xs text-muted-foreground" aria-live="polite">
              {results.length === 0
                ? "No results"
                : `${results.length} ${resultsFor.type === "movie" ? "movies" : "series"} for “${resultsFor.query}”`}
              {results.length > 0 ? " · from TMDB, live" : ""}
            </p>
          ) : null}

          <div className="min-w-0 xl:-m-1 xl:max-h-[calc(100svh-var(--header-height,3rem)-12rem)] xl:overflow-y-auto xl:overscroll-contain xl:p-1">
            {keyMissing ? (
              <TmdbKeyMissing />
            ) : searchError ? (
              <ErrorNotice message={searchError} onRetry={() => search(query, type)} />
            ) : results && resultsFor ? (
              <SearchResults
                results={results}
                query={resultsFor.query}
                type={resultsFor.type}
                pending={searching}
                selectedId={selectedType === resultsFor.type ? selectedId : null}
                onSelect={onSelect}
              />
            ) : searching ? (
              <SearchResultsSkeleton />
            ) : (
              <Empty className="rounded-xl border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
                  </EmptyMedia>
                  <EmptyTitle>Find a title on TMDB</EmptyTitle>
                  <EmptyDescription>
                    Start typing a {type === "movie" ? "movie" : "series"} name. Results come straight from TMDB, and
                    the ones Reelhouse already has are marked.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </div>
        </section>

        <div ref={previewRef} className="flex min-w-0 scroll-mt-20 flex-col gap-6">
          {preview.status === "idle" ? (
            keyMissing ? null : (
              <Empty className="rounded-xl border border-dashed">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <HugeiconsIcon icon={CursorPointer02Icon} strokeWidth={2} />
                  </EmptyMedia>
                  <EmptyTitle>Pick a result to preview it</EmptyTitle>
                  <EmptyDescription>
                    You&rsquo;ll see exactly what an import stores — the title, its genres, people, seasons and episodes
                    — and the SQL transaction that writes it.
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )
          ) : preview.status === "loading" ? (
            <TitlePreviewSkeleton />
          ) : preview.status === "error" ? (
            keyMissing ? (
              <TmdbKeyMissing />
            ) : (
              <ErrorNotice message={preview.message} onRetry={() => void previewQuery.refetch()} />
            )
          ) : (
            <>
              <TitlePreview preview={preview.data} importing={importing} onImport={onImport} />
              <SqlSteps statements={preview.data.statements} title={preview.data.content.title} />
            </>
          )}
        </div>
      </div>

      <footer className="border-t pt-4 text-xs text-muted-foreground">
        Titles, images and credits come from{" "}
        <a
          href="https://www.themoviedb.org"
          target="_blank"
          rel="noreferrer"
          className="rounded-sm text-foreground underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          TMDB
        </a>
        . {TMDB_ATTRIBUTION}
      </footer>
    </div>
  );
}
