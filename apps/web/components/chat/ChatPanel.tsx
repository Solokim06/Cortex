"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useAgentActions, useAgentActionsSummary } from "@/lib/hooks/use-agent-actions";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { MessageSquare, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useQueryClient } from "@tanstack/react-query";
import {
  type ConversationDetail,
  type ConversationSummary,
  useChatStream,
  useConversation,
  useConversations,
  useCortex,
} from "@/lib/hooks/use-cortex";
import { MessageBubble, type ChatMessage } from "./MessageBubble";
import { ProposalCard } from "@/components/actions/ProposalCard";
import type {
  AgentAction,
  AgentProposal,
} from "@/lib/hooks/use-agent-actions";
import type { StreamProposal } from "@/lib/hooks/use-cortex";
import { ChatInput } from "./ChatInput";
import { StarterPrompts } from "./StarterPrompts";
import { FeedbackDialog } from "@/components/help/FeedbackDialog";
import {
  SourcePreviewProvider,
  useSourcePreview,
} from "./SourcePreviewContext";
import { SourcePanel } from "./SourcePanel";
import { UrlPrompt } from "@/components/capture/UrlPrompt";

type ChatPanelProps = {
  /** Optional prefilled question --- auto-sent once on mount. */
  initialQuestion?: string;
  /** Conversation to open (from /chat/[id]). If absent, use newest. */
  conversationId?: string | null;
};

