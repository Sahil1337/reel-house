"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type { ImportTitleInput, ImportTitleResult, TmdbMediaType } from "@/types";

/** Live TMDB search, tagged with the query and type it answers so placeholder data stays attributable. */
export function useTmdbSearch(q: string, type: TmdbMediaType, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.admin.tmdbSearch(q, type),
    queryFn: async ({ signal }) => ({ ...(await api.searchTmdb(q, type, { signal })), query: q, type }),
    enabled: options.enabled,
    placeholderData: keepPreviousData,
    // A missing TMDB key or a TMDB outage won't fix itself on a retry.
    retry: false,
  });
}

/** The TMDB preview (and the SQL an import would run) for the picked title; idle while nothing is picked. */
export function useTmdbTitle(selection: { type: TmdbMediaType; tmdbId: number } | null) {
  return useQuery({
    queryKey: queryKeys.admin.tmdbTitle(selection?.type ?? "movie", selection?.tmdbId ?? 0),
    queryFn: ({ signal }) => api.getTmdbTitle(selection!.type, selection!.tmdbId, { signal }),
    enabled: selection !== null,
    retry: false,
  });
}

/** Imports one TMDB title into the catalogue, then refreshes the catalogue cache and server-rendered counts. */
export function useImportTitle() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useMutation<ImportTitleResult, Error, ImportTitleInput>({
    mutationFn: (input) => api.importTitle(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.content.all });
      router.refresh();
    },
  });
}
