import type { Metadata } from "next";

import { groupHistoryByDay } from "@/components/library/history-groups";
import { HistoryEmpty, HistoryList } from "@/components/library/history-list";
import { LibraryHeader } from "@/components/library/library-header";
import { serverApi } from "@/lib/api/server";
import { requireProfile } from "@/server/session/current-session";

export const metadata: Metadata = { title: "History" };

export default async function HistoryPage() {
  const profile = await requireProfile();
  const items = await serverApi.getHistory(profile.profileId);

  return (
    <div className="flex w-full max-w-5xl flex-col gap-8 px-4 pt-24 pb-16 sm:px-8 sm:pt-28 lg:px-12">
      <LibraryHeader
        title="History"
        count={items.length > 0 ? `${items.length} ${items.length === 1 ? "entry" : "entries"}` : undefined}
        description="What you watch shapes your recommendations. Remove anything you'd rather we didn't count."
      />
      {items.length > 0 ? (
        <HistoryList profileId={profile.profileId} groups={groupHistoryByDay(items)} />
      ) : (
        <HistoryEmpty />
      )}
    </div>
  );
}
