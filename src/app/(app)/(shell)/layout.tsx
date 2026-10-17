import { Suspense } from "react";

import { SiteFooter } from "@/components/layout/site-footer";
import { TopNav } from "@/components/layout/top-nav";
import { serverApi } from "@/lib/api/server";
import { requireProfile, requireUser } from "@/server/session/current-session";

/** Shared chrome for the browsing area: top nav + footer. Needs a selected profile. */
export default async function ShellLayout({ children }: LayoutProps<"/">) {
  const [user, profile, profiles] = await Promise.all([requireUser(), requireProfile(), serverApi.getProfiles()]);
  return (
    <div className="flex min-h-dvh flex-col">
      <Suspense>
        <TopNav profile={profile} profiles={profiles} isAdmin={user.role === "ADMIN"} />
      </Suspense>
      <main className="flex flex-1 flex-col">{children}</main>
      <SiteFooter />
    </div>
  );
}
