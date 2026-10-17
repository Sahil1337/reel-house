import Link from "next/link";

import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";

export function LandingHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="absolute inset-x-0 top-0 z-20">
      <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-8 lg:px-12">
        <Logo />
        {signedIn ? (
          <Button variant="ghost" render={<Link href="/profiles" />}>
            Open Reelhouse
          </Button>
        ) : (
          <Button variant="ghost" render={<Link href="/sign-in" />}>
            Sign in
          </Button>
        )}
      </div>
    </header>
  );
}
