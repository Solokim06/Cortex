"use client";

import { useTranslations } from "next-intl";

/**
 * Renders backend-returned enum values through next-intl so that strings
 * like "high", "medium", "Deep", "Growing" get translated on the client.
 * Falls back to the raw value when no key exists, so unknown values from
 * the API don't crash the UI.
 */
export function useEnumLabel() {
  const tCommon = useTranslations("common");
  const tIdentity = useTranslations("identity");

  return {
    confidence(value: string | null | undefined): string {
      if (!value) return "";
      const normalized = value.trim().toLowerCase();
      if (normalized === "high") return tCommon("confidenceHigh");
      if (normalized === "medium") return tCommon("confidenceMedium");
      if (normalized === "low") return tCommon("confidenceLow");
      return value;
    },
    tier(value: string | null | undefined): string {
      if (!value) return "";
      const normalized = value.replace(/\s+/g, "");
      const keyMap: Record<string, string> = {
        Deep: "tierDeep",
        Growing: "tierGrowing",
        Exploring: "tierExploring",
        Reflective: "tierReflective",
        Emerging: "tierEmerging",
      };
      const key = keyMap[normalized];
      if (!key) return value;
      return tIdentity(key as Parameters<typeof tIdentity>[0]);
    },
  };
}
