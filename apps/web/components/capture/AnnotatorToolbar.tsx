"use client";

import {
  MousePointer2,
  Square,
  ArrowRight,
  Type as TypeIcon,
  Hand,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type AnnotatorTool = "select" | "geo" | "arrow" | "text" | "hand";

type Editor = {
  setCurrentTool: (id: string) => void;
  getCurrentPageShapes: () => Array<{ id: string; meta?: Record<string, unknown> }>;
  deleteShapes: (ids: string[]) => void;
};

const TOOLS: { id: AnnotatorTool; icon: typeof MousePointer2; label: string }[] = [
  { id: "select", icon: MousePointer2, label: "Select" },
  { id: "geo", icon: Square, label: "Box" },
  { id: "arrow", icon: ArrowRight, label: "Arrow" },
  { id: "text", icon: TypeIcon, label: "Text" },
  { id: "hand", icon: Hand, label: "Pan" },
];

type Props = {
  editor: Editor | null;
  activeTool: AnnotatorTool;
  onToolChange: (t: AnnotatorTool) => void;
};

export function AnnotatorToolbar({ editor, activeTool, onToolChange }: Props) {
  const select = (t: AnnotatorTool) => {
    onToolChange(t);
    editor?.setCurrentTool(t);
  };

  const clearAll = () => {
    if (!editor) return;
    const shapes = editor.getCurrentPageShapes();
    const removable = shapes
      .filter((s) => !(s.meta as Record<string, unknown> | undefined)?.isBackground)
      .map((s) => s.id);
    if (removable.length > 0) editor.deleteShapes(removable);
  };

  return (
    <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border bg-card/40 shrink-0">
      {TOOLS.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => select(id)}
          title={label}
          className={cn(
            "inline-flex items-center justify-center w-8 h-8 rounded-md transition-colors",
            activeTool === id
              ? "bg-primary/15 text-primary"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
        >
          <Icon className="w-4 h-4" />
        </button>
      ))}

      <div className="flex-1" />

      <button
        type="button"
        onClick={clearAll}
        title="Clear all annotations"
        className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
        Clear
      </button>
    </div>
  );
}
