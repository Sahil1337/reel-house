import type { HomeExplanation } from "@/types";

/** Step 4: how the ranked list is laid out on Home, top to bottom. A title is never shown twice. */
export function HomeMap({ data }: { data: HomeExplanation }) {
  const first = data.topPicks[0]?.title;
  const genres = data.taste.slice(0, 2).map((row) => row.genre);
  const rows = [
    { name: "Hero", what: first ? `Pick #1: ${first}` : "No pick yet", wide: true },
    { name: "Continue watching", what: "Titles you're partway through (1–89%)" },
    { name: "Top picks", what: "The best scores, in the order above" },
    ...genres.map((genre) => ({
      name: `${genre} for you`,
      what: `A top genre: best unseen ${genre} titles not already in a row above`,
    })),
  ];

  return (
    <ol className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.name} className="grid grid-cols-[3.25rem_1fr] items-center gap-3 text-xs">
          {/* A tiny wireframe: the hero is one wide frame, a row is a strip of cards. */}
          <span aria-hidden="true" className="flex h-5 gap-0.5">
            {row.wide ? (
              <span className="w-full rounded-[3px] bg-foreground/28" />
            ) : (
              Array.from({ length: 4 }, (_, i) => <span key={i} className="w-full rounded-[2px] bg-foreground/14" />)
            )}
          </span>
          <span className="min-w-0">
            <span className="font-medium">{row.name}</span>
            <span className="text-muted-foreground"> · {row.what}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
