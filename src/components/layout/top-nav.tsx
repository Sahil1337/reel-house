"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { CommandPalette } from "@/components/search/command-palette";
import { cn } from "@/lib/utils";
import type { Profile } from "@/types";

import { Logo } from "./logo";
import { ProfileMenu } from "./profile-menu";

const LINKS = [
  { href: "/browse", label: "Home" },
  { href: "/search?type=MOVIE", label: "Films" },
  { href: "/search?type=SERIES", label: "Series" },
  { href: "/my-list", label: "My List" },
  { href: "/history", label: "History" },
] as const;

/** Sticky top bar: transparent over the hero, solid once the page scrolls. */
export function TopNav({ profile, profiles, isAdmin }: { profile: Profile; profiles: Profile[]; isAdmin: boolean }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (href: string) => {
    const [path, query] = href.split("?");
    if (pathname !== path) return false;
    if (!query) return !(path === "/search" && searchParams.get("type"));
    const [key, value] = query.split("=");
    return searchParams.get(key) === value;
  };

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 transition-[background-color,box-shadow] duration-300",
        scrolled
          ? "bg-background/85 shadow-[0_1px_0_var(--border)] backdrop-blur-md"
          : "bg-linear-to-b from-background/90 to-transparent",
      )}
    >
      <nav aria-label="Main" className="flex h-16 items-center gap-4 px-4 sm:px-8 lg:px-12">
        <Logo href="/browse" className="shrink-0" />
        <ul className="no-scrollbar ml-2 flex min-w-0 items-center gap-1 overflow-x-auto md:ml-6">
          {LINKS.map((link) => (
            <li key={link.href} className={cn(link.href.startsWith("/search") && "hidden sm:block")}>
              <Link
                href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap text-muted-foreground outline-none transition-colors duration-150",
                  "hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
                  "aria-[current=page]:font-medium aria-[current=page]:text-foreground",
                )}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <CommandPalette />
          <ProfileMenu profile={profile} profiles={profiles} isAdmin={isAdmin} />
        </div>
      </nav>
    </header>
  );
}
