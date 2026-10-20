"use client";

import { useState, type ReactNode } from "react";

import type { SubscriptionPlan, SubscriptionWithPlan, User } from "@/types";

import { ChangePlan } from "./change-plan";
import { MembershipTicket } from "./membership-ticket";

/** Membership ticket + account details, and the plan picker that updates the ticket from the API's response. */
export function AccountPlan({
  user,
  details,
  plans,
  initialSubscription,
  today,
}: {
  /** Prefills Razorpay Checkout (name, email, phone). */
  user: User;
  details: ReactNode;
  plans: SubscriptionPlan[];
  initialSubscription: SubscriptionWithPlan | null;
  /** ISO timestamp from the server, for the ticket's days-left count. */
  today: string;
}) {
  const [subscription, setSubscription] = useState(initialSubscription);

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <MembershipTicket subscription={subscription} today={today} />
        {details}
      </div>

      <section aria-labelledby="change-plan" className="flex flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h2
            id="change-plan"
            className="scroll-mt-28 font-display text-3xl leading-none font-bold tracking-wide uppercase"
          >
            {subscription ? "Change plan" : "Choose a plan"}
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Pay with Razorpay and the new plan starts as soon as the payment goes through. Your history, lists and
            recommendations stay as they are.
          </p>
        </div>
        <ChangePlan user={user} plans={plans} current={subscription} onChanged={setSubscription} />
      </section>
    </>
  );
}
