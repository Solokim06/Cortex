"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Global keyboard shortcuts:
 *   g h → /home
 *   g c → /capture
 *   g m → /chat
 *   g M → /memory (shift)
 *   g l → /learning
 *   g d → /decisions
 *   g r → /reflections
 *   g i → /identity
 */
const ROUTES: Record<string, string> = {
  h: "/home",
  c: "/capture",
  m: "/chat",
  M: "/memory",
  l: "/learning",
  d: "/decisions",
  r: "/reflections",
  i: "/identity",
};

export function KeyboardShortcuts() {
  const router = useRouter();

  useEffect(() => {
    let pendingG = false;
    let timer: NodeJS.Timeout | null = null;

    const handler = (e: KeyboardEvent) => {
      // Ignore when typing in inputs / textareas
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        return;
      }

      // Ignore when modifier keys are held
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "g") {
        pendingG = true;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          pendingG = false;
        }, 1200);
        return;
      }

      if (pendingG && ROUTES[e.key]) {
        e.preventDefault();
        router.push(ROUTES[e.key]);
        pendingG = false;
        if (timer) clearTimeout(timer);
      }
    };

    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("keydown", handler);
      if (timer) clearTimeout(timer);
    };
  }, [router]);

  return null;
}
