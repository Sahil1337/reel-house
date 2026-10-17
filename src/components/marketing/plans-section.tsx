import Link from "next/link";

import { PlanFeatureList } from "@/components/account/plan-features";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SubscriptionPlan } from "@/types";

const PRESS =
  "transition-[transform,box-shadow] duration-150 ease-out-strong active:scale-[0.97] motion-reduce:active:scale-100";

/** The middle plan is the one most people pick; it gets the quiet highlight. */
const FEATURED_INDEX = 1;

export function PlansSection({ plans, signedIn }: { plans: SubscriptionPlan[]; signedIn: boolean }) {
  return (
    <section aria-labelledby="plans" className="border-t px-4 py-20 sm:px-8 sm:py-28 lg:px-12">
      <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">Plans</p>
        <h2
          id="plans"
          className="font-display text-4xl font-bold uppercase leading-none tracking-wide text-balance sm:text-5xl"
        >
          Pick a seat
        </h2>
        <p className="text-pretty text-muted-foreground">
          Every plan gets the full catalogue and personal recommendations for each profile. Plans differ in picture
          quality and how many screens can play at once.
        </p>
      </div>

      <ul className="mx-auto mt-12 grid max-w-5xl items-start gap-4 lg:grid-cols-3">
        {plans.map((plan, index) => {
          const featured = index === FEATURED_INDEX;
          return (
            <li
              key={plan.planId}
              className={cn(
                "relative flex flex-col gap-6 rounded-2xl border bg-card p-6",
                featured && "border-primary/40 ring-1 ring-primary/20",
              )}
            >
              {featured ? <Badge className="absolute -top-2.5 right-6 rounded-full px-2.5">Most popular</Badge> : null}
              <div className="flex flex-col gap-1">
                <h3 className="font-display text-2xl font-bold uppercase tracking-wide">{plan.name}</h3>
                <p className="flex items-baseline gap-1">
                  <span className="font-mono text-3xl font-semibold tabular-nums">
                    {formatCurrency(plan.priceMonthly)}
                  </span>
                  <span className="text-sm text-muted-foreground">/month</span>
                </p>
              </div>
              <PlanFeatureList plan={plan} />
              <Button
                size="lg"
                variant={featured ? "default" : "outline"}
                className={cn("mt-auto w-full", PRESS)}
                render={<Link href={signedIn ? "/account" : "/sign-up"} />}
              >
                {signedIn ? "Manage your plan" : `Start with ${plan.name}`}
              </Button>
            </li>
          );
        })}
      </ul>
      <p className="mt-6 text-center text-xs text-muted-foreground">
        Prices in Indian rupees, billed monthly. Payments run in Razorpay test mode, so you won&rsquo;t be charged.
      </p>
    </section>
  );
}
