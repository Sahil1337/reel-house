"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api/client";

/** Cancels an ACTIVE subscription, then re-renders the account page with the new status. */
export function CancelSubscriptionButton({
  subscriptionId,
  label = "Cancel",
}: {
  subscriptionId: number;
  label?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onCancel() {
    setLoading(true);
    try {
      await api.cancelSubscription(subscriptionId);
      toast.success("Subscription cancelled");
      router.refresh();
    } catch (error) {
      toast.error("Couldn't cancel", {
        description: error instanceof ApiError ? error.message : "Something went wrong. Try again.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="ghost" size="sm" onClick={onCancel} loading={loading}>
      {label}
    </Button>
  );
}
