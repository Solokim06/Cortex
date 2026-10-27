import { useEffect, useState } from "react";
import { redeemTicket, signOut, AuthError } from "../lib/auth";
import {
  getProfile,
  getPrefs,
  setPrefs,
  getSession,
  type CortexProfile,
  type CortexPrefs,
} from "../lib/storage";
import { browser } from "../lib/runtime";
import { t } from "../lib/i18n";

type Status = "loading" | "signed-out" | "signed-in";

type SidePanelAPI = {
  open?: (opts: { tabId?: number; windowId?: number }) => Promise<void>;
};

export function Options() {
  const [status, setStatus] = useState<Status>("loading");
  const [profile, setProfile] = useState<CortexProfile | null>(null);
  const [ticket, setTicket] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [prefs, setLocalPrefs] = useState<CortexPrefs | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const session = await getSession();
      const prof = await getProfile();
      const p = await getPrefs();
      if (cancelled) return;

      if (!session) {
        setStatus("signed-out");
        return;
      }

      setProfile(prof);
      setLocalPrefs(p);
      setExpiresAt(session.cortexApiTokenExpiresAt);
      setStatus("signed-in");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleRedeem = async () => {
    const trimmed = ticket.trim();
    if (!trimmed) {
      setError(t("errPasteFirst"));
      return;
    }
    setRedeeming(true);
    setError(null);
    try {
      await redeemTicket(trimmed);
      const prof = await getProfile();
      const session = await getSession();
      setProfile(prof);
      setExpiresAt(session?.cortexApiTokenExpiresAt ?? null);
      setTicket("");
      setStatus("signed-in");
    } catch (e) {
      const msg =
        e instanceof AuthError
          ? e.message
          : e instanceof Error
            ? e.message
            : t("errCouldNotSignIn");
      setError(msg);
    } finally {
      setRedeeming(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    setProfile(null);
    setExpiresAt(null);
    setStatus("signed-out");
  };

  const updatePref = async <K extends keyof CortexPrefs>(
    key: K,
    value: CortexPrefs[K],
  ) => {
    await setPrefs({ [key]: value } as Partial<CortexPrefs>);
    const next = await getPrefs();
    setLocalPrefs(next);
  };

  const openSidePanel = async () => {
    try {
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
    } catch (e) {
      console.error("[Cortex] openSidePanel failed:", e);
    }
  };

  if (status === "loading") {
    return (
      <div className="options">
        <div className="container">
          <p className="muted">{t("loading")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="options">
      <div className="container">
        <h1 className="title">{t("extHeading")}</h1>
        <p className="subtitle">
          {t("extSubtitle")}
        </p>

        <section className="card">
          <h2 className="section-title">{t("sectionConnection")}</h2>

          {status === "signed-out" ? (
            <>
              <p className="muted">
                {t("connectIntro")}
              </p>
              <ol className="steps">
                <li>
                  {t("connectStep1Before")}{" "}
                  <a
                    href="http://localhost:3000/settings"
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t("connectStep1Link")}
                  </a>
                  .
                </li>
                <li>
                  {t("connectStep2Before")}{" "}
                  <strong>{t("connectStep2Bold")}</strong>.
                </li>
                <li>{t("connectStep3")}</li>
              </ol>

              <label className="label" htmlFor="ticket">
                {t("labelConnectCode")}
              </label>
              <textarea
                id="ticket"
                className="ticket-input"
                value={ticket}
                onChange={(e) => setTicket(e.target.value)}
                placeholder={t("placeholderPasteCode")}
                rows={3}
                disabled={redeeming}
              />

              {error && <div className="error">{error}</div>}

              <div className="row">
                <button
                  className="btn btn-primary"
                  onClick={handleRedeem}
                  disabled={redeeming || !ticket.trim()}
                  type="button"
                >
                  {redeeming ? t("btnConnecting") : t("btnConnect")}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="connected">
                <div className="connected-row">
                  <span className="connected-label">{t("signedInAs")}</span>
                  <span className="connected-name">
                    {[profile?.firstName, profile?.lastName]
                      .filter(Boolean)
                      .join(" ") ||
                      profile?.email ||
                      t("defaultUser")}
                  </span>
                </div>
                {profile?.email && (
                  <div className="connected-row">
                    <span className="connected-label">{t("labelEmail")}</span>
                    <span className="connected-value">{profile.email}</span>
                  </div>
                )}
                {expiresAt && (
                  <div className="connected-row">
                    <span className="connected-label">{t("labelTokenExpires")}</span>
                    <span className="connected-value">
                      {new Date(expiresAt).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                  </div>
                )}
              </div>

              <div className="row">
                <button
                  className="btn btn-primary"
                  onClick={openSidePanel}
                  type="button"
                >
                  {t("btnOpenSidePanel")}
                </button>
                <button className="btn" onClick={handleSignOut} type="button">
                  {t("btnDisconnect")}
                </button>
              </div>
            </>
          )}
        </section>

        {status === "signed-in" && prefs && (
          <section className="card">
            <h2 className="section-title">{t("sectionPreferences")}</h2>

            <div className="pref">
              <div className="pref-text">
                <p className="pref-title">{t("prefNotificationsTitle")}</p>
                <p className="pref-desc">
                  {t("prefNotificationsDesc")}
                </p>
              </div>
              <Toggle
                checked={prefs.showNotifications}
                onChange={(v) => updatePref("showNotifications", v)}
              />
            </div>

            <div className="pref">
              <div className="pref-text">
                <p className="pref-title">{t("prefOpenAfterCaptureTitle")}</p>
                <p className="pref-desc">
                  {t("prefOpenAfterCaptureDesc")}
                </p>
              </div>
              <Toggle
                checked={prefs.openPanelAfterCapture}
                onChange={(v) => updatePref("openPanelAfterCapture", v)}
              />
            </div>
          </section>
        )}

        <footer className="footer">{t("footerVersion")}</footer>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`toggle ${checked ? "toggle-on" : ""}`}
    >
      <span className="toggle-knob" />
    </button>
  );
}
