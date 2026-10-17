import Link from "next/link";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

/** Empty state for My List / History that points back to browsing. */
export function LibraryEmpty({
  icon,
  title,
  description,
  actionLabel = "Browse titles",
  actionHref = "/browse",
}: {
  icon: IconSvgElement;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <Empty className="rounded-xl border border-dashed">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={icon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button className="active:scale-[0.97]" render={<Link href={actionHref} />}>
          {actionLabel}
        </Button>
      </EmptyContent>
    </Empty>
  );
}
