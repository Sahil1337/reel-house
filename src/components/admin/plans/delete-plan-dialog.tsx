"use client";

import { useState } from "react";

import { SqlPreview } from "@/components/admin/sql-preview";
import { FormAlert } from "@/components/auth/form-alert";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogPopup,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDeletePlan } from "@/hooks/queries/admin-plans";
import { ApiError } from "@/lib/api/client";
import { buildDeletePlanSql } from "@/lib/sql/admin-plans";
import type { AdminPlan } from "@/types";

const plural = (count: number, word: string) => `${count.toLocaleString("en-IN")} ${word}${count === 1 ? "" : "s"}`;

/**
 * Delete plan. A plan with subscriptions can't be deleted (subscription.plan_id is ON DELETE RESTRICT), but
 * the button stays enabled on purpose: pressing it sends the real DELETE and shows the 409 the API answers
 * with, which is the constraint at work.
 */
export function DeletePlanDialog({
  open,
  onOpenChange,
  plan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: AdminPlan | null;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogPopup className="max-w-2xl">
        {plan ? <DeletePlanBody plan={plan} onDone={() => onOpenChange(false)} /> : null}
      </AlertDialogPopup>
    </AlertDialog>
  );
}

function DeletePlanBody({ plan, onDone }: { plan: AdminPlan; onDone: () => void }) {
  const deletePlan = useDeletePlan();
  const [error, setError] = useState<string | null>(null);
  const inUse = plan.totalSubscriptions > 0;

  async function confirm() {
    setError(null);
    try {
      await deletePlan.mutateAsync(plan.planId);
      onDone();
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "Something went wrong. Check your connection and try again.",
      );
    }
  }

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete {plan.name}?</AlertDialogTitle>
        <AlertDialogDescription>
          {inUse
            ? `${plural(plan.totalSubscriptions, "subscription")} (${plan.activeSubscribers.toLocaleString("en-IN")} active) still use this plan, so the database will refuse. Press Delete to see the 409 it returns.`
            : "No subscription has ever used this plan, so the delete goes through."}
        </AlertDialogDescription>
      </AlertDialogHeader>

      <ScrollArea overscrollContain>
        <div className="flex flex-col gap-4 px-6 pb-6">
          {error ? <FormAlert>{error}</FormAlert> : null}
          <SqlPreview
            statements={buildDeletePlanSql(plan.planId, plan.totalSubscriptions)}
            notes={[
              <>
                <code className="font-mono">subscription.plan_id</code> references{" "}
                <code className="font-mono">subscription_plan</code> with{" "}
                <code className="font-mono">ON DELETE RESTRICT</code>: any subscription row, in any status, blocks the
                delete. Billing history needs its plan, so it is never cascaded or nulled.
              </>,
              "The API catches the foreign-key error (23503) instead of counting first, so a subscription created a moment ago can't slip through; the count only fills in the message.",
              "Deleting a plan never touches payment rows.",
            ]}
          />
        </div>
      </ScrollArea>

      <AlertDialogFooter>
        <AlertDialogClose render={<Button variant="ghost" />}>Cancel</AlertDialogClose>
        <Button variant="destructive" loading={deletePlan.isPending} onClick={() => void confirm()}>
          Delete plan
        </Button>
      </AlertDialogFooter>
    </>
  );
}
