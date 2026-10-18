"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";

import { SqlPreview } from "@/components/admin/sql-preview";
import { FormAlert } from "@/components/auth/form-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminPlans } from "@/hooks/queries/admin-plans";
import { useSubscriptionAction } from "@/hooks/queries/admin-subscriptions";
import { ApiError } from "@/lib/api/client";
import { formatCurrency } from "@/lib/format";
import { buildChangePlanSql } from "@/lib/sql/admin-subscriptions";
import type { AdminSubscriptionRow } from "@/types";

import { CONSTRAINT_NOTES, SubscriptionSummary } from "./subscription-summary";

/** Admin override: moves an ACTIVE subscription to another plan with no payment and the dates unchanged. */
export function ChangePlanDialog({
  open,
  onOpenChange,
  row,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: AdminSubscriptionRow | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl">
        {row ? <ChangePlanForm row={row} onDone={() => onOpenChange(false)} /> : null}
      </DialogPopup>
    </Dialog>
  );
}

function ChangePlanForm({ row, onDone }: { row: AdminSubscriptionRow; onDone: () => void }) {
  const plans = useAdminPlans();
  const action = useSubscriptionAction();
  const [planId, setPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const options = plans.data ?? [];
  const items = options.map((plan) => ({
    value: String(plan.planId),
    label: `${plan.name} · ${formatCurrency(plan.priceMonthly)} / month`,
  }));
  const target = options.find((plan) => String(plan.planId) === planId) ?? null;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!target || action.isPending) return;
    setError(null);
    try {
      await action.mutateAsync({
        subscriptionId: row.subscriptionId,
        action: { action: "change_plan", planId: target.planId },
      });
      onDone();
    } catch (cause) {
      setError(
        cause instanceof ApiError ? cause.message : "Something went wrong. Check your connection and try again.",
      );
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle>Change plan</DialogTitle>
        <DialogDescription>
          An admin override for {row.userName}: no payment is recorded and the dates stay as they are.
        </DialogDescription>
      </DialogHeader>

      <DialogPanel className="flex flex-col gap-6">
        <SubscriptionSummary row={row} />

        <Field name="planId">
          <FieldLabel>New plan</FieldLabel>
          <Select
            items={items}
            value={planId}
            onValueChange={(value) => {
              setPlanId(value);
              setError(null);
            }}
            disabled={plans.isPending}
          >
            <SelectTrigger>
              <SelectValue placeholder={plans.isPending ? "Loading plans…" : "Pick a plan"} />
            </SelectTrigger>
            <SelectPopup>
              {options.map((plan) => (
                <SelectItem key={plan.planId} value={String(plan.planId)} disabled={plan.planId === row.planId}>
                  {plan.name} · {formatCurrency(plan.priceMonthly)} / month
                  {plan.planId === row.planId ? " (current)" : ""}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
          {plans.isError ? <FormAlert>Couldn&apos;t load the plans. Close this and try again.</FormAlert> : null}
        </Field>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm" aria-live="polite">
          <span className="font-medium">{row.planName}</span>
          <span className="text-muted-foreground tabular-nums">{formatCurrency(row.planPriceMonthly)} / month</span>
          <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-4 text-muted-foreground" />
          {target ? (
            <>
              <span className="font-medium">{target.name}</span>
              <span className="text-muted-foreground tabular-nums">{formatCurrency(target.priceMonthly)} / month</span>
            </>
          ) : (
            <span className="text-muted-foreground">pick a plan</span>
          )}
        </div>

        {error ? <FormAlert>{error}</FormAlert> : null}

        <SqlPreview
          statements={buildChangePlanSql(row.subscriptionId, target?.planId ?? null)}
          notes={[
            "Admin override: no payment row is recorded and start_date / end_date don't move. The new plan's price applies from the next renewal; its video quality and device limit apply straight away.",
            <>
              <code className="font-mono">plan_id</code> is a foreign key to{" "}
              <code className="font-mono">subscription_plan</code>: a plan that doesn&apos;t exist is refused (23503,
              answered as 404). <code className="font-mono">plan_id &lt;&gt; $2</code> turns a move to the same plan
              into a 409.
            </>,
            ...CONSTRAINT_NOTES,
          ]}
        />
      </DialogPanel>

      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button type="submit" loading={action.isPending} disabled={!target}>
          {target ? `Move to ${target.name}` : "Change plan"}
        </Button>
      </DialogFooter>
    </form>
  );
}
