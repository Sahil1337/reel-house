"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, Logout01Icon, MoreVerticalCircle01Icon } from "@hugeicons/core-free-icons";

import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuLinkItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { useSignOut } from "@/hooks/queries/auth";
import type { User } from "@/types";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

/** The signed-in admin (kit's nav-user), with a way back to the app and sign-out. */
export function AdminUserMenu({ user }: { user: User }) {
  const { isMobile } = useSidebar();
  const { mutate: signOut } = useSignOut();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <Menu>
          <MenuTrigger
            render={<SidebarMenuButton size="lg" className="data-popup-open:bg-sidebar-accent" />}
            aria-label={`Account menu for ${user.name}`}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-xs font-semibold text-primary">
              {initials(user.name)}
            </span>
            <span className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
            <HugeiconsIcon icon={MoreVerticalCircle01Icon} strokeWidth={2} className="ml-auto size-4" />
          </MenuTrigger>
          <MenuPopup side={isMobile ? "bottom" : "right"} align="end" className="w-56">
            <MenuGroup>
              <MenuGroupLabel>Signed in as admin</MenuGroupLabel>
            </MenuGroup>
            <MenuLinkItem render={<Link href="/browse" />}>
              <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
              Back to the app
            </MenuLinkItem>
            <MenuSeparator />
            <MenuItem onClick={() => signOut()}>
              <HugeiconsIcon icon={Logout01Icon} strokeWidth={2} />
              Sign out
            </MenuItem>
          </MenuPopup>
        </Menu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
