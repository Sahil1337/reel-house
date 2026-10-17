"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { DatabaseImportIcon, InformationCircleIcon } from "@hugeicons/core-free-icons";

import { Backdrop, PersonPhoto, Poster } from "@/components/content/artwork";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatRuntime, formatYear } from "@/lib/format";
import type { SnapshotPerson } from "@/lib/tmdb/types";
import type { MaturityLevel, TmdbTitlePreview } from "@/types";

import { SeasonList } from "./season-list";
import { StoredRows } from "./stored-rows";

const MATURITY: Record<MaturityLevel, string> = { KIDS: "Kids", TEEN: "Teen", ADULT: "Adult" };

/** Everything an import would store, laid out like a title page: art, facts, credits, seasons, row counts. */
export function TitlePreview({
  preview,
  importing,
  onImport,
}: {
  preview: TmdbTitlePreview;
  importing: boolean;
  onImport: () => void;
}) {
  const { content, genres, people } = preview;
  const isSeries = content.contentType === "SERIES";
  const personById = new Map(people.map((person) => [person.tmdbId, person]));
  const cast = content.cast.flatMap((credit) => {
    const person = personById.get(credit.personTmdbId);
    return person ? [{ person, characterName: credit.characterName }] : [];
  });
  const directors = content.directorIds.flatMap((id) => personById.get(id) ?? []);
  const seasons = content.seasons ?? [];
  const episodeCount = seasons.reduce((sum, season) => sum + season.episodes.length, 0);

  const facts = [
    formatYear(content.releaseDate),
    isSeries
      ? `${seasons.length} season${seasons.length === 1 ? "" : "s"} · ${episodeCount} episode${episodeCount === 1 ? "" : "s"}`
      : formatRuntime(content.durationMinutes),
  ].filter(Boolean);

  return (
    <Card className="gap-0 overflow-hidden py-0 animate-[fade-up_360ms_var(--ease-out-strong)_both] motion-reduce:animate-none">
      <div className="relative">
        <Backdrop
          content={content}
          sizes="(min-width: 1280px) 60vw, 100vw"
          className="aspect-[16/7] w-full sm:aspect-[21/8]"
        />
        <div aria-hidden="true" className="absolute inset-0 bg-linear-to-t from-card via-card/40 to-transparent" />
      </div>

      <div className="relative -mt-16 flex flex-col gap-6 px-4 pb-5 sm:-mt-24 sm:px-6 sm:pb-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <Poster
            content={content}
            sizes="128px"
            className="w-24 shrink-0 rounded-md shadow-lg/5 ring-1 ring-foreground/10 sm:w-32"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{isSeries ? "Series" : "Movie"}</Badge>
              <span className="font-mono text-xs text-muted-foreground">TMDB {content.tmdbId}</span>
            </div>
            <h2 className="font-display text-3xl leading-none font-bold tracking-wide text-balance uppercase sm:text-4xl">
              {content.title}
            </h2>
            {content.originalTitle && content.originalTitle !== content.title ? (
              <p className="text-sm text-muted-foreground">{content.originalTitle}</p>
            ) : null}
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
              {facts.map((fact, index) => (
                <span key={index} className="after:ms-2 after:content-['·'] last:after:content-none">
                  {fact}
                </span>
              ))}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{content.ageRating ?? "Unrated"}</Badge>
              <Badge variant="outline">Maturity: {MATURITY[content.maturityLevel]}</Badge>
            </div>
          </div>
          <Button
            size="lg"
            onClick={onImport}
            loading={importing}
            className="shrink-0 transition-[transform,box-shadow] duration-150 ease-out-strong active:scale-[0.97] motion-reduce:active:scale-100"
          >
            <HugeiconsIcon icon={DatabaseImportIcon} strokeWidth={2} />
            {preview.alreadyInCatalog ? "Re-import" : "Import"}
          </Button>
        </div>

        {preview.alreadyInCatalog ? (
          <p
            role="status"
            className="flex items-start gap-2 rounded-lg bg-info/8 px-3 py-2.5 text-sm text-info-foreground dark:bg-info/16"
          >
            <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} className="mt-0.5 size-4 shrink-0" />
            <span>
              Already in the catalogue
              {preview.existingContentId !== null ? (
                <>
                  {" "}
                  as <span className="font-mono">content_id {preview.existingContentId}</span>
                </>
              ) : null}
              . Every statement below is an upsert, so importing again refreshes the existing rows instead of
              duplicating them.
            </span>
          </p>
        ) : null}

        {content.description ? (
          <p className="max-w-prose text-sm leading-relaxed text-pretty text-muted-foreground">{content.description}</p>
        ) : null}

        {genres.length ? (
          <ul aria-label="Genres" className="flex flex-wrap gap-1.5">
            {genres.map((genre) => (
              <li key={genre.tmdbId}>
                <Badge variant="outline" size="lg">
                  {genre.name}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}

        <Credits isSeries={isSeries} cast={cast} directors={directors} />

        {isSeries && seasons.length ? <SeasonList seriesTitle={content.title} seasons={seasons} /> : null}

        <StoredRows rowCounts={preview.rowCounts} />
      </div>
    </Card>
  );
}

function Credits({
  isSeries,
  cast,
  directors,
}: {
  isSeries: boolean;
  cast: { person: SnapshotPerson; characterName: string }[];
  directors: SnapshotPerson[];
}) {
  if (!cast.length && !directors.length) return null;
  return (
    <section aria-labelledby="preview-credits-heading" className="flex flex-col gap-3">
      <h3 id="preview-credits-heading" className="text-sm font-medium">
        Cast &amp; crew
      </h3>
      {cast.length ? (
        <ul aria-label="Cast" className="grid grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))] gap-x-3 gap-y-4">
          {cast.map(({ person, characterName }, index) => (
            <li key={`${person.tmdbId}-${index}`} className="text-center">
              <PersonPhoto person={person} className="mx-auto size-16 ring-1 ring-foreground/10" />
              <p className="mt-1.5 line-clamp-2 text-xs leading-snug font-medium">{person.name}</p>
              {characterName ? (
                <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">{characterName}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {directors.length ? (
        <ul aria-label={isSeries ? "Creators" : "Directors"} className="flex flex-wrap gap-2">
          {directors.map((person) => (
            <li key={person.tmdbId} className="flex items-center gap-2 rounded-full border py-0.5 ps-0.5 pe-3">
              <PersonPhoto person={person} className="size-7 shrink-0" />
              <span className="text-xs">{person.name}</span>
              <span className="text-xs text-muted-foreground">{isSeries ? "Creator" : "Director"}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function TitlePreviewSkeleton() {
  return (
    <Card aria-hidden="true" className="gap-0 overflow-hidden py-0">
      <Skeleton className="aspect-[16/7] w-full rounded-none sm:aspect-[21/8]" />
      <div className="flex flex-col gap-5 px-4 pt-4 pb-6 sm:px-6">
        <div className="flex gap-4">
          <Skeleton className="aspect-[2/3] w-24 rounded-md sm:w-32" />
          <div className="flex flex-1 flex-col justify-end gap-2">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-5 w-1/3" />
          </div>
        </div>
        <Skeleton className="h-16 w-full" />
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="aspect-square rounded-full" />
          ))}
        </div>
      </div>
    </Card>
  );
}
