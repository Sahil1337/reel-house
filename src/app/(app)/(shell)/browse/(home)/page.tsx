import type { Metadata } from "next";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";

import { Hero } from "@/components/browse/hero";
import { HomeRows } from "@/components/browse/home-rows";
import { LinkButton } from "@/components/browse/link-button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { serverApi } from "@/lib/api/server";
import { requireProfile } from "@/server/session/current-session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Home" };

export default async function BrowsePage() {
  const profile = await requireProfile();
  const feed = await serverApi.getHome(profile.profileId);
  const { hero } = feed;
  const rows = feed.rows.filter((row) => row.items.length > 0);
  const heroActivity = hero ? await serverApi.getTitleActivity(profile.profileId, hero.content.contentId) : null;

  return (
    <>
      <h1 className="sr-only">Home for {profile.name}</h1>
      {hero ? (
        <Hero hero={hero} profileId={profile.profileId} inMyList={heroActivity?.inMyList ?? false} />
      ) : (
        <EmptyFeed />
      )}
      {rows.length > 0 ? (
        <div className={cn("relative z-10 flex flex-col gap-8 pb-16 sm:gap-10", hero && "-mt-16 sm:-mt-20 lg:-mt-28")}>
          <HomeRows rows={rows} />
        </div>
      ) : null}
    </>
  );
}

function EmptyFeed() {
  return (
    <Empty className="pt-28">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyTitle className="font-display text-3xl tracking-wide uppercase">Nothing on the marquee yet</EmptyTitle>
        <EmptyDescription>
          We couldn&apos;t line up picks for this profile right now. Search the catalogue to find something to watch.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <LinkButton href="/search">Search titles</LinkButton>
      </EmptyContent>
    </Empty>
  );
}
