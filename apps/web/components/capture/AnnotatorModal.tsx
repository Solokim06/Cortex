"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";
import { ImageAnnotator, type ImageAnnotatorHandle } from "./ImageAnnotator";
import { AnnotatorToolbar, type AnnotatorTool } from "./AnnotatorToolbar";
import type { Annotation } from "@/lib/annotations";

// Same minimal editor shape the annotator exposes
type Editor = {
  setCurrentTool: (id: string) => void;
  getCurrentPageShapes: () => Array<{ id: string; meta?: Record<string, unknown> }>;
  deleteShapes: (ids: string[]) => void;
};

type Props = {
  open: boolean;
  imageSrc: string;
  initialAnnotations?: Annotation[];
  onSave: (annotations: Annotation[]) => void;
  onCancel: () => void;
};

export function AnnotatorModal({
  open,
  imageSrc,
  initialAnnotations,
  onSave,
  onCancel,
}: Props) {
  const annotatorRef = useRef<ImageAnnotatorHandle>(null);
  const [activeTool, setActiveTool] = useState<AnnotatorTool>("geo");
  const [editor, setEditor] = useState<Editor | null>(null);

  const handleSave = () => {
    const annotations = annotatorRef.current?.getAnnotations() ?? [];
    onSave(annotations);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      // reset editor state when closing so next open starts fresh
      setEditor(null);
      setActiveTool("geo");
      onCancel();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="max-w-6xl w-[92vw] h-[88vh] p-0 gap-0 flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
          <h2 className="text-sm font-medium">Annotate image</h2>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              Save annotations
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <AnnotatorToolbar
          editor={editor}
          activeTool={activeTool}
          onToolChange={setActiveTool}
        />

        {/* Canvas */}
        <div className="flex-1 min-h-0 relative bg-muted/30">
          <ImageAnnotator
            ref={annotatorRef}
            imageSrc={imageSrc}
            initialAnnotations={initialAnnotations}
            onEditorReady={(e) => setEditor(e as unknown as Editor)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
