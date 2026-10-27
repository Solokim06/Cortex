"use client";

import { useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Plus, MessageSquare, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  useCortex,
  type ConversationSummary,
} from "@/lib/hooks/use-cortex";
import { ConversationItem } from "./ConversationItem";

type Props = {
  conversations: ConversationSummary[];
  activeId: string | null;
  loading?: boolean;
  onSelect: (id: string) => void;
  onCreated: (id: string) => void;
  onChanged: () => void;
  onDeleted: (id: string) => void;
};

type Group = {
  label: string;
  items: ConversationSummary[];
};

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

type GroupTranslator = (
  key:
    | "groupPinned"
    | "groupToday"
    | "groupYesterday"
    | "groupPrevious7Days"
    | "groupPrevious30Days"
    | "groupOlder",
) => string;

function groupConversations(
  conversations: ConversationSummary[],
  t: GroupTranslator,
): Group[] {
  const now = new Date();
  const todayStart = startOfDay(now);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 7);
  const monthStart = new Date(todayStart);
  monthStart.setDate(monthStart.getDate() - 30);

  const pinned: ConversationSummary[] = [];
  const today: ConversationSummary[] = [];
  const yesterday: ConversationSummary[] = [];
  const week: ConversationSummary[] = [];
  const month: ConversationSummary[] = [];
  const older: ConversationSummary[] = [];

  for (const c of conversations) {
    const updated = new Date(c.updated_at);
    if (c.pinned) {
      pinned.push(c);
      continue;
    }
    if (updated >= todayStart) today.push(c);
    else if (updated >= yesterdayStart) yesterday.push(c);
    else if (updated >= weekStart) week.push(c);
    else if (updated >= monthStart) month.push(c);
    else older.push(c);
  }

  const groups: Group[] = [];
  if (pinned.length) groups.push({ label: t("groupPinned"), items: pinned });
  if (today.length) groups.push({ label: t("groupToday"), items: today });
  if (yesterday.length)
    groups.push({ label: t("groupYesterday"), items: yesterday });
  if (week.length)
    groups.push({ label: t("groupPrevious7Days"), items: week });
  if (month.length)
    groups.push({ label: t("groupPrevious30Days"), items: month });
  if (older.length) groups.push({ label: t("groupOlder"), items: older });
  return groups;
}

export function ConversationSidebar({
  conversations,
  activeId,
  loading = false,
  onSelect,
  onCreated,
  onChanged,
  onDeleted,
}: Props) {
  const t = useTranslations("chat.conversationSidebar");
  const [creating, setCreating] = useState(false);
  const cortex = useCortex();

  const groups = useMemo(
    () => groupConversations(conversations, t),
    [conversations, t],
  );

  const handleNewChat = async () => {
    if (creating) return;
    setCreating(true);
    try {
      const conversation = await cortex.createConversation();
      onCreated(conversation.id);
    } catch (e) {
      toast.error(t("couldNotStartNewChat"), {
        description: e instanceof Error ? e.message : t("unknownError"),
      });
    } finally {
      setCreating(false);
    }
  };

  const handleRename = async (id: string, title: string) => {
    try {
      await cortex.renameConversation(id, title);
      onChanged();
    } catch (e) {
      toast.error(t("renameFailed"), {
        description: e instanceof Error ? e.message : t("unknownError"),
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t("confirmDelete"))) return;
    try {
      await cortex.deleteConversation(id);
      toast.success(t("conversationDeleted"));
      onDeleted(id);
    } catch (e) {
      toast.error(t("deleteFailed"), {
        description: e instanceof Error ? e.message : t("unknownError"),
      });
    }
  };

  const handlePinToggle = async (c: ConversationSummary) => {
    try {
      await cortex.setConversationPinned(c.id, !c.pinned);
      onChanged();
    } catch (e) {
      toast.error(c.pinned ? t("unpinFailed") : t("pinFailed"), {
        description: e instanceof Error ? e.message : t("unknownError"),
      });
    }
  };

  return (
    <aside className="hidden md:flex md:flex-col w-64 shrink-0 border-r border-border bg-card/20">
      {/* New chat button */}
      <div className="px-2 pt-3 pb-2">
        <Button
          onClick={handleNewChat}
          disabled={creating}
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-[13px] font-normal hover:bg-accent h-9 px-2"
        >
          {creating ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          {t("newChat")}
        </Button>
      </div>

      {/* Conversation list */}
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        {loading ? (
          <div className="space-y-1 mt-2">
            {[...Array(5)].map((_, i) => (
              <div
                key={i}
                className="h-7 bg-accent/20 rounded-md animate-pulse"
              />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-8 px-4">
            <MessageSquare className="w-5 h-5 text-muted-foreground mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">
              {t("emptyTitle")}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {t("emptyHint")}
            </p>
          </div>
        ) : (
          <div className="space-y-3 mt-1">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium px-2 pb-1 select-none">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((c) => (
                    <ConversationItem
                      key={c.id}
                      conversation={c}
                      active={c.id === activeId}
                      onSelect={() => onSelect(c.id)}
                      onRename={(title) => handleRename(c.id, title)}
                      onDelete={() => handleDelete(c.id)}
                      onPinToggle={() => handlePinToggle(c)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-border">
        <p className="text-[10px] text-muted-foreground text-center select-none">
          {t("conversationCount", { count: conversations.length })}
        </p>
      </div>
    </aside>
  );
}
