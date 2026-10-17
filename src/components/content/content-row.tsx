"use client";

import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

/**
 * A titled, horizontally scrolling shelf with scroll-snap and arrow buttons.
 * Arrows appear on fine pointers only; touch users swipe. Items are passed
 * as children (server-rendered cards), each becomes a snap point.
 */
export function ContentRow({
  title,
  reason,
  action,
  variant = "poster",
  children,
  className,
}: {
  title: string;
  /** Why this row exists — shown subtly next to the title. */
  reason?: string;
  action?: ReactNode;
  variant?: "poster" | "landscape";
  children: ReactNode;
  className?: string;
}) {
  const scroller = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [update]);

  const scrollByPage = (direction: 1 | -1) => {
    const el = scroller.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: direction * el.clientWidth * 0.85, behavior: reduce ? "auto" : "smooth" });
  };

  const items = Children.toArray(children);

  return (
    <section className={cn("group/row relative", className)} aria-label={title}>
      <header className="mb-3 flex items-end justify-between gap-4 px-4 sm:px-8 lg:px-12">
        <div className="min-w-0">
          <h2 className="font-display text-2xl font-bold uppercase leading-none tracking-wide sm:text-[1.7rem]">
            {title}
          </h2>
          {reason ? <p className="mt-1.5 truncate text-xs text-muted-foreground sm:text-sm">{reason}</p> : null}
        </div>
        {action}
      </header>

      <div className="relative">
        <ul
          ref={scroller}
          className={cn(
            "no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain py-3 sm:gap-4",
            "scroll-px-4 px-4 sm:scroll-px-8 sm:px-8 lg:scroll-px-12 lg:px-12",
          )}
        >
          {items.map((child, index) => (
            <li
              key={index}
              className={cn(
                "shrink-0 snap-start",
                variant === "poster"
                  ? "w-[38vw] sm:w-[24vw] md:w-[19vw] lg:w-[15vw] xl:w-[12.5vw] 2xl:w-[11vw]"
                  : "w-[72vw] sm:w-[44vw] md:w-[34vw] lg:w-[26vw] xl:w-[22vw]",
              )}
            >
              {child}
            </li>
          ))}
        </ul>

        <RowArrow direction={-1} hidden={edges.start} onClick={() => scrollByPage(-1)} />
        <RowArrow direction={1} hidden={edges.end} onClick={() => scrollByPage(1)} />
      </div>
    </section>
  );
}

function RowArrow({ direction, hidden, onClick }: { direction: 1 | -1; hidden: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={direction === 1 ? "Scroll right" : "Scroll left"}
      tabIndex={hidden ? -1 : 0}
      className={cn(
        "absolute inset-y-3 z-10 hidden w-10 cursor-pointer place-items-center text-foreground outline-none lg:w-12 [@media(hover:hover)]:grid",
        "from-background/95 to-transparent opacity-0 transition-opacity duration-200",
        "group-hover/row:opacity-100 focus-visible:opacity-100",
        direction === 1 ? "right-0 bg-linear-to-l" : "left-0 bg-linear-to-r",
        hidden && "pointer-events-none group-hover/row:opacity-0",
      )}
    >
      <span className="grid size-9 place-items-center rounded-full bg-background/70 ring-1 ring-foreground/15 backdrop-blur transition-transform duration-150 ease-out active:scale-95 group-focus-visible:ring-ring">
        <HugeiconsIcon icon={direction === 1 ? ArrowRight01Icon : ArrowLeft01Icon} className="size-5" strokeWidth={2} />
      </span>
    </button>
  );
}
