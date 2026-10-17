import { PersonPhoto } from "@/components/content/artwork";
import type { Content } from "@/types";

const MAX_CAST = 10;
const listFormat = new Intl.ListFormat("en", { style: "long", type: "conjunction" });

/** "Directed by" / "Created by" line plus the top-billed cast. */
export function Credits({ content }: { content: Pick<Content, "contentType" | "cast" | "directors"> }) {
  const cast = content.cast.slice(0, MAX_CAST);
  const { directors } = content;
  if (cast.length === 0 && directors.length === 0) return null;

  return (
    <section aria-labelledby="credits-heading">
      <div className="px-4 sm:px-8 lg:px-12">
        <h2
          id="credits-heading"
          className="font-display text-2xl leading-none font-bold tracking-wide uppercase sm:text-[1.7rem]"
        >
          Cast &amp; crew
        </h2>
        {directors.length > 0 ? (
          <p className="mt-1.5 text-xs text-muted-foreground sm:text-sm">
            {content.contentType === "MOVIE" ? "Directed by" : "Created by"}{" "}
            <span className="text-foreground">{listFormat.format(directors.map((person) => person.name))}</span>
          </p>
        ) : null}
      </div>

      {cast.length > 0 ? (
        <ul
          aria-label="Cast"
          className="no-scrollbar mt-5 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto overscroll-x-contain px-4 sm:grid sm:grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] sm:gap-x-4 sm:gap-y-6 sm:overflow-visible sm:px-8 lg:px-12"
        >
          {cast.map(({ person, characterName }) => (
            <li key={person.personId} className="w-24 shrink-0 snap-start text-center sm:w-auto">
              <PersonPhoto person={person} className="mx-auto size-20 ring-1 ring-foreground/10 sm:size-24" />
              <p className="mt-2 line-clamp-2 text-sm leading-snug font-medium">{person.name}</p>
              {characterName ? (
                <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-muted-foreground">{characterName}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
