/**
 * Extension service worker.
 *
 * - Registers context menus on every worker start
 * - Updates the toolbar badge (checkmark if current URL is in the graph)
 * - Handles content-script messages (page navigations)
 * - Opens the side panel from the context menu
 *
 * Side panel is ALSO opened from popup.tsx and options.tsx directly,
 * because chrome.sidePanel.open() must be called inside a user gesture
 * --- and a message to the service worker is not treated as one.
 */

import type { Runtime, Tabs } from "webextension-polyfill";
import { browser, getActiveTab, notify } from "./lib/runtime";
import { captureText, captureUrl, checkUrl, planAgentAction } from "./lib/api";
import { getPrefs, getSession } from "./lib/storage";

const MENU_SAVE_PAGE = "cortex-save-page";
const MENU_SAVE_SELECTION = "cortex-save-selection";
const MENU_OPEN_PANEL = "cortex-open-panel";
const MENU_PLACE_URL = "cortex-place-url";

type CaptureMessage =
  | { type: "capture-active-tab" }
  | { type: "page-changed"; url: string };

type ClickInfo = {
  menuItemId: string | number;
  pageUrl?: string;
  selectionText?: string;
};

type SidePanelAPI = {
  setPanelBehavior?: (opts: {
    openPanelOnActionClick: boolean;
  }) => Promise<void>;
  open?: (opts: { windowId?: number; tabId?: number }) => Promise<void>;
};

function getSidePanelAPI(): SidePanelAPI | null {
  const anyBrowser = browser as unknown as { sidePanel?: SidePanelAPI };
  return anyBrowser.sidePanel ?? null;
}

function isSaveableUrl(url: string | undefined): url is string {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (
    lower.startsWith("chrome://") ||
    lower.startsWith("chrome-extension://") ||
    lower.startsWith("moz-extension://") ||
    lower.startsWith("edge://") ||
    lower.startsWith("about:") ||
    lower.startsWith("file://")
  ) {
    return false;
  }
  if (lower.startsWith("https://chrome.google.com/webstore")) return false;
  if (lower.startsWith("https://addons.mozilla.org")) return false;
  return lower.startsWith("http://") || lower.startsWith("https://");
}

console.log("[Cortex] Worker start. Extension ID:", browser.runtime.id);

// ---------- Menu registration ----------

async function registerMenus(): Promise<void> {
  try {
    await browser.contextMenus.removeAll();

    browser.contextMenus.create({
      id: MENU_SAVE_PAGE,
      title: "Save page to Cortex",
      contexts: ["page"],
    });

    browser.contextMenus.create({
      id: MENU_SAVE_SELECTION,
      title: "Save selection to Cortex",
      contexts: ["selection"],
    });

    browser.contextMenus.create({
      id: MENU_PLACE_URL,
      title: "Ask Cortex to place this URL",
      contexts: ["page"],
    });

    browser.contextMenus.create({
      id: MENU_OPEN_PANEL,
      title: "Open Cortex side panel",
      contexts: ["page", "action"],
    });

    console.log("[Cortex] Context menus registered");
  } catch (e) {
    console.error("[Cortex] Failed to register menus:", e);
  }
}

void registerMenus();

browser.runtime.onInstalled.addListener(() => {
  void registerMenus();

  const sidePanel = getSidePanelAPI();
  if (sidePanel?.setPanelBehavior) {
    sidePanel
      .setPanelBehavior({ openPanelOnActionClick: false })
      .catch(() => {});
  }
});

// ---------- Badge ----------

async function updateBadgeForUrl(url: string | undefined): Promise<void> {
  const action = (browser as unknown as {
    action?: {
      setBadgeText: (d: { text: string; tabId?: number }) => void;
      setBadgeBackgroundColor: (d: { color: string; tabId?: number }) => void;
    };
  }).action;

  if (!action) return;

  if (!isSaveableUrl(url)) {
    action.setBadgeText({ text: "" });
    return;
  }

  const session = await getSession();
  if (!session) {
    action.setBadgeText({ text: "" });
    return;
  }

  try {
    const result = await checkUrl(url);
    if (result.exists) {
      action.setBadgeText({ text: "\u2713" });
      action.setBadgeBackgroundColor({ color: "#22c55e" });
    } else {
      action.setBadgeText({ text: "" });
    }
  } catch {
    action.setBadgeText({ text: "" });
  }
}

// ---------- Tab change listeners ----------

const tabsAPI = browser.tabs as unknown as {
  onActivated: { addListener: (fn: (info: { tabId: number }) => void) => void };
  onUpdated: {
    addListener: (
      fn: (
        tabId: number,
        info: { url?: string; status?: string },
        tab: Tabs.Tab,
      ) => void,
    ) => void;
  };
};

tabsAPI.onActivated.addListener(async (info) => {
  try {
    const tab = await browser.tabs.get(info.tabId);
    void updateBadgeForUrl(tab.url);
  } catch {
    // ignore
  }
});

