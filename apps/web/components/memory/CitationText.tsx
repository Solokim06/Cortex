"use client";

import { useMemo } from "react";

/**
 * Renders prose containing [N] citation indices as inline superscript
 * anchor links that scroll to #source-N on the page.
 *
 * The parser is intentionally simple: it matches [0], [1], [12] — one
 * index per bracket. Multi-index like [0,2] is not needed (the LLM
 * always emits single-index citations per the synthesis prompt).
 */
export function CitationText({ text }: { text: string }) {
  const parts = useMemo(() => splitCitations(text), [text]);
  return (
    <>
      {parts.map((part, i) =>
        part.kind === "text" ? (
          <span key={i}>{part.value}</span>
        ) : (
          <a
            key={i}
            href={`#source-${part.value}`}
            onClick={(e) => {
              e.preventDefault();
              document
                .getElementById(`source-${part.value}`)
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            className="inline-flex items-center justify-center align-super text-[9px] font-medium text-primary bg-primary/10 hover:bg-primary/20 rounded px-1 leading-none ml-0.5 transition-colors"
          >
            [{part.value}]
          </a>
        ),
      )}
    </>
  );
}

type Part =
  | { kind: "text"; value: string }
  | { kind: "cite"; value: string };

function splitCitations(text: string): Part[] {
  const re = /\[(\d+)\]/g;
  const parts: Part[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push({ kind: "text", value: text.slice(last, m.index) });
    }
    parts.push({ kind: "cite", value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    parts.push({ kind: "text", value: text.slice(last) });
  }
  return parts;
}
