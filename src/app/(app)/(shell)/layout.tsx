import { Suspense } from "react";

import { NoPlanNotice } from "@/components/layout/no-plan-notice";
import { SiteFooter } from "@/components/layout/site-footer";
import { TopNav } from "@/components/layout/top-nav";
import { serverApi } from "@/lib/api/server";
import { requireProfile, requireUser } from "@/server/session/current-session";

/** Shared chrome for the browsing area: top nav + footer. Needs a selected profile. */
export default async function ShellLayout({ children }: LayoutProps<"/">) {
  const [user, profile, profiles, { subscription }] = await Promise.all([
    requireUser(),
    requireProfile(),
    serverApi.getProfiles(),
    serverApi.getAccount(),
  ]);
  return (
    <div className="flex min-h-dvh flex-col">
      <Suspense>
        <TopNav profile={profile} profiles={profiles} isAdmin={user.role === "ADMIN"} />
      </Suspense>
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter />
      {subscription ? null : <NoPlanNotice />}
    </div>
  );
}
