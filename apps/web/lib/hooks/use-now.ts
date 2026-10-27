"use client";

import { useEffect, useState } from "react";

/**
 * Returns a stable `Date.now()` captured on mount, plus refreshes
 * it whenever the window regains focus.
 *
 * Lives outside any component, so React Compiler's purity rule
 * doesn't try to inline the `Date.now()` call into a render path.
 */
export function useNow(): number {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const update = () => setNow(Date.now());
    window.addEventListener("focus", update);
    return () => window.removeEventListener("focus", update);
  }, []);

  return now;
}
