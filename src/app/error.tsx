"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/** Fallback for unexpected runtime errors in any route segment. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-4xl font-bold uppercase tracking-wide">The projector jammed</h1>
        <p className="max-w-sm text-muted-foreground">
          Something went wrong while loading this page. Try again in a moment.
        </p>
      </div>
      <Button size="lg" onClick={() => retry()}>
        Try again
      </Button>
    </main>
  );
}
