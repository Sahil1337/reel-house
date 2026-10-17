import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MockPlayer, type PlayerEpisode } from "@/components/player/mock-player";
import { serverApi } from "@/lib/api/server";
import { requireProfile } from "@/server/session/current-session";
import { formatEpisodeCode } from "@/lib/format";
import { isAllowedFor } from "@/lib/content/maturity";
import type { ContentDetail, Episode, Season } from "@/types";

const FALLBACK_MINUTES = { MOVIE: 110, SERIES: 45 } as const;

type Props = PageProps<"/watch/[contentId]">;

function toPlayerEpisode({ episode, season }: { episode: Episode; season: Season }): PlayerEpisode {
  return {
    episodeId: episode.episodeId,
    code: formatEpisodeCode(season.seasonNumber, episode.episodeNumber),
    title: episode.title,
  };
}

async function loadContent(param: string): Promise<ContentDetail | null> {
  const contentId = Number(param);
  return Number.isInteger(contentId) && contentId > 0 ? serverApi.findContent(contentId) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const content = await loadContent((await params).contentId);
  return { title: content ? `Watching ${content.title}` : "Player" };
}

export default async function WatchPage({ params, searchParams }: Props) {
  const [{ contentId }, { episode: episodeParam }, profile] = await Promise.all([
    params,
    searchParams,
    requireProfile(),
  ]);
  const content = await loadContent(contentId);
  if (!content || !isAllowedFor(profile.maturityLevel, content.maturityLevel)) notFound();

  const { resume } = await serverApi.getTitleActivity(profile.profileId, content.contentId);

  let episode: PlayerEpisode | null = null;
  let nextEpisode: PlayerEpisode | null = null;
  let durationMinutes = content.durationMinutes;

  if (content.contentType === "SERIES") {
    // Airing order across seasons: ?episode= wins, then the resume point, then S1:E1.
    const episodes = content.seasons.flatMap((season) => season.episodes.map((item) => ({ episode: item, season })));
    const requestedId = Number(episodeParam);
    const index =
      [requestedId, resume?.episodeId]
        .map((id) => episodes.findIndex((entry) => entry.episode.episodeId === id))
        .find((found) => found >= 0) ?? 0;
    const current = episodes[index];
    if (!current) notFound();

    episode = toPlayerEpisode(current);
    nextEpisode = episodes[index + 1] ? toPlayerEpisode(episodes[index + 1]) : null;
    durationMinutes = current.episode.durationMinutes;
  }

  // Resume where this profile left off when playing the resume point itself.
  const startPercent = resume && resume.episodeId === (episode?.episodeId ?? null) ? resume.progressPercent : 0;

  return (
    <MockPlayer
      key={`${content.contentId}:${episode?.episodeId ?? "film"}`}
      profileId={profile.profileId}
      content={{ contentId: content.contentId, title: content.title, backdropUrl: content.backdropUrl }}
      episode={episode}
      nextEpisode={nextEpisode}
      durationMinutes={durationMinutes ?? FALLBACK_MINUTES[content.contentType]}
      startPercent={startPercent}
    />
  );
}
