import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ContentCard } from "@/components/content/content-card";
import { ContentRow } from "@/components/content/content-row";
import { Credits } from "@/components/title/credits";
import { Episodes } from "@/components/title/episodes";
import { RestrictedTitle } from "@/components/title/restricted-title";
import { TitleHero, type PlayAction } from "@/components/title/title-hero";
import { serverApi } from "@/lib/api/server";
import { requireProfile } from "@/server/session/current-session";
import { formatEpisodeCode } from "@/lib/format";
import { isAllowedFor } from "@/lib/content/maturity";
import type { ContentDetail, TitleActivity } from "@/types";

type Props = PageProps<"/title/[contentId]">;

async function loadContent(param: string): Promise<ContentDetail | null> {
  const contentId = Number(param);
  return Number.isInteger(contentId) && contentId > 0 ? serverApi.findContent(contentId) : null;
}

/** Where Play goes: the resume point if there is one, else the start (S1:E1 for series). */
function getPlayAction(content: ContentDetail, activity: TitleActivity): PlayAction {
  const base = `/watch/${content.contentId}`;
  if (content.contentType === "MOVIE") return { href: base, label: activity.resume?.label ?? "Play" };

  const firstSeason = content.seasons[0];
  const firstEpisode = firstSeason?.episodes[0];
  const episodeId = activity.resume?.episodeId ?? firstEpisode?.episodeId ?? null;
  const label =
    activity.resume?.label ??
    (firstEpisode ? `Play ${formatEpisodeCode(firstSeason.seasonNumber, firstEpisode.episodeNumber)}` : "Play");
  return { href: episodeId ? `${base}?episode=${episodeId}` : base, label };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ contentId }, profile] = await Promise.all([params, requireProfile()]);
  const content = await loadContent(contentId);
  if (!content) return { title: "Title not found" };
  if (!isAllowedFor(profile.maturityLevel, content.maturityLevel)) return { title: "Not available" };
  return { title: content.title, description: content.description };
}

export default async function TitlePage({ params }: Props) {
  const [{ contentId }, profile] = await Promise.all([params, requireProfile()]);
  const content = await loadContent(contentId);
  if (!content) notFound();
  if (!isAllowedFor(profile.maturityLevel, content.maturityLevel))
    return <RestrictedTitle profileName={profile.name} />;

  const [activity, similar] = await Promise.all([
    serverApi.getTitleActivity(profile.profileId, content.contentId),
    serverApi.getSimilar(content.contentId),
  ]);

  return (
    <>
      <TitleHero
        content={content}
        profileId={profile.profileId}
        activity={activity}
        play={getPlayAction(content, activity)}
      />
      <div className="flex flex-col gap-14 pt-6 pb-16">
        {content.contentType === "SERIES" ? (
          <Episodes
            contentId={content.contentId}
            seriesTitle={content.title}
            seasons={content.seasons}
            resume={activity.resume}
          />
        ) : null}
        <Credits content={content} />
        {similar.length > 0 ? (
          <ContentRow title="More like this" reason="Picked from viewers with similar taste and shared genres">
            {similar.map((item) => (
              <ContentCard key={item.contentId} content={item} />
            ))}
          </ContentRow>
        ) : null}
      </div>
    </>
  );
}
