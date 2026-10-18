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
import { useSubscriptionAction } from "@/hooks/queries/admin-subscriptions";
import { ApiError } from "@/lib/api/client";
import { formatDate } from "@/lib/format";
import { buildCancelSubscriptionSql } from "@/lib/sql/admin-subscriptions";
import type { AdminSubscriptionRow } from "@/types";

import { CONSTRAINT_NOTES, SubscriptionSummary } from "./subscription-summary";

/** Cancels an ACTIVE subscription now: status CANCELLED, end_date = now() (no refund, payments untouched). */
export function CancelSubscriptionDialog({
  open,
  onOpenChange,
  row,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  row: AdminSubscriptionRow | null;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogPopup className="max-w-2xl">
        {row ? <CancelBody row={row} onDone={() => onOpenChange(false)} /> : null}
      </AlertDialogPopup>
    </AlertDialog>
  );
}

function CancelBody({ row, onDone }: { row: AdminSubscriptionRow; onDone: () => void }) {
  const action = useSubscriptionAction();
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setError(null);
    try {
      await action.mutateAsync({ subscriptionId: row.subscriptionId, action: { action: "cancel" } });
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
        <AlertDialogTitle>Cancel this subscription?</AlertDialogTitle>
        <AlertDialogDescription>
          {row.userName} loses access now instead of on {formatDate(row.endDate)}. No refund is issued and their payment
          history stays as it is.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <ScrollArea overscrollContain>
        <div className="flex flex-col gap-4 px-6 pb-6">
          <SubscriptionSummary row={row} />
          {error ? <FormAlert>{error}</FormAlert> : null}
          <SqlPreview
            statements={buildCancelSubscriptionSql(row.subscriptionId)}
            notes={[
              <>
                <code className="font-mono">end_date</code> becomes <code className="font-mono">now()</code>, not NULL.
                The paid period already started, so <code className="font-mono">end_date &gt; start_date</code> still
                holds; it would only fail if <code className="font-mono">start_date</code> were in the future.
              </>,
              ...CONSTRAINT_NOTES,
            ]}
          />
        </div>
      </ScrollArea>

      <AlertDialogFooter>
        <AlertDialogClose render={<Button variant="ghost" />}>Keep subscription</AlertDialogClose>
        <Button variant="destructive" loading={action.isPending} onClick={() => void confirm()}>
          Cancel subscription
        </Button>
      </AlertDialogFooter>
    </>
  );
}
