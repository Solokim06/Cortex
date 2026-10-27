"use client";

import { useCallback, useRef, useState } from "react";

import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { API_BASE, cortexFetch, cortexUpload } from "@/lib/cortex";

// ---------- Shared types ----------

export type Goal = {
  id: string;
  title: string;
  status: string;
  summary: string;
  created_at: string;
};

export type Decision = {
  id: string;
  question: string;
  status: string;
  chosen_option: string | null;
  lesson: string | null;
  review_at: string | null;
  created_at: string;
};

export type Lesson = {
  id: string;
  kind: string;
  title: string | null;
  content: string;
  meta: Record<string, unknown>;
  decision_id: string | null;
  created_at: string;
};

export type IdentityModel = {
  has_model: boolean;
  narrative: string;
  values: Array<{ value: string; evidence: string; strength: string }>;
  patterns: Array<{ pattern: string; description: string; evidence: string }>;
  strengths: Array<{ strength: string; evidence: string }>;
  blind_spots: Array<{ spot: string; evidence: string }>;
  growth_areas: Array<{ area: string; reason: string }>;
  thinking_style: string;
  source_stats: Record<string, number>;
  last_rebuilt_at: string | null;
};

export type IdentityMaturity = {
  score: number;
  tier: string;
  narrative: string;
  breakdown: {
    nodes: number;
    concepts: number;
    goals: number;
    decisions: number;
    reflections: number;
    snapshots: number;
  };
};

export type DeltaInfo = {
  type: "new" | "stronger" | "weaker" | "stable";
  delta?: number;
  persistent?: boolean;
  appearances?: number;
};

export type IdentityDiff = {
  available: boolean;
  reason?: string;
  current_snapshot_at?: string;
  previous_snapshot_at?: string;
  values: Record<string, DeltaInfo>;
  patterns: Record<string, DeltaInfo>;
  strengths: Record<string, DeltaInfo>;
  blind_spots: Record<string, DeltaInfo>;
};

export type Milestone = {
  id: string;
  created_at: string;
  narrative: string;
  title: string;
  highlights: string;
  category:
    | "origin"
    | "discovery"
    | "growth"
    | "stabilizing"
    | "consolidation"
    | string;
};

export type MilestonesResponse = {
  count: number;
  milestones: Milestone[];
};

export type SignatureQuote = {
  available: boolean;
  reason?: string;
  quote: string;
  title: string | null;
  node_id: string | null;
  type: string | null;
  score?: number;
};

