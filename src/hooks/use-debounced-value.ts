"use client";

import { useEffect, useState } from "react";

/** `value`, but only after it has stopped changing for `delay` ms (for search boxes that hit the API). */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
