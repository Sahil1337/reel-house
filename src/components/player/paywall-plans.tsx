"use client";

import { ChangePlan } from "@/components/account/change-plan";
import type { SubscriptionPlan, User } from "@/types";

/** The account page's plan picker on the paywall. ChangePlan refreshes the route once the plan is active, which swaps in the player. */
export function PaywallPlans({ user, plans }: { user: User; plans: SubscriptionPlan[] }) {
  return <ChangePlan user={user} plans={plans} current={null} onChanged={() => {}} compact />;
}
