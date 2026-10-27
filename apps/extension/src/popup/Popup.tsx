import { useEffect, useState } from "react";
import { captureText, listRecentNodes, type RecentNode } from "../lib/api";
import { getProfile, getSession, type CortexProfile } from "../lib/storage";
import { browser, openOptionsPage } from "../lib/runtime";
import { ensureFreshCortexToken } from "../lib/auth";
import { t } from "../lib/i18n";

const API_HOME = "http://localhost:3000";

type Status = "loading" | "signed-out" | "signed-in";

type SidePanelAPI = {
  open?: (opts: { tabId?: number; windowId?: number }) => Promise<void>;
};

export function Popup() {
  const [status, setStatus] = useState<Status>("loading");
  const [profile, setProfile] = useState<CortexProfile | null>(null);
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentNode[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await getSession();
      const prof = await getProfile();
      if (cancelled) return;
      if (!session) {
        setStatus("signed-out");
        return;
      }
      setProfile(prof);
      setStatus("signed-in");

      ensureFreshCortexToken().catch(() => {});

      try {
        const { nodes } = await listRecentNodes(5);
        if (!cancelled) setRecent(nodes);
      } catch {
        // Non-fatal
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      const node = await captureText(trimmed);
      setText("");
      setSavedMessage(node.title || t("untitled"));
      setTimeout(() => setSavedMessage(null), 2500);
      const { nodes } = await listRecentNodes(5);
      setRecent(nodes);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("errCaptureFailed"));
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSave();
    }
  };

  const openCortex = (path = "/") => {
    window.open(`${API_HOME}${path}`, "_blank");
  };

  const openSidePanel = async () => {
    try {
      // Chrome requires sidePanel.open() to be called directly from a
      // user gesture. Because this function is invoked from the button's
      // onClick, we're inside that gesture.
      const api = browser as unknown as { sidePanel?: SidePanelAPI };
      if (!api.sidePanel?.open) {
        console.warn("[Cortex] sidePanel.open not supported");
        return;
      }

      const [tab] = await browser.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab?.id) return;

      await api.sidePanel.open({ tabId: tab.id });
      window.close();
    } catch (e) {
      console.error("[Cortex] openSidePanel failed:", e);
    }
  };

  if (status === "loading") {
    return (
      <div className="popup">
        <div className="loading">{t("loading")}</div>
      </div>
    );
  }

  if (status === "signed-out") {
    return (
      <div className="popup">
        <header className="header">
          <span className="brand">Cortex</span>
        </header>
        <div className="body">
          <p className="msg">
            {t("popupSignedOut")}
          </p>
          <button
            className="btn btn-primary"
            onClick={openOptionsPage}
            type="button"
          >
            {t("btnOpenOptions")}
          </button>
        </div>
      </div>
    );
  }

  const displayName =
    [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") ||
    profile?.email ||
    t("defaultSignedIn");

  return (
    <div className="popup">
      <header className="header">
        <span className="brand">Cortex</span>
        <span className="user">{displayName}</span>
      </header>

      <div className="body">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t("placeholderQuickCapture")}
          rows={4}
          className="capture-input"
          disabled={saving}
          autoFocus
        />

        <div className="actions">
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !text.trim()}
            type="button"
          >
            {saving ? t("btnSaving") : t("btnSave")}
          </button>
          <button className="btn" onClick={openSidePanel} type="button">
            {t("btnSidePanel")}
          </button>
          <button
            className="btn"
            onClick={() => openCortex("/memory")}
            type="button"
          >
            {t("btnSearch")}
          </button>
        </div>

        {savedMessage && <div className="success">{t("savedPrefix")} {savedMessage}</div>}
        {error && <div className="error">{error}</div>}

        <div className="recent">
          <p className="recent-title">{t("recentTitle")}</p>
          {recent.length === 0 ? (
            <p className="recent-empty">{t("recentEmpty")}</p>
          ) : (
            <ul className="recent-list">
              {recent.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className="recent-item"
                    onClick={() => openCortex("/capture")}
                  >
                    <span className="recent-name">
                      {n.title || t("untitled")}
                    </span>
                    {n.content && (
                      <span className="recent-preview">
                        {n.content.slice(0, 60)}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer className="footer">
          <button type="button" className="link" onClick={openOptionsPage}>
            {t("footerOptions")}
          </button>
          <span className="dot">·</span>
          <button
            type="button"
            className="link"
            onClick={() => openCortex("/settings")}
          >
            {t("footerSettings")}
          </button>
        </footer>
      </div>
    </div>
  );
}
