import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight02Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import type { ContentSummary } from "@/types";

import { PosterWall } from "./poster-wall";

const PRESS =
  "transition-[transform,box-shadow] duration-150 ease-out-strong active:scale-[0.97] motion-reduce:active:scale-100";
const ENTER = "animate-[fade-up_480ms_var(--ease-out-strong)_both] motion-reduce:animate-none";

export function LandingHero({
  posters,
  signedIn,
  startingPrice,
}: {
  posters: ContentSummary[];
  signedIn: boolean;
  /** Cheapest monthly plan, in rupees. */
  startingPrice: number | null;
}) {
  return (
    <section className="relative isolate flex min-h-[92svh] items-center overflow-hidden pt-16">
      <PosterWall items={posters} className="-z-20 opacity-60" />
      {/* Scrims: darken the wall toward the edges and under the copy. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-linear-to-t from-background via-background/70 to-background/40"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_60%_at_30%_55%,var(--background)_15%,transparent_75%)] max-sm:bg-[radial-gradient(ellipse_100%_70%_at_50%_55%,var(--background)_20%,transparent_80%)]"
      />
      {/* The projector light. */}
      <div
        aria-hidden="true"
        className="absolute top-1/4 left-[8%] -z-10 size-[28rem] rounded-full bg-lamp/10 blur-[120px] animate-[lamp-drift_18s_ease-in-out_infinite] motion-reduce:animate-none"
      />

      <div className="w-full px-4 py-20 sm:px-8 lg:px-12">
        <div className="flex max-w-2xl flex-col gap-6">
          <p className={`${ENTER} font-mono text-xs uppercase tracking-[0.2em] text-primary`}>
            Now showing on Reelhouse
          </p>
          <h1
            className={`${ENTER} font-display text-6xl font-bold uppercase leading-[0.9] tracking-wide text-balance sm:text-7xl lg:text-8xl [animation-delay:60ms]`}
          >
            Films and series, picked for the way you watch
          </h1>
          <p
            className={`${ENTER} max-w-xl text-pretty text-base text-muted-foreground sm:text-lg [animation-delay:120ms]`}
          >
            Reelhouse learns from what you finish, rate and save — and every row on your home screen tells you why
            it&rsquo;s there. No mystery algorithm, just reasons you can read.
          </p>
          <div className={`${ENTER} flex flex-col gap-3 sm:flex-row [animation-delay:180ms]`}>
            {signedIn ? (
              <Button size="xl" className={PRESS} render={<Link href="/profiles" />}>
                Continue to Reelhouse
                <HugeiconsIcon icon={ArrowRight02Icon} strokeWidth={2} />
              </Button>
            ) : (
              <>
                <Button size="xl" className={PRESS} render={<Link href="/sign-up" />}>
                  Get started
                  <HugeiconsIcon icon={ArrowRight02Icon} strokeWidth={2} />
                </Button>
                <Button size="xl" variant="outline" className={PRESS} render={<Link href="/sign-in" />}>
                  Sign in
                </Button>
              </>
            )}
          </div>
          {!signedIn && startingPrice !== null ? (
            <p className={`${ENTER} text-xs text-muted-foreground [animation-delay:240ms]`}>
              Plans from <span className="font-mono text-foreground">{formatCurrency(startingPrice)}</span> a month ·
              Switch plans any time · Payments in Razorpay test mode
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