export function ChatPanel({
  initialQuestion,
  conversationId,
}: ChatPanelProps = {}) {
  const t = useTranslations("chat.panel");
  const tCommon = useTranslations("common");
  const [explicitActiveId, setExplicitActiveId] = useState<string | null>(
    conversationId ?? null,
  );
  const [loading, setLoading] = useState(false);
  const [urlPromptOpen, setUrlPromptOpen] = useState(false);
  const [optimisticUser, setOptimisticUser] = useState<string | null>(null);

  // Feedback dialog state --- opened by "Send to support" on any message.
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackInitial, setFeedbackInitial] = useState<{
    category?: string;
    subject?: string;
    description?: string;
    context?: Record<string, unknown>;
    conversation?: Array<{
      role: "user" | "assistant";
      content: string;
      created_at?: string;
    }>;
  } | null>(null);

  const cortex = useCortex();
  const queryClient = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  const conversationsQuery = useConversations();

  const conversations = useMemo<ConversationSummary[]>(
    () => conversationsQuery.data ?? [],
    [conversationsQuery.data],
  );

  const activeId = useMemo(() => {
    if (explicitActiveId) return explicitActiveId;
    if (conversations.length > 0) return conversations[0].id;
    return null;
  }, [explicitActiveId, conversations]);
  // If the URL provides a conversationId, honor it --- this makes the URL
  // the source of truth for which chat is open.
  useEffect(() => {
    if (conversationId) {
      // Intentional: syncs the URL's conversationId into explicitActiveId
      // so that navigation (e.g. from /chat/abc to /chat/xyz) updates the
      // active conversation. This runs once per navigation — the cascading-
      // render cost is 1 render per navigation, negligible. See
      // components/consent/ConsentContext.tsx for the same pattern.
      //
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setExplicitActiveId(conversationId);
    }
  }, [conversationId]);


  const conversationQuery = useConversation(activeId);
  const activeConversation: ConversationDetail | undefined =
    conversationQuery.data;
  // True while a refetch is in flight. We hold the streaming ghost
  // visible across this window so the reply never disappears between
  // stream end and the persisted message landing.
  const isRefetchingConversation = conversationQuery.isFetching && !conversationQuery.isLoading;

  const activeMessages: ChatMessage[] = useMemo(
    () =>
      (activeConversation?.messages ?? []).map((m) => ({
        id: m.id,
        role: m.role === "assistant" ? "assistant" : "user",
        content: m.content,
        sources: m.sources,
        nodes_used: m.nodes_used,
        edges: m.edges ?? [],
        // agent is not persisted yet --- badge shows live-only for now.
        agent: null,
        created_at: m.created_at,
      })),
    [activeConversation],
  );

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [activeMessages.length, loading]);

  const invalidateConversations = () => {
    queryClient.invalidateQueries({ queryKey: ["conversations"] });
  };

  const invalidateActiveConversation = () => {
    if (activeId) {
      queryClient.invalidateQueries({ queryKey: ["conversation", activeId] });
    }
  };

  const ensureConversation = async (): Promise<string> => {
    if (activeId) return activeId;
    const conversation = await cortex.createConversation();
    setExplicitActiveId(conversation.id);
    invalidateConversations();
    return conversation.id;
  };

  const chatStream = useChatStream();
  const [agent, setAgent] = useState<string | null>(null);

  // Tier 4 -- hydrate persisted proposals for this conversation.
  // Scoped to actions created at or after the conversation started,
  // so we do not pull in proposals from other conversations.
  const conversationSince = activeConversation?.created_at;
  const agentActionsQuery = useAgentActions(
    undefined,
    50,
    conversationSince,
  );

  // Merge streamed (in-flight) and persisted proposals, deduping by
  // action_id. Persisted entries are converted into the StreamProposal
  // shape that InlineProposalCard expects.
  const mergedProposals = useMemo<StreamProposal[]>(() => {
    const out = new Map<string, StreamProposal>();

    for (const a of agentActionsQuery.data?.actions ?? []) {
      out.set(a.id, {
        name: a.action_kind,
        action_id: a.id,
        status: a.status,
        summary: a.proposal?.reasoning,
        proposal: a.proposal,
        auto_applied: a.status === "applied",
      });
    }
    for (const sp of chatStream.streamedProposals) {
      if (sp.action_id) {
        out.set(sp.action_id, sp);
      }
    }
    return [...out.values()];
  }, [agentActionsQuery.data, chatStream.streamedProposals]);

  // Live-stream splice: while streaming, append a synthetic assistant
  // message whose content is the token buffer. When onDone fires the
  // single invalidateActiveConversation(), the persisted row replaces it.
  const displayMessages: ChatMessage[] = useMemo(() => {
    const out: ChatMessage[] = [...activeMessages];

    if (optimisticUser) {
      const alreadyPersisted = activeMessages.some(
        (m) => m.role === "user" && m.content === optimisticUser,
      );
      if (!alreadyPersisted) {
        out.push({
          id: "__optimistic_user__",
          role: "user",
          content: optimisticUser,
          created_at: new Date().toISOString(),
        });
      }
    }

    const lastMsg = out[out.length - 1];
    const hasPersistedReply = lastMsg && lastMsg.role === "assistant";
    const ghostActive =
      !hasPersistedReply &&
      (chatStream.isStreaming || isRefetchingConversation);

    if (ghostActive) {
      out.push({
        id: "__streaming__",
        role: "assistant",
        content: chatStream.streamedText,
        sources: chatStream.streamedSources.map((s) => ({
          id: s.id,
          type: s.type,
          title: s.title,
        })),
        edges: chatStream.streamedEdges,
        nodes_used: chatStream.streamedSources.length,
        agent: chatStream.streamedAgent,
        created_at: new Date().toISOString(),
      });
    }

    return out;
  }, [
    activeMessages,
    optimisticUser,
    isRefetchingConversation,
    chatStream.isStreaming,
    chatStream.streamedText,
    chatStream.streamedEdges,
    chatStream.streamedSources,
    chatStream.streamedAgent,
  ]);

  const sendMessage = async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed || loading || chatStream.isStreaming) return;

    setLoading(true);
    setOptimisticUser(trimmed);
    try {
      const conversationId = await ensureConversation();

      await chatStream.start(conversationId, trimmed, {
        onMeta: (
          sources: Array<{ id: string; type: string; title: string | null }>,
          mode: string,
        ) => {
          // The backend has persisted the user's message by the time the
          // meta frame arrives (add_user_message runs before the walk).
          // Fire one refetch here so the user bubble appears within a
          // few hundred ms instead of waiting for onDone.
          invalidateActiveConversation();
          // Also refresh the sidebar so the auto-title lands mid-stream
          // instead of waiting for the reply to finish.
          invalidateConversations();
          void sources;
          void mode;
        },
        onToken: () => {
          // No-op: useChatStream accumulates tokens into streamedText
          // internally. Refetching here caused a 401 storm --- one GET per
          // token, each grabbing a fresh Clerk JWT that raced the ~60s
          // rotation window.
        },
        onDone: () => {
          invalidateActiveConversation();
          invalidateConversations();
          setLoading(false);
        },
        onError: (message: string) => {
          toast.error(t("chatFailed"), { description: message });
          setLoading(false);
        },
      }, { agent });
    } catch (e: unknown) {
      toast.error(t("chatFailed"), {
        description: getErrorMessage(e, t("genericError")),
      });
      setLoading(false);
      setOptimisticUser(null);
    }
  };

  const sentInitialRef = useRef(false);
  useEffect(() => {
    if (!initialQuestion || sentInitialRef.current) return;
    sentInitialRef.current = true;
    void sendMessage(initialQuestion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuestion]);

  const handleFileSubmit = async (file: File, message: string) => {
    if (loading) return;
    setLoading(true);
    toast.loading(t("processingFile"), {
      id: "chat-attach",
      description: file.name,
    });
    try {
      await cortex.chatAttach(file, message.trim() || undefined);
      const conversationId = await ensureConversation();
      const label = message.trim() || `??"? ${file.name}`;
      await cortex.sendConversationMessage(conversationId, label);
      toast.success(t("fileCaptured"), {
        id: "chat-attach",
        description: t("fileCapturedHint", { name: file.name }),
      });
      invalidateActiveConversation();
      invalidateConversations();
    } catch (e: unknown) {
      toast.error(t("couldNotProcessFile"), {
        id: "chat-attach",
        description: getErrorMessage(e, t("genericError")),
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUrlSubmit = async (url: string) => {
    if (loading) return;
    setLoading(true);
    toast.loading(t("fetchingLink"), { id: "chat-url", description: url });
    try {
      await cortex.captureUrl(url);
      const conversationId = await ensureConversation();
      await cortex.sendConversationMessage(
        conversationId,
        t("summarizeUrlPrompt", { url }),
      );
      toast.success(t("linkCaptured"), {
        id: "chat-url",
        description: t("linkCapturedHint"),
      });
      invalidateActiveConversation();
      invalidateConversations();
    } catch (e: unknown) {
      toast.error(t("couldNotFetchLink"), {
        id: "chat-url",
        description: getErrorMessage(e, t("genericError")),
      });
    } finally {
      setLoading(false);
    }
  };

  const [pendingDeleteChat, setPendingDeleteChat] = useState(false);
  const [deletingChat, setDeletingChat] = useState(false);

  const requestClearChat = async () => {
    if (!activeId) return;
    setPendingDeleteChat(true);
  };

  const performClearChat = async () => {
    if (!activeId) return;
    setDeletingChat(true);
    try {
      await cortex.deleteConversation(activeId);
      toast.success(t("conversationDeleted"));
      setExplicitActiveId(null);
      invalidateConversations();
      setPendingDeleteChat(false);
    } catch (e: unknown) {
      toast.error(t("deleteFailed"), {
        description: getErrorMessage(e, t("genericError")),
      });
    } finally {
      setDeletingChat(false);
    }
  };

  const regenerateLastReply = async () => {
    if (!activeId || loading) return;

    const lastUserMessage = [...activeMessages]
      .reverse()
      .find((m) => m.role === "user");
    if (!lastUserMessage) {
      toast.error(t("noUserMessage"));
      return;
    }

    setLoading(true);
    try {
      await cortex.sendConversationMessage(activeId, lastUserMessage.content);
      invalidateActiveConversation();
      invalidateConversations();
    } catch (e: unknown) {
      toast.error(t("regenerateFailed"), {
        description: getErrorMessage(e, t("genericError")),
      });
    } finally {
      setLoading(false);
    }
  };

  const editLastMessage = async (newContent: string) => {
    if (!activeId || loading) return;
    setLoading(true);
    try {
      await cortex.sendConversationMessage(activeId, newContent);
      invalidateActiveConversation();
      invalidateConversations();
    } catch (e: unknown) {
      toast.error(t("editFailed"), {
        description: getErrorMessage(e, t("genericError")),
      });
    } finally {
      setLoading(false);
    }
  };

  /**
   * Opens the feedback dialog with the last N messages ending at
   * `triggerIndex` attached as a transcript. `triggerIndex` is the index
   * of the message the user clicked "Send to support" on.
   *
   * Transcript rules:
   *   - Last 10 messages, ending at (and including) the trigger message
   *   - Roles normalized to "user" | "assistant"
   *   - Empty assistant content filtered out (e.g. streaming placeholders)
   */
  const openFeedbackWithTranscript = (triggerIndex: number) => {
    const WINDOW = 10;

    // Slice ending at triggerIndex (inclusive), bounded on the left.
    const start = Math.max(0, triggerIndex - WINDOW + 1);
    const slice = activeMessages.slice(start, triggerIndex + 1);

    const conversation = slice
      .filter((m) => m.content.trim().length > 0)
      .map((m) => ({
        role: m.role,
        content: m.content,
        created_at: m.created_at,
      }));

    // Try to give the subject some context from the trigger message
    const trigger = activeMessages[triggerIndex];
    const subject =
      trigger?.role === "user"
        ? trigger.content.slice(0, 80)
        : activeConversation?.title?.slice(0, 80) ||
          "Follow-up from chat";

    setFeedbackInitial({
      category: "question",
      subject,
      description: "",
      conversation,
      context: {
        source: "chat_export",
        conversation_id: activeId,
        conversation_title: activeConversation?.title ?? null,
        message_count: conversation.length,
      },
    });
    setFeedbackOpen(true);
  };

  return (
    <SourcePreviewProvider>
      <ChatContent
        activeId={activeId}
        activeConversation={activeConversation}
        activeMessages={activeMessages}
        displayMessages={displayMessages}
        streamedProposals={mergedProposals}
        loading={loading}
        scrollRef={scrollRef}
        urlPromptOpen={urlPromptOpen}
        setUrlPromptOpen={setUrlPromptOpen}
        onDeleteActive={requestClearChat}
        onSendMessage={sendMessage}
        isStreaming={chatStream.isStreaming}
        isRefetching={isRefetchingConversation}
        onStop={() => {
          chatStream.stop();
          setLoading(false);
        }}
        agent={agent}
        onAgentChange={setAgent}
        onFileSubmit={handleFileSubmit}
        onUrlSubmit={handleUrlSubmit}
        onRegenerate={regenerateLastReply}
        onEditMessage={editLastMessage}
        onSendToSupport={openFeedbackWithTranscript}
      />

      {/* Feedback dialog --- opened by "Send to support" on any message */}
      <FeedbackDialog
        open={feedbackOpen}
        onOpenChange={(open) => {
          setFeedbackOpen(open);
          if (!open) setFeedbackInitial(null);
        }}
        initial={feedbackInitial ?? undefined}
      />

      {/* Confirm delete — restored: pendingDeleteChat gates visibility,
          performClearChat executes the delete with busy state. */}
      <ConfirmDialog
        open={pendingDeleteChat}
        onOpenChange={setPendingDeleteChat}
        title={t("confirmDelete")}
        confirmLabel={tCommon("delete")}
        destructive
        busy={deletingChat}
        onConfirm={performClearChat}
      />
    </SourcePreviewProvider>
  );
}

function getErrorMessage(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  return fallback;
}

type ChatContentProps = {
  activeId: string | null;
  activeConversation: ConversationDetail | undefined;
  activeMessages: ChatMessage[];
  displayMessages: ChatMessage[];
  streamedProposals: StreamProposal[];
  loading: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  urlPromptOpen: boolean;
  setUrlPromptOpen: (v: boolean) => void;
  onDeleteActive: () => Promise<void>;
  onSendMessage: (content: string) => Promise<void>;
  onFileSubmit: (file: File, message: string) => Promise<void>;
  onUrlSubmit: (url: string) => Promise<void>;
  onRegenerate: () => Promise<void>;
  onEditMessage: (newContent: string) => Promise<void>;
  onSendToSupport: (triggerIndex: number) => void;
  isStreaming: boolean;
  isRefetching: boolean;
  onStop: () => void;
  agent: string | null;
  onAgentChange: (agent: string | null) => void;
};

function ChatContent({
  activeId,
  activeConversation,
  activeMessages,
  displayMessages,
  streamedProposals,
  loading,
  scrollRef,
  urlPromptOpen,
  setUrlPromptOpen,
  onDeleteActive,
  onSendMessage,
  onFileSubmit,
  isStreaming,
  isRefetching,
  onStop,
  onUrlSubmit,
  onRegenerate,
  onEditMessage,
  onSendToSupport,
  agent,
  onAgentChange,
}: ChatContentProps) {
  const t = useTranslations("chat.panel");
  const tCommon = useTranslations("common");
  const tActions = useTranslations("agent.banner");
  const agentSummary = useAgentActionsSummary();
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const showBanner =
    !bannerDismissed && (agentSummary.pending + agentSummary.failed) > 0;
  const { openedNodeId, closeSource, openSource } = useSourcePreview();
  // The landing hero only shows when there is genuinely nothing happening.
  // During the initial send (before the backend persists the user message)
  // `loading` is true and `isStreaming` may be true --- suppress the hero so
  // the user sees a ghost bubble immediately, not the empty-state hero.
  const isEmpty =
    activeMessages.length === 0 &&
    !loading &&
    !isStreaming &&
    !isRefetching;

  return (
    <div className="flex h-[calc(100vh-8rem)] -mx-4 md:-mx-8 -my-8">

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 pt-4 pb-4 border-b border-border/60">
          <div className="flex items-center gap-2 min-w-0">
            <MessageSquare className="w-5 h-5 text-primary shrink-0" />
            <h1 className="text-lg font-semibold tracking-tight truncate">
              {activeConversation?.title || t("titleFallback")}
            </h1>
            {activeMessages.length > 0 && (
              <span className="text-xs text-muted-foreground ml-2 shrink-0">
                {t("messageCount", { count: activeMessages.length })}
              </span>
            )}
          </div>
          {activeId && activeMessages.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDeleteActive}
              className="text-muted-foreground hover:text-destructive shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              {tCommon("delete")}
            </Button>
          )}
        </div>

        {/* Global agent actions banner */}
        {showBanner && (
          <div className="border-b border-amber-500/20 bg-amber-500/5 px-4 md:px-6 py-2.5">
            <div className="max-w-3xl mx-auto flex items-center gap-2 text-xs">
              <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              <Link
                href="/memory/actions"
                className="flex-1 min-w-0 flex items-center gap-2 text-amber-500 hover:text-amber-400 transition-colors"
              >
                <span className="truncate">
                  {tActions("summary", {
                    pending: agentSummary.pending,
                    recent: agentSummary.recent,
                    failed: agentSummary.failed,
                  })}
                </span>
                <span className="shrink-0 font-medium">
                  {tActions("review")} &rarr;
                </span>
              </Link>
              <button
                type="button"
                onClick={() => setBannerDismissed(true)}
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors text-[10px]"
                aria-label={tActions("dismiss")}
              >
                {tActions("dismiss")}
              </button>
            </div>
          </div>
        )}

        {/* Message area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto py-6 scroll-smooth"
        >
          {isEmpty ? (
            <StarterPrompts onSelect={onSendMessage} />
          ) : (
            <div className="space-y-6 max-w-3xl mx-auto px-4">
              {displayMessages.map((m, idx) => {
                const sourceIndex: Record<string, string> = {};
                (m.sources ?? []).forEach((s) => {
                  if (s.title) sourceIndex[s.title] = s.id;
                });
                const isLastUserMessage =
                  m.role === "user" &&
                  idx ===
                    activeMessages.map((x) => x.role).lastIndexOf("user");
                const isLastAssistantMessage =
                  m.role === "assistant" &&
                  idx ===
                    activeMessages.map((x) => x.role).lastIndexOf("assistant");
                // The synthetic placeholder we splice on while streaming
                // has this id. MessageBubble uses `streaming` to render the
                // "thinking" indicator when content is still empty.
                const isStreaming = m.id === "__streaming__";
                const rowKey =
                  m.id === "__streaming__" ? `__streaming__-${idx}` : m.id;
                return (
                  <div key={rowKey} className="space-y-2">
                    <MessageBubble
                      message={m}
                      streaming={isStreaming}
                      sourceIndex={sourceIndex}
                      onNodeClick={(nodeId) => {
                        // GraphStrip click ->  open the source panel with that node.
                        // openSource comes from the SourcePreviewContext that
                        // wraps this component.
                        openSource(nodeId);
                      }}
                      isLastUserMessage={isLastUserMessage}
                      isLastAssistantMessage={isLastAssistantMessage}
                      onRegenerate={onRegenerate}
                      onEditSave={onEditMessage}
                      onSendToSupport={() => onSendToSupport(idx)}
                    />
                    {streamedProposals.length > 0 &&
                      (isStreaming ||
                        idx === displayMessages.length - 1) && (
                        <div className="ml-11 space-y-2">
                          {streamedProposals.map((sp, i) => (
                            <InlineProposalCard
                              key={sp.action_id ?? `${sp.name}-${i}`}
                              streamProposal={sp}
                            />
                          ))}
                        </div>
                      )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-4 md:px-6 pt-4 pb-4 border-t border-border/60">
          <div className="max-w-3xl mx-auto">
            <ChatInput
              onSubmit={onSendMessage}
              onSubmitWithFile={onFileSubmit}
              onUrlRequested={() => setUrlPromptOpen(true)}
              loading={loading}
              disabled={false}
              isStreaming={isStreaming}
              onStop={onStop}
              agent={agent}
              onAgentChange={onAgentChange}
              placeholder={
                isEmpty ? t("placeholderEmpty") : t("placeholderContinue")
              }
            />
          </div>
        </div>
      </div>

      {/* Source panel --- slides in from the right when a chip is clicked */}
      <SourcePanel nodeId={openedNodeId} onClose={closeSource} />

      <UrlPrompt
        open={urlPromptOpen}
        onOpenChange={setUrlPromptOpen}
        onSubmit={onUrlSubmit}
      />
    </div>
  );
}


// =====================================================================
// Tier 4 -- inline proposal card
//
// Converts the streaming proposal shape (what the SSE frame delivers)
// into the AgentAction shape that ProposalCard renders. If the action
// was auto-applied (like find_orphans), the card shows the Undo button;
// if pending, it shows Apply / Dismiss.
// =====================================================================


function InlineProposalCard({ streamProposal }: { streamProposal: StreamProposal }) {
  const proposal =
    (streamProposal.proposal as AgentProposal | undefined) ?? {
      id: "",
      action_kind: streamProposal.name,
      reasoning: streamProposal.summary ?? "",
      changes: [],
      details: [],
      confidence: 1,
      expires_at: null,
    };

  const action: AgentAction = {
    id: streamProposal.action_id ?? "",
    action_kind: streamProposal.name,
    instruction: null,
    proposal,
    status:
      (streamProposal.status as AgentAction["status"] | undefined) ?? "pending",
    result: null,
    snapshot: null,
    created_at: new Date().toISOString(),
    applied_at: null,
    undone_at: null,
    expires_at: null,
  };

  return <ProposalCard action={action} compact />;
}
