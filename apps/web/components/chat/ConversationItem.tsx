"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  X,
  Pin,
  PinOff,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@/lib/hooks/use-cortex";

type Props = {
  conversation: ConversationSummary;
  active: boolean;
  onSelect: () => void;
  onRename: (newTitle: string) => void;
  onDelete: () => void;
  onPinToggle: () => void;
};

export function ConversationItem({
  conversation,
  active,
  onSelect,
  onRename,
  onDelete,
  onPinToggle,
}: Props) {
  const t = useTranslations("chat.conversationItem");
  const tCommon = useTranslations("common");
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(conversation.title);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleRename = () => {
    const trimmed = draftTitle.trim();
    if (trimmed && trimmed !== conversation.title) {
      onRename(trimmed);
    } else {
      setDraftTitle(conversation.title);
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleRename();
    } else if (e.key === "Escape") {
      setDraftTitle(conversation.title);
      setEditing(false);
    }
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1 px-1.5 py-1">
        <input
          autoFocus
          type="text"
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleRename}
          className="flex-1 min-w-0 bg-background border border-primary/40 rounded-md px-2 py-1 text-xs outline-none"
        />
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={handleRename}
          className="p-1 text-muted-foreground hover:text-foreground"
          aria-label={tCommon("save")}
        >
          <Check className="w-3 h-3" />
        </button>
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setDraftTitle(conversation.title);
            setEditing(false);
          }}
          className="p-1 text-muted-foreground hover:text-foreground"
          aria-label={tCommon("cancel")}
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative flex items-center gap-2 rounded-md px-2 py-1.5 cursor-pointer transition-colors min-w-0",
        active
          ? "bg-accent text-foreground"
          : "text-foreground/80 hover:bg-accent/50 hover:text-foreground",
      )}
      onClick={onSelect}
      title={conversation.title}
    >
      {/* Icon: pin if pinned, otherwise message square */}
      {conversation.pinned ? (
        <Pin className="w-3 h-3 shrink-0 text-primary fill-primary" />
      ) : (
        <MessageSquare
          className={cn(
            "w-3.5 h-3.5 shrink-0",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        />
      )}

      {/* Title */}
      <p className="text-[13px] truncate flex-1 min-w-0 leading-tight">
        {conversation.title}
      </p>

      {/* Hover menu trigger */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          setMenuOpen((v) => !v);
        }}
        className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 text-muted-foreground hover:text-foreground transition-opacity shrink-0"
        aria-label={t("moreOptions")}
      >
        <MoreHorizontal className="w-3.5 h-3.5" />
      </button>

      {/* Popover menu */}
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(false);
            }}
            aria-hidden
          />
          <div className="absolute right-1 top-full mt-1 z-20 w-36 rounded-md border border-border bg-popover shadow-lg overflow-hidden py-0.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onPinToggle();
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-accent transition-colors"
            >
              {conversation.pinned ? (
                <>
                  <PinOff className="w-3 h-3" />
                  {t("unpin")}
                </>
              ) : (
                <>
                  <Pin className="w-3 h-3" />
                  {t("pin")}
                </>
              )}
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                setDraftTitle(conversation.title);
                setEditing(true);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left hover:bg-accent transition-colors"
            >
              <Pencil className="w-3 h-3" />
              {t("rename")}
            </button>

            <div className="my-0.5 border-t border-border" />

            <button
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
                onDelete();
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 className="w-3 h-3" />
              {tCommon("delete")}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
