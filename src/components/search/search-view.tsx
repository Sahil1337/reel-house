"use client";

import { useEffect, useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";

import { ContentGrid } from "@/components/content/content-grid";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useContentSearch } from "@/hooks/queries/catalog";
import { ApiError, type ContentQuery } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import type { ContentSummary, Genre } from "@/types";

import { SEARCH_RESULT_LIMIT, parseContentType, searchHeading, searchHref, type SearchState } from "./search-params";

const DEBOUNCE_MS = 250;
const ALL = "all";

const sameSearch = (a: SearchState, b: SearchState) =>
  a.query === b.query && a.type === b.type && a.genreId === b.genreId;

/** The /api/content params for a search state. */
const toContentQuery = (state: SearchState): ContentQuery => ({
  q: state.query.trim() || undefined,
  type: state.type ?? undefined,
  genre: state.genreId ?? undefined,
  limit: SEARCH_RESULT_LIMIT,
});

const TYPE_OPTIONS = [
  { value: ALL, label: "All" },
  { value: "MOVIE", label: "Films" },
  { value: "SERIES", label: "Series" },
] as const;

export function SearchView({
  initial,
  initialResults,
  genres,
}: {
  initial: SearchState;
  initialResults: ContentSummary[];
  genres: Genre[];
}) {
  const [query, setQuery] = useState(initial.query);
  const [type, setType] = useState(initial.type);
  const [genreId, setGenreId] = useState(initial.genreId);
  /** The search last submitted or debounced; the query below runs for this. */
  const [committed, setCommitted] = useState(initial);

  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<number | undefined>(undefined);

  // The server-rendered results seed the cache only while the committed search is still the initial one.
  const result = useContentSearch(toContentQuery(committed), {
    initialData: sameSearch(committed, initial) ? { items: initialResults, query: toContentQuery(initial) } : undefined,
  });

  const pending = result.isFetching;
  const results = result.data?.items ?? [];
  /** The search the visible results belong to (drives the count and empty-state copy). */
  const resultsFor: SearchState = result.data
    ? {
        query: result.data.query.q ?? "",
        type: result.data.query.type ?? null,
        genreId: result.data.query.genre ?? null,
      }
    : committed;
  const error = result.isError
    ? result.error instanceof ApiError
      ? result.error.message
      : "Search failed. Check your connection and try again."
    : null;

  const genreItems = [
    { value: ALL, label: "All genres" },
    ...genres.map((genre) => ({ value: String(genre.genreId), label: genre.name })),
  ];

  useEffect(() => {
    // Desktop only: focusing on touch would throw the keyboard over the results.
    if (window.matchMedia("(pointer: fine)").matches) inputRef.current?.focus();
    return () => {
      window.clearTimeout(debounce.current);
    };
  }, []);

  const search = (next: SearchState) => {
    window.clearTimeout(debounce.current);

    // Keep the URL shareable without a server round trip (Next syncs native history updates).
    window.history.replaceState(null, "", searchHref(next));
    if (sameSearch(next, committed)) void result.refetch();
    else setCommitted(next);
  };

  const onQueryChange = (value: string) => {
    setQuery(value);
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => search({ query: value, type, genreId }), DEBOUNCE_MS);
  };

  const onTypeChange = (value: string | undefined) => {
    if (!value) return; // Pressing the active option again keeps it selected.
    const nextType = parseContentType(value);
    setType(nextType);
    search({ query, type: nextType, genreId });
  };

  const onGenreChange = (value: string | null) => {
    const nextGenreId = value && value !== ALL ? Number(value) : null;
    setGenreId(nextGenreId);
    search({ query, type, genreId: nextGenreId });
  };

  const reset = (next: SearchState) => {
    setQuery(next.query);
    setType(next.type);
    setGenreId(next.genreId);
    search(next);
    inputRef.current?.focus();
  };

  const heading = searchHeading(type);
  const count = results.length;
  const countLabel = `${count === SEARCH_RESULT_LIMIT ? `Top ${count}` : count} ${count === 1 ? "title" : "titles"}`;

  return (
    <div className="flex flex-col gap-8 px-4 pt-24 pb-16 sm:px-8 sm:pt-28 lg:px-12">
      <header className="flex flex-col gap-5">
        <h1 className="font-display text-5xl leading-none font-bold tracking-wide uppercase sm:text-6xl">{heading}</h1>

        <form
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            search({ query, type, genreId });
          }}
        >
          <InputGroup className="max-w-3xl rounded-xl [&_input]:h-12 [&_input]:text-base sm:[&_input]:h-13 sm:[&_input]:text-lg">
            <InputGroupAddon>
              <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-5 text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              ref={inputRef}
              type="search"
              aria-label="Search titles, actors and directors"
              placeholder="Titles, actors, directors…"
              autoComplete="off"
              enterKeyHint="search"
              value={query}
              onValueChange={onQueryChange}
            />
            {pending ? (
              <InputGroupAddon align="inline-end">
                <Spinner className="size-4 text-muted-foreground" aria-label="Searching" />
              </InputGroupAddon>
            ) : null}
          </InputGroup>
        </form>

        <div className="flex flex-wrap items-center gap-3">
          <ToggleGroup
            variant="outline"
            aria-label="Type"
            value={[type ?? ALL]}
            onValueChange={(value: string[]) => onTypeChange(value[0])}
          >
            {TYPE_OPTIONS.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value} className="px-3">
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <Select items={genreItems} value={genreId ? String(genreId) : ALL} onValueChange={onGenreChange}>
            <SelectTrigger aria-label="Genre" className="w-auto min-w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {genreItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>

          <p className="ms-auto text-sm text-muted-foreground tabular-nums" aria-live="polite">
            {pending
              ? "Searching…"
              : resultsFor.query
                ? `${countLabel} for “${resultsFor.query}”`
                : `${countLabel} · most popular first`}
          </p>
        </div>

        {error ? (
          <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive-foreground">
            {error}
            <Button variant="link" size="sm" className="h-auto px-0" onClick={() => search({ query, type, genreId })}>
              Try again
            </Button>
          </p>
        ) : null}
      </header>

      <section
        aria-label="Results"
        aria-busy={pending}
        className={cn("transition-opacity duration-200 motion-reduce:transition-none", pending && "opacity-50")}
      >
        {count > 0 ? (
          <ContentGrid items={results} />
        ) : (
          <SearchEmpty
            searched={resultsFor}
            onClearQuery={() => reset({ ...resultsFor, query: "" })}
            onClearFilters={() => reset({ ...resultsFor, type: null, genreId: null })}
          />
        )}
      </section>
    </div>
  );
}

function SearchEmpty({
  searched,
  onClearQuery,
  onClearFilters,
}: {
  searched: SearchState;
  onClearQuery: () => void;
  onClearFilters: () => void;
}) {
  const hasFilters = Boolean(searched.type || searched.genreId);
  return (
    <Empty className="rounded-xl border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyTitle>
          {searched.query ? `No matches for “${searched.query}”` : "Nothing matches these filters"}
        </EmptyTitle>
        <EmptyDescription>
          {searched.query
            ? "Try a different title, actor or director, or check the spelling."
            : "Try another genre, or switch between films and series."}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center">
        {searched.query ? (
          <Button variant="outline" onClick={onClearQuery}>
            Clear search
          </Button>
        ) : null}
        {hasFilters ? (
          <Button variant={searched.query ? "ghost" : "outline"} onClick={onClearFilters}>
            Clear filters
          </Button>
        ) : null}
      </EmptyContent>
    </Empty>
  );
}
