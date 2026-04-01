"use client";

import { useEffect, useMemo, useState } from "react";
import {
  clearMapPrefs,
  loadMapPrefs,
  saveMapPrefs,
  type MapPrefs,
  type Purpose,
} from "../../lib/clientPrefs";
import { getThemePref, setThemePref, type ThemePref } from "../../lib/clientTheme";

type IncomingRequest = {
  id: string;
  createdAt: string;
  status: string;
  from: { id: string; username: string | null };
};

type RespondState = {
  status: "idle" | "sending" | "error";
  error?: string;
};

type ProfileDraft = {
  avatarFile: File | null;
  avatarPreviewUrl: string;
  bio: string;
};

type MeUser = {
  id: string;
  username: string;
  purpose: Purpose;
  gender?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
};

const PURPOSES: Purpose[] = ["friends", "hangout", "hookup", "social"];

export default function SettingsPage() {
  const [me, setMe] = useState<MeUser | null>(null);
  const [meLoading, setMeLoading] = useState(true);
  const [meError, setMeError] = useState<string | null>(null);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [incoming, setIncoming] = useState<IncomingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [responding, setResponding] = useState<Record<string, RespondState>>({});
  const [mapPrefs, setMapPrefs] = useState<MapPrefs>(() => loadMapPrefs());
  const [themePref, setThemePrefState] = useState<ThemePref>(() => getThemePref());
  const [profileDraft, setProfileDraft] = useState<ProfileDraft>({
    avatarFile: null,
    avatarPreviewUrl: "",
    bio: "",
  });
  const [profileSave, setProfileSave] = useState<RespondState>({ status: "idle" });

  const incomingSorted = useMemo(() => {
    return [...incoming].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [incoming]);

  useEffect(() => {
    setProfileDraft({
      avatarFile: null,
      avatarPreviewUrl: me?.avatar_url ?? "",
      bio: me?.bio ?? "",
    });
    setProfileSave({ status: "idle" });
  }, [me?.id]);

  useEffect(() => {
    function onThemeChanged(e: Event) {
      const detail = (e as CustomEvent<{ pref: ThemePref }> | null)?.detail;
      if (detail?.pref) setThemePrefState(detail.pref);
      else setThemePrefState(getThemePref());
    }
    window.addEventListener("mf:theme-pref-changed", onThemeChanged as EventListener);
    return () => {
      window.removeEventListener("mf:theme-pref-changed", onThemeChanged as EventListener);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadMe() {
      setMeLoading(true);
      setMeError(null);
      try {
        const res = await fetch("/api/me", { method: "GET" });
        const data = (await res.json().catch(() => null)) as
          | { ok: true; user: MeUser | null }
          | { ok: false; error: string }
          | null;

        if (!res.ok || !data || !("ok" in data) || !data.ok) {
          throw new Error((data as { error?: string } | null)?.error || "Failed.");
        }

        if (!cancelled) setMe(data.user);
      } catch (e) {
        if (!cancelled) setMeError(e instanceof Error ? e.message : "Failed.");
      } finally {
        if (!cancelled) setMeLoading(false);
      }
    }

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/friend-requests", { method: "GET" });
        if (res.status === 401) {
          if (!cancelled) setIncoming([]);
          return;
        }

        const data = (await res.json().catch(() => null)) as
          | { ok: true; incoming: IncomingRequest[] }
          | { ok: false; error: string }
          | null;

        if (!res.ok || !data || !("ok" in data) || !data.ok) {
          throw new Error((data as { error?: string } | null)?.error || "Failed.");
        }

        if (!cancelled) setIncoming(data.incoming);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadMe();
    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function logout() {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      if (!res.ok) return;
      setMe(null);
      setIncoming([]);
      try {
        window.dispatchEvent(new Event("mf:auth-changed"));
      } catch {
        // ignore
      }
    } finally {
      setLogoutBusy(false);
    }
  }

  async function saveProfile() {
    if (!me) return;
    if (profileSave.status === "sending") return;

    setProfileSave({ status: "sending" });
    try {
      let res: Response;
      if (profileDraft.avatarFile) {
        const formData = new FormData();
        formData.append("bio", profileDraft.bio);
        formData.append("avatarFile", profileDraft.avatarFile);
        res = await fetch("/api/me", {
          method: "PATCH",
          body: formData,
        });
      } else {
        res = await fetch("/api/me", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            bio: profileDraft.bio,
          }),
        });
      }

      const data = (await res.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; error: string }
        | null;

      if (!res.ok || !data || !("ok" in data) || !data.ok) {
        throw new Error((data as { error?: string } | null)?.error || "Failed.");
      }

      const bioNext = profileDraft.bio.trim() ? profileDraft.bio.trim() : null;
      setMe((prev) =>
        prev ? { ...prev, avatar_url: profileDraft.avatarPreviewUrl || prev.avatar_url, bio: bioNext } : prev,
      );
      setProfileSave({ status: "idle" });
      if (profileDraft.avatarFile) {
        setProfileDraft((prev) => ({ ...prev, avatarFile: null }));
      }
    } catch (e) {
      setProfileSave({ status: "error", error: e instanceof Error ? e.message : "Failed." });
    }
  }

  async function respond(id: string, action: "accept" | "decline") {
    setResponding((prev) => ({ ...prev, [id]: { status: "sending" } }));
    try {
      const res = await fetch("/api/friend-requests", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, action }),
      });

      if (res.status === 401) {
        setResponding((prev) => ({
          ...prev,
          [id]: { status: "error", error: "Please login first." },
        }));
        return;
      }

      const data = (await res.json().catch(() => null)) as
        | { ok: true; status: string }
        | { ok: false; error: string }
        | null;

      if (!res.ok || !data || !("ok" in data) || !data.ok) {
        throw new Error((data as { error?: string } | null)?.error || "Failed.");
      }

      setIncoming((prev) => prev.filter((r) => r.id !== id));
      setResponding((prev) => ({ ...prev, [id]: { status: "idle" } }));
    } catch (e) {
      setResponding((prev) => ({
        ...prev,
        [id]: { status: "error", error: e instanceof Error ? e.message : "Failed." },
      }));
    }
  }

  return (
    <main className="mf-page">
      <div className="mf-headerRow">
        <img
          src="/logo.png"
          alt="MapFriend"
          style={{ width: 32, height: 32, objectFit: "contain" }}
        />
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Settings</h1>
      </div>

      <div className="mf-card" style={{ marginTop: 16 }}>
        <h2 className="mf-cardTitle">Account</h2>

        {meLoading ? (
          <div className="mf-muted">Loading...</div>
        ) : meError ? (
          <div className="mf-error">{meError}</div>
        ) : !me ? (
          <div className="mf-muted">Not logged in.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 9999,
                  overflow: "hidden",
                  border: "1px solid var(--mf-border)",
                  background: "var(--mf-surface-2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flex: "0 0 auto",
                }}
                aria-hidden="true"
                title="Profile photo"
              >
                {profileDraft.avatarPreviewUrl ? (
                  <img
                    src={profileDraft.avatarPreviewUrl}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : me.avatar_url ? (
                  <img
                    src={me.avatar_url}
                    alt=""
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                ) : (
                  <div style={{ fontWeight: 900, color: "var(--mf-muted)" }}>
                    {me.username.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>

              <div style={{ flex: "1 1 auto", minWidth: 220 }}>
                <div style={{ fontWeight: 900 }}>@{me.username}</div>
                <div className="mf-muted" style={{ fontSize: 13, marginTop: 2 }}>
                  Purpose: {me.purpose}
                  {me.gender ? ` · Gender: ${me.gender}` : ""}
                </div>
              </div>

              <button
                type="button"
                onClick={logout}
                disabled={logoutBusy}
                className="mf-btn mf-btnSecondary"
                style={{
                  opacity: logoutBusy ? 0.7 : 1,
                  cursor: logoutBusy ? "not-allowed" : "pointer",
                }}
                title="Logout"
              >
                Logout
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <span className="mf-muted" style={{ fontSize: 13, fontWeight: 700 }}>
                  Profile photo
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="mf-input"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file) {
                      const previewUrl = URL.createObjectURL(file);
                      setProfileDraft((prev) => {
                        if (prev.avatarFile && prev.avatarPreviewUrl.startsWith("blob:")) {
                          URL.revokeObjectURL(prev.avatarPreviewUrl);
                        }
                        return {
                          ...prev,
                          avatarFile: file,
                          avatarPreviewUrl: previewUrl,
                        };
                      });
                    }
                  }}
                />
                <div className="mf-muted" style={{ fontSize: 12 }}>
                  Take or choose a photo from your device.
                </div>
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span className="mf-muted" style={{ fontSize: 13, fontWeight: 700 }}>
                  Bio
                </span>
                <textarea
                  className="mf-textarea"
                  value={profileDraft.bio}
                  onChange={(e) =>
                    setProfileDraft((p) => ({ ...p, bio: e.target.value }))
                  }
                  maxLength={280}
                  placeholder="Say something short about you…"
                />
                <div className="mf-muted" style={{ fontSize: 12 }}>
                  {profileDraft.bio.length}/280
                </div>
              </label>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={saveProfile}
                  disabled={profileSave.status === "sending"}
                  className="mf-btn mf-btnPrimary"
                  style={{
                    opacity: profileSave.status === "sending" ? 0.7 : 1,
                    cursor: profileSave.status === "sending" ? "not-allowed" : "pointer",
                  }}
                >
                  {profileSave.status === "sending" ? "Saving…" : "Save profile"}
                </button>

                {profileSave.status === "error" && (
                  <div className="mf-error" style={{ fontSize: 13 }}>
                    {profileSave.error || "Failed."}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mf-card" style={{ marginTop: 12 }}>
        <h2 className="mf-cardTitle">Map preferences</h2>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span className="mf-muted" style={{ fontSize: 13, fontWeight: 700 }}>
              Default purpose filter
            </span>
            <select
              className="mf-select"
              value={mapPrefs.defaultPurposeFilter}
              onChange={(e) => {
                const next = {
                  ...mapPrefs,
                  defaultPurposeFilter: e.target.value as MapPrefs["defaultPurposeFilter"],
                };
                setMapPrefs(next);
                saveMapPrefs(next);
              }}
              style={{ height: 40, maxWidth: 360 }}
            >
              <option value="all">All purposes</option>
              {PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>

          <label style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="checkbox"
              checked={mapPrefs.autoFitPeopleOnOpen}
              onChange={(e) => {
                const next = { ...mapPrefs, autoFitPeopleOnOpen: e.target.checked };
                setMapPrefs(next);
                saveMapPrefs(next);
              }}
            />
            <span style={{ fontSize: 14 }}>Auto-zoom to people on open</span>
          </label>

          <div>
            <button
              type="button"
              onClick={() => {
                clearMapPrefs();
                setMapPrefs(loadMapPrefs());
              }}
              className="mf-btn mf-btnSecondary"
            >
              Reset map preferences
            </button>
          </div>
        </div>
      </div>

      <div className="mf-card" style={{ marginTop: 12 }}>
        <h2 className="mf-cardTitle">Theming</h2>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span className="mf-muted" style={{ fontSize: 13, fontWeight: 700 }}>
            Theme
          </span>
          <select
            className="mf-select"
            value={themePref}
            onChange={(e) => {
              const next = e.target.value as ThemePref;
              setThemePrefState(next);
              setThemePref(next);
            }}
            style={{ height: 40, maxWidth: 360 }}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
      </div>

      <div className="mf-card" style={{ marginTop: 12 }}>
        <h2 className="mf-cardTitle">Friend requests</h2>

        {loading ? (
          <div className="mf-muted">Loading...</div>
        ) : error ? (
          <div className="mf-error">{error}</div>
        ) : incomingSorted.length === 0 ? (
          <div className="mf-muted">No pending requests.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {incomingSorted.map((req) => (
              <div
                key={req.id}
                style={{
                  border: "1px solid var(--mf-border)",
                  borderRadius: 14,
                  padding: 12,
                  background: "var(--mf-surface-2)",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  {req.from.username ?? "Unknown user"}
                </div>
                <div className="mf-muted" style={{ fontSize: 12, marginBottom: 10 }}>
                  Sent {new Date(req.createdAt).toLocaleString()}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => respond(req.id, "accept")}
                    disabled={responding[req.id]?.status === "sending"}
                    className="mf-btn mf-btnPrimary"
                    style={{
                      flex: 1,
                      opacity: responding[req.id]?.status === "sending" ? 0.7 : 1,
                      cursor:
                        responding[req.id]?.status === "sending"
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => respond(req.id, "decline")}
                    disabled={responding[req.id]?.status === "sending"}
                    className="mf-btn mf-btnSecondary"
                    style={{
                      flex: 1,
                      opacity: responding[req.id]?.status === "sending" ? 0.7 : 1,
                      cursor:
                        responding[req.id]?.status === "sending"
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    Decline
                  </button>
                </div>

                {responding[req.id]?.status === "error" && (
                  <div className="mf-error" style={{ marginTop: 8, fontSize: 13 }}>
                    {responding[req.id]?.error || "Failed."}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mf-card" style={{ marginTop: 12 }}>
        <h2 className="mf-cardTitle">Help</h2>
        <div className="mf-muted" style={{ fontSize: 14, lineHeight: 1.5 }}>
          <div>
            Tips: If location doesn&apos;t work, open this site over HTTPS (or use{" "}
            <code style={{ fontSize: 13 }}>http://localhost</code>).
          </div>
          <div style={{ marginTop: 8 }}>
            Support:{" "}
            <a href="mailto:support@example.com" style={{ color: "var(--mf-text)" }}>
              support@example.com
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
