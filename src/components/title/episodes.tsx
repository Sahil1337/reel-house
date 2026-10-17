import { formatDate, formatRuntime } from "@/lib/format";
import type { Season, TitleActivity } from "@/types";

import { SeasonBrowser, type SeasonView } from "./season-browser";

function toSeasonView(season: Season): SeasonView {
  return {
    seasonId: season.seasonId,
    name: season.name,
    episodes: season.episodes.map((episode) => ({
      episodeId: episode.episodeId,
      episodeNumber: episode.episodeNumber,
      title: episode.title,
      description: episode.description,
      stillUrl: episode.stillUrl,
      runtime: formatRuntime(episode.durationMinutes),
      airDate: episode.releaseDate ? formatDate(episode.releaseDate) : null,
    })),
  };
}

/** Server wrapper: formats episode data once, then hands it to the interactive browser. */
export function Episodes({
  contentId,
  seriesTitle,
  seasons,
  resume,
}: {
  contentId: number;
  seriesTitle: string;
  seasons: Season[];
  resume: TitleActivity["resume"];
}) {
  const views = seasons.filter((season) => season.episodes.length > 0).map(toSeasonView);
  if (views.length === 0) return null;

  return (
    <SeasonBrowser
      contentId={contentId}
      seriesTitle={seriesTitle}
      seasons={views}
      resume={resume?.episodeId ? { episodeId: resume.episodeId, progressPercent: resume.progressPercent } : null}
    />
  );
}
