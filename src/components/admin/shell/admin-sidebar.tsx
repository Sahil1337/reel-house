"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";

import { Logo } from "@/components/layout/logo";
import { Badge } from "@/components/ui/badge";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import type { User } from "@/types";

import { AdminUserMenu } from "./admin-user-menu";
import { ADMIN_NAV, findAdminNavItem } from "./nav-config";

const ICON_TONE = "[&>svg]:text-sidebar-foreground/70 data-[active=true]:[&>svg]:text-primary";

/** The kit's shell sidebar, adapted: admin sections, a way back to the app, and the signed-in admin. */
export function AdminSidebar({ user, ...props }: React.ComponentProps<typeof Sidebar> & { user: User }) {
  const active = findAdminNavItem(usePathname());

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <div className="flex h-12 items-center gap-2 px-2">
          <Logo href="/admin" />
          <Badge variant="outline" className="uppercase tracking-wide">
            Admin
          </Badge>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Manage</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {ADMIN_NAV.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    tooltip={item.description}
                    isActive={item.href === active.href}
                    render={<Link href={item.href} />}
                    className={ICON_TONE}
                  >
                    <HugeiconsIcon icon={item.icon} strokeWidth={2} />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Reelhouse</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton render={<Link href="/browse" />} className={ICON_TONE}>
                  <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
                  <span>Back to the app</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <AdminUserMenu user={user} />
      </SidebarFooter>
    </Sidebar>
  );
}
