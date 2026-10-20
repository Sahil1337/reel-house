"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ApiError, api } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type { AdminPlan, CreatePlanInput, UpdatePlanInput } from "@/types";

const byPrice = (a: AdminPlan, b: AdminPlan) => a.priceMonthly - b.priceMonthly || a.planId - b.planId;

const messageOf = (error: unknown) =>
  error instanceof ApiError ? error.message : "Something went wrong. Check your connection and try again.";

/** Every plan with its subscriber counts. `initialData` is the server-rendered list from the page. */
export function useAdminPlans(initialData?: AdminPlan[]) {
  return useQuery({
    queryKey: queryKeys.admin.plans.list(),
    queryFn: async ({ signal }) => (await api.listAdminPlans({ signal })).plans,
    initialData,
  });
}

/**
 * The shared shape of the three plan mutations: optimistic patch of the cached list on mutate, rollback on
 * error, and the list refetched when it settles so it shows what the database holds.
 */
function usePlanCache() {
  const queryClient = useQueryClient();
  const key = queryKeys.admin.plans.list();

  return {
    /** Cancels in-flight reads (they'd overwrite the patch), snapshots the list and applies `patch`. */
    async begin(patch: (plans: AdminPlan[]) => AdminPlan[]) {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<AdminPlan[]>(key);
      if (previous) queryClient.setQueryData<AdminPlan[]>(key, patch(previous));
      return { previous };
    },
    restore(context: { previous: AdminPlan[] | undefined } | undefined) {
      if (context?.previous) queryClient.setQueryData<AdminPlan[]>(key, context.previous);
    },
    replace(match: (plan: AdminPlan) => boolean, plan: AdminPlan) {
      queryClient.setQueryData<AdminPlan[]>(key, (plans) => plans?.map((entry) => (match(entry) ? plan : entry)));
    },
    settle() {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  };
}

/** Adds a plan. The new row appears at once with a temporary negative id, then the server's row replaces it. */
export function useCreatePlan() {
  const cache = usePlanCache();
  return useMutation({
    mutationFn: async (input: CreatePlanInput) => (await api.createPlan(input)).plan,
    onMutate: async (input) => {
      const tempId = -Date.now();
      const context = await cache.begin((plans) =>
        [...plans, { ...input, planId: tempId, activeSubscribers: 0, totalSubscriptions: 0 }].sort(byPrice),
      );
      return { ...context, tempId };
    },
    onError: (error, _input, context) => {
      cache.restore(context);
      toast.error("Couldn't add the plan", { description: messageOf(error) });
    },
    onSuccess: (plan, _input, context) => {
      cache.replace((entry) => entry.planId === context.tempId, plan);
      toast.success(`Added the ${plan.name} plan`);
    },
    onSettled: cache.settle,
  });
}

/** Edits a plan; the row changes at once and is replaced by the server's row (with real counts) on success. */
export function useUpdatePlan() {
  const cache = usePlanCache();
  return useMutation({
    mutationFn: async ({ planId, changes }: { planId: number; changes: UpdatePlanInput }) =>
      (await api.updatePlan(planId, changes)).plan,
    onMutate: ({ planId, changes }) =>
      cache.begin((plans) =>
        plans.map((plan) => (plan.planId === planId ? { ...plan, ...changes } : plan)).sort(byPrice),
      ),
    onError: (error, _variables, context) => {
      cache.restore(context);
      toast.error("Couldn't save the plan", { description: messageOf(error) });
    },
    onSuccess: (plan) => {
      cache.replace((entry) => entry.planId === plan.planId, plan);
      toast.success(`Saved the ${plan.name} plan`);
    },
    onSettled: cache.settle,
  });
}

/**
 * Deletes a plan. The row leaves the list at once; a 409 PLAN_IN_USE (subscriptions still reference it)
 * puts it back and rejects, so the dialog can show the message inline.
 */
export function useDeletePlan() {
  const cache = usePlanCache();
  return useMutation({
    mutationFn: (planId: number) => api.deletePlan(planId),
    onMutate: (planId) => cache.begin((plans) => plans.filter((plan) => plan.planId !== planId)),
    onError: (error, _planId, context) => {
      cache.restore(context);
      toast.error("Couldn't delete the plan", { description: messageOf(error) });
    },
    onSuccess: () => {
      toast.success("Plan deleted");
    },
    onSettled: cache.settle,
  });
}
