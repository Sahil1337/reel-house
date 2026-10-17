import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Film01Icon } from "@hugeicons/core-free-icons";

import { LinkButton } from "@/components/browse/link-button";
import { TypeFilter } from "@/components/browse/type-filter";
import { ContentGrid } from "@/components/content/content-grid";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { serverApi } from "@/lib/api/server";
import { requireProfile } from "@/server/session/current-session";
import type { ContentType, Genre } from "@/types";

type Props = PageProps<"/browse/genre/[genreId]">;

const TYPE_NOUNS: Record<ContentType | "ALL", [singular: string, plural: string]> = {
  ALL: ["title", "titles"],
  MOVIE: ["film", "films"],
  SERIES: ["series", "series"],
};

/** The genre for a route param, or a 404 for malformed / unknown ids. */
async function loadGenre(param: string): Promise<Genre> {
  const genre = (await serverApi.getGenres()).find((entry) => entry.genreId === Number(param));
  if (!genre) notFound();
  return genre;
}

function parseType(value: string | string[] | undefined): ContentType | null {
  return value === "MOVIE" || value === "SERIES" ? value : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { genreId } = await params;
  const genre = await loadGenre(genreId);
  return { title: genre.name, description: `${genre.name} films and series on Reelhouse.` };
}

export default async function GenrePage({ params, searchParams }: Props) {
  const [{ genreId }, query, profile] = await Promise.all([params, searchParams, requireProfile()]);
  const genre = await loadGenre(genreId);
  const type = parseType(query.type);

  const all = await serverApi.searchContent({ genre: genre.genreId, limit: 100 });
  const counts = {
    ALL: all.length,
    MOVIE: all.filter((content) => content.contentType === "MOVIE").length,
    SERIES: all.filter((content) => content.contentType === "SERIES").length,
  };
  const items = type ? all.filter((content) => content.contentType === type) : all;
  const [singular, plural] = TYPE_NOUNS[type ?? "ALL"];
  const noun = items.length === 1 ? singular : plural;

  return (
    <div className="flex flex-col gap-8 px-4 pt-24 pb-16 sm:px-8 sm:pt-28 lg:px-12">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <nav
            aria-label="Breadcrumb"
            className="text-xs font-medium tracking-[0.16em] text-muted-foreground uppercase"
          >
            <Link
              href="/browse"
              className="rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              Home
            </Link>
            <span aria-hidden="true" className="mx-2 text-foreground/25">
              /
            </span>
            <span>Genre</span>
          </nav>
          <h1 className="mt-2 font-display text-5xl leading-none font-bold tracking-wide text-balance uppercase sm:text-6xl lg:text-7xl">
            {genre.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            <span className="font-mono tabular-nums">{items.length}</span> {noun} available on {profile.name}&apos;s
            profile
          </p>
        </div>
        {all.length > 0 ? (
          <TypeFilter basePath={`/browse/genre/${genre.genreId}`} active={type} counts={counts} className="shrink-0" />
        ) : null}
      </header>

      {items.length > 0 ? (
        <ContentGrid items={items} />
      ) : (
        <Empty className="rounded-xl border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Film01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>
              No {plural} in {genre.name} yet
            </EmptyTitle>
            <EmptyDescription>
              {type
                ? `Try all ${genre.name} titles, or search the full catalogue.`
                : "Nothing in this genre suits this profile's maturity setting. Search the catalogue for something else."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent className="flex-row justify-center">
            {type ? (
              <LinkButton href={`/browse/genre/${genre.genreId}`} variant="outline">
                Show all {genre.name}
              </LinkButton>
            ) : null}
            <LinkButton href="/search">Search titles</LinkButton>
          </EmptyContent>
        </Empty>
      )}
    </div>
  );
}
