import type { Metadata } from "next";
import { Bookmark02Icon } from "@hugeicons/core-free-icons";

import { ContentGrid } from "@/components/content/content-grid";
import { LibraryEmpty } from "@/components/library/library-empty";
import { LibraryHeader } from "@/components/library/library-header";
import { serverApi } from "@/lib/api/server";
import { requireProfile } from "@/server/session/current-session";

export const metadata: Metadata = { title: "My List" };

export default async function MyListPage() {
  const profile = await requireProfile();
  const items = await serverApi.getMyList(profile.profileId);

  return (
    <div className="flex flex-col gap-8 px-4 pt-24 pb-16 sm:px-8 sm:pt-28 lg:px-12">
      <LibraryHeader
        title="My List"
        count={items.length > 0 ? `${items.length} ${items.length === 1 ? "title" : "titles"}` : undefined}
        description={items.length > 0 ? "Saved for later, newest first." : undefined}
      />
      {items.length > 0 ? (
        <ContentGrid items={items} />
      ) : (
        <LibraryEmpty
          icon={Bookmark02Icon}
          title="Your list is empty"
          description="Save films and series to watch later with the “My List” button on any title."
        />
      )}
    </div>
  );
}
