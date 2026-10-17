"use client";

import { usePathname } from "next/navigation";

import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

import { findAdminNavItem } from "./nav-config";

/** Sticky page header inside the inset card: sidebar toggle, section title and its one-liner. */
export function AdminHeader() {
  const section = findAdminNavItem(usePathname());

  return (
    <header className="sticky top-0 z-30 flex h-(--header-height) shrink-0 items-center gap-2 border-b bg-background/85 backdrop-blur-md sm:rounded-t-xl">
      <div className="flex w-full min-w-0 items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 h-4 data-vertical:self-auto" />
        <h1 className="shrink-0 text-base font-medium">{section.title}</h1>
        <span className="hidden truncate text-sm text-muted-foreground md:inline">— {section.description}</span>
      </div>
    </header>
  );
}
