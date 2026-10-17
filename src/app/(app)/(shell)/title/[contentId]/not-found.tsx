import { HugeiconsIcon } from "@hugeicons/react";
import { Film01Icon } from "@hugeicons/core-free-icons";

import { LinkButton } from "@/components/browse/link-button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia } from "@/components/ui/empty";

export default function TitleNotFound() {
  return (
    <Empty className="min-h-[70svh] pt-28">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={Film01Icon} strokeWidth={2} />
        </EmptyMedia>
        <h1 className="font-display text-3xl leading-none font-bold tracking-wide uppercase">
          We couldn&apos;t find that title
        </h1>
        <EmptyDescription className="mt-2">
          It may have left the catalogue, or the link has a typo. Head back to Home or search for it by name.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center">
        <LinkButton href="/browse">Back to Home</LinkButton>
        <LinkButton href="/search" variant="outline">
          Search titles
        </LinkButton>
      </EmptyContent>
    </Empty>
  );
}