export type ConversationSummary = {
  id: string;
  title: string;
  message_count: number;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

export type ConversationMessage = {
  id: string;
  role: "user" | "assistant" | string;
  content: string;
  sources: Array<{ id: string; type: string; title: string | null }>;
  nodes_used: number;
  edges?: Array<{ from: number; to: number; type: string }>;
  created_at: string;
};

export type ConversationDetail = {
  id: string;
  title: string;
  message_count: number;
  created_at: string;
  updated_at: string;
  messages: ConversationMessage[];
};

export type SendMessageResult = {
  user_message: ConversationMessage;
  assistant_message: ConversationMessage;
  conversation: ConversationSummary;
};

export type NodeDetail = {
  id: string;
  type: string;
  title: string | null;
  content: string | null;
  summary: string | null;
  created_at: string;
  meta?: Record<string, unknown> | null;
};

export type RelatedNode = {
  id: string;
  type: string;
  title: string | null;
  summary: string | null;
  edge_type: string;
  edge_direction: "incoming" | "outgoing" | string;
  edge_weight: number;
};

export type RelatedNodesResponse = {
  center_id: string;
  count: number;
  related: RelatedNode[];
};

export type Node = {
  id: string;
  type: string;
  title: string;
  content: string;
  created_at: string;
};

export type UrlPreview = {
  url: string;
  domain: string | null;
  title: string | null;
  description: string | null;
  site_name: string | null;
  image: string | null;
  favicon: string | null;
  error: string | null;
};

// ---------- Memory types ----------

export type MemorySearchHit = {
  id: string;
  type: string;
  title: string | null;
  content: string | null;
  summary: string | null;
  score: number;
  meta?: Record<string, unknown> | null;
};

export type MemorySearchResponse = {
  query: string;
  results: MemorySearchHit[];
  count: number;
};

export type MemorySearchMode = "semantic" | "hybrid";

// ---------- Decision types ----------

export type DecisionOption = {
  name: string;
  pros: string[];
  cons: string[];
  best_if: string;
};

export type DecisionAnalysis = {
  framing?: string;
  tradeoffs?: string[];
  patterns_noticed?: string[];
  blind_spots?: string[];
  questions_to_ask_self?: string[];
  suggested_review_days?: number;
  what_was_right?: string;
  what_was_wrong?: string;
  recommendation_for_future?: string;
};

export type DecisionSummary = {
  id: string;
  question: string;
  status: "open" | "decided" | "reviewed" | "archived" | string;
  chosen_option: string | null;
  lesson: string | null;
  review_at: string | null;
  created_at: string;
};

export type DecisionDetail = {
  id: string;
  question: string;
  context: string;
  options: DecisionOption[];
  analysis: DecisionAnalysis;
  chosen_option: string | null;
  reasoning: string | null;
  expected_outcome: string | null;
  actual_outcome: string | null;
  lesson: string | null;
  status: string;
  review_at: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type DecisionPattern = {
  name: string;
  description: string;
  evidence: string[];
  confidence: "low" | "medium" | "high" | string;
};

export type DecisionPatternsResponse = {
  count: number;
  patterns?: DecisionPattern[];
  strengths?: string[];
  blind_spots?: string[];
  note?: string;
};

// ---------- Reflection types ----------

export type ReflectionKind =
  | "lesson"
  | "weekly_report"
  | "pattern_insight"
  | "identity_update"
  | string;

export type Reflection = {
  id: string;
  kind: ReflectionKind;
  title: string | null;
  content: string;
  meta: Record<string, unknown>;
  decision_id: string | null;
  created_at: string;
};

// ---------- API hook ----------

export function useCortex() {
  const { getToken } = useAuth();
  const getT = () => getToken();

  return {
    // ---- Capture ----
    captureText: (text: string, title?: string, sourceType = "manual") =>
      cortexFetch("/capture/text", getT, {
        method: "POST",
        body: { text, title, source_type: sourceType },
      }),

    captureFile: (
      file: File,
      title?: string,
      annotations?: unknown[],
    ) => {
      const form = new FormData();
      form.append("file", file);
      if (title) form.append("title", title);
      if (annotations && annotations.length > 0) {
        form.append("annotations", JSON.stringify(annotations));
      }
      return cortexUpload("/capture/file", form, getT);
    },

    captureUrl: (url: string, title?: string) =>
      cortexFetch("/capture/url", getT, {
        method: "POST",
        body: { url, title },
      }),

    previewUrl: (url: string) =>
      cortexFetch<UrlPreview>("/capture/preview", getT, {
        method: "POST",
        body: { url },
      }),

    getNode: (nodeId: string) =>
      cortexFetch<NodeDetail>(`/capture/${nodeId}`, getT),

    saveAnnotations: (
      nodeId: string,
      annotations: unknown[],
      reEnrich = false,
    ) =>
      cortexFetch<NodeDetail>(`/capture/${nodeId}/annotations`, getT, {
        method: "POST",
        body: { annotations, re_enrich: reEnrich },
      }),

    getRelatedNodes: (nodeId: string) =>
      cortexFetch<RelatedNodesResponse>(`/capture/${nodeId}/related`, getT),

    listNodes: (limit = 50, offset = 0) =>
      cortexFetch(`/capture/?limit=${limit}&offset=${offset}`, getT),

    supportedTypes: () => cortexFetch("/capture/supported-types", getT),

    // ---- Chat (legacy) ----
    chat: (message: string) =>
      cortexFetch("/chat/", getT, {
        method: "POST",
        body: { message },
      }),

    chatAttach: (file: File, question?: string) => {
      const form = new FormData();
      form.append("file", file);
      if (question) form.append("question", question);
      return cortexUpload("/chat/attach", form, getT);
    },

    // ---- Conversations ----
    listConversations: () =>
      cortexFetch<ConversationSummary[]>("/chat/conversations", getT),

    createConversation: (title = "New chat") =>
      cortexFetch<ConversationSummary>("/chat/conversations", getT, {
        method: "POST",
        body: { title },
      }),

    getConversation: (conversationId: string) =>
      cortexFetch<ConversationDetail>(
        `/chat/conversations/${conversationId}`,
        getT,
      ),

    renameConversation: (conversationId: string, title: string) =>
      cortexFetch<ConversationSummary>(
        `/chat/conversations/${conversationId}`,
        getT,
        { method: "PATCH", body: { title } },
      ),

    deleteConversation: (conversationId: string) =>
      cortexFetch<{ deleted: boolean }>(
        `/chat/conversations/${conversationId}`,
        getT,
        { method: "DELETE" },
      ),

    setConversationPinned: (conversationId: string, pinned: boolean) =>
      cortexFetch<ConversationSummary>(
        `/chat/conversations/${conversationId}/pin`,
        getT,
        { method: "PATCH", body: { pinned } },
      ),

    sendConversationMessage: (conversationId: string, message: string) =>
      cortexFetch<SendMessageResult>(
        `/chat/conversations/${conversationId}/messages`,
        getT,
        { method: "POST", body: { message } },
      ),

    // ---- Memory ----
    searchMemory: (
      q: string,
      limit = 10,
      mode: "semantic" | "hybrid" = "hybrid",
    ) =>
      cortexFetch(
        `/memory/search?q=${encodeURIComponent(q)}&limit=${limit}&mode=${mode}`,
        getT,
      ),

    searchMemoryTyped: (
      q: string,
      limit = 10,
      mode: MemorySearchMode = "hybrid",
    ) =>
      cortexFetch<MemorySearchResponse>(
        `/memory/search?q=${encodeURIComponent(q)}&limit=${limit}&mode=${mode}`,
        getT,
      ),

    similarNodes: (nodeId: string, limit = 10) =>
      cortexFetch(`/memory/similar/${nodeId}?limit=${limit}`, getT),

    similarNodesTyped: (nodeId: string, limit = 10) =>
      cortexFetch<MemorySearchResponse>(
        `/memory/similar/${nodeId}?limit=${limit}`,
        getT,
      ),

    reindex: () => cortexFetch("/memory/reindex", getT, { method: "POST" }),

    // ---- Voice ----
    transcribe: (file: File, language?: string) => {
      const form = new FormData();
      form.append("file", file);
      if (language) form.append("language", language);
      return cortexUpload("/voice/transcribe", form, getT);
    },

    voiceCapture: (file: File, title?: string, language?: string) => {
      const form = new FormData();
      form.append("file", file);
      if (title) form.append("title", title);
      if (language) form.append("language", language);
      return cortexUpload("/voice/capture", form, getT);
    },

    // ---- Learning ----
    createGoal: (title: string, description = "") =>
      cortexFetch("/learning/goal", getT, {
        method: "POST",
        body: { title, description },
      }),

    listGoals: (limit = 50) =>
      cortexFetch(`/learning/goals?limit=${limit}`, getT),

    getGoalPlan: (goalId: string) =>
      cortexFetch(`/learning/plan/${goalId}`, getT),

    updateMilestone: (
      goalId: string,
      phaseIndex: number,
      milestoneIndex: number,
      done = true,
    ) =>
      cortexFetch(`/learning/progress/${goalId}`, getT, {
        method: "POST",
        body: {
          phase_index: phaseIndex,
          milestone_index: milestoneIndex,
          done,
        },
      }),

    // ---- Decision ----
    analyzeDecision: (payload: {
      question: string;
      context?: string;
      chosen_option?: string;
      reasoning?: string;
      expected_outcome?: string;
    }) =>
      cortexFetch<{
        decision: DecisionSummary;
        options: DecisionOption[];
        analysis: DecisionAnalysis;
      }>("/decision/analyze", getT, {
        method: "POST",
        body: payload,
      }),

    listDecisions: (status?: string, limit = 50) => {
      const qs = new URLSearchParams();
      if (status) qs.set("status", status);
      qs.set("limit", String(limit));
      return cortexFetch<{ count: number; decisions: DecisionSummary[] }>(
        `/decision/?${qs.toString()}`,
        getT,
      );
    },

    getDecision: (id: string) =>
      cortexFetch<DecisionDetail>(`/decision/${id}`, getT),

    updateDecision: (
      id: string,
      payload: {
        chosen_option?: string;
        reasoning?: string;
        expected_outcome?: string;
        review_days?: number;
      },
    ) =>
      cortexFetch<{
        decision: DecisionSummary;
        options: DecisionOption[];
        analysis: DecisionAnalysis;
        chosen_option: string | null;
        reasoning: string | null;
        expected_outcome: string | null;
        review_at: string | null;
      }>(`/decision/${id}`, getT, {
        method: "PATCH",
        body: payload,
      }),

    recordOutcome: (id: string, actualOutcome: string) =>
      cortexFetch<{
        decision: DecisionSummary;
        actual_outcome: string;
        lesson: string | null;
        analysis: DecisionAnalysis;
      }>(`/decision/${id}/outcome`, getT, {
        method: "POST",
        body: { actual_outcome: actualOutcome },
      }),

    decisionPatterns: () =>
      cortexFetch<DecisionPatternsResponse>("/decision/patterns", getT),

    dueReviews: () =>
      cortexFetch<{ count: number; decisions: DecisionSummary[] }>(
        "/decision/due",
        getT,
      ),

    // ---- Reflection ----
    listReflections: (kind?: string, limit = 50) => {
      const qs = new URLSearchParams();
      if (kind) qs.set("kind", kind);
      qs.set("limit", String(limit));
      return cortexFetch<{ count: number; reflections: Reflection[] }>(
        `/reflection/?${qs.toString()}`,
        getT,
      );
    },

    listLessons: (limit = 50) =>
      cortexFetch<{ count: number; lessons: Reflection[] }>(
        `/reflection/lessons?limit=${limit}`,
        getT,
      ),

    extractLesson: (decisionId: string) =>
      cortexFetch<{ reflection: Reflection }>(
        "/reflection/extract-lesson",
        getT,
        {
          method: "POST",
          body: { decision_id: decisionId },
        },
      ),

    generateReport: (days = 30) =>
      cortexFetch<{ reflection: Reflection }>("/reflection/report", getT, {
        method: "POST",
        body: { days },
      }),

    // ---- Identity ----
    getIdentity: () => cortexFetch("/identity/", getT),
    rebuildIdentity: () =>
      cortexFetch("/identity/rebuild", getT, { method: "POST" }),
    identityTimeline: (limit = 20) =>
      cortexFetch(`/identity/timeline?limit=${limit}`, getT),
    identityMaturity: () => cortexFetch("/identity/maturity", getT),
    identityDiff: () => cortexFetch("/identity/diff", getT),
    identityMilestones: (limit = 10) =>
      cortexFetch(`/identity/milestones?limit=${limit}`, getT),
    identitySignature: () => cortexFetch("/identity/signature", getT),
  };
}

// ---------- React Query hooks ----------

export function useRecentNodes(limit = 10) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["nodes", limit],
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<{ count: number; nodes: Node[] }>(
        `/capture/?limit=${limit}`,
        () => Promise.resolve(token),
      );
    },
  });
}

