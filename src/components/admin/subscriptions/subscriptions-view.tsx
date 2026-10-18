"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDataTransferHorizontalIcon,
  Calendar03Icon,
  Cancel01Icon,
  CreditCardIcon,
  MoreHorizontalIcon,
  Search01Icon,
  SourceCodeIcon,
} from "@hugeicons/core-free-icons";

import { AdminPagination } from "@/components/admin/admin-pagination";
import { SqlPreview } from "@/components/admin/sql-preview";
import { SubscriptionStatusBadge } from "@/components/account/status-badges";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogPanel, DialogPopup, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAdminSubscriptions } from "@/hooks/queries/admin-subscriptions";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ApiError } from "@/lib/api/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { buildListSubscriptionsSql } from "@/lib/sql/admin-subscriptions";
import { ADMIN_PAGE_SIZE, SUBSCRIPTION_STATUSES } from "@/lib/validation/admin";
import { cn } from "@/lib/utils";
import type { AdminSubscriptionFilters, AdminSubscriptionRow, SubscriptionStatus } from "@/types";

import { CancelSubscriptionDialog } from "./cancel-subscription-dialog";
import { ChangePlanDialog } from "./change-plan-dialog";
import { ExtendSubscriptionDialog } from "./extend-subscription-dialog";

type StatusFilter = "ALL" | SubscriptionStatus;
type ActionKind = "cancel" | "extend" | "change_plan";

const STATUS_ITEMS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All statuses" },
  ...SUBSCRIPTION_STATUSES.map((status) => ({
    value: status,
    label: status.charAt(0) + status.slice(1).toLowerCase(),
  })),
];

const COLUMNS = 7;

/** The row an action dialog is about, kept apart from `open` so the dialog doesn't empty mid close animation. */
interface ActionState {
  kind: ActionKind;
  row: AdminSubscriptionRow | null;
  open: boolean;
}

/**
 * The Subscriptions page: every subscription joined with its user and plan, filtered by status and email,
 * paginated on the server. ACTIVE rows have Cancel / Extend / Change plan; each opens a dialog with the SQL.
 */
export function SubscriptionsView() {
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [action, setAction] = useState<ActionState>({ kind: "cancel", row: null, open: false });
  const [sqlOpen, setSqlOpen] = useState(false);

  const q = useDebouncedValue(search.trim(), 300);
  const filters: AdminSubscriptionFilters = {
    status: status === "ALL" ? undefined : status,
    q: q || undefined,
    page,
    pageSize: ADMIN_PAGE_SIZE,
  };
  const query = useAdminSubscriptions(filters);
  const data = query.data;
  const filtered = status !== "ALL" || q !== "";

  const openAction = (kind: ActionKind, row: AdminSubscriptionRow) => setAction({ kind, row, open: true });
  const setOpen = (open: boolean) => setAction((current) => ({ ...current, open }));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <InputGroup className="sm:max-w-xs">
          <InputGroupAddon>
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="Search subscriptions by user email"
            placeholder="Search by email"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </InputGroup>
        <Select
          items={STATUS_ITEMS}
          value={status}
          onValueChange={(value) => {
            if (!value) return;
            setStatus(value as StatusFilter);
            setPage(1);
          }}
        >
          <SelectTrigger aria-label="Filter by status" className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            {STATUS_ITEMS.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectPopup>
        </Select>
        <Button variant="outline" className="ms-auto" onClick={() => setSqlOpen(true)}>
          <HugeiconsIcon icon={SourceCodeIcon} strokeWidth={2} />
          View SQL
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-xs/5">
        <Table className="min-w-[56rem]" aria-busy={query.isFetching}>
          <TableHeader>
            <TableRow>
              <TableHead>Customer</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Start</TableHead>
              <TableHead>End</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={cn("transition-opacity", query.isPlaceholderData && "opacity-64")}>
            {query.isPending ? (
              Array.from({ length: 6 }, (_, index) => <SkeletonRow key={index} />)
            ) : query.isError && !data ? (
              <TableRow>
                <TableCell colSpan={COLUMNS}>
                  <div role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
                    <p className="text-sm text-destructive-foreground">
                      {query.error instanceof ApiError ? query.error.message : "Couldn't load the subscriptions."}
                    </p>
                    <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
                      Try again
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ) : data && data.items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={COLUMNS}>
                  <Empty className="py-10 md:py-12">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <HugeiconsIcon icon={CreditCardIcon} strokeWidth={2} />
                      </EmptyMedia>
                      <EmptyTitle>{filtered ? "No matching subscriptions" : "No subscriptions yet"}</EmptyTitle>
                      <EmptyDescription>
                        {filtered
                          ? "Try another email or status."
                          : "Subscriptions appear here once customers start checkout."}
                      </EmptyDescription>
                    </EmptyHeader>
                    {filtered ? (
                      <EmptyContent>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSearch("");
                            setStatus("ALL");
                            setPage(1);
                          }}
                        >
                          Clear filters
                        </Button>
                      </EmptyContent>
                    ) : null}
                  </Empty>
                </TableCell>
              </TableRow>
            ) : (
              data?.items.map((row) => <SubscriptionRow key={row.subscriptionId} row={row} onAction={openAction} />)
            )}
          </TableBody>
        </Table>
      </div>

      {data ? (
        <AdminPagination
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          pageCount={data.pageCount}
          onPageChange={setPage}
          disabled={query.isPlaceholderData}
        />
      ) : null}

      <CancelSubscriptionDialog
        open={action.open && action.kind === "cancel"}
        onOpenChange={setOpen}
        row={action.row}
      />
      <ExtendSubscriptionDialog
        open={action.open && action.kind === "extend"}
        onOpenChange={setOpen}
        row={action.row}
      />
      <ChangePlanDialog open={action.open && action.kind === "change_plan"} onOpenChange={setOpen} row={action.row} />

      <Dialog open={sqlOpen} onOpenChange={setSqlOpen}>
        <DialogPopup className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>The query behind this table</DialogTitle>
            <DialogDescription>It follows the filters and page you have selected.</DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <SqlPreview
              statements={buildListSubscriptionsSql(filters)}
              notes={[
                <>
                  <code className="font-mono">users</code> has a unique index on{" "}
                  <code className="font-mono">lower(email)</code>, which serves exact lookups but not a leading-wildcard{" "}
                  <code className="font-mono">ILIKE</code>, so the search scans the (small) users table.
                </>,
                "The search escapes % and _ so they match literally; a NULL parameter switches its filter off.",
              ]}
            />
          </DialogPanel>
        </DialogPopup>
      </Dialog>
    </>
  );
}

