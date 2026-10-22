import type { Metadata } from "next";

import { AccountDetailsCard } from "@/components/account/account-details-card";
import { AccountPlan } from "@/components/account/account-plan";
import { BillingHistory } from "@/components/account/billing-history";
import { serverApi } from "@/lib/api/server";
import { NO_PLAN_MAX_PROFILES } from "@/lib/constants";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const [{ user, subscription }, plans, subscriptions, payments, profiles] = await Promise.all([
    serverApi.getAccount(),
    serverApi.getPlans(),
    serverApi.getSubscriptions(),
    serverApi.getPayments(),
    serverApi.getProfiles(),
  ]);

  return (
    <div className="flex flex-col gap-14 px-4 pt-24 pb-16 sm:px-8 lg:px-12">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-5xl font-bold uppercase leading-none tracking-wide sm:text-6xl">Account</h1>
        <p className="text-muted-foreground">Your membership, plan and billing history.</p>
      </header>

      <AccountPlan
        key={subscription ? `${subscription.subscriptionId}-${subscription.status}` : "none"}
        user={user}
        details={
          <AccountDetailsCard
            user={user}
            profiles={profiles}
            maxProfiles={subscription?.plan.maxProfiles ?? NO_PLAN_MAX_PROFILES}
          />
        }
        plans={plans}
        initialSubscription={subscription}
        today={new Date().toISOString()}
      />

      <BillingHistory subscriptions={subscriptions} payments={payments} />
    </div>
  );
}