export function useGoals() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["goals"],
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<{ count: number; goals: Goal[] }>(
        "/learning/goals",
        () => Promise.resolve(token),
      );
    },
  });
}

export function useDecisions(status?: string) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["decisions", status],
    queryFn: async () => {
      const token = await getToken();
      const qs = status ? `?status=${status}` : "";
      return cortexFetch<{ count: number; decisions: Decision[] }>(
        `/decision/${qs}`,
        () => Promise.resolve(token),
      );
    },
  });
}

export function useLessons() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["lessons"],
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<{ count: number; lessons: Lesson[] }>(
        "/reflection/lessons",
        () => Promise.resolve(token),
      );
    },
  });
}

export function useIdentity() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["identity"],
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<IdentityModel>("/identity/", () =>
        Promise.resolve(token),
      );
    },
  });
}

export function useIdentityMaturity() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["identity-maturity"],
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<IdentityMaturity>("/identity/maturity", () =>
        Promise.resolve(token),
      );
    },
  });
}

export function useIdentityDiff() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["identity-diff"],
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<IdentityDiff>("/identity/diff", () =>
        Promise.resolve(token),
      );
    },
  });
}

export function useIdentityMilestones(limit = 10) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["identity-milestones", limit],
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<MilestonesResponse>(
        `/identity/milestones?limit=${limit}`,
        () => Promise.resolve(token),
      );
    },
  });
}

