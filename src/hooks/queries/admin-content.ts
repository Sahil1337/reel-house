"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiError, api } from "@/lib/api/client";
import { DEMO_WRITE_NOTE } from "@/lib/constants";
import { queryKeys } from "@/lib/api/query-keys";
import type { AdminContentFilters, AdminContentRow, AdminPage, ContentDetail, UpdateContentInput } from "@/types";

type ContentPage = AdminPage<AdminContentRow>;
type ListSnapshot = [readonly unknown[], ContentPage | undefined][];

/** The titles table for these filters; keeps the previous page on screen while the next one loads. */
export function useAdminContent(filters: AdminContentFilters) {
  return useQuery({
    queryKey: queryKeys.admin.content.list(filters),
    queryFn: ({ signal }) => api.listAdminContent(filters, { signal }),
    placeholderData: keepPreviousData,
  });
}

/** What removing a title would cascade to; idle until a title is picked, always re-read when the dialog opens. */
export function useContentImpact(contentId: number | null) {
  return useQuery({
    queryKey: queryKeys.admin.content.impact(contentId ?? 0),
    queryFn: ({ signal }) => api.getContentImpact(contentId!, { signal }),
    enabled: contentId !== null,
    staleTime: 0,
    retry: false,
  });
}

/** The genres for the table's filter (GET /api/genres, alphabetical). */
export function useAdminGenres() {
  return useQuery({
    queryKey: queryKeys.admin.genres(),
    queryFn: async ({ signal }) => (await api.listGenres({ signal })).genres,
    staleTime: 5 * 60_000,
  });
}

export type ContentEditable = Pick<ContentDetail, "description" | "backdropUrl">;

/**
 * The fields the list row doesn't carry (description, backdrop), loaded when the edit dialog opens so the
 * form can show their current values. GET /api/content/:id is not maturity-filtered for this call.
 */
export function useContentEditable(contentId: number | null) {
  return useQuery({
    queryKey: queryKeys.admin.content.editable(contentId ?? 0),
    queryFn: async ({ signal }): Promise<ContentEditable> => {
      const { content } = await api.getContent(contentId!, { signal });
      return { description: content.description, backdropUrl: content.backdropUrl };
    },
    enabled: contentId !== null,
    staleTime: 0,
    retry: false,
  });
}

/** Applies `patch` to every cached page of the table and returns the pages as they were, for rollback. */
async function patchCachedPages(
  queryClient: QueryClient,
  patch: (page: ContentPage) => ContentPage,
): Promise<ListSnapshot> {
  const lists = { queryKey: queryKeys.admin.content.lists() };
  // An in-flight refetch would land after the patch and undo it.
  await queryClient.cancelQueries(lists);
  const snapshots = queryClient.getQueriesData<ContentPage>(lists);
  queryClient.setQueriesData<ContentPage>(lists, (page) => (page ? patch(page) : page));
  return snapshots;
}

function restore(queryClient: QueryClient, snapshots: ListSnapshot | undefined) {
  for (const [key, data] of snapshots ?? []) queryClient.setQueryData(key, data);
}

/**
 * The mocks don't persist, so a refetch would bring a removed row back. Mark the pages stale without
 * refetching. With a real backend, drop `refetchType: "none"` to refetch the visible page.
 */
function markListsStale(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: queryKeys.admin.content.lists(), refetchType: "none" });
}

const messageOf = (error: unknown, fallback: string) => (error instanceof Error ? error.message : fallback);

/** Removes a title. The row leaves every cached page at once and comes back if the request fails. */
export function useDeleteContent() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { contentId: number; title: string }, { snapshots: ListSnapshot }>({
    mutationFn: ({ contentId }) => api.deleteContent(contentId),
    onMutate: async ({ contentId }) => ({
      snapshots: await patchCachedPages(queryClient, (page) => {
        if (!page.items.some((row) => row.contentId === contentId)) return page;
        const total = Math.max(0, page.total - 1);
        return {
          ...page,
          items: page.items.filter((row) => row.contentId !== contentId),
          total,
          pageCount: Math.max(1, Math.ceil(total / page.pageSize)),
        };
      }),
    }),
    onError: (error, { title }, context) => {
      restore(queryClient, context?.snapshots);
      toast.error(`Couldn't remove ${title}`, { description: messageOf(error, "Try again.") });
    },
    onSuccess: (_data, { title }) => {
      toast.success(`Removed ${title}`, { description: DEMO_WRITE_NOTE });
    },
    onSettled: () => markListsStale(queryClient),
  });
}

/** Edits a title. The row updates in place straight away, then takes the server's version of it. */
export function useUpdateContent() {
  const queryClient = useQueryClient();
  return useMutation<
    AdminContentRow,
    Error,
    { contentId: number; title: string; changes: UpdateContentInput },
    { snapshots: ListSnapshot }
  >({
    mutationFn: async ({ contentId, changes }) => (await api.updateContent(contentId, changes)).content,
    onMutate: async ({ contentId, changes }) => ({
      snapshots: await patchCachedPages(queryClient, (page) => ({
        ...page,
        items: page.items.map((row) =>
          row.contentId === contentId
            ? {
                ...row,
                title: changes.title ?? row.title,
                releaseDate: changes.releaseDate !== undefined ? changes.releaseDate : row.releaseDate,
                ageRating: changes.ageRating !== undefined ? changes.ageRating : row.ageRating,
                posterUrl: changes.posterUrl !== undefined ? changes.posterUrl : row.posterUrl,
              }
            : row,
        ),
      })),
    }),
    onError: (error, { title }, context) => {
      restore(queryClient, context?.snapshots);
      // A duplicate title is explained inside the form; every other failure gets a toast.
      if (!(error instanceof ApiError && error.code === "CONTENT_EXISTS")) {
        toast.error(`Couldn't save ${title}`, { description: messageOf(error, "Try again.") });
      }
    },
    onSuccess: (content, { contentId }) => {
      queryClient.setQueriesData<ContentPage>({ queryKey: queryKeys.admin.content.lists() }, (page) =>
        page ? { ...page, items: page.items.map((row) => (row.contentId === contentId ? content : row)) } : page,
      );
      toast.success(`Saved ${content.title}`, { description: DEMO_WRITE_NOTE });
    },
    onSettled: () => markListsStale(queryClient),
  });
}
