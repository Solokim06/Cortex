"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// =====================================================================
// A fixed but organic-looking node graph. Positions are hardcoded in a
// viewBox so the layout is deterministic across renders. Only the
// "activity counter" and node pulse are time-based.
// =====================================================================

type Node = {
  id: string;
  x: number;
  y: number;
  r: number;
  delay: number; // for the ambient pulse
  tone: "primary" | "muted" | "accent";
  /** Sample concept name shown on hover / click. Not real data. */
  label: string;
  /** One-line description for the inspector card. */
  description: string;
};

type Edge = [string, string];

const NODES: Node[] = [
  { id: "a", x: 80,  y: 90,  r: 5, delay: 0.0, tone: "primary",
    label: "Knowledge graph", description: "Concepts and the edges between them." },
  { id: "b", x: 160, y: 50,  r: 4, delay: 0.3, tone: "muted",
    label: "Embeddings", description: "Vectors for semantic search and recall." },
  { id: "c", x: 180, y: 130, r: 6, delay: 0.6, tone: "primary",
    label: "Long-term memory", description: "Rolling summaries and cross-conversation recall." },
  { id: "d", x: 250, y: 90,  r: 4, delay: 0.9, tone: "muted",
    label: "User model", description: "A persistent profile derived from your captures." },
  { id: "e", x: 320, y: 60,  r: 5, delay: 1.2, tone: "accent",
    label: "Groq", description: "Language model inference for extraction and chat." },
  { id: "f", x: 340, y: 140, r: 4, delay: 0.4, tone: "muted",
    label: "Reindexing", description: "Rebuilding embeddings when content changes." },
  { id: "g", x: 410, y: 100, r: 6, delay: 0.7, tone: "primary",
    label: "Recall", description: "Surfacing relevant past captures in the current chat." },
  { id: "h", x: 480, y: 60,  r: 4, delay: 1.0, tone: "muted",
    label: "Agentic actions", description: "Cortex proposes graph reorganizations." },
  { id: "i", x: 500, y: 140, r: 5, delay: 0.2, tone: "accent",
    label: "Gemini Vision", description: "Image and video analysis via Google." },
  { id: "j", x: 570, y: 90,  r: 6, delay: 0.5, tone: "primary",
    label: "Multimodal capture", description: "Text, voice, image, video, and annotations." },
  { id: "k", x: 640, y: 60,  r: 4, delay: 0.8, tone: "muted",
    label: "Graph health", description: "Stale concepts, orphan detection, pending merges." },
  { id: "l", x: 660, y: 140, r: 5, delay: 1.1, tone: "primary",
    label: "Capture kind", description: "Task, idea, question, reflection — classified automatically." },
  { id: "m", x: 730, y: 100, r: 4, delay: 0.35, tone: "muted",
    label: "Decision log", description: "Choices you made, with rationale and review dates." },
  { id: "n", x: 800, y: 80,  r: 5, delay: 0.65, tone: "accent",
    label: "Reflection", description: "Weekly summaries of your own thinking." },
];

const EDGES: Edge[] = [
  ["a", "b"], ["a", "c"], ["b", "d"], ["c", "d"], ["c", "f"],
  ["d", "e"], ["d", "f"], ["e", "g"], ["f", "g"], ["g", "h"],
  ["g", "i"], ["h", "j"], ["i", "j"], ["j", "k"], ["j", "l"],
  ["k", "m"], ["l", "m"], ["m", "n"],
];

const TONE_FILL: Record<Node["tone"], string> = {
  primary: "fill-primary",
  muted: "fill-muted-foreground/60",
  accent: "fill-primary/70",
};