export function useIdentitySignature() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["identity-signature"],
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<SignatureQuote>("/identity/signature", () =>
        Promise.resolve(token),
      );
    },
  });
}

export function useConversations() {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["conversations"],
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<ConversationSummary[]>("/chat/conversations", () =>
        Promise.resolve(token),
      );
    },
  });
}

export function useConversation(conversationId: string | null) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["conversation", conversationId],
    enabled: !!conversationId,
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<ConversationDetail>(
        `/chat/conversations/${conversationId}`,
        () => Promise.resolve(token),
      );
    },
  });
}

export function useNodeDetail(nodeId: string | null) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["node-detail", nodeId],
    enabled: !!nodeId,
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<NodeDetail>(`/capture/${nodeId}`, () =>
        Promise.resolve(token),
      );
    },
  });
}

export function useRelatedNodes(nodeId: string | null) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["node-related", nodeId],
    enabled: !!nodeId,
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<RelatedNodesResponse>(
        `/capture/${nodeId}/related`,
        () => Promise.resolve(token),
      );
    },
  });
}

export function useUrlPreview(url: string | null) {
  const { getToken } = useAuth();
  return useQuery({
    queryKey: ["url-preview", url],
    enabled: !!url,
    staleTime: 5 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<UrlPreview>(
        "/capture/preview",
        () => Promise.resolve(token),
        { method: "POST", body: { url } },
      );
    },
  });
}

