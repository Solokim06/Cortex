import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { CommandPaletteProvider } from "@/components/layout/CommandPalette";
import { KeyboardShortcuts } from "@/components/layout/KeyboardShortcuts";
import { Toaster } from "@/components/ui/sonner";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CommandPaletteProvider>
      <Toaster position="top-center" richColors closeButton />
      <KeyboardShortcuts />
      <div className="flex h-[100dvh] overflow-hidden bg-background">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar />
          <main
            className="flex-1 overflow-y-auto"
            style={{ paddingBottom: "var(--safe-bottom)" }}
          >
            <div className="mx-auto max-w-6xl px-4 md:px-8 pt-8 pb-24 cortex-fade-in">
              {children}
            </div>
          </main>
        </div>
      </div>
    </CommandPaletteProvider>
  );
}
