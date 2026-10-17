import Link from "next/link";

import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <div className="flex flex-col gap-2">
        <p className="font-mono text-sm text-primary">404</p>
        <h1 className="font-display text-4xl font-bold uppercase tracking-wide">This reel is missing</h1>
        <p className="max-w-sm text-muted-foreground">The page you asked for doesn&rsquo;t exist or has moved.</p>
      </div>
      <Button render={<Link href="/browse" />} size="lg">
        Back to browsing
      </Button>
    </main>
  );
}
