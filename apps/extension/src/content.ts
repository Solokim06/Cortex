/**
 * Content script.
 *
 * Runs on every http(s) page. Its only job is to tell the service worker
 * "the URL of this page is X" so the worker can decide whether to show
 * the toolbar badge (checkmark if already in the graph).
 *
 * Deliberately tiny --- no DOM manipulation, no user-visible UI.
 */

import type { Runtime } from "webextension-polyfill";
import { browser } from "./lib/runtime";

function report(): void {
  try {
    const url = window.location.href;
    if (!url.startsWith("http")) return;

    // Fire-and-forget. If the service worker is asleep, this wakes it.
    browser.runtime
      .sendMessage({ type: "page-changed", url })
      .catch(() => {
        // Silently ignore --- happens if the worker is restarting
      });
  } catch {
    // ignore
  }
}

// Initial report
report();

// Report on history changes (SPA navigations)
let lastHref = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== lastHref) {
    lastHref = window.location.href;
    report();
  }
});
observer.observe(document.body, { childList: true, subtree: true });

// Also report on popstate (back/forward)
window.addEventListener("popstate", report);

// TypeScript may complain about Runtime unused; suppress.
void (undefined as unknown as Runtime.MessageSender);
