import Link from "next/link";

import { cn } from "@/lib/utils";

/** Reelhouse wordmark: a lit reel mark + condensed marquee lettering. */
export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link
      href={href}
      aria-label="Reelhouse home"
      className={cn(
        "group inline-flex items-center gap-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <LogoMark className="size-6" />
      <span className="font-display text-xl font-extrabold uppercase leading-none tracking-[0.06em] text-foreground">
        Reel<span className="text-primary">house</span>
      </span>
    </Link>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn("text-primary", className)}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      {[0, 72, 144, 216, 288].map((angle) => (
        <circle
          key={angle}
          cx={12 + 5.6 * Math.cos(((angle - 90) * Math.PI) / 180)}
          cy={12 + 5.6 * Math.sin(((angle - 90) * Math.PI) / 180)}
          r="1.9"
          fill="currentColor"
          opacity="0.85"
        />
      ))}
    </svg>
  );
}
