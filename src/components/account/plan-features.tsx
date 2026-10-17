import { HugeiconsIcon } from "@hugeicons/react";
import { Tick02Icon } from "@hugeicons/core-free-icons";

import { MAX_PROFILES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { SubscriptionPlan } from "@/types";

/** What a plan includes — the plan table only stores quality and screens, so the rest is shared copy. */
export function planFeatures(plan: SubscriptionPlan): string[] {
  return [
    `${plan.videoQuality} streaming`,
    plan.maxDevices === 1 ? "Watch on 1 screen at a time" : `Watch on ${plan.maxDevices} screens at once`,
    `Up to ${MAX_PROFILES} profiles, each with its own recommendations`,
  ];
}

export function PlanFeatureList({ plan, className }: { plan: SubscriptionPlan; className?: string }) {
  return (
    <ul className={cn("flex flex-col gap-2", className)}>
      {planFeatures(plan).map((feature) => (
        <li key={feature} className="flex items-start gap-2 text-sm">
          <HugeiconsIcon icon={Tick02Icon} strokeWidth={2.5} className="mt-0.5 size-4 shrink-0 text-primary" />
          <span className="text-muted-foreground">{feature}</span>
        </li>
      ))}
    </ul>
  );
}
