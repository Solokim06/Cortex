"use client";

import type { Annotation } from "@/lib/annotations";

type Props = {
  /** Natural dimensions of the image (from node.meta.width/height) */
  imageWidth: number;
  imageHeight: number;
  annotations: Annotation[];
  className?: string;
};

const COLOR_MAP: Record<string, string> = {
  yellow: "#facc15",
  red: "#ef4444",
  green: "#22c55e",
  blue: "#3b82f6",
};

const ARROWHEAD_SIZE = 10;

export function AnnotationOverlay({
  imageWidth,
  imageHeight,
  annotations,
  className,
}: Props) {
  if (!annotations.length || imageWidth <= 0 || imageHeight <= 0) return null;

  return (
    <svg
      viewBox={`0 0 ${imageWidth} ${imageHeight}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
    >
      {annotations.map((a, i) => {
        const color = COLOR_MAP[a.color ?? "yellow"] ?? COLOR_MAP.yellow;

        if (a.kind === "box") {
          return (
            <g key={i}>
              <rect
                x={a.x}
                y={a.y}
                width={a.w}
                height={a.h}
                fill="none"
                stroke={color}
                strokeWidth={Math.max(2, imageWidth / 500)}
                strokeDasharray="8 6"
                rx={4}
              />
              {a.label && (
                <text
                  x={a.x + 4}
                  y={a.y - 6}
                  fill={color}
                  fontSize={Math.max(14, imageWidth / 60)}
                  fontFamily="system-ui, sans-serif"
                >
                  {a.label}
                </text>
              )}
            </g>
          );
        }

        if (a.kind === "arrow") {
          const dx = a.x2 - a.x1;
          const dy = a.y2 - a.y1;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          const backX = a.x2 - ux * ARROWHEAD_SIZE * 1.6;
          const backY = a.y2 - uy * ARROWHEAD_SIZE * 1.6;
          const perpX = -uy * ARROWHEAD_SIZE;
          const perpY = ux * ARROWHEAD_SIZE;
          const head = `${a.x2},${a.y2} ${backX + perpX},${backY + perpY} ${backX - perpX},${backY - perpY}`;

          return (
            <g key={i}>
              <line
                x1={a.x1}
                y1={a.y1}
                x2={a.x2}
                y2={a.y2}
                stroke={color}
                strokeWidth={Math.max(2, imageWidth / 500)}
              />
              <polygon points={head} fill={color} />
              {a.label && (
                <text
                  x={(a.x1 + a.x2) / 2}
                  y={(a.y1 + a.y2) / 2 - 8}
                  fill={color}
                  fontSize={Math.max(14, imageWidth / 60)}
                  fontFamily="system-ui, sans-serif"
                  textAnchor="middle"
                >
                  {a.label}
                </text>
              )}
            </g>
          );
        }

        // text
        return (
          <text
            key={i}
            x={a.x}
            y={a.y}
            fill={color}
            fontSize={Math.max(16, imageWidth / 50)}
            fontFamily="system-ui, sans-serif"
            style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.6)", strokeWidth: 3 }}
          >
            {a.text}
          </text>
        );
      })}
    </svg>
  );
}
