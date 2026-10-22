"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, Delete02Icon, PencilEdit01Icon, Tag01Icon } from "@hugeicons/core-free-icons";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdminPlans } from "@/hooks/queries/admin-plans";
import { formatCurrency } from "@/lib/format";
import type { AdminPlan } from "@/types";

import { DeletePlanDialog } from "./delete-plan-dialog";
import { PlanFormDialog } from "./plan-form-dialog";

/** Dialog open state is kept apart from the plan it shows, so the plan doesn't vanish mid close animation. */
interface DialogState<T> {
  open: boolean;
  plan: T;
}

/**
 * The Plans page: every plan with how many subscribers it has, an Add plan button and Edit / Delete per row.
 * The list is the server-rendered one at first, then lives in the TanStack Query cache so writes show up
 * at once (optimistic updates, see hooks/queries/admin-plans.ts).
 */
export function PlansView({ initialPlans }: { initialPlans: AdminPlan[] }) {
  const { data: plans = initialPlans, isError, refetch } = useAdminPlans(initialPlans);
  const [form, setForm] = useState<DialogState<AdminPlan | null>>({ open: false, plan: null });
  const [removal, setRemoval] = useState<DialogState<AdminPlan | null>>({ open: false, plan: null });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {plans.length} {plans.length === 1 ? "plan" : "plans"}, cheapest first
        </p>
        <Button onClick={() => setForm({ open: true, plan: null })}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
          Add plan
        </Button>
      </div>

      {isError ? (
        <p role="alert" className="text-sm text-destructive-foreground">
          Couldn&apos;t refresh the plans.{" "}
          <button type="button" className="underline underline-offset-4" onClick={() => void refetch()}>
            Try again
          </button>
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border bg-card shadow-xs/5">
        <div className="overflow-x-auto">
          <Table className="min-w-[44rem]">
            <TableHeader>
              <TableRow>
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Price / month</TableHead>
                <TableHead>Video quality</TableHead>
                <TableHead className="text-right">Max devices</TableHead>
                <TableHead className="text-right">Max profiles</TableHead>
                <TableHead className="text-right">Active subscribers</TableHead>
                <TableHead className="text-right">All subscriptions</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8}>
                    <Empty className="py-10 md:py-12">
                      <EmptyHeader>
                        <EmptyMedia variant="icon">
                          <HugeiconsIcon icon={Tag01Icon} strokeWidth={2} />
                        </EmptyMedia>
                        <EmptyTitle>No plans yet</EmptyTitle>
                        <EmptyDescription>Add a plan so customers have something to subscribe to.</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              ) : (
                plans.map((plan) => (
                  <PlanRow
                    key={plan.planId}
                    plan={plan}
                    onEdit={() => setForm({ open: true, plan })}
                    onDelete={() => setRemoval({ open: true, plan })}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <p className="max-w-3xl text-xs leading-relaxed text-muted-foreground">
        A plan with any subscription, even an expired one, can&apos;t be deleted: <code>subscription.plan_id</code> is{" "}
        <code>ON DELETE RESTRICT</code>, so billing history keeps pointing at a real plan.
      </p>

      <PlanFormDialog
        open={form.open}
        plan={form.plan}
        onOpenChange={(open) => setForm((current) => ({ ...current, open }))}
      />
      <DeletePlanDialog
        open={removal.open}
        plan={removal.plan}
        onOpenChange={(open) => setRemoval((current) => ({ ...current, open }))}
      />
    </>
  );
}

function PlanRow({ plan, onEdit, onDelete }: { plan: AdminPlan; onEdit: () => void; onDelete: () => void }) {
  // A row added optimistically has a temporary negative id until the server answers.
  const saving = plan.planId < 0;
  return (
    <TableRow className={saving ? "opacity-64" : undefined}>
      <TableCell className="font-medium">{plan.name}</TableCell>
      <TableCell className="text-right tabular-nums">{formatCurrency(plan.priceMonthly)}</TableCell>
      <TableCell>
        <Badge variant="outline">{plan.videoQuality}</Badge>
      </TableCell>
      <TableCell className="text-right tabular-nums">{plan.maxDevices}</TableCell>
      <TableCell className="text-right tabular-nums">{plan.maxProfiles}</TableCell>
      <TableCell className="text-right tabular-nums">{plan.activeSubscribers.toLocaleString("en-IN")}</TableCell>
      <TableCell className="text-right tabular-nums text-muted-foreground">
        {plan.totalSubscriptions.toLocaleString("en-IN")}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" disabled={saving} onClick={onEdit} aria-label={`Edit ${plan.name}`}>
            <HugeiconsIcon icon={PencilEdit01Icon} strokeWidth={2} />
            Edit
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={saving}
            onClick={onDelete}
            aria-label={`Delete ${plan.name}`}
            className="text-destructive-foreground hover:bg-destructive/8"
          >
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
            Delete
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
