import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api, type ContentQuery } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type { ContentSummary } from "@/types";

/** A search's items plus the params that produced them (so kept-over placeholder data stays attributable). */
export type ContentSearchResult = { items: ContentSummary[]; query: ContentQuery };

/** Catalogue search; keeps the previous result on screen while the next params load. */
export function useContentSearch(
  params: ContentQuery,
  options?: { enabled?: boolean; initialData?: ContentSearchResult },
) {
  return useQuery({
    queryKey: queryKeys.content.search(params),
    queryFn: async ({ signal }): Promise<ContentSearchResult> => {
      const { items } = await api.searchContent(params, { signal });
      return { items, query: params };
    },
    enabled: options?.enabled,
    initialData: options?.initialData,
    placeholderData: keepPreviousData,
  });
}
