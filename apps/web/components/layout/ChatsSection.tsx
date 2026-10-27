"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { Plus, MessageSquare, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCortex, useConversations, type ConversationSummary } from "@/lib/hooks/use-cortex";
import { ConversationItem } from "@/components/chat/ConversationItem";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Group = { label: string; items: ConversationSummary[] };

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
    if (c.pinned) { pinned.push(c); continue; }
    if (updated >= todayStart) today.push(c);
    else if (updated >= yesterdayStart) yesterday.push(c);
    else if (updated >= weekStart) week.push(c);
    else if (updated >= monthStart) month.push(c);
    else older.push(c);
  }

  const groups: Group[] = [];
  if (pinned.length) groups.push({ label: t("groupPinned"), items: pinned });
  if (today.length) groups.push({ label: t("groupToday"), items: today });
  if (yesterday.length) groups.push({ label: t("groupYesterday"), items: yesterday });
  if (week.length) groups.push({ label: t("groupPrevious7Days"), items: week });
  if (month.length) groups.push({ label: t("groupPrevious30Days"), items: month });
  if (older.length) groups.push({ label: t("groupOlder"), items: older });
  return groups;
}

export function ChatsSection() {
  const t = useTranslations("chat.conversationSidebar");
  const router = useRouter();
  const pathname = usePathname();
  const cortex = useCortex();
  const [creating, setCreating] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const conversationsQuery = useConversations();
  const conversations: ConversationSummary[] = useMemo(
    () => conversationsQuery.data ?? [],
    [conversationsQuery.data],
  );
  const loading = conversationsQuery.isLoading;

  const groups = useMemo(
    () => groupConversations(conversations, t),
    [conversations, t],
  );

  // Active conversation is whichever /chat/[id] we're on. On bare /chat
  // nothing is "active" in the list — the user is on a new chat.
  const activeId = useMemo(() => {
    const match = pathname.match(/^\/chat\/([^/?#]+)/);
    return match ? match[1] : null;
  }, [pathname]);

  const handleNewChat = async () => {
    if (creating) return;

    // Reuse an existing empty conversation if one exists. This prevents
    // rapid "New chat" clicks from cluttering the list with multiple
    // empty threads.
    const existingEmpty = conversations.find(
      (c) => c.message_count === 0 && !c.pinned,
    );
    if (existingEmpty) {
      router.push(`/chat/${existingEmpty.id}`);
      return;
    }

    setCreating(true);
    try {
      const c = await cortex.createConversation();
      router.push(`/chat/${c.id}`);
      router.refresh();
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
      conversationsQuery.refetch();
    } catch (e) {
      toast.error(t("renameFailed"), {
        description: e instanceof Error ? e.message : t("unknownError"),
      });
    }
  };

  const requestDelete = (id: string) => {
    setPendingDeleteId(id);
  };

  const performDelete = async () => {
    if (!pendingDeleteId) return;
    setDeleting(true);
    try {
      const id = pendingDeleteId;
      await cortex.deleteConversation(id);
      toast.success(t("conversationDeleted"));
      if (activeId === id) router.push("/chat");
      conversationsQuery.refetch();
      setPendingDeleteId(null);
    } catch (e) {
      toast.error(t("deleteFailed"), {
        description: e instanceof Error ? e.message : t("unknownError"),
      });
    } finally {
      setDeleting(false);
    }
  };

  const handlePinToggle = async (c: ConversationSummary) => {
    try {
      await cortex.setConversationPinned(c.id, !c.pinned);
      conversationsQuery.refetch();
    } catch (e) {
      toast.error(c.pinned ? t("unpinFailed") : t("pinFailed"), {
        description: e instanceof Error ? e.message : t("unknownError"),
      });
    }
  };

  return (
    <div className="border-t border-border pt-3 mt-3">
      {/* New chat button — full width, prominent */}
      <div className="px-2 pb-2">
        <button
          type="button"
          onClick={handleNewChat}
          disabled={creating}
          className="w-full flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] font-medium text-foreground bg-background border border-border hover:bg-accent/50 hover:border-primary/40 transition-colors disabled:opacity-40"
        >
          {creating ? (
            <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
          ) : (
            <Plus className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>{t("newChat")}</span>
        </button>
      </div>

      {/* List */}
      <div>
        {loading ? (
          <div className="space-y-1 px-2">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="h-6 bg-accent/20 rounded-md animate-pulse"
              />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="text-center py-4 px-3">
            <MessageSquare className="w-4 h-4 text-muted-foreground mx-auto mb-1.5" />
            <p className="text-[10px] text-muted-foreground">
              {t("emptyTitle")}
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-medium px-3 pb-0.5 select-none">
                  {group.label}
                </p>
                <div className="space-y-0.5 px-1">
                  {group.items.map((c) => (
                    <ConversationItem
                      key={c.id}
                      conversation={c}
                      active={c.id === activeId}
                      onSelect={() => {
                        router.push(`/chat/${c.id}`);
                        router.refresh();
                      }}
                      onRename={(title) => handleRename(c.id, title)}
                      onDelete={() => requestDelete(c.id)}
                      onPinToggle={() => handlePinToggle(c)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!pendingDeleteId}
        onOpenChange={(o) => {
          if (!o && !deleting) setPendingDeleteId(null);
        }}
        title={t("deleteDialogTitle")}
        description={t("deleteDialogDescription")}
        confirmLabel={t("deleteDialogConfirm")}
        cancelLabel={t("cancel")}
        destructive
        busy={deleting}
        onConfirm={performDelete}
      />
    </div>
  );
}
