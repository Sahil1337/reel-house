"use client";

import type { Ref } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Film01Icon, Search01Icon, Tv01Icon } from "@hugeicons/core-free-icons";

import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { TmdbMediaType } from "@/types";

const TYPE_OPTIONS: { value: TmdbMediaType; label: string; icon: typeof Film01Icon }[] = [
  { value: "movie", label: "Movies", icon: Film01Icon },
  { value: "tv", label: "Series", icon: Tv01Icon },
];

/** Search box (search-as-you-type) plus the Movies / Series switch. */
export function TmdbSearch({
  ref,
  query,
  type,
  pending,
  onQueryChange,
  onTypeChange,
  onSubmit,
}: {
  ref?: Ref<HTMLInputElement>;
  query: string;
  type: TmdbMediaType;
  pending: boolean;
  onQueryChange: (value: string) => void;
  onTypeChange: (value: TmdbMediaType) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      role="search"
      className="flex flex-col gap-3 sm:flex-row sm:items-center"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <InputGroup className="min-w-0 flex-1 rounded-xl [&_input]:h-11 [&_input]:text-base sm:[&_input]:h-10">
        <InputGroupAddon>
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-4.5 text-muted-foreground" />
        </InputGroupAddon>
        <InputGroupInput
          ref={ref}
          type="search"
          aria-label={`Search TMDB ${type === "movie" ? "movies" : "series"}`}
          placeholder={type === "movie" ? "Search TMDB movies… e.g. Inception" : "Search TMDB series… e.g. Dark"}
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

      <ToggleGroup
        variant="outline"
        aria-label="Content type"
        value={[type]}
        onValueChange={(value: string[]) => {
          // Pressing the active option again keeps it selected.
          if (value[0] === "movie" || value[0] === "tv") onTypeChange(value[0]);
        }}
      >
        {TYPE_OPTIONS.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value} className="px-3">
            <HugeiconsIcon icon={option.icon} strokeWidth={2} />
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </form>
  );
}
