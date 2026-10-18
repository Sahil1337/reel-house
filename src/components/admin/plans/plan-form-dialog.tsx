"use client";

import { useState } from "react";

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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreatePlan, useUpdatePlan } from "@/hooks/queries/admin-plans";
import { ApiError } from "@/lib/api/client";
import { buildCreatePlanSql, buildUpdatePlanSql } from "@/lib/sql/admin-plans";
import { planSchema, VIDEO_QUALITIES } from "@/lib/validation/admin";
import type { AdminPlan, UpdatePlanInput } from "@/types";

type FieldName = "name" | "priceMonthly" | "videoQuality" | "maxDevices";

const QUALITY_ITEMS = VIDEO_QUALITIES.map((quality) => ({ value: quality, label: quality }));

/** Add plan (plan = null) and Edit plan in one dialog. The form state resets every time it opens. */
export function PlanFormDialog({
  open,
  onOpenChange,
  plan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan: AdminPlan | null;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl">
        <PlanForm plan={plan} onDone={() => onOpenChange(false)} />
      </DialogPopup>
    </Dialog>
  );
}

function PlanForm({ plan, onDone }: { plan: AdminPlan | null; onDone: () => void }) {
  const editing = plan !== null;
  const [name, setName] = useState(plan?.name ?? "");
  const [price, setPrice] = useState(plan ? String(plan.priceMonthly) : "");
  const [quality, setQuality] = useState<string>(plan?.videoQuality ?? VIDEO_QUALITIES[0]);
  const [devices, setDevices] = useState(plan ? String(plan.maxDevices) : "");
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<{ message: string; code?: string } | null>(null);

  const createPlan = useCreatePlan();
  const updatePlan = useUpdatePlan();
  const pending = createPlan.isPending || updatePlan.isPending;

  // Validation: the same schema the API uses. An empty box is "missing", not 0 (z.coerce would turn "" into 0).
  const parsed = planSchema.safeParse({
    name,
    priceMonthly: price.trim() === "" ? undefined : price,
    videoQuality: quality,
    maxDevices: devices.trim() === "" ? undefined : devices,
  });
  const issues: Partial<Record<FieldName, string>> = {};
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] as FieldName;
      issues[field] ??= issue.message;
    }
  }
  const nameTaken = serverError?.code === "PLAN_NAME_TAKEN";
  const errorFor = (field: FieldName) =>
    (touched[field] || submitted ? issues[field] : undefined) ??
    (field === "name" && nameTaken ? serverError.message : undefined);

  // The SQL follows whatever is typed, valid or not (unusable values show as NULL).
  const draftPrice = price.trim() === "" ? undefined : Number(price);
  const draftDevices = devices.trim() === "" ? undefined : Number(devices);
  const draft = { name: name.trim(), priceMonthly: draftPrice, videoQuality: quality, maxDevices: draftDevices };

  const changes: UpdatePlanInput = {};
  if (plan) {
    if (draft.name !== plan.name) changes.name = draft.name;
    if (draftPrice !== undefined && Number.isFinite(draftPrice) && draftPrice !== plan.priceMonthly) {
      changes.priceMonthly = draftPrice;
    }
    if (quality !== plan.videoQuality) changes.videoQuality = quality as UpdatePlanInput["videoQuality"];
    if (draftDevices !== undefined && Number.isFinite(draftDevices) && draftDevices !== plan.maxDevices) {
      changes.maxDevices = draftDevices;
    }
  }
  const unchanged = editing && Object.keys(changes).length === 0;

  const statements = plan ? buildUpdatePlanSql(plan.planId, changes) : buildCreatePlanSql(draft);

  const edit = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setServerError(null);
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!parsed.success || pending) return;
    setServerError(null);
    try {
      if (plan) {
        const real: UpdatePlanInput = {};
        if (parsed.data.name !== plan.name) real.name = parsed.data.name;
        if (parsed.data.priceMonthly !== plan.priceMonthly) real.priceMonthly = parsed.data.priceMonthly;
        if (parsed.data.videoQuality !== plan.videoQuality) real.videoQuality = parsed.data.videoQuality;
        if (parsed.data.maxDevices !== plan.maxDevices) real.maxDevices = parsed.data.maxDevices;
        if (Object.keys(real).length === 0) return;
        await updatePlan.mutateAsync({ planId: plan.planId, changes: real });
      } else {
        await createPlan.mutateAsync(parsed.data);
      }
      onDone();
    } catch (error) {
      setServerError(
        error instanceof ApiError
          ? { message: error.message, code: error.code }
          : { message: "Something went wrong. Check your connection and try again." },
      );
    }
  }

  const notes: React.ReactNode[] = plan
    ? [
        <>
          A price change does <strong className="font-medium text-foreground">not</strong> touch past{" "}
          <code className="font-mono">payment.amount</code>: that column records what was charged, whatever the plan
          cost then.
        </>,
        <>
          The {plan.activeSubscribers.toLocaleString("en-IN")} active subscriber
          {plan.activeSubscribers === 1 ? "" : "s"} keep this plan (their <code className="font-mono">plan_id</code>{" "}
          doesn&apos;t change); the new price applies from their next renewal or checkout.
        </>,
        "Video quality and max devices are read from the plan, so a change applies to everyone on it straight away.",
        <>
          <code className="font-mono">UNIQUE (name)</code> refuses a duplicate name (23505, shown as a 409); the CHECKs
          keep <code className="font-mono">price_monthly &gt;= 0</code> and{" "}
          <code className="font-mono">max_devices &gt; 0</code>.
        </>,
      ]
    : [
        <>
          <code className="font-mono">UNIQUE (name)</code> refuses a duplicate name (23505, shown as a 409). The
          database decides, not a SELECT first, so two admins can&apos;t both add &quot;Family&quot;.
        </>,
        <>
          <code className="font-mono">CHECK (price_monthly &gt;= 0)</code> and{" "}
          <code className="font-mono">CHECK (max_devices &gt; 0)</code> back up the form&apos;s validation.
        </>,
        "A new plan has no subscriptions yet, so it can be deleted until someone subscribes (ON DELETE RESTRICT).",
      ];

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <DialogHeader>
        <DialogTitle>{editing ? `Edit ${plan.name}` : "Add plan"}</DialogTitle>
        <DialogDescription>
          {editing
            ? "Only the fields you change are sent."
            : "A plan sets the price and what a subscriber gets. The SQL below updates as you type."}
        </DialogDescription>
      </DialogHeader>

      <DialogPanel className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="name" invalid={Boolean(errorFor("name"))} className="sm:col-span-2">
            <FieldLabel>Name</FieldLabel>
            <Input
              value={name}
              maxLength={80}
              autoComplete="off"
              placeholder="Family"
              onChange={(event) => edit(setName)(event.target.value)}
              onBlur={() => setTouched((current) => ({ ...current, name: true }))}
            />
            <FieldError match={Boolean(errorFor("name"))}>{errorFor("name")}</FieldError>
          </Field>

          <Field name="priceMonthly" invalid={Boolean(errorFor("priceMonthly"))}>
            <FieldLabel>Price per month (INR)</FieldLabel>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={price}
              placeholder="499"
              onChange={(event) => edit(setPrice)(event.target.value)}
              onBlur={() => setTouched((current) => ({ ...current, priceMonthly: true }))}
            />
            <FieldError match={Boolean(errorFor("priceMonthly"))}>{errorFor("priceMonthly")}</FieldError>
          </Field>

          <Field name="maxDevices" invalid={Boolean(errorFor("maxDevices"))}>
            <FieldLabel>Max devices</FieldLabel>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={devices}
              placeholder="2"
              onChange={(event) => edit(setDevices)(event.target.value)}
              onBlur={() => setTouched((current) => ({ ...current, maxDevices: true }))}
            />
            <FieldError match={Boolean(errorFor("maxDevices"))}>{errorFor("maxDevices")}</FieldError>
          </Field>

          <Field name="videoQuality" invalid={Boolean(errorFor("videoQuality"))} className="sm:col-span-2">
            <FieldLabel>Video quality</FieldLabel>
            <Select
              items={QUALITY_ITEMS}
              value={quality}
              onValueChange={(value) => {
                if (value) edit(setQuality)(value);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectPopup>
                {QUALITY_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectPopup>
            </Select>
            <FieldDescription>Stored in subscription_plan.video_quality (VARCHAR(10)).</FieldDescription>
          </Field>
        </div>

        {serverError && !nameTaken ? <FormAlert>{serverError.message}</FormAlert> : null}

        {unchanged ? (
          <>
            <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
              Nothing changed yet. Edit a field and the UPDATE appears here.
            </p>
            <SqlNotesOnly notes={notes} />
          </>
        ) : (
          <SqlPreview statements={statements} notes={notes} />
        )}
      </DialogPanel>

      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button type="submit" loading={pending} disabled={unchanged}>
          {editing ? "Save changes" : "Add plan"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function SqlNotesOnly({ notes }: { notes: React.ReactNode[] }) {
  return (
    <ul className="flex list-disc flex-col gap-1 ps-4 text-xs leading-relaxed text-pretty text-muted-foreground marker:text-muted-foreground/50">
      {notes.map((note, index) => (
        <li key={index}>{note}</li>
      ))}
    </ul>
  );
}