export function useMemorySearch(
  query: string | null,
  mode: MemorySearchMode = "hybrid",
  limit = 25,
) {
  const { getToken } = useAuth();
  const trimmed = query?.trim() ?? "";
  return useQuery({
    queryKey: ["memory-search", trimmed, mode, limit],
    enabled: trimmed.length > 0,
    staleTime: 60 * 1000,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const token = await getToken();
      return cortexFetch<MemorySearchResponse>(
        `/memory/search?q=${encodeURIComponent(trimmed)}&limit=${limit}&mode=${mode}`,
        () => Promise.resolve(token),
      );
    },
  });
}

// =====================================================================
// streaming chat
// =====================================================================

export type StreamEdge = {
  from: number;
  to: number;
  type: string;
};

type ChatStreamHandlers = {
  onMeta?: (
    sources: Array<{ id: string; type: string; title: string | null }>,
    mode: string,
    agent?: string | null,
  ) => void;
  onEdges?: (edges: StreamEdge[]) => void;
  onToken?: (text: string) => void;
  onDone?: (messageId?: string) => void;
  onError?: (message: string) => void;
  /** Tier 4 -- emitted when the LLM invokes an agent as a tool. */
  onProposal?: (data: StreamProposal) => void;
};

/** Shape of a proposal frame from the backend's stream_reason_with_tools. */
export type StreamProposal = {
  name: string;
  action_id?: string;
  status?: string;
  summary?: string;
  proposal?: unknown;
  auto_applied?: boolean;
};

