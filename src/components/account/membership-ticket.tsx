import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SubscriptionWithPlan } from "@/types";

import { CancelSubscriptionButton } from "./cancel-subscription-button";

const DAY_MS = 86_400_000;

/** Punched half-circles where the stub tears off: left/right of a horizontal line on mobile, top/bottom from sm up. */
const NOTCH = "absolute size-7 rounded-full bg-background";

/** Days left and the share of the period used, from the server's `today` so it can't drift between renders. */
function periodProgress(startDate: string | null, endDate: string | null, today: string) {
  if (!startDate || !endDate) return null;
  const end = new Date(endDate).getTime();
  // Each payment buys one calendar month, so the current period starts a month before end_date.
  const periodStart = new Date(endDate);
  periodStart.setMonth(periodStart.getMonth() - 1);
  const start = Math.max(new Date(startDate).getTime(), periodStart.getTime());
  const now = new Date(today).getTime();
  const daysLeft = Math.max(0, Math.ceil((end - now) / DAY_MS));
  const used = Math.min(1, Math.max(0, (now - start) / (end - start)));
  return { daysLeft, used };
}

/** The active plan as an admission ticket: the stub's ADMIT count is the plan's screen limit. */
export function MembershipTicket({
  subscription,
  today,
}: {
  subscription: SubscriptionWithPlan | null;
  today: string;
}) {
  if (!subscription) {
    return (
      <div className="flex min-h-56 flex-col items-start justify-center gap-3 rounded-2xl border-2 border-dashed p-6 sm:p-8">
        <p className="font-mono text-xs tracking-[0.25em] text-muted-foreground uppercase">No pass on this account</p>
        <p className="font-display text-4xl leading-none font-bold tracking-wide uppercase sm:text-5xl">
          Pick a plan to start watching
        </p>
        <a href="#change-plan" className="text-sm text-primary underline-offset-4 hover:underline">
          See the plans
        </a>
      </div>
    );
  }

  const { plan } = subscription;
  const progress = periodProgress(subscription.startDate, subscription.endDate, today);
  const serial = String(subscription.subscriptionId).padStart(6, "0");
  // Cancelled plans stay watchable until end_date; they just won't renew.
  const cancelled = subscription.status === "CANCELLED";

  return (
    <div className="flex flex-col gap-3">
      <article
        aria-label={`${plan.name} membership`}
        className={cn(
          "relative isolate flex flex-col overflow-hidden rounded-2xl bg-primary text-primary-foreground sm:flex-row",
          "animate-[fade-up_480ms_var(--ease-out-strong)_both] motion-reduce:animate-none",
        )}
      >
        {/* Lamp light falling across the ticket, plus the same grain the posters carry. */}
        <span
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_0%_0%,var(--lamp),transparent_60%)] opacity-70"
        />
        <span aria-hidden="true" className="film-grain absolute inset-0 -z-10 opacity-40" />

        <div className="flex min-w-0 flex-1 flex-col gap-6 p-6 sm:p-8">
          <p className="font-mono text-xs tracking-[0.25em] uppercase opacity-70">Reelhouse · Membership pass</p>
          <h2 className="font-display text-6xl leading-[0.85] font-bold tracking-wide break-words uppercase sm:text-7xl lg:text-8xl">
            {plan.name}
          </h2>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            <TicketFact label="Picture">{plan.videoQuality}</TicketFact>
            <TicketFact label="Per month">{formatCurrency(plan.priceMonthly)}</TicketFact>
            <TicketFact label={cancelled ? "Access until" : "Valid through"}>
              {formatDate(subscription.endDate)}
            </TicketFact>
          </dl>

          {progress ? (
            <div className="flex flex-col gap-2">
              <div aria-hidden="true" className="h-1 overflow-hidden rounded-full bg-primary-foreground/15">
                <div
                  className="h-full origin-left rounded-full bg-primary-foreground animate-bar-grow"
                  style={{ width: `${progress.used * 100}%` }}
                />
              </div>
              <p className="text-sm opacity-80">
                {progress.daysLeft === 0
                  ? "This period ends today."
                  : `${progress.daysLeft} ${progress.daysLeft === 1 ? "day" : "days"} left in this period.`}
                {cancelled ? " Cancelled, so it won't renew." : null}
              </p>
            </div>
          ) : null}
        </div>

        {/* Perforation: dashed tear line with a punched notch at each end. */}
        <div aria-hidden="true" className="relative">
          <span className="absolute inset-x-6 top-0 border-t-2 border-dashed border-primary-foreground/30 sm:inset-x-auto sm:inset-y-6 sm:left-0 sm:border-t-0 sm:border-l-2" />
          <span
            className={cn(
              NOTCH,
              "top-0 -left-3.5 -translate-y-1/2 sm:-top-3.5 sm:left-0 sm:-translate-x-1/2 sm:translate-y-0",
            )}
          />
          <span
            className={cn(
              NOTCH,
              "top-0 -right-3.5 -translate-y-1/2 sm:top-auto sm:right-auto sm:-bottom-3.5 sm:left-0 sm:-translate-x-1/2 sm:translate-y-0",
            )}
          />
        </div>

        <div className="flex items-center justify-between gap-6 p-6 sm:w-52 sm:flex-col sm:items-start sm:justify-between sm:p-8">
          <div className="flex flex-col">
            <span className="font-mono text-xs tracking-[0.25em] uppercase opacity-70">Admit</span>
            <span className="mt-4 font-display text-8xl leading-[0.8] font-bold tabular-nums">{plan.maxDevices}</span>
            <span className="mt-3 text-sm opacity-80">
              {plan.maxDevices === 1 ? "screen at a time" : "screens at once"}
            </span>
          </div>
          <p className="font-mono text-xs tracking-[0.2em] opacity-70">No. {serial}</p>
        </div>
      </article>

      {cancelled ? null : (
        <div className="flex justify-end">
          <CancelSubscriptionButton subscriptionId={subscription.subscriptionId} label="Cancel plan" />
        </div>
      )}
    </div>
  );
}

function TicketFact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="font-mono text-[0.6875rem] tracking-[0.2em] uppercase opacity-65">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{children}</dd>
    </div>
  );
}
