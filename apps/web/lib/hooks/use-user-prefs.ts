"use client";

import { useAuth } from "@clerk/nextjs";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  fetchUserPrefs,
  patchUserPrefs,
  deleteAllChats,
  deleteAccount,
  downloadUserExport,
  type UserPrefs,
} from "@/lib/user-api";

const KEY = ["user-prefs"] as const;


export function useUserPrefs() {
  const { getToken, isSignedIn } = useAuth();
  return useQuery<UserPrefs>({
    queryKey: KEY,
    enabled: !!isSignedIn,
    staleTime: 30_000,
    queryFn: () => fetchUserPrefs(getToken),
  });
}


export function usePatchUserPrefs() {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (patch: {
      voice?: string | null;
      data_contribution_optin?: boolean;
      agent_auto_apply?: Record<string, boolean>;
    }) => patchUserPrefs(getToken, patch),
    onSuccess: (data) => {
      qc.setQueryData(KEY, data);
    },
  });
}


export function useDownloadExport() {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: () => downloadUserExport(getToken),
  });
}


export function useDeleteAllChats() {
  const { getToken } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: () => deleteAllChats(getToken),
    onSuccess: () => {
      // Invalidate chat-related caches
      qc.invalidateQueries({ queryKey: ["chat"] });
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}


export function useDeleteAccount() {
  const { getToken } = useAuth();
  return useMutation({
    mutationFn: (confirmEmail: string) => deleteAccount(getToken, confirmEmail),
  });
}
