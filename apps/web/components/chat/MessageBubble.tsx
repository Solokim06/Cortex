"use client";

import { useState, useRef, useEffect } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { User, Sparkles, Loader2, Check, X } from "lucide-react";
import { SourcesList } from "./SourcesList";
import { GraphStrip, type GraphEdge } from "./GraphStrip";
import { Markdown } from "./Markdown";
import { MessageActions } from "./MessageActions";

export type MessageSource = {
  id: string;
  type: string;
  title: string | null;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: MessageSource[];
  /** Index-keyed edges matching the [nX] citation order of `sources`. */
  edges?: GraphEdge[];
  nodes_used?: number;
  /** Agent name when the reply was produced in an agent mode. */
  agent?: string | null;
  created_at: string;
};

type Props = {
  message: ChatMessage;
  streaming?: boolean;
  sourceIndex?: Record<string, string>;
  /** True if this is the last user message in the conversation */
  isLastUserMessage?: boolean;
  /** True if this is the last assistant message in the conversation */
  isLastAssistantMessage?: boolean;
  /** Called when user clicks regenerate on this assistant message */
  onRegenerate?: () => void;
  /** Called when user saves an edited version of this user message */
  onEditSave?: (newContent: string) => void;
  /** Called when user clicks "Send to support" on this message */
  onSendToSupport?: () => void;
  /** Called when user clicks a node in the GraphStrip */
  onNodeClick?: (nodeId: string) => void;
};

export function MessageBubble({
  message,
  streaming = false,
  sourceIndex,
  isLastUserMessage = false,
  isLastAssistantMessage = false,
  onRegenerate,
  onEditSave,
  onSendToSupport,
  onNodeClick,
}: Props) {
  const t = useTranslations("chat.message");
  const isUser = message.role === "user";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus the textarea when edit mode opens
  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(draft.length, draft.length);
    }
  }, [editing, draft.length]);

  const handleSave = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === message.content) {
      setEditing(false);
      setDraft(message.content);
      return;
    }
    onEditSave?.(trimmed);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      setDraft(message.content);
      setEditing(false);
    }
  };

  return (
    <div
      className={cn(
        "flex gap-3 w-full group",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      {/* Icon — left side for assistant */}
      {!isUser && (
        <div className="shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
          {streaming ? (
            <Loader2 className="w-4 h-4 text-primary animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 text-primary" />
          )}
        </div>
      )}

      {/* Bubble */}
      <div className="flex flex-col min-w-0 max-w-[80%]">
        <div
          className={cn(
            "rounded-2xl px-4 py-3 text-sm",
            isUser
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "bg-card/60 border border-border rounded-bl-md",
          )}
        >
          {/* Content */}
          {isUser ? (
            editing ? (
              <div className="space-y-2">
                <textarea
                  ref={textareaRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="w-full bg-background/20 text-primary-foreground rounded-md px-2 py-1.5 text-sm resize-none outline-none border border-primary-foreground/30 focus:border-primary-foreground/60"
                  rows={Math.min(6, draft.split("\n").length + 1)}
                />
                <div className="flex items-center gap-1.5 justify-end">
                  <button
                    onClick={handleSave}
                    className="p-1 rounded text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/10 transition-colors"
                    aria-label={t("saveEdit")}
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setDraft(message.content);
                      setEditing(false);
                    }}
                    className="p-1 rounded text-primary-foreground/80 hover:text-primary-foreground hover:bg-white/10 transition-colors"
                    aria-label={t("cancelEdit")}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="whitespace-pre-wrap break-words leading-relaxed text-primary-foreground">
                {message.content}
              </div>
            )
          ) : (
            <div className="break-words text-foreground">
              {message.content ? (
                <Markdown
                  content={message.content}
                  sourceIndex={sourceIndex}
                />
              ) : streaming ? (
                <span className="text-muted-foreground italic">
                  {t("thinking")}
                </span>
              ) : null}
            </div>
          )}

          {/* Agent mode badge — shown when the reply was produced by an agent */}
          {!isUser && message.agent && (
            <div className="mt-2 inline-flex items-center gap-1 rounded-md border border-border bg-accent/30 px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              {message.agent === "devil_advocate" && t("agentDevilBadge")}
              {message.agent === "steelman" && t("agentSteelmanBadge")}
              {message.agent === "historian" && t("agentHistorianBadge")}
            </div>
          )}

          {/* Sources (only for assistant messages with sources) */}
          {!isUser &&
            message.sources &&
            message.sources.length > 1 &&
            message.edges &&
            message.edges.length > 0 && (
              <GraphStrip
                nodes={message.sources.map((s) => ({
                  id: s.id,
                  type: s.type,
                  title: s.title,
                  depth: (s as MessageSource & { depth?: number }).depth,
                  is_seed: (s as MessageSource & { is_seed?: boolean }).is_seed,
                }))}
                edges={message.edges}
                onNodeClick={onNodeClick}
              />
            )}

          {!isUser && message.sources && message.sources.length > 0 && (
            <SourcesList
              sources={message.sources}
              nodesUsed={message.nodes_used ?? message.sources.length}
            />
          )}

          {/* Timestamp */}
          <div
            className={cn(
              "mt-1.5 text-[10px]",
              isUser ? "text-primary-foreground/60" : "text-muted-foreground",
            )}
          >
            {new Date(message.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>

        {/* Message actions row — shown on hover below the bubble */}
        {!streaming && !editing && (
          <div
            className={cn(
              "mt-1 px-1 flex",
              isUser ? "justify-end" : "justify-start",
            )}
          >
            <MessageActions
              role={message.role}
              content={message.content}
              isLastUserMessage={isLastUserMessage}
              isLastAssistantMessage={isLastAssistantMessage}
              onRegenerate={onRegenerate}
              onEdit={isLastUserMessage ? () => setEditing(true) : undefined}
              onSendToSupport={onSendToSupport}
            />
          </div>
        )}
      </div>

      {/* Icon — right side for user */}
      {isUser && (
        <div className="shrink-0 w-8 h-8 rounded-full bg-accent flex items-center justify-center mt-0.5">
          <User className="w-4 h-4 text-foreground" />
        </div>
      )}
    </div>
  );
}