tabsAPI.onUpdated.addListener((_tabId, info, tab) => {
  if (info.status === "complete" || info.url) {
    void updateBadgeForUrl(tab.url);
  }
});

// ---------- Side panel (context menu only) ----------

async function openSidePanelFromGesture(): Promise<void> {
  const sidePanel = getSidePanelAPI();
  if (!sidePanel?.open) {
    console.log("[Cortex] sidePanel.open not supported");
    return;
  }
  try {
    const tab = await getActiveTab();
    if (!tab?.id) return;
    await sidePanel.open({ tabId: tab.id });
  } catch (e) {
    console.error("[Cortex] openSidePanel failed:", e);
  }
}

// ---------- Context menu clicks ----------

browser.contextMenus.onClicked.addListener(
  (async (info: ClickInfo, tab?: Tabs.Tab) => {
    console.log("[Cortex] menu clicked:", info.menuItemId);

    if (info.menuItemId === MENU_OPEN_PANEL) {
      // contextMenus.onClicked counts as a user gesture for sidePanel.open()
      await openSidePanelFromGesture();
      return;
    }

    const session = await getSession();
    if (!session) {
      console.log("[Cortex] session missing");
      await notify(
        "Not signed in",
        "Open the Cortex extension and paste your connect code first.",
      );
      return;
    }

    const prefs = await getPrefs();

    try {
      if (info.menuItemId === MENU_PLACE_URL) {
        const url = info.pageUrl ?? tab?.url;
        if (!isSaveableUrl(url)) {
          console.log("[Cortex] skipping non-saveable URL:", url);
          return;
        }
        console.log("[Cortex] planning place_url for:", url);
        try {
          const result = await planAgentAction({
            instruction: `Place this URL in my graph: ${url}`,
            action_kind: "place_url",
            context: { url, title: tab?.title ?? "" },
          });
          await notify(
            "Cortex processed your request",
            result.status === "applied"
              ? "Done. Check the Actions page to review."
              : "Proposal created. Check the Actions page to review.",
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // Until Phase 4.3 lands, the place_url agent is not
          // registered and the backend returns 400. Surface that
          // gracefully.
          if (msg.toLowerCase().includes("unknown action kind")) {
            await notify(
              "Coming soon",
              "Place URL will be available in a future update.",
            );
          } else {
            await notify("Could not process", msg);
          }
        }
        return;
      }

      if (info.menuItemId === MENU_SAVE_PAGE) {
        const url = info.pageUrl ?? tab?.url;
        if (!isSaveableUrl(url)) {
          console.log("[Cortex] skipping non-saveable URL:", url);
          return;
        }
        console.log("[Cortex] saving page:", url);
        await captureUrl(url, tab?.title);
        console.log("[Cortex] page saved");
        if (prefs.showNotifications) {
          await notify("Saved to Cortex", url);
        }
        void updateBadgeForUrl(url);
      }

      if (info.menuItemId === MENU_SAVE_SELECTION) {
        const selection = info.selectionText ?? "";
        if (!selection.trim()) {
          console.log("[Cortex] empty selection");
          return;
        }
        console.log("[Cortex] saving selection:", selection.slice(0, 60));
        await captureText(selection, tab?.title ?? undefined);
        console.log("[Cortex] selection saved");
        if (prefs.showNotifications) {
          await notify("Selection saved to Cortex", selection.slice(0, 80));
        }
      }
    } catch (e) {
      console.error("[Cortex] Capture failed:", e);
      await notify(
        "Capture failed",
        e instanceof Error ? e.message : "Unknown error",
      );
    }
  }) as Parameters<typeof browser.contextMenus.onClicked.addListener>[0],
);

// ---------- Message bridge ----------

browser.runtime.onMessage.addListener(
  (async (message: unknown, _sender: Runtime.MessageSender) => {
    if (!message || typeof message !== "object") return;
    const msg = message as Partial<CaptureMessage>;

    if (msg.type === "capture-active-tab") {
      const tab = await getActiveTab();
      if (!tab?.url) throw new Error("No active tab");
      if (!isSaveableUrl(tab.url)) {
        throw new Error("This page can't be saved to Cortex.");
      }
      const result = await captureUrl(tab.url, tab.title);
      void updateBadgeForUrl(tab.url);
      return { ok: true, node: result };
    }

    if (msg.type === "page-changed" && typeof msg.url === "string") {
      void updateBadgeForUrl(msg.url);
      return;
    }

    // NOTE: we deliberately do NOT handle an "open-side-panel" message here.
    // chrome.sidePanel.open() requires a genuine user gesture --- a message
    // from the popup/options does not qualify. Call sidePanel.open() directly
    // in those contexts instead.

    return;
  }) as Parameters<typeof browser.runtime.onMessage.addListener>[0],
);

console.log("[Cortex] Background service worker ready");