export function useChatStream() {
  const { getToken } = useAuth();
  const controllerRef = useRef<AbortController | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [streamedText, setStreamedText] = useState("");
  const [streamedProposals, setStreamedProposals] = useState<StreamProposal[]>([]);
  const [streamedEdges, setStreamedEdges] = useState<StreamEdge[]>([]);
  const [streamedSources, setStreamedSources] = useState<
    Array<{ id: string; type: string; title: string | null }>
  >([]);
  const [streamedAgent, setStreamedAgent] = useState<string | null>(null);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setStreaming(false);
    // Abort is client-side only; clear the accumulator state so the UI
    // doesn't show a half-rendered ghost reply after the user stops.
    setStreamedText("");
    setStreamedEdges([]);
    setStreamedSources([]);
    setStreamedAgent(null);
    setStreamedProposals([]);
  }, []);

  // Public reset: caller invokes this AFTER the post-done refetch lands,
  // so the persisted message replaces the streaming ghost with no gap.
  const reset = useCallback(() => {
    setStreamedText("");
    setStreamedEdges([]);
    setStreamedSources([]);
    setStreamedAgent(null);
    setStreamedProposals([]);
  }, []);

  const start = useCallback(
    async (
      conversationId: string,
      message: string,
      handlers: ChatStreamHandlers = {},
      options: { agent?: string | null } = {},
    ) => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      setStreamedText("");
      setStreamedEdges([]);
      setStreamedSources([]);
      setStreamedAgent(null);
      setStreamedProposals([]);
      setStreaming(true);

      try {
        const token = await getToken();
        if (!token) {
          handlers.onError?.("Not signed in");
          return;
        }

        const resp = await fetch(
          `${API_BASE}/chat/conversations/${conversationId}/messages/stream`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream",
              Authorization: `Bearer ${token}`,
              "X-Locale":
                typeof document !== "undefined"
                  ? document.documentElement.lang || "en"
                  : "en",
            },
            body: JSON.stringify({
              message,
              agent: options.agent ?? null,
            }),
            signal: controller.signal,
          },
        );

        if (!resp.ok || !resp.body) {
          handlers.onError?.(`HTTP ${resp.status}`);
          return;
        }

        // Wrap the caller's handlers so we can accumulate the streamed
        // text locally without the caller having to do it. The panel reads
        // `streamedText` for live rendering and only refetches once, on done.
        const wrappedHandlers: ChatStreamHandlers = {
          ...handlers,
          onMeta: (sources, mode, agent) => {
            setStreamedSources(sources);
            setStreamedAgent(agent ?? null);
            handlers.onMeta?.(sources, mode, agent);
          },
          onEdges: (edges) => {
            setStreamedEdges(edges);
            handlers.onEdges?.(edges);
          },
          onToken: (text: string) => {
            setStreamedText((prev) => prev + text);
            handlers.onToken?.(text);
          },
          onProposal: (data: StreamProposal) => {
            setStreamedProposals((prev) => [...prev, data]);
            handlers.onProposal?.(data);
          },
        };

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let sepIdx: number;
          while ((sepIdx = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, sepIdx);
            buffer = buffer.slice(sepIdx + 2);
            dispatchChatFrame(frame, wrappedHandlers);
          }
        }

        if (buffer.trim()) {
          dispatchChatFrame(buffer, wrappedHandlers);
        }
      } catch (err: unknown) {
        const aborted = (err as { name?: string })?.name === "AbortError";
        if (!aborted) {
          handlers.onError?.(err instanceof Error ? err.message : "Stream failed");
        }
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
          setStreaming(false);
          // NOTE: do NOT clear streamedText/etc here. The chat panel
          // needs the ghost message to remain in `displayMessages` until
          // the invalidation-refetch that follows `done` has landed.
          // Otherwise there's a dead window where neither the ghost nor
          // the persisted reply exists. Panel calls `reset()` on refetch.
        }
      }
    },
    [getToken],
  );

  return {
    start,
    stop,
    reset,
    isStreaming: streaming,
    streamedText,
    streamedEdges,
    streamedSources,
    streamedAgent,
    streamedProposals,
  };
}

function dispatchChatFrame(raw: string, handlers: ChatStreamHandlers) {
  if (raw.startsWith(":")) return;
  const lines = raw.split("\n");
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
  }
  if (dataLines.length === 0) return;
  let frame: Record<string, unknown>;
  try {
    frame = JSON.parse(dataLines.join("\n"));
  } catch {
    return;
  }
  switch (frame.type) {
    case "meta":
      handlers.onMeta?.(
        (frame.sources as Array<{ id: string; type: string; title: string | null }>) ?? [],
        String(frame.mode ?? "flat"),
        typeof frame.agent === "string" ? frame.agent : null,
      );
      if (Array.isArray(frame.edges)) {
        handlers.onEdges?.(frame.edges as StreamEdge[]);
      }
      break;
    case "token":
      handlers.onToken?.(String(frame.text ?? ""));
      break;
    case "proposal":
      handlers.onProposal?.(frame.data as StreamProposal);
      break;
    case "done":
      handlers.onDone?.(frame.message_id ? String(frame.message_id) : undefined);
      break;
    case "error":
      handlers.onError?.(String(frame.message ?? "Stream error"));
      break;
  }
}
