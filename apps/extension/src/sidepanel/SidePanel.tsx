import { useEffect, useState, useCallback } from "react";
import {
  searchMemory,
  captureUrl,
  listRecentNodes,
  checkUrl,
  type MemoryHit,
  type RecentNode,
} from "../lib/api";
import { getSession, getProfile, type CortexProfile } from "../lib/storage";
import { browser, getActiveTab, openOptionsPage } from "../lib/runtime";
import { ensureFreshCortexToken } from "../lib/auth";
import { t } from "../lib/i18n";

type Status = "loading" | "signed-out" | "ready";

const CORTEX_HOME = "http://localhost:3000";

export function SidePanel() {
  const [status, setStatus] = useState<Status>("loading");
  const [profile, setProfile] = useState<CortexProfile | null>(null);
  const [tab, setTab] = useState<{ url?: string; title?: string } | null>(null);
  const [alreadySaved, setAlreadySaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MemoryHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [recent, setRecent] = useState<RecentNode[]>([]);

  // ── Bootstrap ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await getSession();
      const prof = await getProfile();
      const activeTab = await getActiveTab();
      if (cancelled) return;

      if (!session) {
        setStatus("signed-out");
        return;
      }
      setProfile(prof);
      setTab(activeTab ? { url: activeTab.url, title: activeTab.title } : null);
      setStatus("ready");

      ensureFreshCortexToken().catch(() => {});

      // Fetch badge status for the current page + recent nodes
      if (activeTab?.url?.startsWith("http")) {
        checkUrl(activeTab.url)
          .then((r) => {
            if (!cancelled) setAlreadySaved(r.exists);
          })
          .catch(() => {});
      }

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

  // ── Listen for tab changes ──
  useEffect(() => {
    const handler = async () => {
      const activeTab = await getActiveTab();
      if (!activeTab) return;
      setTab({ url: activeTab.url, title: activeTab.title });
      if (activeTab.url?.startsWith("http")) {
        try {
          const r = await checkUrl(activeTab.url);
          setAlreadySaved(r.exists);
        } catch {
          setAlreadySaved(false);
        }
      } else {
        setAlreadySaved(false);
      }
    };

    const onActivated = () => void handler();
    const onUpdated = (_id: number, info: { url?: string }) => {
      if (info.url) void handler();
    };

    browser.tabs.onActivated.addListener(onActivated);
    browser.tabs.onUpdated.addListener(onUpdated);
    return () => {
      browser.tabs.onActivated.removeListener(onActivated);
      browser.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  // ── Save current page ──
  const handleSavePage = async () => {
    if (!tab?.url || !tab.url.startsWith("http")) return;
    setSaving(true);
    try {
      const node = await captureUrl(tab.url, tab.title);
      setAlreadySaved(true);
      setSavedFlash(node.title || t("untitled"));
      setTimeout(() => setSavedFlash(null), 2500);
      const { nodes } = await listRecentNodes(5);
      setRecent(nodes);
    } catch (e) {
      console.error("[Cortex] Save failed:", e);
    } finally {
      setSaving(false);
    }
  };

  // ── Memory search ──
  const runSearch = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setHits([]);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const res = await searchMemory(trimmed, 12);
      setHits(res.results ?? []);
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : t("errSearchFailed"));
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => {
      void runSearch(query);
    }, 350);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  const openInCortex = (path = "/") => {
    window.open(`${CORTEX_HOME}${path}`, "_blank");
  };

  if (status === "loading") {
    return (
      <div className="sp">
        <header className="sp-header">
          <span className="sp-brand">Cortex</span>
        </header>
        <div className="sp-body">
          <p className="sp-muted">{t("loading")}</p>
        </div>
      </div>
    );
  }

  if (status === "signed-out") {
    return (
      <div className="sp">
        <header className="sp-header">
          <span className="sp-brand">Cortex</span>
        </header>
        <div className="sp-body">
          <p className="sp-muted">
            {t("spSignedOut")}
          </p>
          <button
            className="sp-btn sp-btn-primary"
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

  const canSavePage = !!tab?.url?.startsWith("http");

  return (
    <div className="sp">
      <header className="sp-header">
        <span className="sp-brand">Cortex</span>
        <span className="sp-user">{displayName}</span>
      </header>

      <section className="sp-section">
        <p className="sp-section-title">{t("spThisPage")}</p>
        {tab?.url ? (
          <div className="sp-page-card">
            <p className="sp-page-title">{tab.title || t("spNoTitle")}</p>
            <p className="sp-page-url" title={tab.url}>
              {tab.url}
            </p>
            <div className="sp-page-actions">
              {alreadySaved ? (
                <span className="sp-badge sp-badge-saved">
                  {t("spBadgeSaved")}
                </span>
              ) : (
                <button
                  className="sp-btn sp-btn-primary"
                  onClick={handleSavePage}
                  disabled={saving || !canSavePage}
                  type="button"
                >
                  {saving ? t("btnSaving") : t("spBtnSavePage")}
                </button>
              )}
            </div>
            {savedFlash && (
              <div className="sp-flash">{t("savedPrefix")} {savedFlash}</div>
            )}
          </div>
        ) : (
          <p className="sp-muted">{t("spNoActivePage")}</p>
        )}
      </section>

      <section className="sp-section">
        <p className="sp-section-title">{t("spSectionSearch")}</p>
        <input
          className="sp-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("placeholderAskAnything")}
          type="text"
          spellCheck={false}
          autoComplete="off"
        />
        {searching && <p className="sp-muted sp-small">{t("spSearching")}</p>}
        {searchError && <p className="sp-error sp-small">{searchError}</p>}
        {!searching && hits.length > 0 && (
          <ul className="sp-hits">
            {hits.map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  className="sp-hit"
                  onClick={() => openInCortex("/memory")}
                >
                  <span className="sp-hit-title">
                    {h.title || t("untitled")}
                  </span>
                  <span className="sp-hit-meta">
                    <span className="sp-hit-type">{h.type}</span>
                    <span className="sp-hit-score">
                      {Math.round(h.score * 100)}%
                    </span>
                  </span>
                  {h.summary && (
                    <span className="sp-hit-summary">
                      {h.summary.slice(0, 100)}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
        {!searching && query.trim() && hits.length === 0 && !searchError && (
          <p className="sp-muted sp-small">{t("spNoMatches")}</p>
        )}
      </section>

      <section className="sp-section">
        <p className="sp-section-title">{t("spSectionRecent")}</p>
        {recent.length === 0 ? (
          <p className="sp-muted sp-small">{t("spNothingCaptured")}</p>
        ) : (
          <ul className="sp-recent">
            {recent.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  className="sp-recent-item"
                  onClick={() => openInCortex("/capture")}
                >
                  <span className="sp-recent-title">
                    {n.title || t("untitled")}
                  </span>
                  <span className="sp-recent-type">{n.type}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <footer className="sp-footer">
        <button
          type="button"
          className="sp-link"
          onClick={() => openInCortex("/home")}
        >
          {t("spBtnOpenCortex")}
        </button>
        <span className="sp-dot">·</span>
        <button type="button" className="sp-link" onClick={openOptionsPage}>
          {t("footerOptions")}
        </button>
      </footer>
    </div>
  );
}
