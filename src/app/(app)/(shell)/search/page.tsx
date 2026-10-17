import type { Metadata } from "next";

import { SearchView } from "@/components/search/search-view";
import {
  SEARCH_RESULT_LIMIT,
  parseContentType,
  parseSearchParams,
  searchHeading,
} from "@/components/search/search-params";
import { serverApi } from "@/lib/api/server";

export async function generateMetadata({ searchParams }: PageProps<"/search">): Promise<Metadata> {
  const { type } = await searchParams;
  return { title: searchHeading(parseContentType(typeof type === "string" ? type : null)) };
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const [params, genres] = await Promise.all([searchParams, serverApi.getGenres()]);
  const initial = parseSearchParams(params, genres);
  const results = await serverApi.searchContent({
    q: initial.query || undefined,
    type: initial.type ?? undefined,
    genre: initial.genreId ?? undefined,
    limit: SEARCH_RESULT_LIMIT,
  });

  // Keyed so a fresh navigation (e.g. the nav's Films → Series) starts from the new URL.
  return (
    <SearchView
      key={`${initial.query}|${initial.type}|${initial.genreId}`}
      initial={initial}
      initialResults={results}
      genres={genres}
    />
  );
}
