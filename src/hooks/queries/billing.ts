"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { queryKeys } from "@/lib/api/query-keys";
import type { ChangePlanInput, CheckoutOrder, SubscriptionWithPlan, VerifyPaymentInput } from "@/types";

/** After a verified payment, check GET /api/account this many times, this far apart, for the ACTIVE plan. */
const POLL_ATTEMPTS = 5;
const POLL_INTERVAL_MS = 2000;

/** Creates the Razorpay order for a plan (POST /api/account/subscriptions). */
export function useStartCheckout() {
  return useMutation<CheckoutOrder, Error, ChangePlanInput>({
    mutationFn: (input) => api.startCheckout(input),
  });
}

/** Has the server check Checkout's success response; refreshes cached account data on success. */
export function useVerifyPayment() {
  const queryClient = useQueryClient();
  return useMutation<{ verified: true }, Error, VerifyPaymentInput>({
    mutationFn: (input) => api.verifyPayment(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.account.all }),
  });
}

function isActivated(
  subscription: SubscriptionWithPlan | null | undefined,
  subscriptionId: number | null,
): subscription is SubscriptionWithPlan {
  return subscription?.subscriptionId === subscriptionId && subscription?.status === "ACTIVE";
}

/**
 * Polls GET /api/account until this checkout's subscription is ACTIVE. `settled` flips once it is, or after
 * POLL_ATTEMPTS checks without it; a dropped request mid-poll just counts as an attempt. Pass null to stay idle.
 */
export function useActivationPoll(subscriptionId: number | null): {
  subscription: SubscriptionWithPlan | null;
  settled: boolean;
} {
  const queryClient = useQueryClient();
  const key = queryKeys.account.activation(subscriptionId ?? -1);
  const query = useQuery({
    queryKey: key,
    queryFn: () => api.getAccount(),
    enabled: subscriptionId !== null,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    refetchOnMount: "always",
    select: ({ subscription }) => (isActivated(subscription, subscriptionId) ? subscription : null),
    refetchInterval: (q) =>
      !isActivated(q.state.data?.subscription, subscriptionId) &&
      q.state.dataUpdateCount + q.state.errorUpdateCount < POLL_ATTEMPTS
        ? POLL_INTERVAL_MS
        : false,
  });

  const subscription = query.data ?? null;
  // Read the attempt count off the cache entry; touching these two fields re-renders on each finished check.
  void query.dataUpdatedAt;
  void query.errorUpdatedAt;
  const state = queryClient.getQueryState(key);
  const attempts = (state?.dataUpdateCount ?? 0) + (state?.errorUpdateCount ?? 0);
  return { subscription, settled: subscription !== null || attempts >= POLL_ATTEMPTS };
}
