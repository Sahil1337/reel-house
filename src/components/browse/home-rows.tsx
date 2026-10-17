import { ContentCard } from "@/components/content/content-card";
import { ContentRow } from "@/components/content/content-row";
import { ContinueWatchingCard } from "@/components/content/continue-watching-card";
import type { HomeRow } from "@/types";

/** The personalised shelves on Home, in the order the home feed returns them. */
export function HomeRows({ rows }: { rows: HomeRow[] }) {
  return rows.map((row) => <HomeRowShelf key={row.id} row={row} />);
}

function HomeRowShelf({ row }: { row: HomeRow }) {
  if (row.items.length === 0) return null;
  const isContinue = row.kind === "continue-watching";

  return (
    <ContentRow title={row.title} reason={row.reason} variant={isContinue ? "landscape" : "poster"}>
      {row.items.map((item) =>
        isContinue ? (
          <ContinueWatchingCard key={item.content.contentId} item={item} />
        ) : (
          <ContentCard key={item.content.contentId} content={item.content} match={item.match} />
        ),
      )}
    </ContentRow>
  );
}
