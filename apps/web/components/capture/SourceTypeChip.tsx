"use client";

import { useTranslations } from "next-intl";
import {
  FileText,
  Mic,
  Link2,
  File,
  Image as ImageIcon,
  Video,
  FileSpreadsheet,
  FileJson,
  FileType,
  Sparkles,
  Lightbulb,
  HelpCircle,
  User,
  Calendar,
  BookOpen,
  Bookmark,
  Zap,
  CheckSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

type SourceType =
  | "text"
  | "manual"
  | "voice"
  | "url"
  | "file"
  | "image"
  | "video"
  | "pdf"
  | "docx"
  | "xlsx"
  | "csv"
  | "json"
  | "thought"
  | "concept"
  | "idea"
  | "question"
  | "note"
  | "person"
  | "event"
  | "resource"
  | "insight"
  | "task"
  | string;

type Props = {
  type: SourceType | null | undefined;
  className?: string;
  iconOnly?: boolean;
};

type ChipSpec = {
  labelKey: string | null;
  labelLiteral: string | null;
  Icon: React.ComponentType<{ className?: string }>;
  tone: string;
};

/**
 * Source-type specs. Either `labelKey` (translated via capture.sourceType.*)
 * or `labelLiteral` (untranslated — used for acronyms like PDF/JSON/CSV).
 */
const SPECS: Record<string, ChipSpec> = {
  // ── Source types (from backend source_type) ──
  text: {
    labelKey: "text",
    labelLiteral: null,
    Icon: FileText,
    tone: "border-sky-500/40 text-sky-600 dark:text-sky-400",
  },
  manual: {
    labelKey: "text",
    labelLiteral: null,
    Icon: FileText,
    tone: "border-sky-500/40 text-sky-600 dark:text-sky-400",
  },
  voice: {
    labelKey: "voice",
    labelLiteral: null,
    Icon: Mic,
    tone: "border-violet-500/40 text-violet-600 dark:text-violet-400",
  },
  url: {
    labelKey: "link",
    labelLiteral: null,
    Icon: Link2,
    tone: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  },
  file: {
    labelKey: "file",
    labelLiteral: null,
    Icon: File,
    tone: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  },
  image: {
    labelKey: "image",
    labelLiteral: null,
    Icon: ImageIcon,
    tone: "border-pink-500/40 text-pink-600 dark:text-pink-400",
  },
  video: {
    labelKey: "video",
    labelLiteral: null,
    Icon: Video,
    tone: "border-rose-500/40 text-rose-600 dark:text-rose-400",
  },
  pdf: {
    labelKey: null,
    labelLiteral: "PDF",
    Icon: FileType,
    tone: "border-red-500/40 text-red-600 dark:text-red-400",
  },
  docx: {
    labelKey: "doc",
    labelLiteral: null,
    Icon: FileText,
    tone: "border-blue-500/40 text-blue-600 dark:text-blue-400",
  },
  xlsx: {
    labelKey: "sheet",
    labelLiteral: null,
    Icon: FileSpreadsheet,
    tone: "border-green-500/40 text-green-600 dark:text-green-400",
  },
  csv: {
    labelKey: null,
    labelLiteral: "CSV",
    Icon: FileSpreadsheet,
    tone: "border-green-500/40 text-green-600 dark:text-green-400",
  },
  json: {
    labelKey: null,
    labelLiteral: "JSON",
    Icon: FileJson,
    tone: "border-indigo-500/40 text-indigo-600 dark:text-indigo-400",
  },

  // ── Node types (from node.type, used as fallback) ──
  thought: {
    labelKey: "text",
    labelLiteral: null,
    Icon: FileText,
    tone: "border-sky-500/40 text-sky-600 dark:text-sky-400",
  },
  concept: {
    labelKey: "concept",
    labelLiteral: null,
    Icon: Sparkles,
    tone: "border-purple-500/40 text-purple-600 dark:text-purple-400",
  },
  idea: {
    labelKey: "idea",
    labelLiteral: null,
    Icon: Lightbulb,
    tone: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  },
  question: {
    labelKey: "question",
    labelLiteral: null,
    Icon: HelpCircle,
    tone: "border-cyan-500/40 text-cyan-600 dark:text-cyan-400",
  },
  note: {
    labelKey: "note",
    labelLiteral: null,
    Icon: FileText,
    tone: "border-sky-500/40 text-sky-600 dark:text-sky-400",
  },
  person: {
    labelKey: "person",
    labelLiteral: null,
    Icon: User,
    tone: "border-teal-500/40 text-teal-600 dark:text-teal-400",
  },
  event: {
    labelKey: "event",
    labelLiteral: null,
    Icon: Calendar,
    tone: "border-orange-500/40 text-orange-600 dark:text-orange-400",
  },
  resource: {
    labelKey: "resource",
    labelLiteral: null,
    Icon: BookOpen,
    tone: "border-lime-500/40 text-lime-600 dark:text-lime-400",
  },
  insight: {
    labelKey: "insight",
    labelLiteral: null,
    Icon: Zap,
    tone: "border-yellow-500/40 text-yellow-600 dark:text-yellow-400",
  },
  task: {
    labelKey: "task",
    labelLiteral: null,
    Icon: CheckSquare,
    tone: "border-fuchsia-500/40 text-fuchsia-600 dark:text-fuchsia-400",
  },
  bookmark: {
    labelKey: "bookmark",
    labelLiteral: null,
    Icon: Bookmark,
    tone: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  },
};

const FALLBACK: ChipSpec = {
  labelKey: "capture",
  labelLiteral: null,
  Icon: Sparkles,
  tone: "border-border text-muted-foreground",
};

export function SourceTypeChip({ type, className, iconOnly = false }: Props) {
  const t = useTranslations("capture.sourceType");
  const key = (type ?? "").toLowerCase();
  const spec = SPECS[key] ?? FALLBACK;
  const { Icon, tone, labelKey, labelLiteral } = spec;

  // Prefer a translated label; fall back to a literal (e.g. "PDF"),
  // then to the raw `type` value, then to the fallback translation.
  const label =
    (labelKey ? t(labelKey) : null) ||
    labelLiteral ||
    type ||
    t("capture");

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone,
        className,
      )}
      title={label}
    >
      <Icon className="w-3 h-3" />
      {!iconOnly && <span>{label}</span>}
    </span>
  );
}
