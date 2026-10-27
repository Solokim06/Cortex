"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { SourceChip } from "./SourceChip";

type Props = {
  content: string;
  className?: string;
  /** Optional map of title → node id, for chip linking */
  sourceIndex?: Record<string, string>;
};

/**
 * Renders Cortex replies as clean, formatted markdown.
 * `[Title]` patterns inside the text are rendered as source chips.
 */
export function Markdown({ content, className, sourceIndex }: Props) {
  return (
    <div
      className={cn(
        "cortex-prose prose prose-invert prose-sm max-w-none",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          // Render text nodes with source-chip extraction
          p: ({ children }) => <p>{processChildren(children, sourceIndex)}</p>,
          li: ({ children }) => (
            <li>{processChildren(children, sourceIndex)}</li>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Walk children, find string nodes, and split out `[Title]` patterns into
 * SourceChip components. Everything else is returned unchanged.
 */
function processChildren(
  children: React.ReactNode,
  sourceIndex?: Record<string, string>,
): React.ReactNode {
  const out: React.ReactNode[] = [];
  let key = 0;

  const walk = (node: React.ReactNode): void => {
    if (typeof node === "string") {
      out.push(...splitAndChip(node, sourceIndex, () => key++));
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    // If it's a React element, leave it alone (could be a link, code, etc.)
    out.push(node);
  };

  walk(children);
  return out;
}

/**
 * Split a string on `[Title]` patterns. Non-matching text stays as text.
 * Matched titles become SourceChip components.
 */
function splitAndChip(
  text: string,
  sourceIndex: Record<string, string> | undefined,
  nextKey: () => number,
): React.ReactNode[] {
  const results: React.ReactNode[] = [];
  const regex = /\[([^\[\]]+)\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Push any text before the match
    if (match.index > lastIndex) {
      results.push(text.slice(lastIndex, match.index));
    }

    const title = match[1].trim();

    // Skip if it looks like a markdown link (has a following "(")
    const nextChar = text[match.index + match[0].length];
    if (nextChar === "(") {
      results.push(match[0]);
      lastIndex = regex.lastIndex;
      continue;
    }

    // Skip extremely long matches (likely not a source reference)
    if (title.length > 120) {
      results.push(match[0]);
      lastIndex = regex.lastIndex;
      continue;
    }

    // Look up in the source index (case-insensitive)
    const nodeId = lookupSource(sourceIndex, title);

    results.push(
      <SourceChip key={`chip-${nextKey()}`} title={title} nodeId={nodeId} />,
    );
    lastIndex = regex.lastIndex;
  }

  // Push any remaining text
  if (lastIndex < text.length) {
    results.push(text.slice(lastIndex));
  }

  return results;
}

/**
 * Fuzzy lookup: exact match first, then case-insensitive contains.
 */
function lookupSource(
  sourceIndex: Record<string, string> | undefined,
  title: string,
): string | undefined {
  if (!sourceIndex) return undefined;

  const needle = title.toLowerCase().trim();

  // Exact match
  for (const [k, v] of Object.entries(sourceIndex)) {
    if (k.toLowerCase().trim() === needle) return v;
  }

  // Contains match (title appears in source key or vice versa)
  for (const [k, v] of Object.entries(sourceIndex)) {
    const haystack = k.toLowerCase().trim();
    if (haystack.includes(needle) || needle.includes(haystack)) return v;
  }

  return undefined;
}
