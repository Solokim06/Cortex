"use client";

import { useRef, useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { AttachmentMenu } from "./AttachmentMenu";
import { ACCEPT_STRING, validateFile } from "@/lib/attachments";

type Props = {
  onFileSelected: (file: File) => void;
  onUrlRequested?: () => void;
  onVoiceRequested?: () => void;
  disabled?: boolean;
};

type MenuAction = "upload" | "camera" | "voice" | "url";

export function AttachmentButton({
  onFileSelected,
  onUrlRequested,
  onVoiceRequested,
  disabled = false,
}: Props) {
  const t = useTranslations("attachments.button");
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  const handleMenuSelect = (action: MenuAction) => {
    switch (action) {
      case "upload":
        fileInputRef.current?.click();
        break;
      case "camera":
        cameraInputRef.current?.click();
        break;
      case "voice":
        onVoiceRequested?.();
        break;
      case "url":
        onUrlRequested?.();
        break;
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateFile(file);
    if (!validation.valid) {
      toast.error(t("cannotAttach"), {
        description: validation.error,
      });
      // Reset input so the same file can be selected again
      e.target.value = "";
      return;
    }

    onFileSelected(file);
    e.target.value = "";
  };

  return (
    <div ref={containerRef} className="relative">
      <Button
        type="button"
        size="icon"
        variant="ghost"
        disabled={disabled}
        onClick={() => setMenuOpen((v) => !v)}
        className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
        aria-label={t("attachFileAria")}
      >
        <Paperclip className="w-4 h-4" />
      </Button>

      {menuOpen && (
        <AttachmentMenu
          onSelect={handleMenuSelect}
          onClose={() => setMenuOpen(false)}
        />
      )}

      {/* Hidden file input — general uploads */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_STRING}
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Hidden file input — camera capture (mobile) */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}
