"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  BookOpen,
  ChevronRight,
  Loader2,
  Puzzle,
  Sparkles,
  MessageSquare,
  Brain,
  GraduationCap,
  GitBranch,
  Lightbulb,
  User as UserIcon,
  Settings as SettingsIcon,
  Shield,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { useDocsInCategory, useHelpTopics } from "@/lib/hooks/use-help";

/**
 * Icon mapping by category name. Categories come from the backend
 * (help_docs.json), which uses friendly strings like "Browser extension",
 * "Capture", "Chat", etc. Anything unmapped falls back to BookOpen.
 */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  // English (source)
  "Browser extension": Puzzle,
  Capture: Sparkles,
  Chat: MessageSquare,
  Memory: Brain,
  Learning: GraduationCap,
  Decisions: GitBranch,
  Reflections: Lightbulb,
  Identity: UserIcon,
  Settings: SettingsIcon,
  "Privacy & data": Shield,
  Troubleshooting: LifeBuoy,
  "How Cortex works": Sparkles,
  // Spanish
  "Extensión del navegador": Puzzle,
  Captura: Sparkles,
  Memoria: Brain,
  Aprendizaje: GraduationCap,
  Decisiones: GitBranch,
  Reflexiones: Lightbulb,
  Identidad: UserIcon,
  Ajustes: SettingsIcon,
  "Privacidad y datos": Shield,
  "Solución de problemas": LifeBuoy,
  "Cómo funciona Cortex": Sparkles,
  // French
  "Extension du navigateur": Puzzle,
  Mémoire: Brain,
  Apprentissage: GraduationCap,
  Décisions: GitBranch,
  Réflexions: Lightbulb,
  Identité: UserIcon,
  Paramètres: SettingsIcon,
  "Confidentialité et données": Shield,
  Dépannage: LifeBuoy,
  "Comment fonctionne Cortex": Sparkles,
  // German
  "Browser-Erweiterung": Puzzle,
  Erfassung: Sparkles,
  Gedächtnis: Brain,
  Lernen: GraduationCap,
  Entscheidungen: GitBranch,
  Reflexionen: Lightbulb,
  Identität: UserIcon,
  Einstellungen: SettingsIcon,
  "Datenschutz & Daten": Shield,
  Fehlerbehebung: LifeBuoy,
  "Wie Cortex funktioniert": Sparkles,
  // Arabic
  "إضافة المتصفح": Puzzle,
  الالتقاط: Sparkles,
  الذاكرة: Brain,
  "التعلّم": GraduationCap,
  القرارات: GitBranch,
  التأملات: Lightbulb,
  الهوية: UserIcon,
  الإعدادات: SettingsIcon,
  "الخصوصية والبيانات": Shield,
  "استكشاف الأخطاء": LifeBuoy,
  "كيف يعمل Cortex": Sparkles,
  // Swahili
  "Kiendelezi cha kivinjari": Puzzle,
  Kunasa: Sparkles,
  Kumbukumbu: Brain,
  Kujifunza: GraduationCap,
  Maamuzi: GitBranch,
  Tafakari: Lightbulb,
  Utambulisho: UserIcon,
  Mipangilio: SettingsIcon,
  "Faragha na data": Shield,
  "Utatuzi wa matatizo": LifeBuoy,
  "Jinsi Cortex inavyofanya kazi": Sparkles,
};

const TONE_BY_SLUG: Record<string, string> = {
  "Browser extension": "text-violet-500",
  Capture: "text-primary",
  Chat: "text-primary",
  Memory: "text-emerald-500",
  Learning: "text-sky-500",
  Decisions: "text-amber-500",
  Reflections: "text-rose-500",
  Identity: "text-indigo-500",
  Settings: "text-muted-foreground",
  "Privacy & data": "text-rose-500",
  Troubleshooting: "text-orange-500",
  "How Cortex works": "text-primary",
};

// Map every localized category name back to the English slug so tone
// lookup keeps working even when the backend does not send `slug`.
const CATEGORY_TO_SLUG: Record<string, string> = {
  // Spanish
  Ajustes: "Settings",
  Aprendizaje: "Learning",
  Captura: "Capture",
  Memoria: "Memory",
  Decisiones: "Decisions",
  Reflexiones: "Reflections",
  Identidad: "Identity",
  "Extensión del navegador": "Browser extension",
  "Privacidad y datos": "Privacy & data",
  "Solución de problemas": "Troubleshooting",
  "Cómo funciona Cortex": "How Cortex works",
  // French
  "Extension du navigateur": "Browser extension",
  Mémoire: "Memory",
  Apprentissage: "Learning",
  Décisions: "Decisions",
  Réflexions: "Reflections",
  Identité: "Identity",
  Paramètres: "Settings",
  "Confidentialité et données": "Privacy & data",
  Dépannage: "Troubleshooting",
  "Comment fonctionne Cortex": "How Cortex works",
  // German
  "Browser-Erweiterung": "Browser extension",
  Erfassung: "Capture",
  Gedächtnis: "Memory",
  Lernen: "Learning",
  Entscheidungen: "Decisions",
  Reflexionen: "Reflections",
  Identität: "Identity",
  Einstellungen: "Settings",
  "Datenschutz & Daten": "Privacy & data",
  Fehlerbehebung: "Troubleshooting",
  "Wie Cortex funktioniert": "How Cortex works",
  // Arabic
  "إضافة المتصفح": "Browser extension",
  الالتقاط: "Capture",
  الذاكرة: "Memory",
  "التعلّم": "Learning",
  القرارات: "Decisions",
  التأملات: "Reflections",
  الهوية: "Identity",
  الإعدادات: "Settings",
  "الخصوصية والبيانات": "Privacy & data",
  "استكشاف الأخطاء": "Troubleshooting",
  "كيف يعمل Cortex": "How Cortex works",
  // Swahili
  "Kiendelezi cha kivinjari": "Browser extension",
  Kunasa: "Capture",
  Kumbukumbu: "Memory",
  Kujifunza: "Learning",
  Maamuzi: "Decisions",
  Tafakari: "Reflections",
  Utambulisho: "Identity",
  Mipangilio: "Settings",
  "Faragha na data": "Privacy & data",
  "Utatuzi wa matatizo": "Troubleshooting",
  "Jinsi Cortex inavyofanya kazi": "How Cortex works",
};

