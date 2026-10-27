"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@clerk/nextjs";
import {
  User as UserIcon,
  UserX,
  Check,
  Loader2,
  Search,
} from "lucide-react";
import { cn } from "cn";
import { fetchUsers } from "@/lib/admin-api";
import type { Filer } from "@/lib/admin-api";

type Props = {
  value: Filer | null;
  onChange: (userId: string | null) => void;
  disabled?: boolean;
};

/**
 * Searchable assignee dropdown.
 *
 * Behaviour:
 *  - Shows current assignee as a chip
 *  - Click the chip → opens a popover with a search box + user list
 *  - Click "Unassign" to clear
 *  - Search filters via /admin/users?search=... (server-side)
 *
 * The popover closes on outside-click or Escape.
 */
export function AssigneePicker({ value, onChange, disabled }: Props) {
  const t = useTranslations("admin.tickets.assignee");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { getToken } = useAuth();

  // Fetch users — server-side search. Only fetch when popover is open.
  const usersQuery = useQuery({
    queryKey: ["admin-users", query],
    enabled: open,
    staleTime: 30_000,
    queryFn: () =>
      fetchUsers(getToken, {
        search: query.trim() || undefined,
        limit: 50,
      }),
  });

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setQuery("");
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  // Autofocus the search input when opening
  useEffect(() => {
    if (!open) return;
    // Small delay so the popover mounts before we focus
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [open]);

  const users = usersQuery.data ?? [];

  const currentLabel = useMemo(() => {
    if (!value) return t("unassigned");
    return value.name || value.email;
  }, [value, t]);

  const handleSelect = (userId: string) => {
    onChange(userId);
    setOpen(false);
    setQuery("");
  };

  const handleUnassign = () => {
    onChange(null);
    setOpen(false);
    setQuery("");
  };

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger chip */}
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        className={cn(
          "w-full inline-flex items-center gap-2 rounded-md border border-border bg-background",
          "px-2 py-1.5 text-xs text-left",
          "hover:bg-accent/30 transition-colors",
          "disabled:opacity-50 disabled:pointer-events-none",
        )}
      >
        {value ? (
          <UserIcon className="w-3 h-3 text-muted-foreground shrink-0" />
        ) : (
          <UserX className="w-3 h-3 text-muted-foreground shrink-0" />
        )}
        <span className={cn("truncate flex-1", !value && "italic text-muted-foreground")}>
          {currentLabel}
        </span>
      </button>

      {/* Popover */}
      {open && (
        <div
          className={cn(
            "absolute z-30 mt-1 left-0 right-0 min-w-55",
            "rounded-md border border-border bg-popover shadow-lg",
            "overflow-hidden",
          )}
          role="listbox"
        >
          {/* Search */}
          <div className="relative border-b border-border/60">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("search_placeholder")}
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-transparent focus:outline-none"
            />
          </div>

          {/* User list */}
          <div className="max-h-64 overflow-y-auto">
            {usersQuery.isLoading && (
              <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
              </div>
            )}

            {!usersQuery.isLoading && users.length === 0 && (
              <div className="px-3 py-3 text-xs text-muted-foreground italic text-center">
                {t("no_users")}
              </div>
            )}

            {!usersQuery.isLoading &&
              users.map((u) => {
                const isCurrent = value?.id === u.id;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSelect(u.id)}
                    className={cn(
                      "w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs",
                      "hover:bg-accent/50 transition-colors",
                      isCurrent && "bg-primary/5",
                    )}
                    role="option"
                    aria-selected={isCurrent}
                  >
                    <UserIcon className="w-3 h-3 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{u.name || u.email}</div>
                      {u.name && (
                        <div className="text-[10px] text-muted-foreground truncate">
                          {u.email}
                        </div>
                      )}
                    </div>
                    {u.role !== "user" && (
                      <span
                        className={cn(
                          "text-[9px] uppercase tracking-wider rounded px-1 py-0.5 shrink-0",
                          u.role === "admin"
                            ? "bg-rose-500/10 text-rose-500"
                            : "bg-sky-500/10 text-sky-500",
                        )}
                      >
                        {u.role}
                      </span>
                    )}
                    {isCurrent && (
                      <Check className="w-3 h-3 text-primary shrink-0" />
                    )}
                  </button>
                );
              })}
          </div>

          {/* Unassign footer — only when something is assigned */}
          {value && (
            <button
              type="button"
              onClick={handleUnassign}
              className={cn(
                "w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs",
                "border-t border-border/60 text-muted-foreground",
                "hover:bg-accent/50 hover:text-rose-500 transition-colors",
              )}
            >
              <UserX className="w-3 h-3" />
              {t("unassign")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
