"use client";

import { useState, type ReactNode } from "react";

import type { SubscriptionPlan, SubscriptionWithPlan, User } from "@/types";

import { ChangePlan } from "./change-plan";
import { CurrentPlanCard } from "./current-plan-card";

/** Account details + current plan, and the plan picker that updates both from the API's response. */
export function AccountPlan({
  user,
  details,
  plans,
  initialSubscription,
}: {
  /** Prefills Razorpay Checkout (name, email, phone). */
  user: User;
  details: ReactNode;
  plans: SubscriptionPlan[];
  initialSubscription: SubscriptionWithPlan | null;
}) {
  const [subscription, setSubscription] = useState(initialSubscription);

  return (
    <>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {details}
        <CurrentPlanCard subscription={subscription} />
      </div>

      <section aria-labelledby="change-plan" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="change-plan" className="text-xl font-semibold">
            {subscription ? "Change plan" : "Choose a plan"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Pay with Razorpay and the new plan starts as soon as the payment goes through. Your history, lists and
            recommendations stay as they are.
          </p>
        </div>
        <ChangePlan user={user} plans={plans} current={subscription} onChanged={setSubscription} />
      </section>
    </>
  );
}
