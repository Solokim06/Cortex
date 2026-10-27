"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

export type GraphNode = {
  id: string;
  type: string;
  title: string | null;
  depth?: number;
  is_seed?: boolean;
};

export type GraphEdge = {
  from: number;
  to: number;
  type: string;
};

type Props = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Called when a node is clicked. Receives the node's real UUID. */
  onNodeClick?: (nodeId: string) => void;
  className?: string;
};

const NODE_COLORS: Record<string, string> = {
  thought: "fill-sky-500",
  concept: "fill-emerald-500",
  reflection: "fill-amber-500",
  decision: "fill-violet-500",
};

const DEFAULT_NODE_COLOR = "fill-muted-foreground";

const EDGE_COLORS: Record<string, string> = {
  contradicts: "stroke-rose-500",
  refines: "stroke-sky-500",
  supports: "stroke-emerald-500",
  expands: "stroke-violet-500",
  exemplifies: "stroke-amber-500",
  questions: "stroke-orange-500",
  related_to: "stroke-muted-foreground/50",
  contains: "stroke-muted-foreground/30",
};

const DEFAULT_EDGE_COLOR = "stroke-muted-foreground/50";

/**
 * Compact subgraph view rendered inline in a chat reply.
 *
 * Layout: radial. Seed nodes near the center, other nodes on rings
 * by depth. It's deterministic (no force simulation), which means
 * the same subgraph always looks the same — easier to reason about
 * and much cheaper to render.
 */
export function GraphStrip({ nodes, edges, onNodeClick, className }: Props) {
  const t = useTranslations("chat.graphStrip");
  const [expanded, setExpanded] = useState(false);

  const WIDTH = expanded ? 520 : 360;
  const HEIGHT = expanded ? 320 : 140;

  // Compute positions. Seeds share the inner ring, non-seeds get
  // concentric rings by depth.
  const positions = useMemo(() => {
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;
    const innerR = Math.min(WIDTH, HEIGHT) * 0.18;
    const ringStep = Math.min(WIDTH, HEIGHT) * 0.22;

    const seeds: number[] = [];
    const byDepth = new Map<number, number[]>();
    nodes.forEach((n, i) => {
      if (n.is_seed) {
        seeds.push(i);
      } else {
        const d = n.depth ?? 1;
        if (!byDepth.has(d)) byDepth.set(d, []);
        byDepth.get(d)!.push(i);
      }
    });

    const pos: { x: number; y: number }[] = new Array(nodes.length);
    seeds.forEach((idx, i) => {
      const angle = (i / Math.max(seeds.length, 1)) * 2 * Math.PI - Math.PI / 2;
      const r = innerR * (seeds.length > 1 ? 1 : 0);
      pos[idx] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
    });

    const depths = Array.from(byDepth.keys()).sort((a, b) => a - b);
    depths.forEach((d, ringIdx) => {
      const idxs = byDepth.get(d)!;
      const r = innerR + ringStep * (ringIdx + 1);
      idxs.forEach((idx, i) => {
        const angle = (i / Math.max(idxs.length, 1)) * 2 * Math.PI - Math.PI / 2;
        pos[idx] = { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
      });
    });

    return pos;
  }, [nodes, WIDTH, HEIGHT]);

  if (nodes.length === 0) return null;

  return (
    <div className={cn("mt-3 pt-3 border-t border-border/60", className)}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
      >
        {expanded
          ? t("hideGraph")
          : t("showGraph", { count: nodes.length, edges: edges.length })}
      </button>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="mt-2 w-full rounded-md bg-accent/10 border border-border/40"
        style={{ maxHeight: expanded ? 320 : 160 }}
      >
        {edges.map((e, i) => {
          const a = positions[e.from];
          const b = positions[e.to];
          if (!a || !b) return null;
          const color = EDGE_COLORS[e.type] ?? DEFAULT_EDGE_COLOR;
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className={cn(color, "stroke-[1.2]")}
              strokeLinecap="round"
            >
              <title>{e.type}</title>
            </line>
          );
        })}

        {nodes.map((n, i) => {
          const p = positions[i];
          if (!p) return null;
          const color = NODE_COLORS[n.type] ?? DEFAULT_NODE_COLOR;
          const r = n.is_seed ? 7 : 5;
          return (
            <g key={n.id}>
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                className={cn(color, "cursor-pointer hover:opacity-80 transition-opacity")}
                onClick={() => onNodeClick?.(n.id)}
              >
                <title>{n.title ?? n.type}</title>
              </circle>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
