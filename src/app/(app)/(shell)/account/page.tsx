import type { Metadata } from "next";

import { AccountDetailsCard } from "@/components/account/account-details-card";
import { AccountPlan } from "@/components/account/account-plan";
import { PaymentHistory, SubscriptionHistory } from "@/components/account/billing-history";
import { serverApi } from "@/lib/api/server";

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
    <div className="flex flex-col gap-12 px-4 pt-24 pb-16 sm:px-8 lg:px-12">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-5xl font-bold uppercase leading-none tracking-wide sm:text-6xl">Account</h1>
        <p className="text-muted-foreground">Your details, plan and billing history.</p>
      </header>

      <AccountPlan
        user={user}
        details={<AccountDetailsCard user={user} profileCount={profiles.length} />}
        plans={plans}
        initialSubscription={subscription}
      />

      <section aria-labelledby="billing-history" className="flex flex-col gap-4">
        <h2 id="billing-history" className="text-xl font-semibold">
          Billing history
        </h2>
        <div className="grid gap-4 xl:grid-cols-2">
          <SubscriptionHistory subscriptions={subscriptions} />
          <PaymentHistory payments={payments} />
        </div>
      </section>
    </div>
  );
}
