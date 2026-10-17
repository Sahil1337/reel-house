"use client";

import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useMemo } from "react";

import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type { ProgressInput } from "@/types";

/**
 * Server-rendered props seed a cache entry that is never fetched (skipToken). gcTime 0 means every
 * fresh mount starts from the props again, so the cache only carries optimistic values for the
 * lifetime of the component.
 */
const seeded = <T>(initial: T) =>
  ({ queryFn: skipToken, initialData: initial, staleTime: Infinity, gcTime: 0 }) as const;

/** Whether a title is in the profile's My List (seeded from the server-rendered page). */
export function useMyListStatus(profileId: number, contentId: number, initial: boolean): boolean {
  const { data } = useQuery({ queryKey: queryKeys.profile.myListStatus(profileId, contentId), ...seeded(initial) });
  return data ?? initial;
}

/** Adds (`true`) or removes (`false`) a title from My List, optimistically. */
export function useToggleMyList(profileId: number, contentId: number) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const statusKey = queryKeys.profile.myListStatus(profileId, contentId);

  return useMutation<unknown, Error, boolean, { previous: boolean | undefined }>({
    mutationFn: (next) => (next ? api.addToMyList(profileId, contentId) : api.removeFromMyList(profileId, contentId)),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: statusKey });
      const previous = queryClient.getQueryData<boolean>(statusKey);
      queryClient.setQueryData(statusKey, next);
      return { previous };
    },
    onError: (_error, _next, context) => {
      queryClient.setQueryData(statusKey, context?.previous);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile.myList(profileId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile.home(profileId) });
      router.refresh();
    },
  });
}

/** The saved 1-5 rating for a title, plus `setRating` (resolves `true` if a request was sent). */
export function useRating(profileId: number, contentId: number, initial: number | null) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const ratingKey = queryKeys.profile.rating(profileId, contentId);
  const { data } = useQuery({ queryKey: ratingKey, ...seeded<number | null>(initial) });
  const rating = data === undefined ? initial : data;

  const mutation = useMutation<unknown, Error, number | null, { previous: number | null | undefined }>({
    mutationFn: (next) =>
      next === null ? api.removeRating(profileId, contentId) : api.rate(profileId, contentId, next),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: ratingKey });
      const previous = queryClient.getQueryData<number | null>(ratingKey);
      queryClient.setQueryData(ratingKey, next);
      return { previous };
    },
    onError: (_error, _next, context) => {
      queryClient.setQueryData(ratingKey, context?.previous);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile.home(profileId) });
      router.refresh();
    },
  });

  /** Reads the cache, not a render closure, so debounced timers see the latest saved value. */
  const getRating = useCallback(
    () => queryClient.getQueryData<number | null>(ratingKey) ?? null,
    [queryClient, ratingKey],
  );
  const { mutateAsync } = mutation;
  const setRating = useCallback(
    async (next: number | null): Promise<boolean> => {
      if (next === getRating()) return false;
      await mutateAsync(next);
      return true;
    },
    [getRating, mutateAsync],
  );

  return { rating, getRating, setRating, isPending: mutation.isPending };
}

/** History entry ids hidden on this page until the server-rendered list catches up. */
export function useRemovedHistoryIds(profileId: number): ReadonlySet<number> {
  const { data } = useQuery({ queryKey: queryKeys.profile.removedHistory(profileId), ...seeded<number[]>([]) });
  return useMemo(() => new Set(data ?? []), [data]);
}

/** Removes a watch-history entry by id, hiding it immediately. */
export function useRemoveHistoryEntry(profileId: number) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const removedKey = queryKeys.profile.removedHistory(profileId);

  return useMutation<unknown, Error, number>({
    mutationFn: (historyId) => api.removeHistoryEntry(profileId, historyId),
    onMutate: async (historyId) => {
      await queryClient.cancelQueries({ queryKey: removedKey });
      queryClient.setQueryData<number[]>(removedKey, (ids = []) => [...ids, historyId]);
    },
    onError: (_error, historyId) => {
      queryClient.setQueryData<number[]>(removedKey, (ids = []) => ids.filter((id) => id !== historyId));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile.history(profileId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.profile.home(profileId) });
      router.refresh();
    },
  });
}

/**
 * Records watch progress. Deliberately no invalidation or router.refresh(): it is a background
 * save every 10s, and refreshing the server-rendered page each time would be disruptive.
 */
export function useRecordProgress() {
  return useMutation({
    mutationFn: ({ profileId, body }: { profileId: number; body: ProgressInput }) =>
      api.recordProgress(profileId, body),
  });
}
