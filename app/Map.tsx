"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadMapPrefs, type MapPrefs } from "./lib/clientPrefs";

type Position = {
  lat: number;
  lng: number;
  accuracy?: number;
};

type SavedLocation = {
  lat: number;
  lng: number;
  username?: string | null;
  purpose?: User["purpose"] | null;
  avatar_url?: string | null;
  bio?: string | null;
};

type User = {
  username: string;
  purpose: "friends" | "hangout" | "hookup" | "social";
};

type FriendRequestEntry = {
  status: "sending" | "sent" | "error";
  error?: string;
};

type Friend = { id: string; username: string };

const PURPOSES: User["purpose"][] = ["friends", "hangout", "hookup", "social"];

const PURPOSE_COLORS: Record<
  User["purpose"],
  {
    dot: string;
    dotBorder: string;
    badgeBg: string;
    badgeBorder: string;
    badgeText: string;
  }
> = {
  friends: {
    dot: "#22c55e",
    dotBorder: "#15803d",
    badgeBg: "rgba(34,197,94,0.12)",
    badgeBorder: "rgba(21,128,61,0.25)",
    badgeText: "#166534",
  },
  hangout: {
    dot: "#3b82f6",
    dotBorder: "#1d4ed8",
    badgeBg: "rgba(59,130,246,0.12)",
    badgeBorder: "rgba(29,78,216,0.25)",
    badgeText: "#1e40af",
  },
  hookup: {
    dot: "#f43f5e",
    dotBorder: "#be123c",
    badgeBg: "rgba(244,63,94,0.12)",
    badgeBorder: "rgba(190,18,60,0.25)",
    badgeText: "#9f1239",
  },
  social: {
    dot: "#a855f7",
    dotBorder: "#7e22ce",
    badgeBg: "rgba(168,85,247,0.12)",
    badgeBorder: "rgba(126,34,206,0.25)",
    badgeText: "#6b21a8",
  },
};

const DEFAULT_COLORS = {
  dot: "#ef4444",
  dotBorder: "#b91c1c",
  badgeBg: "rgba(107,114,128,0.12)",
  badgeBorder: "rgba(107,114,128,0.25)",
  badgeText: "#6b7280",
};

