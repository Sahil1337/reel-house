import type { Metadata } from "next";

import { AdminHeader } from "@/components/admin/shell/admin-header";
import { AdminSidebar } from "@/components/admin/shell/admin-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { requireAdmin } from "@/server/session/current-session";

export const metadata: Metadata = {
  title: { default: "Admin", template: "%s · Admin · Reelhouse" },
};

/**
 * The admin panel's shell (the kit's inset sidebar layout). proxy.ts already sent signed-out
 * visitors to sign-in; requireAdmin() sends signed-in non-admins to /profiles.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requireAdmin();
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 64)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AdminSidebar variant="inset" user={user} />
      {/* Fixed shell: the page never scrolls, the rounded card does. */}
      <div className="w-full min-w-0 transition-[padding] duration-200 ease-linear sm:py-2 sm:pr-2 sm:peer-data-[state=collapsed]:pl-2">
        <div className="no-scrollbar h-svh overflow-y-auto overscroll-none bg-background sm:h-[calc(100svh-1rem)] sm:rounded-xl sm:border sm:shadow-sm/5">
          <SidebarInset>
            <AdminHeader />
            {children}
          </SidebarInset>
        </div>
      </div>
    </SidebarProvider>
  );
}