export function GraphStrip() {
  const [counts, setCounts] = useState({ nodes: 14, edges: 22, secs: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Build a neighbor lookup so hovering can highlight connected nodes.
  const neighborIds = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const n of NODES) map.set(n.id, new Set());
    for (const [a, b] of EDGES) {
      map.get(a)?.add(b);
      map.get(b)?.add(a);
    }
    return map;
  }, []);

  const selectedNode = selectedId
    ? NODES.find((n) => n.id === selectedId) ?? null
    : null;

  const hoveredNode = hoveredId
    ? NODES.find((n) => n.id === hoveredId) ?? null
    : null;

  // Animate the "updated Xs ago" counter and gently bump node/edge counts
  // so the strip feels alive without being noisy.
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const t = setInterval(() => {
      setCounts((c) => ({
        nodes: c.nodes + (Math.random() < 0.35 ? 1 : 0),
        edges: c.edges + (Math.random() < 0.5 ? 1 : 0),
        secs: c.secs >= 4 ? 0 : c.secs + 1,
      }));
    }, 1000);
    return () => clearInterval(t);
  }, []);

  // Reduced-motion: freeze the counter and hide pulses
  const prefersReduced = useRef(false);
  useEffect(() => {
    prefersReduced.current =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  // Static, deterministic edges — memo so we don't recompute on every tick
  const edges = useMemo(() => {
    const map = new Map(NODES.map((n) => [n.id, n]));
    return EDGES.map(([a, b]) => {
      const from = map.get(a)!;
      const to = map.get(b)!;
      return { from, to, key: `${a}-${b}` };
    });
  }, []);

  // ─── Interaction helpers ───
  const isNeighborOf = (id: string) =>
    hoveredId ? neighborIds.get(hoveredId)?.has(id) ?? false : false;

  const handleNodeEnter = (id: string) => setHoveredId(id);
  const handleNodeLeave = () => setHoveredId(null);
  const handleNodeClick = (id: string) => {
    setSelectedId((cur) => (cur === id ? null : id));
  };

  return (
    <section className="mx-auto max-w-5xl px-4 sm:px-6 pt-4 pb-6 sm:pt-6 sm:pb-10">
      <div className="relative rounded-2xl border border-border bg-card/40 overflow-hidden">
        {/* ambient glow */}
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            background:
              "radial-gradient(circle at 30% 40%, hsl(var(--primary) / 0.08), transparent 50%), radial-gradient(circle at 70% 60%, hsl(var(--primary) / 0.06), transparent 50%)",
          }}
          aria-hidden
        />

        <div className="relative">
          {/* SVG graph */}
          <svg
            viewBox="0 0 880 200"
            className="w-full h-auto block"
            role="img"
            aria-label="Cortex knowledge graph (sample)"
            onClick={() => setSelectedId(null)}
          >
            {/* edges — brighten when either endpoint is hovered */}
            {edges.map(({ from, to, key }) => {
              const isHot =
                hoveredId === from.id || hoveredId === to.id;
              return (
                <line
                  key={key}
                  x1={from.x}
                  y1={from.y}
                  x2={to.x}
                  y2={to.y}
                  className={isHot ? "stroke-primary/60" : "stroke-border"}
                  strokeWidth={isHot ? 1.2 : 0.75}
                  opacity={isHot ? 1 : 0.8}
                  style={{ transition: "stroke 200ms, stroke-width 200ms, opacity 200ms" }}
                />
              );
            })}

            {/* nodes with subtle pulse + interaction */}
            {NODES.map((n) => {
              const isHovered = hoveredId === n.id;
              const isNeighbor = isNeighborOf(n.id);
              const isSelected = selectedId === n.id;
              const isDimmed =
                hoveredId !== null && !isHovered && !isNeighbor;

              return (
                <g
                  key={n.id}
                  style={{
                    cursor: "pointer",
                    opacity: isDimmed ? 0.35 : 1,
                    transition: "opacity 200ms",
                  }}
                  onMouseEnter={() => handleNodeEnter(n.id)}
                  onMouseLeave={handleNodeLeave}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleNodeClick(n.id);
                  }}
                >
                  {/* pulse halo */}
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={n.r * 2.2}
                    className={TONE_FILL[n.tone]}
                    opacity={isHovered ? 0.3 : 0.12}
                  >
                    <animate
                      attributeName="opacity"
                      values="0.08;0.22;0.08"
                      dur="4s"
                      begin={`${n.delay}s`}
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="r"
                      values={`${n.r * 2};${n.r * 3};${n.r * 2}`}
                      dur="4s"
                      begin={`${n.delay}s`}
                      repeatCount="indefinite"
                    />
                  </circle>

                  {/* selected ring */}
                  {isSelected && (
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r={n.r + 5}
                      fill="none"
                      className="stroke-primary"
                      strokeWidth={1.5}
                      opacity={0.9}
                    />
                  )}

                  {/* main node — scaled up on hover */}
                  <circle
                    cx={n.x}
                    cy={n.y}
                    r={isHovered ? n.r + 2 : n.r}
                    className={TONE_FILL[n.tone]}
                    style={{ transition: "r 180ms ease-out" }}
                  />
                </g>
              );
            })}

            {/* hover tooltip rendered inside SVG */}
            {hoveredNode && (
              <g pointerEvents="none">
                <rect
                  x={hoveredNode.x - 60}
                  y={hoveredNode.y - 36}
                  width={120}
                  height={26}
                  rx={5}
                  className="fill-card stroke-border"
                  strokeWidth={0.5}
                />
                <text
                  x={hoveredNode.x}
                  y={hoveredNode.y - 19}
                  textAnchor="middle"
                  className="fill-foreground"
                  style={{ fontSize: 11, fontWeight: 500 }}
                >
                  {hoveredNode.label}
                </text>
              </g>
            )}
          </svg>

          {/* Selected node inspector — slides in from the right */}
          {selectedNode && (
            <div
              key={selectedNode.id}
              className="absolute top-3 right-3 w-[260px] rounded-lg border border-border bg-card/95 backdrop-blur-md p-4 shadow-2xl"
              style={{ animation: "graphSlideIn 220ms ease-out" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <h4 className="text-[13px] font-medium leading-tight">
                  {selectedNode.label}
                </h4>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="text-muted-foreground hover:text-foreground transition-colors text-[14px] leading-none"
                  aria-label="Close"
                >
                  ×
                </button>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                {selectedNode.description}
              </p>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">
                Connected to
              </div>
              <div className="flex flex-wrap gap-1">
                {Array.from(neighborIds.get(selectedNode.id) ?? []).map((nid) => {
                  const nn = NODES.find((x) => x.id === nid);
                  if (!nn) return null;
                  return (
                    <span
                      key={nid}
                      className="inline-flex items-center rounded-md border border-border/70 bg-accent/30 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {nn.label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Counter bar */}
        <div className="relative border-t border-border/60 bg-card/30 px-5 py-3 flex items-center justify-between text-[11px] text-muted-foreground flex-wrap gap-2">
          <span className="font-mono">
            {counts.nodes} nodes · {counts.edges} edges
          </span>
          <span className="hidden sm:inline text-[10px] text-muted-foreground italic">
            sample graph — hover or click a node
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            updated {counts.secs}s ago
          </span>
        </div>
      </div>

      <style jsx>{`
        @keyframes graphSlideIn {
          from {
            opacity: 0;
            transform: translateX(12px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          :global([style*="graphSlideIn"]) {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}
