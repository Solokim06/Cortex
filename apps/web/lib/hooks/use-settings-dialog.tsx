"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Ctx = {
  open: boolean;
  setOpen: (v: boolean) => void;
  toggle: () => void;
};

const SettingsDialogCtx = createContext<Ctx | null>(null);

export function SettingsDialogContext({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  // Global ⌘, / Ctrl+, opens settings
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === ",") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <SettingsDialogCtx.Provider
      value={{
        open,
        setOpen,
        toggle: () => setOpen((v) => !v),
      }}
    >
      {children}
    </SettingsDialogCtx.Provider>
  );
}

export function useSettingsDialog() {
  const ctx = useContext(SettingsDialogCtx);
  if (!ctx) {
    throw new Error(
      "useSettingsDialog must be used within <SettingsDialogContext>",
    );
  }
  return ctx;
}
