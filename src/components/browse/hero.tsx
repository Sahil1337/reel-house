import { HugeiconsIcon } from "@hugeicons/react";
import { InformationCircleIcon, PlayIcon } from "@hugeicons/core-free-icons";

import { ContentMeta, MatchBadge } from "@/components/content/content-meta";
import { MyListButton } from "@/components/content/my-list-button";
import { cn } from "@/lib/utils";
import type { HomeHero } from "@/types";

import { DisplayTitle } from "./display-title";
import { LinkButton } from "./link-button";
import { StageBackdrop } from "./stage-backdrop";

const ENTER = "animate-[fade-up_420ms_var(--ease-out-strong)_both] motion-reduce:animate-none";
const stagger = (step: number) => ({ animationDelay: `${80 + step * 60}ms` });

/** Full-bleed feature that sits under the transparent nav at the top of Home. */
export function Hero({ hero, profileId, inMyList }: { hero: HomeHero; profileId: number; inMyList: boolean }) {
  const { content, reason, match } = hero;

  return (
    <section
      aria-labelledby="hero-title"
      className="relative isolate flex min-h-[68svh] items-end sm:min-h-[76svh] lg:min-h-[85svh]"
    >
      <StageBackdrop content={content} withLamp />

      <div className="w-full px-4 pt-28 pb-24 sm:px-8 sm:pb-28 lg:px-12 lg:pb-36">
        <div className="flex max-w-xl flex-col items-start gap-4 lg:max-w-2xl">
          <p
            className={cn(
              ENTER,
              "flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-medium tracking-[0.16em] text-foreground/80 uppercase",
            )}
            style={stagger(0)}
          >
            <span>{reason}</span>
            {match !== undefined ? (
              <>
                <span aria-hidden="true" className="h-3 w-px bg-foreground/25" />
                <MatchBadge match={match} className="tracking-normal normal-case" />
              </>
            ) : null}
          </p>

          <DisplayTitle as="h2" id="hero-title" title={content.title} className={ENTER} style={stagger(1)} />

          <div className={ENTER} style={stagger(2)}>
            <ContentMeta content={content} className="text-foreground/75" />
          </div>

          <p
            className={cn(ENTER, "line-clamp-3 max-w-prose text-sm text-pretty text-foreground/80 sm:text-base")}
            style={stagger(3)}
          >
            {content.description}
          </p>

          <div className={cn(ENTER, "mt-2 flex flex-wrap items-center gap-3")} style={stagger(4)}>
            <LinkButton href={`/watch/${content.contentId}`} size="xl">
              <HugeiconsIcon icon={PlayIcon} strokeWidth={2} className="fill-current" />
              Play
            </LinkButton>
            <LinkButton href={`/title/${content.contentId}`} size="xl" variant="outline">
              <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} />
              More info
            </LinkButton>
            <MyListButton
              profileId={profileId}
              contentId={content.contentId}
              title={content.title}
              initialInMyList={inMyList}
              iconOnly
              className="size-11 sm:size-10"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
