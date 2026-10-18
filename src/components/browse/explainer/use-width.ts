"use client";

import { useCallback, useState } from "react";

/** Width of an element in px (0 until measured), kept up to date with a ResizeObserver. */
export function useWidth<T extends HTMLElement>() {
  const [width, setWidth] = useState(0);
  const ref = useCallback((element: T | null) => {
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}
