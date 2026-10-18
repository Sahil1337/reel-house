"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, Delete02Icon } from "@hugeicons/core-free-icons";

import { SqlPreview } from "@/components/admin/sql-preview";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useContentImpact, useDeleteContent } from "@/hooks/queries/admin-content";
import { ApiError } from "@/lib/api/client";
import { formatYear } from "@/lib/format";
import { buildDeleteContentSql, CASCADE_RULES } from "@/lib/sql/admin-content";
import type { AdminContentRow, ContentDeletionImpact } from "@/types";

/**
 * Confirm removing a title: shows what the delete cascades to (counted live), the DELETE that runs, and what
 * stays. Controlled by the table: `row` is the title being removed, null when closed.
 */
export function RemoveContentDialog({
  row,
  onOpenChange,
}: {
  row: AdminContentRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  // Keep the last title while the closing animation plays, so the text doesn't blank out.
  const [shown, setShown] = useState(row);
  if (row && row !== shown) setShown(row);

  return (
    <AlertDialog open={row !== null} onOpenChange={(open) => onOpenChange(open)}>
      <AlertDialogPopup className="sm:max-w-2xl">
        {shown ? <RemoveBody key={shown.contentId} row={shown} onClose={() => onOpenChange(false)} /> : null}
      </AlertDialogPopup>
    </AlertDialog>
  );
}

function RemoveBody({ row, onClose }: { row: AdminContentRow; onClose: () => void }) {
  const impact = useContentImpact(row.contentId);
  const remove = useDeleteContent();
  const removing = remove.isPending;

  const year = formatYear(row.releaseDate);
  const kind = row.contentType === "MOVIE" ? "Movie" : "Series";
  const statements = buildDeleteContentSql(row.contentId, row.title);

  return (
    <>
      <AlertDialogHeader>
        <AlertDialogTitle>Remove &ldquo;{row.title}&rdquo;?</AlertDialogTitle>
        <AlertDialogDescription>
          {[kind, year].filter(Boolean).join(" · ")}. This deletes the title and everything linked to it, for every
          profile. It can&rsquo;t be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 pb-6">
        <ImpactTable impact={impact.data} loading={impact.isPending} />
        {impact.isError ? (
          <p role="alert" className="flex flex-wrap items-center gap-x-2 text-sm text-destructive-foreground">
            <HugeiconsIcon icon={Alert02Icon} strokeWidth={2} className="size-4 shrink-0" />
            {impact.error instanceof ApiError ? impact.error.message : "Couldn't count what would be removed."}
            <Button variant="link" size="xs" className="h-auto p-0" onClick={() => void impact.refetch()}>
              Try again
            </Button>
          </p>
        ) : null}

        <SqlPreview
          statements={statements}
          notes={[
            <>
              One statement is atomic: the title and every row below it go together or not at all, so no transaction is
              needed.
            </>,
            <>
              The cascade follows <code className="font-mono">ON DELETE CASCADE</code> on content_genre, content_credit,
              season (episodes go with their season), watch_history, my_list, rating and recommendation.
            </>,
            <>
              Person and genre rows are shared, so they stay. People credited only on this title remain in the database
              without a credit.
            </>,
            <>
              Irreversible: there is no soft delete. Importing the title from TMDB again creates a new row with a new id
              and none of this history.
            </>,
          ]}
        />
      </div>

      <AlertDialogFooter>
        <AlertDialogClose render={<Button variant="ghost" disabled={removing} />}>Keep title</AlertDialogClose>
        <Button
          variant="destructive"
          loading={removing}
          disabled={!impact.data}
          onClick={() => remove.mutate({ contentId: row.contentId, title: row.title }, { onSuccess: onClose })}
        >
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
          Remove title
        </Button>
      </AlertDialogFooter>
    </>
  );
}

/** "Rows this deletes": one line per child table, non-zero counts highlighted, with a total. */
function ImpactTable({ impact, loading }: { impact: ContentDeletionImpact | undefined; loading: boolean }) {
  const total = impact ? Object.values(impact.counts).reduce((sum, count) => sum + count, 0) : 0;

  return (
    <section className="flex flex-col gap-2" aria-busy={loading}>
      <h3 className="text-sm font-medium">Rows this deletes along with the title</h3>
      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <caption className="sr-only">Rows removed per table</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Table</th>
              <th scope="col">Holds</th>
              <th scope="col">Rows</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {CASCADE_RULES.map((rule) => {
              const count = impact?.counts[rule.table];
              return (
                <tr key={rule.table}>
                  <th scope="row" className="w-40 px-3 py-2 text-left align-top font-mono text-xs font-medium">
                    {rule.table}
                  </th>
                  <td className="px-3 py-2 text-xs text-muted-foreground">{rule.holds}</td>
                  <td className="w-24 px-3 py-2 text-right tabular-nums">
                    {count === undefined ? (
                      <Skeleton className="ms-auto h-4 w-10" />
                    ) : count === 0 ? (
                      <span className="text-muted-foreground">nothing</span>
                    ) : (
                      <span className="font-medium text-destructive-foreground">{count.toLocaleString("en-IN")}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/40">
              <th scope="row" colSpan={2} className="px-3 py-2 text-left text-xs font-medium">
                Total in other tables
              </th>
              <td className="px-3 py-2 text-right font-medium tabular-nums">
                {impact ? total.toLocaleString("en-IN") : <Skeleton className="ms-auto h-4 w-10" />}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
