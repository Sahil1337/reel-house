"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Ticket01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";

/**
 * Bottom bar for accounts without a running plan: browsing stays open, playback asks for a plan.
 * Lives in the shell layout, which doesn't remount between pages, so a dismissal lasts until reload.
 */
export function NoPlanNotice() {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(false);
  // The account page already leads with the plans.
  if (dismissed || pathname === "/account") return null;

  return (
    <aside
      aria-label="No active plan"
      className="fixed inset-x-3 bottom-3 z-30 mx-auto flex max-w-2xl items-center gap-3 rounded-xl border bg-popover/95 py-2.5 pr-2 pl-3 shadow-lg backdrop-blur-md animate-[fade-up_360ms_var(--ease-out-strong)_both] motion-reduce:animate-none sm:inset-x-6 sm:pl-4"
    >
      <HugeiconsIcon icon={Ticket01Icon} strokeWidth={2} className="hidden size-5 shrink-0 text-primary sm:block" />
      <p className="min-w-0 flex-1 text-sm">
        <span className="font-medium">No plan on this account.</span>{" "}
        <span className="text-muted-foreground">You can browse, but you&rsquo;ll need a plan to watch.</span>
      </p>
      <Button size="sm" className="shrink-0" render={<Link href="/account#change-plan" />}>
        Choose a plan
      </Button>
      <Button variant="ghost" size="icon-sm" aria-label="Hide this message" onClick={() => setDismissed(true)}>
        <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
      </Button>
    </aside>
  );
}