const CATEGORY_TONES: Record<string, string> = new Proxy(TONE_BY_SLUG, {
  get(target, prop: string) {
    const slug = CATEGORY_TO_SLUG[prop] ?? prop;
    return target[slug] ?? "text-muted-foreground";
  },
});

/**
 * Renders a grid of topic cards. Clicking a card expands it inline to
 * show its docs; clicking a doc opens the shared HelpDocDrawer via the
 * `cortex:help:open-doc` event.
 */
export function TopicGrid({ isPublic = false }: { isPublic?: boolean } = {}) {
  const t = useTranslations("help.topics");
  const topicsQuery = useHelpTopics(isPublic);

  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const toggle = (category: string) => {
    setActiveCategory((cur) => (cur === category ? null : category));
  };

  return (
    <div className="rounded-xl border border-border bg-card/40 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/60">
        <div className="rounded-md bg-primary/10 p-1.5">
          <BookOpen className="w-3.5 h-3.5 text-primary" />
        </div>
        <p className="text-sm font-medium">{t("title")}</p>
      </div>

      {/* Body */}
      {topicsQuery.isLoading && (
        <div className="flex items-center gap-2 px-4 py-6 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          {t("loading")}
        </div>
      )}

      {!topicsQuery.isLoading && (topicsQuery.data ?? []).length === 0 && (
        <p className="px-4 py-6 text-xs text-muted-foreground">
          {t("empty")}
        </p>
      )}

      {!topicsQuery.isLoading && (topicsQuery.data ?? []).length > 0 && (
        <div className="divide-y divide-border/40">
          {(topicsQuery.data ?? []).map((topic) => {
            const slug = (topic as { slug?: string }).slug ?? topic.category;
            const Icon = CATEGORY_ICONS[slug] ?? CATEGORY_ICONS[CATEGORY_TO_SLUG[slug] ?? ""] ?? BookOpen;
            const tone = CATEGORY_TONES[slug] ?? "text-muted-foreground";
            const active = activeCategory === slug;

            return (
              <div key={slug}>
                <button
                  type="button"
                  onClick={() => toggle(slug)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-4 py-2.5 text-left transition-colors",
                    active
                      ? "bg-primary/5"
                      : "hover:bg-accent/40",
                  )}
                >
                  <div
                    className={cn(
                      "shrink-0 rounded-md p-1.5",
                      active ? "bg-primary/15" : "bg-muted/40",
                    )}
                  >
                    <Icon className={cn("w-3.5 h-3.5", tone)} />
                  </div>
                  <span
                    className={cn(
                      "flex-1 text-xs font-medium truncate",
                      active ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {topic.category}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                    {topic.count}
                  </span>
                  <ChevronRight
                    className={cn(
                      "w-3 h-3 text-muted-foreground shrink-0 transition-transform",
                      active && "rotate-90",
                    )}
                  />
                </button>

                {active && (
                  <CategoryDocs category={slug} isPublic={isPublic} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// expanded docs list
// =====================================================================

function CategoryDocs({ category, isPublic = false }: { category: string; isPublic?: boolean }) {
  const t = useTranslations("help.topics");
  const docsQuery = useDocsInCategory(category, isPublic);

  const openDoc = (docId: string) => {
    window.dispatchEvent(
      new CustomEvent("cortex:help:open-doc", { detail: { docId } }),
    );
  };

  if (docsQuery.isLoading) {
    return (
      <div className="px-4 pb-3 pt-1 ml-8 flex items-center gap-2 text-[11px] text-muted-foreground">
        <Loader2 className="w-2.5 h-2.5 animate-spin" />
        {t("loadingDocs")}
      </div>
    );
  }

  const docs = docsQuery.data ?? [];
  if (docs.length === 0) {
    return (
      <div className="px-4 pb-3 pt-1 ml-8 text-[11px] text-muted-foreground italic">
        {t("empty")}
      </div>
    );
  }

  return (
    <div className="pl-12 pr-4 pb-3 pt-1">
      <ul className="space-y-0.5">
        {docs.map((doc) => (
          <li key={doc.id}>
            <button
              type="button"
              onClick={() => openDoc(doc.id)}
              className={cn(
                "w-full text-left text-[11px] py-1 px-1.5 rounded",
                "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                "transition-colors truncate",
              )}
            >
              {doc.title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
