import Image from "next/image";

import { formatYear } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ContentSummary, Episode, Person } from "@/types";

import { GeneratedArt, type ArtKind } from "./generated-art";

/**
 * Real image via next/image when a URL exists (TMDB), generated art otherwise.
 * The wrapper is `relative` + `@container` so it must be given a size/aspect by the caller.
 */
interface ArtworkProps {
  src: string | null;
  alt: string;
  kind: ArtKind;
  seed: string;
  title?: string;
  caption?: string;
  sizes: string;
  preload?: boolean;
  className?: string;
  imageClassName?: string;
}

export function Artwork({
  src,
  alt,
  kind,
  seed,
  title,
  caption,
  sizes,
  preload,
  className,
  imageClassName,
}: ArtworkProps) {
  return (
    <div className={cn("@container relative overflow-hidden bg-muted", className)}>
      {src ? (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes}
          preload={preload}
          className={cn("object-cover", imageClassName)}
        />
      ) : (
        <GeneratedArt seed={seed} kind={kind} title={title} caption={caption} className={imageClassName} />
      )}
    </div>
  );
}

const typeLabel = (content: Pick<ContentSummary, "contentType">) =>
  content.contentType === "MOVIE" ? "Film" : "Series";

export function Poster({
  content,
  sizes = "(min-width: 1280px) 14vw, (min-width: 768px) 20vw, 40vw",
  preload,
  className,
  imageClassName,
}: {
  content: Pick<ContentSummary, "title" | "posterUrl" | "releaseDate" | "contentType">;
  sizes?: string;
  preload?: boolean;
  className?: string;
  imageClassName?: string;
}) {
  const year = formatYear(content.releaseDate);
  return (
    <Artwork
      src={content.posterUrl}
      alt={`${content.title} poster`}
      kind="poster"
      seed={content.title}
      title={content.title}
      caption={[year, typeLabel(content)].filter(Boolean).join(" · ")}
      sizes={sizes}
      preload={preload}
      className={cn("aspect-[2/3]", className)}
      imageClassName={imageClassName}
    />
  );
}

export function Backdrop({
  content,
  sizes = "100vw",
  preload,
  className,
  imageClassName,
}: {
  content: Pick<ContentSummary, "title" | "backdropUrl">;
  sizes?: string;
  preload?: boolean;
  className?: string;
  imageClassName?: string;
}) {
  return (
    <Artwork
      src={content.backdropUrl}
      alt=""
      kind="backdrop"
      seed={`${content.title}·backdrop`}
      sizes={sizes}
      preload={preload}
      className={className}
      imageClassName={imageClassName}
    />
  );
}

export function EpisodeStill({
  episode,
  seriesTitle,
  className,
  sizes = "(min-width: 768px) 240px, 40vw",
}: {
  episode: Pick<Episode, "title" | "stillUrl" | "episodeNumber">;
  seriesTitle: string;
  className?: string;
  sizes?: string;
}) {
  return (
    <Artwork
      src={episode.stillUrl}
      alt={`Still from ${episode.title}`}
      kind="still"
      seed={`${seriesTitle}·${episode.title}`}
      title={String(episode.episodeNumber).padStart(2, "0")}
      sizes={sizes}
      className={cn("aspect-video", className)}
    />
  );
}

export function PersonPhoto({ person, className }: { person: Pick<Person, "name" | "photoUrl">; className?: string }) {
  return (
    <Artwork
      src={person.photoUrl}
      alt={person.name}
      kind="person"
      seed={person.name}
      title={person.name}
      sizes="96px"
      className={cn("aspect-square rounded-full", className)}
    />
  );
}