const LOCATION_UPDATE_MIN_METERS = 50;
const LOCATION_UPDATE_MIN_MS = 30_000;
const LOCATION_UPDATE_MAX_ACCURACY_METERS = 200;

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function formatDistance(distanceMeters: number) {
  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m away`;
  }
  return `${(distanceMeters / 1000).toFixed(1)} km away`;
}

export function Map() {
  const initialPrefs = useMemo(() => loadMapPrefs(), []);
  const [position, setPosition] = useState<Position | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(true);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);
  const [mapPrefs, setMapPrefs] = useState<MapPrefs>(initialPrefs);
  const [purposeFilter, setPurposeFilter] = useState<User["purpose"] | "all">(
    initialPrefs.defaultPurposeFilter,
  );
  const [user, setUser] = useState<User | null>(null);
  const [friendRequests, setFriendRequests] = useState<Record<string, FriendRequestEntry>>({});
  const [friends, setFriends] = useState<Set<string>>(new Set());
  const [selectedProfile, setSelectedProfile] = useState<SavedLocation | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPurpose, setAuthPurpose] = useState<User["purpose"]>("friends");
  const [authBio, setAuthBio] = useState("");
  const [authAvatarFile, setAuthAvatarFile] = useState<File | null>(null);
  const [authAvatarPreview, setAuthAvatarPreview] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);

  const lastLocationSentRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const locationSendInFlightRef = useRef(false);

  useEffect(() => {
    function onPrefsChanged(e: Event) {
      const next = (e as CustomEvent<MapPrefs> | null)?.detail ?? loadMapPrefs();
      setMapPrefs(next);
      setPurposeFilter(next.defaultPurposeFilter);
    }

    window.addEventListener("mf:map-prefs-changed", onPrefsChanged as EventListener);
    return () => {
      window.removeEventListener("mf:map-prefs-changed", onPrefsChanged as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!window.isSecureContext) {
      setError(
        "Location requires a secure origin (HTTPS) or http://localhost. Open this site over HTTPS and try again.",
      );
      setIsLocating(false);
      return;
    }

    if (!("geolocation" in navigator)) {
      setError("Geolocation is not supported in this browser.");
      setIsLocating(false);
      return;
    }

    let watchId: number | null = null;

    const onSuccess: PositionCallback = (pos) => {
      setPosition({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      });
      setError(null);
      setIsLocating(false);
    };

    const onError: PositionErrorCallback = (err) => {
      setError(err.message || "Location permission denied.");
      setIsLocating(false);
    };

    navigator.geolocation.getCurrentPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 0,
    });

    watchId = navigator.geolocation.watchPosition(onSuccess, onError, {
      enableHighAccuracy: true,
      timeout: 20_000,
      maximumAge: 10_000,
    });

    return () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  useEffect(() => {
    if (!position || hasCheckedAuth) return;

    let cancelled = false;

    async function loadMe() {
      try {
        const res = await fetch("/api/me", { method: "GET" });
        const data = (await res.json()) as { ok: true; user: User | null };
        if (cancelled) return;
        setUser(data.user);
        if (!data.user) setAuthOpen(true);
      } catch {
        if (!cancelled) setAuthOpen(true);
      } finally {
        if (!cancelled) setHasCheckedAuth(true);
      }
    }

    void loadMe();

    return () => {
      cancelled = true;
    };
  }, [hasCheckedAuth, position]);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    async function loadSaved() {
      try {
        const res = await fetch("/api/locations", { method: "GET" });
        if (res.status === 401) {
          if (!cancelled) setAuthOpen(true);
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as
          | { ok: true; locations: SavedLocation[] }
          | { ok: false; error: string };
        if (cancelled) return;
        if (data.ok) setSavedLocations(data.locations);
      } catch {
        // ignore
      }
    }

    void loadSaved();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      setFriends(new Set());
      return;
    }

    let cancelled = false;

    async function loadFriends() {
      try {
        const res = await fetch("/api/friends", { method: "GET" });
        if (res.status === 401) return;
        if (!res.ok) return;

        const data = (await res.json().catch(() => null)) as
          | { ok: true; friends: Friend[] }
          | { ok: false; error: string }
          | null;

        if (cancelled || !data || !("ok" in data) || !data.ok) return;

        const next = new Set(
          (data.friends ?? [])
            .map((f) => f.username?.trim())
            .filter((u): u is string => !!u)
            .map((u) => u.toLowerCase()),
        );
        setFriends(next);
      } catch {
        // ignore
      }
    }

    void loadFriends();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (!user || !position) return;
    const currentPosition = position;
    if (
      typeof currentPosition.accuracy === "number" &&
      currentPosition.accuracy > LOCATION_UPDATE_MAX_ACCURACY_METERS
    ) {
      return;
    }
    if (locationSendInFlightRef.current) return;

    const last = lastLocationSentRef.current;
    const now = Date.now();
    const movedMeters = last ? distanceMeters(last, currentPosition) : Infinity;
    const elapsedMs = last ? now - last.at : Infinity;

    if (movedMeters < LOCATION_UPDATE_MIN_METERS) return;
    if (elapsedMs < LOCATION_UPDATE_MIN_MS) return;

    let cancelled = false;

    async function save() {
      try {
        locationSendInFlightRef.current = true;
        lastLocationSentRef.current = {
          lat: currentPosition.lat,
          lng: currentPosition.lng,
          at: now,
        };

        const res = await fetch("/api/locations", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            lat: currentPosition.lat,
            lng: currentPosition.lng,
            accuracy: currentPosition.accuracy,
          }),
        });
        if (cancelled) return;
        if (!res.ok) return;
      } catch {
        // ignore
      } finally {
        locationSendInFlightRef.current = false;
      }
    }

    void save();

    return () => {
      cancelled = true;
    };
  }, [position, user]);

  const filteredLocations = useMemo(() => {
    if (purposeFilter === "all") return savedLocations;
    return savedLocations.filter((l) => l.purpose === purposeFilter);
  }, [purposeFilter, savedLocations]);

  async function submitAuth() {
    setIsAuthSubmitting(true);
    setAuthError(null);

    try {
      const endpoint =
        authMode === "register" ? "/api/auth/register" : "/api/auth/login";

      if (authMode === "register") {
        if (!position) {
          throw new Error("Location is required to register.");
        }
        if (!authBio.trim()) {
          throw new Error("Bio is required to register.");
        }
        if (!authAvatarFile) {
          throw new Error("Profile photo is required to register.");
        }
      }

      let res: Response;

      if (authMode === "register") {
        const formData = new FormData();
        formData.append("username", authUsername.trim());
        formData.append("password", authPassword);
        formData.append("purpose", authPurpose);
        formData.append("bio", authBio.trim());
        formData.append("avatarFile", authAvatarFile as File);

        if (position) {
          formData.append("lat", String(position.lat));
          formData.append("lng", String(position.lng));
          if (typeof position.accuracy === "number") {
            formData.append("accuracy", String(position.accuracy));
          }
        }

        res = await fetch(endpoint, {
          method: "POST",
          body: formData,
        });
      } else {
        const payload = {
          username: authUsername.trim(),
          password: authPassword,
          location: position
            ? {
                lat: position.lat,
                lng: position.lng,
                accuracy: position.accuracy,
              }
            : undefined,
        };

        res = await fetch(endpoint, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const data = (await res.json().catch(() => null)) as
        | { ok: true; user: User }
        | { ok: false; error: string }
        | null;

      if (!res.ok || !data || !("ok" in data) || !data.ok) {
        throw new Error((data as { error?: string } | null)?.error || "Failed.");
      }

      setUser(data.user);
      setAuthOpen(false);
      setAuthPassword("");
      setAuthBio("");
      setAuthAvatarFile(null);
      setAuthAvatarPreview("");
      try {
        window.dispatchEvent(new Event("mf:auth-changed"));
      } catch {
        // ignore
      }
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setIsAuthSubmitting(false);
    }
  }

  async function sendFriendRequest(toUsername: string) {
    const username = toUsername.trim();
    if (!username) return;
    if (!user) {
      setAuthOpen(true);
      return;
    }
    if (user.username === username) return;

    setFriendRequests((prev) => ({ ...prev, [username]: { status: "sending" } }));

    try {
      const res = await fetch("/api/friend-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toUsername: username }),
      });

      if (res.status === 401) {
        setAuthOpen(true);
        setFriendRequests((prev) => ({
          ...prev,
          [username]: { status: "error", error: "Please login first." },
        }));
        return;
      }

      const data = (await res.json().catch(() => null)) as
        | { ok: true; created: boolean }
        | { ok: false; error: string }
        | null;

      if (!res.ok || !data || !("ok" in data) || !data.ok) {
        throw new Error((data as { error?: string } | null)?.error || "Failed.");
      }

      setFriendRequests((prev) => ({ ...prev, [username]: { status: "sent" } }));
    } catch (e) {
      setFriendRequests((prev) => ({
        ...prev,
        [username]: { status: "error", error: e instanceof Error ? e.message : "Failed." },
      }));
    }
  }

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: "var(--mf-surface)", color: "var(--mf-text)" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px 40px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
          <div style={{ minWidth: 0 }}>
            
            
            
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flex: "0 0 auto" }}>
            <label htmlFor="purposeFilter" style={{ color: "var(--mf-muted)", fontSize: 13, whiteSpace: "nowrap" }}>
              Filter:
            </label>
            <select
              id="purposeFilter"
              value={purposeFilter}
              onChange={(e) => setPurposeFilter(e.target.value as User["purpose"] | "all")}
              style={{
                minWidth: 160,
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid var(--mf-border)",
                background: "var(--mf-surface)",
                color: "var(--mf-text)",
                fontSize: 14,
              }}
            >
              <option value="all">All purposes</option>
              {PURPOSES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
        </div>

        {(isLocating || error) && (
          <div
            style={{
              marginBottom: 20,
              padding: 16,
              borderRadius: 18,
              border: "1px solid var(--mf-border)",
              background: "var(--mf-surface-2)",
              color: "var(--mf-text)",
            }}
          >
            {error ? `Location error: ${error}` : "Getting your location…"}
          </div>
        )}

        <div style={{ display: "grid", gap: 18 }}>
          {filteredLocations.length === 0 ? (
            <div
              style={{
                padding: 24,
                borderRadius: 20,
                border: "1px solid var(--mf-border)",
                background: "var(--mf-surface-2)",
                color: "var(--mf-muted)",
              }}
            >
              No profiles found for the selected filter. Try a different purpose or check back later.
            </div>
          ) : (
            filteredLocations.map((loc, idx) => {
              const username = loc.username?.trim() || "Unknown";
              const isSelf = user?.username === loc.username?.trim();
              const normalizedUsername = loc.username?.trim().toLowerCase() ?? "";
              const isFriend = normalizedUsername ? friends.has(normalizedUsername) : false;
              const requestState = normalizedUsername ? friendRequests[normalizedUsername] : undefined;

              return (
                <article
                  key={`${username}-${idx}`}
                  onClick={() => setSelectedProfile(loc)}
                  style={{
                    padding: 24,
                    borderRadius: 24,
                    border: "1px solid var(--mf-border)",
                    background: "var(--mf-surface-2)",
                    boxShadow: "0 18px 40px rgba(0,0,0,0.05)",
                    cursor: "pointer",
                    transition: "transform 0.15s ease, box-shadow 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = "none";
                  }}
                >
                  <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div
                      style={{
                        width: 64,
                        height: 64,
                        borderRadius: 9999,
                        overflow: "hidden",
                        background: "var(--mf-surface)",
                        border: "1px solid var(--mf-border)",
                        display: "grid",
                        placeItems: "center",
                        flex: "0 0 auto",
                      }}
                    >
                      {loc.avatar_url ? (
                        <img
                          src={loc.avatar_url}
                          alt=""
                          style={{ width: "100%", height: "100%", objectFit: "cover" }}
                        />
                      ) : (
                        <span style={{ fontSize: 24, fontWeight: 800, color: "var(--mf-muted)" }}>
                          {username.slice(0, 1).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                        <h2 style={{ margin: 0, fontSize: 20, lineHeight: 1.1 }}>{username}</h2>
                        {loc.purpose ? (
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              padding: "6px 12px",
                              borderRadius: 9999,
                              border: `1px solid ${PURPOSE_COLORS[loc.purpose].badgeBorder}`,
                              background: PURPOSE_COLORS[loc.purpose].badgeBg,
                              color: PURPOSE_COLORS[loc.purpose].badgeText,
                              fontSize: 12,
                              lineHeight: 1.2,
                            }}
                          >
                            {loc.purpose}
                          </span>
                        ) : null}
                        {isSelf ? (
                          <span
                            style={{
                              padding: "6px 12px",
                              borderRadius: 9999,
                              background: "rgba(15,23,42,0.06)",
                              color: "var(--mf-muted)",
                              fontSize: 12,
                            }}
                          >
                            You
                          </span>
                        ) : null}
                        {isFriend ? (
                          <span
                            style={{
                              padding: "6px 12px",
                              borderRadius: 9999,
                              background: "rgba(34,197,94,0.12)",
                              color: "#166534",
                              fontSize: 12,
                            }}
                          >
                            Friend
                          </span>
                        ) : null}
                      </div>
                      <p style={{ margin: "10px 0 0", color: "var(--mf-muted)", lineHeight: 1.7 }}>
                        {loc.bio?.trim() || "This profile hasn’t added a bio yet, but they’re ready to connect."}
                      </p>
                    </div>
                  </div>

                  <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                    <div style={{ color: "var(--mf-muted)", fontSize: 13 }}>
                      {loc.purpose ? `Looking for ${loc.purpose}` : "Open to connections"}
                    </div>
                    {loc.username?.trim() && !isSelf && !isFriend ? (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          sendFriendRequest(loc.username as string);
                        }}
                        disabled={requestState?.status === "sending" || requestState?.status === "sent"}
                        style={{
                          minWidth: 180,
                          padding: "10px 14px",
                          borderRadius: 14,
                          border: "1px solid var(--mf-border)",
                          background: "var(--mf-primary)",
                          color: "var(--mf-primary-text)",
                          fontSize: 14,
                          cursor:
                            requestState?.status === "sending" || requestState?.status === "sent"
                              ? "not-allowed"
                              : "pointer",
                          opacity: requestState?.status === "sending" || requestState?.status === "sent" ? 0.75 : 1,
                        }}
                      >
                        {requestState?.status === "sending"
                          ? "Sending…"
                          : requestState?.status === "sent"
                          ? "Request sent"
                          : user
                          ? "Send friend request"
                          : "Login to add friend"}
                      </button>
                    ) : null}
                  </div>
                  {requestState?.status === "error" ? (
                    <div style={{ marginTop: 10, color: "var(--mf-danger)", fontSize: 13 }}>
                      {requestState.error || "Failed to send request."}
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
        </div>
      </div>

      {selectedProfile && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 3500,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => setSelectedProfile(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            style={{
              width: "100%",
              maxWidth: 520,
              borderRadius: 24,
              background: "var(--mf-surface)",
              padding: 24,
              border: "1px solid var(--mf-border)",
              boxShadow: "0 30px 80px rgba(0,0,0,0.18)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 9999,
                    overflow: "hidden",
                    border: "1px solid var(--mf-border)",
                    background: "var(--mf-surface-2)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  {selectedProfile.avatar_url ? (
                    <img
                      src={selectedProfile.avatar_url}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span style={{ fontSize: 28, fontWeight: 800, color: "var(--mf-muted)" }}>
                      {(selectedProfile.username?.trim() || "?").slice(0, 1).toUpperCase()}
                    </span>
                  )}
                </div>
                <div style={{ minWidth: 0 }}>
                  <h2 style={{ margin: 0, fontSize: 24 }}>{selectedProfile.username ?? "Unknown"}</h2>
                  <div style={{ marginTop: 6, color: "var(--mf-muted)", fontSize: 14 }}>
                    {selectedProfile.purpose ? `Looking for ${selectedProfile.purpose}` : "Open to connections"}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProfile(null)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "var(--mf-text)",
                  fontSize: 18,
                  cursor: "pointer",
                }}
                aria-label="Close profile view"
              >
                ×
              </button>
            </div>
            <div style={{ marginTop: 18, color: "var(--mf-text)", lineHeight: 1.7 }}>
              {selectedProfile.bio?.trim() || "This profile hasn’t added a bio yet."}
            </div>
            <div style={{ marginTop: 18, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  padding: "8px 14px",
                  borderRadius: 9999,
                  border: `1px solid ${
                    selectedProfile.purpose
                      ? PURPOSE_COLORS[selectedProfile.purpose].badgeBorder
                      : DEFAULT_COLORS.badgeBorder
                  }`,
                  background: selectedProfile.purpose
                    ? PURPOSE_COLORS[selectedProfile.purpose].badgeBg
                    : DEFAULT_COLORS.badgeBg,
                  color: selectedProfile.purpose
                    ? PURPOSE_COLORS[selectedProfile.purpose].badgeText
                    : DEFAULT_COLORS.badgeText,
                  fontSize: 13,
                }}
              >
                {selectedProfile.purpose ?? "No purpose specified"}
              </span>
              <span style={{ color: "var(--mf-muted)", fontSize: 13 }}>
                {typeof selectedProfile.lat === "number" && typeof selectedProfile.lng === "number" && position
                  ? formatDistance(distanceMeters(position, selectedProfile))
                  : "Location hidden"}
              </span>
            </div>
          </div>
        </div>
      )}

      {authOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 3000,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 420,
              background: "white",
              borderRadius: 16,
              padding: 16,
              border: "1px solid rgba(0,0,0,0.08)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: 10,
              }}
            >
              <img
                src="/logo.png"
                alt="MapFriend"
                style={{ width: 44, height: 44, objectFit: "contain" }}
              />
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button
                type="button"
                onClick={() => setAuthMode("register")}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.12)",
                  background: authMode === "register" ? "#111827" : "white",
                  color: authMode === "register" ? "white" : "#111827",
                }}
              >
                Register
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("login")}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.12)",
                  background: authMode === "login" ? "#111827" : "white",
                  color: authMode === "login" ? "white" : "#111827",
                }}
              >
                Login
              </button>
            </div>

            <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>
              Username
            </label>
            <input
              value={authUsername}
              onChange={(e) => setAuthUsername(e.target.value)}
              autoCapitalize="none"
              autoCorrect="off"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.12)",
                marginBottom: 12,
              }}
            />

            <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>
              Password
            </label>
            <input
              value={authPassword}
              onChange={(e) => setAuthPassword(e.target.value)}
              type="password"
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.12)",
                marginBottom: 12,
              }}
            />

            {authMode === "register" && (
              <>
                <label
                  style={{ display: "block", fontSize: 13, marginBottom: 6 }}
                >
                  Purpose
                </label>
                <select
                  value={authPurpose}
                  onChange={(e) =>
                    setAuthPurpose(e.target.value as User["purpose"])
                  }
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid var(--mf-border-strong)",
                    marginBottom: 12,
                    background: "var(--mf-surface)",
                    color: "var(--mf-text)",
                  }}
                >
                  {PURPOSES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>

                <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>
                  Profile photo
                </label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    const file = e.target.files?.[0] ?? null;
                    if (file) {
                      const preview = URL.createObjectURL(file);
                      if (authAvatarPreview) {
                        URL.revokeObjectURL(authAvatarPreview);
                      }
                      setAuthAvatarFile(file);
                      setAuthAvatarPreview(preview);
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid var(--mf-border-strong)",
                    marginBottom: 12,
                    background: "var(--mf-surface)",
                    color: "var(--mf-text)",
                  }}
                />
                {authAvatarPreview ? (
                  <div
                    style={{
                      width: 96,
                      height: 96,
                      borderRadius: 18,
                      overflow: "hidden",
                      border: "1px solid var(--mf-border)",
                      marginBottom: 12,
                    }}
                  >
                    <img
                      src={authAvatarPreview}
                      alt="Selected avatar"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                ) : null}

                <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>
                  Bio
                </label>
                <textarea
                  value={authBio}
                  onChange={(e) => setAuthBio(e.target.value)}
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid var(--mf-border-strong)",
                    marginBottom: 12,
                    background: "var(--mf-surface)",
                    color: "var(--mf-text)",
                    resize: "vertical",
                  }}
                />
              </>
            )}

            {authError && (
              <div style={{ color: "var(--mf-danger)", fontSize: 13, marginBottom: 10 }}>
                {authError}
              </div>
            )}

            <button
              type="button"
              onClick={submitAuth}
              disabled={isAuthSubmitting}
              style={{
                width: "100%",
                background: "var(--mf-primary)",
                color: "var(--mf-primary-text)",
                border: "1px solid var(--mf-border)",
                borderRadius: 12,
                padding: "10px 12px",
                fontSize: 14,
                opacity: isAuthSubmitting ? 0.7 : 1,
              }}
            >
              {isAuthSubmitting
                ? "Please wait…"
                : authMode === "register"
                ? "Create account"
                : "Login"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
