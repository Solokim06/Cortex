"use client";

import { useAuth } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createMacro,
  deleteMacro,
  fetchMacroUsage,
  fetchMacros,
  updateMacro,
  type Macro,
} from "@/lib/admin-api";

// =====================================================================
// queries
// =====================================================================

/**
 * All macros. Cached 60s — macros change rarely.
 */
export function useAdminMacros() {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["admin-macros"],
    enabled: !!isSignedIn,
    staleTime: 60_000,
    queryFn: () => fetchMacros(getToken),
  });
}

/**
 * Usage stats: how many times each macro was used in replies.
 */
export function useAdminMacroUsage() {
  const { getToken, isSignedIn } = useAuth();

  return useQuery({
    queryKey: ["admin-macro-usage"],
    enabled: !!isSignedIn,
    staleTime: 60_000,
    queryFn: () => fetchMacroUsage(getToken),
  });
}

// =====================================================================
// mutations
// =====================================================================

/**
 * Invalidate anything that could reference a macro:
 *  - the macro list (obviously)
 *  - the macro picker's suggestion cache for every ticket
 *  - usage stats
 */
function invalidateMacroRelated(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["admin-macros"] });
  qc.invalidateQueries({ queryKey: ["admin-macro-usage"] });
  qc.invalidateQueries({ queryKey: ["admin-ticket-macros-suggest"] });
}

export function useCreateMacro() {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation<Macro, Error, { title: string; body: string; tags?: string[] }>({
    mutationFn: (payload) => createMacro(getToken, payload),
    onSuccess: () => invalidateMacroRelated(qc),
  });
}

export function useUpdateMacro() {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation<
    Macro,
    Error,
    { id: string; title?: string; body?: string; tags?: string[] }
  >({
    mutationFn: ({ id, ...patch }) => updateMacro(getToken, id, patch),
    onSuccess: () => invalidateMacroRelated(qc),
  });
}

export function useDeleteMacro() {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation<{ ok: boolean }, Error, string>({
    mutationFn: (id) => deleteMacro(getToken, id),
    onSuccess: () => invalidateMacroRelated(qc),
  });
}
