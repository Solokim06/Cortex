/**
 * Cross-browser runtime helpers.
 *
 * Firefox exposes `browser.*` with promise-based APIs.
 * Chrome exposes `chrome.*` --- modern Chrome also supports promises on
 * most APIs, but not all. We wrap the two so calling code never cares.
 */

import browserPolyfill from "webextension-polyfill";

export const browser = browserPolyfill;

/**
 * Returns the current active tab in the focused window, or null.
 */
export async function getActiveTab(): Promise<{
  id?: number;
  url?: string;
  title?: string;
} | null> {
  try {
    const [tab] = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tab ?? null;
  } catch {
    return null;
  }
}

/**
 * Read the current selection from the active tab via scripting.executeScript.
 * Returns null if the tab can't be read.
 */
export async function getSelectionFromActiveTab(): Promise<string | null> {
  try {
    const tab = await getActiveTab();
    if (!tab?.id) return null;
    const results = await browser.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => window.getSelection()?.toString() ?? "",
    });
    const first = results[0];
    if (!first) return null;
    return typeof first.result === "string" ? first.result : null;
  } catch {
    return null;
  }
}

/**
 * Returns the extension's own base URL, useful for building web_accessible URLs.
 */
export function getExtensionURL(path: string): string {
  return browser.runtime.getURL(path);
}

/**
 * Short alias for opening the options page.
 */
export function openOptionsPage(): void {
  void browser.runtime.openOptionsPage();
}

/**
 * Show a small OS notification with the Cortex icon.
 * Falls back to a no-op on browsers that don't support notifications.
 */
export async function notify(
  title: string,
  message: string,
): Promise<void> {
  try {
    if (!browser.notifications) return;
    await browser.notifications.create({
      type: "basic",
      iconUrl: browser.runtime.getURL("icons2/icon-128.png"),
      title,
      message,
    });
  } catch {
    // Notification API unavailable --- silently ignore
  }
}