function SubscriptionRow({
  row,
  onAction,
}: {
  row: AdminSubscriptionRow;
  onAction: (kind: ActionKind, row: AdminSubscriptionRow) => void;
}) {
  const active = row.status === "ACTIVE";
  return (
    <TableRow>
      <TableCell>
        <span className="flex flex-col">
          <span className="font-medium">{row.userName}</span>
          <span className="text-xs text-muted-foreground">{row.userEmail}</span>
        </span>
      </TableCell>
      <TableCell>
        <span className="flex flex-col">
          <span>{row.planName}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {formatCurrency(row.planPriceMonthly)} / month
          </span>
        </span>
      </TableCell>
      <TableCell>
        <SubscriptionStatusBadge status={row.status} />
      </TableCell>
      <TableCell className="tabular-nums">{formatDate(row.startDate)}</TableCell>
      <TableCell className="tabular-nums">{formatDate(row.endDate)}</TableCell>
      <TableCell className="text-muted-foreground tabular-nums">{formatDate(row.createdAt)}</TableCell>
      <TableCell className="text-right">
        <Menu>
          <MenuTrigger
            render={<Button variant="ghost" size="icon-sm" />}
            aria-label={`Actions for ${row.userEmail}, subscription ${row.subscriptionId}`}
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} strokeWidth={2} />
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem disabled={!active} onClick={() => onAction("extend", row)}>
              <HugeiconsIcon icon={Calendar03Icon} strokeWidth={2} />
              Extend
            </MenuItem>
            <MenuItem disabled={!active} onClick={() => onAction("change_plan", row)}>
              <HugeiconsIcon icon={ArrowDataTransferHorizontalIcon} strokeWidth={2} />
              Change plan
            </MenuItem>
            <MenuSeparator />
            <MenuItem variant="destructive" disabled={!active} onClick={() => onAction("cancel", row)}>
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              Cancel subscription
            </MenuItem>
            {!active ? (
              <MenuGroup>
                <MenuGroupLabel className="max-w-56 text-pretty">
                  Only ACTIVE subscriptions can be changed; this one is {row.status.toLowerCase()}.
                </MenuGroupLabel>
              </MenuGroup>
            ) : null}
          </MenuPopup>
        </Menu>
      </TableCell>
    </TableRow>
  );
}

function SkeletonRow() {
  return (
    <TableRow aria-hidden="true">
      <TableCell>
        <Skeleton className="h-9 w-44" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-9 w-24" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-5 w-16" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-20" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-20" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-20" />
      </TableCell>
      <TableCell>
        <Skeleton className="ms-auto size-7" />
      </TableCell>
    </TableRow>
  );
}
