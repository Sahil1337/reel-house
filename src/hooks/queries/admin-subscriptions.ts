"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiError, api } from "@/lib/api/client";
import { DEMO_WRITE_NOTE } from "@/lib/constants";
import { queryKeys } from "@/lib/api/query-keys";
import type {
  AdminPage,
  AdminPlan,
  AdminSubscriptionAction,
  AdminSubscriptionFilters,
  AdminSubscriptionRow,
} from "@/types";

type Page = AdminPage<AdminSubscriptionRow>;

const messageOf = (error: unknown) =>
  error instanceof ApiError ? error.message : "Something went wrong. Check your connection and try again.";

/**
 * `iso` plus N calendar months, like Postgres' `end_date + make_interval(months => n)`: the day is kept,
 * or clamped to the end of a shorter month (Jan 31 + 1 month = Feb 28/29).
 */
export function addMonthsIso(iso: string, months: number): string {
  const date = new Date(iso);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}

/** One page of subscriptions; the previous page stays on screen while the next one loads. */
export function useAdminSubscriptions(filters: AdminSubscriptionFilters) {
  return useQuery({
    queryKey: queryKeys.admin.subscriptions.list(filters),
    queryFn: ({ signal }) => api.listAdminSubscriptions(filters, { signal }),
    placeholderData: keepPreviousData,
  });
}

/** The row after an admin action, as the server will return it: computed from the cached row. */
function applyAction(
  row: AdminSubscriptionRow,
  action: AdminSubscriptionAction,
  plans: AdminPlan[] | undefined,
): AdminSubscriptionRow {
  switch (action.action) {
    case "cancel": {
      const now = new Date().toISOString();
      // LEAST(end_date, now()): a period that already lapsed keeps its earlier end.
      return { ...row, status: "CANCELLED", endDate: row.endDate && row.endDate < now ? row.endDate : now };
    }
    case "extend":
      return { ...row, endDate: row.endDate ? addMonthsIso(row.endDate, action.months) : row.endDate };
    case "change_plan": {
      const plan = plans?.find((entry) => entry.planId === action.planId);
      return plan
        ? { ...row, planId: plan.planId, planName: plan.name, planPriceMonthly: plan.priceMonthly }
        : { ...row, planId: action.planId };
    }
  }
}

const ACTION_TITLES: Record<AdminSubscriptionAction["action"], { done: string; failed: string }> = {
  cancel: { done: "Subscription cancelled", failed: "Couldn't cancel the subscription" },
  extend: { done: "Subscription extended", failed: "Couldn't extend the subscription" },
  change_plan: { done: "Plan changed", failed: "Couldn't change the plan" },
};

/**
 * Cancel, extend or change the plan of one subscription. The row is patched at once in every cached page of
 * the table and restored if the request fails (the mutation then rejects, so the dialog can show the
 * message inline: 409 SUBSCRIPTION_NOT_ACTIVE, PLAN_UNCHANGED, 404…).
 *
 * Nothing is persisted while the services are mocks, so a refetch after the write would put the old rows back
 * over the optimistic change. `refetchType: "none"` only marks the pages stale. With a real backend you would
 * refetch here (drop `refetchType`) so the table shows what the database holds.
 */
export function useSubscriptionAction() {
  const queryClient = useQueryClient();
  const lists = queryKeys.admin.subscriptions.lists();

  return useMutation({
    mutationFn: async ({ subscriptionId, action }: { subscriptionId: number; action: AdminSubscriptionAction }) =>
      (await api.updateSubscription(subscriptionId, action)).subscription,
    onMutate: async ({ subscriptionId, action }) => {
      await queryClient.cancelQueries({ queryKey: lists });
      const snapshot = queryClient.getQueriesData<Page>({ queryKey: lists });
      const plans = queryClient.getQueryData<AdminPlan[]>(queryKeys.admin.plans.list());
      queryClient.setQueriesData<Page>(
        { queryKey: lists },
        (page) =>
          page && {
            ...page,
            items: page.items.map((row) =>
              row.subscriptionId === subscriptionId ? applyAction(row, action, plans) : row,
            ),
          },
      );
      return { snapshot };
    },
    onError: (error, { action }, context) => {
      for (const [key, data] of context?.snapshot ?? []) queryClient.setQueryData(key, data);
      toast.error(ACTION_TITLES[action.action].failed, { description: messageOf(error) });
    },
    onSuccess: (subscription, { action }) => {
      // The server's row is the truth (its timestamps), so swap it in for the guess.
      queryClient.setQueriesData<Page>(
        { queryKey: lists },
        (page) =>
          page && {
            ...page,
            items: page.items.map((row) => (row.subscriptionId === subscription.subscriptionId ? subscription : row)),
          },
      );
      toast.success(ACTION_TITLES[action.action].done, { description: DEMO_WRITE_NOTE });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: lists, refetchType: "none" });
    },
  });
}
