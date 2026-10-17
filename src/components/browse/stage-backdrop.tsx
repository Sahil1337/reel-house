import { Backdrop } from "@/components/content/artwork";
import { cn } from "@/lib/utils";
import type { ContentSummary } from "@/types";

/**
 * Full-bleed backdrop art behind a hero, with scrims so overlaid text reads
 * and the bottom edge melts into the page. Purely decorative.
 */
export function StageBackdrop({
  content,
  withLamp = false,
  className,
}: {
  content: Pick<ContentSummary, "title" | "backdropUrl">;
  /** Adds the slow ambient "projector light" glow. */
  withLamp?: boolean;
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 -z-10 overflow-hidden", className)}>
      <Backdrop
        content={content}
        preload
        sizes="100vw"
        className="absolute inset-0"
        imageClassName="object-[center_25%]"
      />
      <div className="absolute inset-0 bg-linear-to-r from-scrim/90 via-scrim/50 to-scrim/5 sm:via-scrim/35 sm:to-transparent" />
      {withLamp ? <ProjectorLight /> : null}
      <div className="absolute inset-x-0 top-0 h-32 bg-linear-to-b from-scrim/60 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-3/4 bg-linear-to-t from-background via-background/65 to-transparent" />
    </div>
  );
}

/** A soft tungsten glow drifting over the art, like light spilling from the booth. */
function ProjectorLight() {
  return (
    <div
      className={cn(
        "absolute -top-1/3 -left-[15%] h-[95%] w-[80%] rounded-full bg-lamp/15 blur-[110px] mix-blend-screen will-change-transform",
        "animate-[lamp-drift_18s_ease-in-out_infinite] motion-reduce:animate-none motion-reduce:opacity-60",
      )}
    />
  );
}
