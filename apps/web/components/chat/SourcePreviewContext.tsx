"use client";

import {
  createContext,
  useContext,
  useCallback,
  useState,
  useRef,
} from "react";

type Preview = {
  id: string;
  title: string | null;
  type: string | null;
  summary: string | null;
  content?: string | null;
};

type ContextValue = {
  getPreview: (nodeId: string) => Preview | undefined;
  openSource: (nodeId: string) => void;
  openedNodeId: string | null;
  closeSource: () => void;
};

/**
 * Minimal shape of the Clerk global that we rely on. Clerk attaches
 * `window.Clerk` at runtime; we only need `session.getToken()`.
 */
type ClerkGlobal = {
  session?: {
    getToken?: () => Promise<string | null>;
  };
};

const SourcePreviewContext = createContext<ContextValue | null>(null);

const NOOP_SOURCE_PREVIEW: ContextValue = {
  getPreview: () => undefined,
  openSource: () => {},
  openedNodeId: null,
  closeSource: () => {},
};

/**
 * Returns a no-op context when called outside a SourcePreviewProvider,
 * so lightweight consumers (e.g. Markdown on the help page) don't crash.
 * Pages that actually need previews should still wrap in the provider.
 */
export function useSourcePreview(): ContextValue {
  const ctx = useContext(SourcePreviewContext);
  return ctx ?? NOOP_SOURCE_PREVIEW;
}

export function SourcePreviewProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const cacheRef = useRef<Map<string, Preview>>(new Map());
  const pendingRef = useRef<Set<string>>(new Set());
  const [, forceUpdate] = useState(0);
  const [openedNodeId, setOpenedNodeId] = useState<string | null>(null);

  const fetchPreview = useCallback(async (nodeId: string) => {
    if (cacheRef.current.has(nodeId) || pendingRef.current.has(nodeId)) return;
    pendingRef.current.add(nodeId);

    try {
      const clerk = (window as Window & { Clerk?: ClerkGlobal }).Clerk;
      const token = await clerk?.session?.getToken?.();
      if (!token) return;

      const res = await fetch(`http://localhost:8000/capture/${nodeId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;

      const data = await res.json();
      cacheRef.current.set(nodeId, {
        id: data.id,
        title: data.title,
        type: data.type,
        summary: data.summary,
        content: data.content,
      });
      forceUpdate((n) => n + 1);
    } catch {
      // ignore
    } finally {
      pendingRef.current.delete(nodeId);
    }
  }, []);

  const getPreview = useCallback(
    (nodeId: string) => {
      const cached = cacheRef.current.get(nodeId);
      if (cached) return cached;
      // Kick off a fetch on first miss
      void fetchPreview(nodeId);
      return undefined;
    },
    [fetchPreview],
  );

  const openSource = useCallback((nodeId: string) => {
    setOpenedNodeId(nodeId);
  }, []);

  const closeSource = useCallback(() => {
    setOpenedNodeId(null);
  }, []);

  return (
    <SourcePreviewContext.Provider
      value={{ getPreview, openSource, openedNodeId, closeSource }}
    >
      {children}
    </SourcePreviewContext.Provider>
  );
}
