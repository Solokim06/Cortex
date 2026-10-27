"use client";

import { ReactNode } from "react";

export function Section({
  id,
  number,
  title,
  intro,
  children,
}: {
  id: string;
  number: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="scroll-mt-24 py-10 sm:py-14 border-t border-border/60 first:border-t-0"
    >
      <div className="flex items-baseline gap-3 mb-4">
        <span className="font-mono text-[11px] tracking-wider text-muted-foreground">
          {number}
        </span>
        <span className="h-px flex-1 bg-border/50" />
      </div>
      <h2 className="text-xl sm:text-2xl font-semibold tracking-tight mb-3">
        {title}
      </h2>
      {intro && (
        <div className="text-sm text-muted-foreground leading-relaxed max-w-2xl mb-6">
          {intro}
        </div>
      )}
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function RefTable({
  headers,
  rows,
  compact,
}: {
  headers: string[];
  rows: ReactNode[][];
  compact?: boolean;
}) {
  return (
    <div
      role="region"
      aria-label="Data table (scrollable)"
      tabIndex={0}
      className="rounded-lg border border-border/60 overflow-x-auto min-w-0 max-w-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
    >
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-card/40 border-b border-border/60">
            {headers.map((h) => (
              <th
                key={h}
                className="text-left font-medium text-muted-foreground px-3 py-2"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-border/40 last:border-b-0 hover:bg-card/20 transition-colors"
            >
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-3 ${compact ? "py-1.5" : "py-2.5"} align-top ${
                    j === 0 ? "text-foreground/90" : "text-muted-foreground"
                  }`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RefCode({ children }: { children: string }) {
  return (
    <pre
      role="region"
      aria-label="Code sample (scrollable)"
      tabIndex={0}
      className="rounded-lg border border-border/60 bg-card/40 p-4 text-[11px] leading-relaxed font-mono text-foreground/85 overflow-x-auto min-w-0 max-w-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
    >
      <code>{children}</code>
    </pre>
  );
}

export function RefKV({
  entries,
}: {
  entries: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-[180px_1fr] gap-x-4 gap-y-2 text-[12px] py-1">
      {entries.map(({ label, value }) => (
        <div key={label} className="contents">
          <dt className="text-muted-foreground py-0.5">{label}</dt>
          <dd className="text-foreground/85 py-0.5">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
