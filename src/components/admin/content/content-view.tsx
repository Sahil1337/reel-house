"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, Film01Icon, RefreshIcon, Search01Icon } from "@hugeicons/core-free-icons";

import { AdminPagination } from "@/components/admin/admin-pagination";
import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useAdminContent, useAdminGenres } from "@/hooks/queries/admin-content";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { ADMIN_PAGE_SIZE } from "@/lib/validation/admin";
import type { AdminContentFilters, AdminContentRow, ContentType } from "@/types";

import { ContentTable, ContentTableSkeleton } from "./content-table";
import { EditContentDialog } from "./edit-content-dialog";
import { RemoveContentDialog } from "./remove-content-dialog";

const ALL = "all";
const SEARCH_DEBOUNCE_MS = 300;

const TYPE_OPTIONS = [
  { value: ALL, label: "All" },
  { value: "MOVIE", label: "Movies" },
  { value: "SERIES", label: "Series" },
] as const;

/**
 * The admin content page: a searchable, filterable, server-paginated table of the catalogue, with
 * "Edit details" and "Remove" per row. Owns the filters and which row a dialog is open for.
 */
export function ContentView() {
  const [query, setQuery] = useState("");
  const [type, setType] = useState<ContentType | undefined>(undefined);
  const [genre, setGenre] = useState<number | undefined>(undefined);
  const [pageState, setPageState] = useState({ filtersKey: "", page: 1 });
  const [editing, setEditing] = useState<AdminContentRow | null>(null);
  const [removing, setRemoving] = useState<AdminContentRow | null>(null);

  const q = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  // Changing any filter starts over at page 1: the page number only counts while the filters it was picked under hold.
  const filtersKey = `${q}|${type ?? ""}|${genre ?? ""}`;
  const requestedPage = pageState.filtersKey === filtersKey ? pageState.page : 1;
  const filters: AdminContentFilters = { q, type, genre, page: requestedPage, pageSize: ADMIN_PAGE_SIZE };

  const content = useAdminContent(filters);
  const genres = useAdminGenres();
  const { data } = content;

  const genreItems = [
    { value: ALL, label: "All genres" },
    ...(genres.data ?? []).map((entry) => ({ value: String(entry.genreId), label: entry.name })),
  ];
  const filtered = Boolean(q || type || genre);
  const hasRows = Boolean(data && data.items.length > 0);
  // Text typed but not searched yet, or a new page loading: keep the old rows on screen, dimmed.
  const refreshing = content.isFetching && !content.isPending;
  const typing = query.trim() !== q;

  const goToPage = (page: number) => setPageState({ filtersKey, page });

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <InputGroup className="max-w-sm">
            <InputGroupAddon>
              <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="text-muted-foreground" />
            </InputGroupAddon>
            <InputGroupInput
              type="search"
              aria-label="Search titles"
              placeholder="Search titles…"
              autoComplete="off"
              value={query}
              onValueChange={setQuery}
            />
            {refreshing || typing ? (
              <InputGroupAddon align="inline-end">
                <Spinner className="size-4 text-muted-foreground" aria-label="Searching" />
              </InputGroupAddon>
            ) : null}
          </InputGroup>

          <ToggleGroup
            variant="outline"
            aria-label="Type"
            value={[type ?? ALL]}
            onValueChange={(value: string[]) => {
              if (!value[0]) return; // Pressing the active option again keeps it selected.
              setType(value[0] === ALL ? undefined : (value[0] as ContentType));
            }}
          >
            {TYPE_OPTIONS.map((option) => (
              <ToggleGroupItem key={option.value} value={option.value} className="px-3">
                {option.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <Select
            items={genreItems}
            value={genre ? String(genre) : ALL}
            onValueChange={(value: string | null) => setGenre(value && value !== ALL ? Number(value) : undefined)}
          >
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
            {data ? `${data.total.toLocaleString("en-IN")} ${data.total === 1 ? "title" : "titles"}` : " "}
          </p>
        </div>

        <div className="overflow-hidden rounded-xl border bg-card">
          {content.isPending ? (
            <ContentTableSkeleton />
          ) : content.isError && !data ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} />
                </EmptyMedia>
                <EmptyTitle>Couldn&rsquo;t load the catalogue</EmptyTitle>
                <EmptyDescription>
                  {content.error instanceof ApiError ? content.error.message : "Check your connection and try again."}
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={() => void content.refetch()} loading={content.isFetching}>
                  <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} />
                  Try again
                </Button>
              </EmptyContent>
            </Empty>
          ) : data && !hasRows ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={filtered ? Search01Icon : Film01Icon} strokeWidth={2} />
                </EmptyMedia>
                <EmptyTitle>
                  {data.total > 0 ? "No titles on this page" : filtered ? "No titles match" : "The catalogue is empty"}
                </EmptyTitle>
                <EmptyDescription>
                  {data.total > 0
                    ? "Everything here was removed. Go back a page."
                    : filtered
                      ? "Try a different search, or clear the type and genre filters."
                      : "Import a title from TMDB to get started."}
                </EmptyDescription>
              </EmptyHeader>
              {data.total > 0 ? (
                <EmptyContent>
                  <Button variant="outline" onClick={() => goToPage(data.pageCount)}>
                    Go to the last page
                  </Button>
                </EmptyContent>
              ) : filtered ? (
                <EmptyContent>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQuery("");
                      setType(undefined);
                      setGenre(undefined);
                    }}
                  >
                    Clear filters
                  </Button>
                </EmptyContent>
              ) : null}
            </Empty>
          ) : data ? (
            <div className={cn("transition-opacity duration-200", refreshing && "opacity-60")}>
              <ContentTable rows={data.items} onEdit={setEditing} onRemove={setRemoving} />
            </div>
          ) : null}
        </div>

        {data ? (
          <AdminPagination
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            pageCount={data.pageCount}
            onPageChange={goToPage}
            disabled={content.isFetching}
          />
        ) : null}
        {content.isError && data ? (
          <p role="alert" className="text-sm text-destructive-foreground">
            Couldn&rsquo;t refresh the list.{" "}
            <Button variant="link" size="xs" onClick={() => void content.refetch()} className="h-auto p-0">
              Try again
            </Button>
          </p>
        ) : null}
      </div>

      <RemoveContentDialog row={removing} onOpenChange={(open) => !open && setRemoving(null)} />
      <EditContentDialog row={editing} onOpenChange={(open) => !open && setEditing(null)} />
    </>
  );
}
