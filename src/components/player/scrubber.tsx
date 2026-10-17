"use client";

import { SliderPrimitive } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

import { formatTimecode } from "./timecode";

/**
 * Seek bar built from the kit's Base UI slider parts — the packaged `Slider`
 * doesn't forward an accessible name or value text to its thumb.
 */
export function Scrubber({
  position,
  duration,
  onScrub,
  onCommit,
  className,
}: {
  position: number;
  duration: number;
  /** Fires continuously; `dragging` is true while a thumb drag is in progress. */
  onScrub: (seconds: number, dragging: boolean) => void;
  /** Fires once the seek is finished (drag release, click, or key press). */
  onCommit: (seconds: number) => void;
  className?: string;
}) {
  return (
    <SliderPrimitive.Root
      value={position}
      min={0}
      max={duration}
      step={10}
      largeStep={60}
      thumbAlignment="edge"
      onValueChange={(value, details) => onScrub(Number(value), details.reason === "drag")}
      onValueCommitted={(value) => onCommit(Number(value))}
      className={cn("w-full", className)}
    >
      <SliderPrimitive.Control className="group/scrub flex h-6 w-full cursor-pointer touch-none items-center select-none">
        <SliderPrimitive.Track className="relative h-1 w-full rounded-full bg-foreground/20">
          <SliderPrimitive.Indicator className="rounded-full bg-primary" />
          <SliderPrimitive.Thumb
            aria-label="Seek"
            getAriaValueText={(_, value) => `${formatTimecode(value)} of ${formatTimecode(duration)}`}
            className={cn(
              "block size-3.5 rounded-full bg-primary shadow-md outline-none",
              "transition-transform duration-150 ease-out-strong group-hover/scrub:scale-125 data-dragging:scale-125 motion-reduce:transition-none",
              "has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2 has-focus-visible:ring-offset-scrim",
            )}
          />
        </SliderPrimitive.Track>
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  );
}
