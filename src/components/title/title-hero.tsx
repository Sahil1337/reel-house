import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { PlayIcon } from "@hugeicons/core-free-icons";

import { DisplayTitle } from "@/components/browse/display-title";
import { LinkButton } from "@/components/browse/link-button";
import { StageBackdrop } from "@/components/browse/stage-backdrop";
import { Poster } from "@/components/content/artwork";
import { ContentMeta } from "@/components/content/content-meta";
import { MyListButton } from "@/components/content/my-list-button";
import { cn } from "@/lib/utils";
import type { ContentDetail, Genre, TitleActivity } from "@/types";

import { RatingControl } from "./rating-control";

const ENTER = "animate-[fade-up_420ms_var(--ease-out-strong)_both] motion-reduce:animate-none";
const stagger = (step: number) => ({ animationDelay: `${60 + step * 60}ms` });

export interface PlayAction {
  href: string;
  label: string;
}

/** Title page header: backdrop, poster, facts, actions and the rating control. */
export function TitleHero({
  content,
  profileId,
  activity,
  play,
}: {
  content: ContentDetail;
  profileId: number;
  activity: TitleActivity;
  play: PlayAction;
}) {
  const isSeries = content.contentType === "SERIES";

  return (
    <section aria-labelledby="title-heading" className="relative isolate">
      <StageBackdrop content={content} className="bottom-auto h-[62svh] md:bottom-0 md:h-auto" />

      <div className="px-4 pt-[34svh] pb-6 sm:px-8 md:pt-40 lg:px-12 lg:pt-48">
        <div className="flex items-end gap-8 lg:gap-12">
          <Poster
            content={content}
            preload
            sizes="(min-width: 1280px) 288px, (min-width: 1024px) 256px, 208px"
            className="hidden w-52 shrink-0 rounded-lg shadow-2xl ring-1 ring-foreground/10 md:block lg:w-64 xl:w-72 animate-[pop-in_420ms_var(--ease-out-strong)_both] motion-reduce:animate-none"
          />

          <div className="flex min-w-0 max-w-3xl flex-col items-start gap-4">
            <p
              className={cn(ENTER, "text-xs font-medium tracking-[0.16em] text-foreground/75 uppercase")}
              style={stagger(0)}
            >
              {isSeries ? "Series" : "Film"}
            </p>
            <DisplayTitle id="title-heading" title={content.title} className={ENTER} style={stagger(1)} />

            <div
              className={cn(ENTER, "flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-foreground/75")}
              style={stagger(2)}
            >
              <ContentMeta
                content={content}
                seasonCount={isSeries ? content.seasons.length : undefined}
                className="text-foreground/75"
              />
            </div>

            {content.genres.length > 0 ? (
              <div className={ENTER} style={stagger(3)}>
                <GenreChips genres={content.genres} />
              </div>
            ) : null}

            <p
              className={cn(ENTER, "max-w-prose text-sm text-pretty text-foreground/85 sm:text-base")}
              style={stagger(3)}
            >
              {content.description}
            </p>

            <div className={cn(ENTER, "mt-1 flex flex-wrap items-center gap-3")} style={stagger(4)}>
              <LinkButton href={play.href} size="xl">
                <HugeiconsIcon icon={PlayIcon} strokeWidth={2} className="fill-current" />
                {play.label}
              </LinkButton>
              <MyListButton
                profileId={profileId}
                contentId={content.contentId}
                title={content.title}
                initialInMyList={activity.inMyList}
                size="xl"
              />
            </div>

            <div className={cn(ENTER, "mt-2 w-full border-t border-foreground/10 pt-4")} style={stagger(5)}>
              <RatingControl
                profileId={profileId}
                contentId={content.contentId}
                title={content.title}
                initialRating={activity.rating}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function GenreChips({ genres }: { genres: Genre[] }) {
  return (
    <ul aria-label="Genres" className="flex flex-wrap gap-2">
      {genres.map((genre) => (
        <li key={genre.genreId}>
          <Link
            href={`/browse/genre/${genre.genreId}`}
            className={cn(
              "inline-flex h-7 items-center rounded-full border border-foreground/15 bg-background/30 px-3 text-xs font-medium text-foreground/85 outline-none backdrop-blur-sm",
              "transition-colors duration-150 hover-fine:border-foreground/30 hover-fine:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            {genre.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}
