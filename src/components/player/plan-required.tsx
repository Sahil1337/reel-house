import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";

import { StageBackdrop } from "@/components/browse/stage-backdrop";
import { DisplayTitle } from "@/components/browse/display-title";
import { Logo } from "@/components/layout/logo";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ContentDetail, SubscriptionPlan, SubscriptionWithPlan, User } from "@/types";

import { PaywallPlans } from "./paywall-plans";

const ENTER = "animate-[fade-up_420ms_var(--ease-out-strong)_both] motion-reduce:animate-none";

/** Shown instead of the player when the account has no running plan; paying here reloads straight into playback. */
export function PlanRequired({
  content,
  user,
  plans,
  lastPlan,
}: {
  content: ContentDetail;
  user: User;
  plans: SubscriptionPlan[];
  /** The newest paid subscription, if any: its plan has since ended. */
  lastPlan: SubscriptionWithPlan | null;
}) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col">
      <StageBackdrop content={content} className="bottom-auto h-[60svh]" />

      <header className="flex h-16 items-center justify-between gap-4 px-4 sm:px-8 lg:px-12">
        <Logo href="/browse" />
        <Link
          href={`/title/${content.contentId}`}
          className="inline-flex items-center gap-1.5 text-sm text-foreground/80 hover:text-foreground"
        >
          <HugeiconsIcon icon={ArrowLeft02Icon} strokeWidth={2} className="size-4" />
          Back to {content.contentType === "SERIES" ? "series" : "film"}
        </Link>
      </header>

      {/* Sized to fit one laptop screen (header, pitch and plans) without scrolling; phones scroll the stacked cards. */}
      <main className="flex flex-1 flex-col justify-center gap-6 px-4 py-4 sm:px-8 lg:gap-8 lg:px-12">
        <div className="flex max-w-3xl flex-col items-start gap-3">
          <p className={cn(ENTER, "font-mono text-xs tracking-[0.25em] text-primary uppercase")}>Membership required</p>
          <DisplayTitle
            title={content.title}
            className={cn(ENTER, "text-4xl sm:text-5xl lg:text-6xl")}
            style={{ animationDelay: "60ms" }}
          />
          <p className={cn(ENTER, "max-w-prose text-pretty text-foreground/85")} style={{ animationDelay: "120ms" }}>
            {lastPlan
              ? `Your ${lastPlan.plan.name} plan ended on ${formatDate(lastPlan.endDate)}. Pick a plan to keep watching.`
              : "You need a plan to watch on Reelhouse."}{" "}
            {content.title} starts playing as soon as the payment goes through.
          </p>
        </div>

        <PaywallPlans user={user} plans={plans} />
      </main>
    </div>
  );
}
