import type { Metadata } from "next";

import { SubscriptionsView } from "@/components/admin/subscriptions/subscriptions-view";

export const metadata: Metadata = { title: "Subscriptions" };

/** Every customer's subscription with its user and plan; cancel, extend or move one, each with the SQL it runs. */
export default function SubscriptionsPage() {
  return (
    <div className="flex flex-1 flex-col gap-6 px-4 py-6 lg:px-6">
      <SubscriptionsView />
    </div>
  );
}
