import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

/** Marquee-sized title; shorter titles get bigger type so long ones never overflow. */
function sizeFor(title: string): string {
  if (title.length <= 14) return "text-[clamp(3rem,10vw,7.5rem)]";
  if (title.length <= 28) return "text-[clamp(2.6rem,7vw,5.75rem)]";
  return "text-[clamp(2.2rem,5vw,4.5rem)]";
}

export function DisplayTitle({
  title,
  as: Tag = "h1",
  id,
  className,
  style,
}: {
  title: string;
  as?: "h1" | "h2";
  id?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <Tag
      id={id}
      style={style}
      className={cn(
        "font-display font-bold uppercase leading-[0.9] tracking-wide text-balance break-words drop-shadow-sm",
        sizeFor(title),
        className,
      )}
    >
      {title}
    </Tag>
  );
}
