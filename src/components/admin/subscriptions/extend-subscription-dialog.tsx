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
import { addMonthsIso, useSubscriptionAction } from "@/hooks/queries/admin-subscriptions";
import { ApiError } from "@/lib/api/client";
import { formatDate } from "@/lib/format";
import { buildExtendSubscriptionSql } from "@/lib/sql/admin-subscriptions";
import { extendMonthsSchema, MAX_EXTEND_MONTHS } from "@/lib/validation/admin";
import type { AdminSubscriptionRow } from "@/types";

import { CONSTRAINT_NOTES, SubscriptionSummary } from "./subscription-summary";

/** Adds whole months to an ACTIVE subscription's end_date, for free (no payment row). */
export function ExtendSubscriptionDialog({
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
        {row ? <ExtendForm row={row} onDone={() => onOpenChange(false)} /> : null}
      </DialogPopup>
    </Dialog>
  );
}

function ExtendForm({ row, onDone }: { row: AdminSubscriptionRow; onDone: () => void }) {
  const action = useSubscriptionAction();
  const [months, setMonths] = useState("1");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = extendMonthsSchema.safeParse(months.trim() === "" ? undefined : months);
  const validationError = !parsed.success ? parsed.error.issues[0]?.message : undefined;
  const count = parsed.success ? parsed.data : null;
  const newEnd = row.endDate && count !== null ? addMonthsIso(row.endDate, count) : null;
  const lapsed = row.endDate !== null && row.endDate < new Date().toISOString();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (count === null || action.isPending) return;
    setError(null);
    try {
      await action.mutateAsync({ subscriptionId: row.subscriptionId, action: { action: "extend", months: count } });
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
        <DialogTitle>Extend subscription</DialogTitle>
        <DialogDescription>
          Gives {row.userName} extra months at no charge. Nothing is recorded as a payment.
        </DialogDescription>
      </DialogHeader>

      <DialogPanel className="flex flex-col gap-6">
        <SubscriptionSummary row={row} />

        <Field name="months" invalid={touched && Boolean(validationError)}>
          <FieldLabel>Months to add</FieldLabel>
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_EXTEND_MONTHS}
            step={1}
            value={months}
            className="sm:max-w-40"
            onChange={(event) => {
              setMonths(event.target.value);
              setError(null);
            }}
            onBlur={() => setTouched(true)}
          />
          <FieldDescription>Whole months, 1 to {MAX_EXTEND_MONTHS} at a time.</FieldDescription>
          <FieldError match={touched && Boolean(validationError)}>{validationError}</FieldError>
        </Field>

        <p className="text-sm tabular-nums" aria-live="polite">
          <span className="text-muted-foreground">Paid until </span>
          <span className="font-medium">{formatDate(row.endDate)}</span>
          <span className="text-muted-foreground"> becomes </span>
          <span className="font-medium">{newEnd ? formatDate(newEnd) : "—"}</span>
        </p>
        {lapsed ? (
          <p className="-mt-3 text-xs text-muted-foreground">
            This period already lapsed but the row is still ACTIVE, so the months are added on top of the old end date;
            the customer may still be expired afterwards.
          </p>
        ) : null}

        {error ? <FormAlert>{error}</FormAlert> : null}

        <SqlPreview
          statements={buildExtendSubscriptionSql(row.subscriptionId, count ?? Number.NaN)}
          notes={[
            <>
              <code className="font-mono">make_interval(months =&gt; n)</code> adds calendar months (Jan 31 + 1 month =
              Feb 28 or 29). Running it twice adds twice, so it isn&apos;t idempotent.
            </>,
            ...CONSTRAINT_NOTES,
          ]}
        />
      </DialogPanel>

      <DialogFooter>
        <DialogClose render={<Button variant="ghost" />}>Cancel</DialogClose>
        <Button type="submit" loading={action.isPending} disabled={count === null}>
          Extend by {count ?? "…"} {count === 1 ? "month" : "months"}
        </Button>
      </DialogFooter>
    </form>
  );
}
