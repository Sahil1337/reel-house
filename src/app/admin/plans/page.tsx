import type { Metadata } from "next";

import { PlansView } from "@/components/admin/plans/plans-view";
import { serverApi } from "@/lib/api/server";

export const metadata: Metadata = { title: "Plans" };

/** Subscription plans with their subscriber counts; add, edit and delete them, each with the SQL it runs. */
export default async function PlansPage() {
  const plans = await serverApi.getAdminPlans();
  return (
    <div className="flex flex-1 flex-col gap-6 px-4 py-6 lg:px-6">
      <PlansView initialPlans={plans} />
    </div>
  );
}
