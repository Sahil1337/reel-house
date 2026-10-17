import { HugeiconsIcon } from "@hugeicons/react";
import { SquareLock02Icon } from "@hugeicons/core-free-icons";

import { LinkButton } from "@/components/browse/link-button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";

/** Shown instead of a title that's rated above the profile's maturity setting. */
export function RestrictedTitle({ profileName }: { profileName: string }) {
  return (
    <Empty className="min-h-[70svh] pt-28">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={SquareLock02Icon} strokeWidth={2} />
        </EmptyMedia>
        <h1 className="font-display text-3xl leading-none font-bold tracking-wide uppercase">
          Not available on this profile
        </h1>
        <EmptyDescription className="mt-2">
          This title is rated above the maturity setting for {profileName}. Switch to another profile to watch it.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center">
        <LinkButton href="/browse">Back to Home</LinkButton>
        <LinkButton href="/profiles" variant="outline">
          Switch profile
        </LinkButton>
      </EmptyContent>
    </Empty>
  );
}
