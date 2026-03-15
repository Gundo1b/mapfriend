"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { divIcon } from "leaflet";

type Position = {
  lat: number;
  lng: number;
  accuracy?: number;
};

type SavedLocation = {
  lat: number;
  lng: number;
  username?: string | null;
};

type User = {
  username: string;
  purpose: "friends" | "hangout" | "hookup" | "social";
};

function FollowLocation({
  position,
  follow,
  onUserMove,
}: {
  position: Position | null;
  follow: boolean;
  onUserMove: () => void;
}) {
  const map = useMap();

  useMapEvents({
    dragstart(e) {
      if ("originalEvent" in e && e.originalEvent) onUserMove();
    },
    zoomstart(e) {
      if ("originalEvent" in e && e.originalEvent) onUserMove();
    },
  });

  useEffect(() => {
    if (!position || !follow) return;
    map.setView([position.lat, position.lng], Math.max(map.getZoom(), 16), {
      animate: true,
    });
  }, [follow, map, position]);

  return null;
}

export function Map() {
  const [position, setPosition] = useState<Position | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPurpose, setAuthPurpose] = useState<User["purpose"]>("friends");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
  const [followUser, setFollowUser] = useState(true);

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

  const initialCenter = useMemo<[number, number]>(() => [0, 0], []);

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

  async function saveCurrentLocation() {
    if (!position) return;
    if (!user) {
      setAuthOpen(true);
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);

    try {
      const res = await fetch("/api/locations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lat: position.lat,
          lng: position.lng,
          accuracy: position.accuracy,
        }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          setAuthOpen(true);
          throw new Error("Please log in.");
        }
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error || `Save failed (${res.status})`);
      }

      setSaveMessage("Saved");
      setSavedLocations((prev) => [
        { lat: position.lat, lng: position.lng, username: user.username },
        ...prev,
      ]);
      setTimeout(() => setSaveMessage(null), 2500);
    } catch (e) {
      setSaveMessage(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setIsSaving(false);
    }
  }

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

  async function submitAuth() {
    setIsAuthSubmitting(true);
    setAuthError(null);

    try {
      const endpoint =
        authMode === "register" ? "/api/auth/register" : "/api/auth/login";

      if (authMode === "register" && !position) {
        throw new Error("Location is required to register.");
      }

      const payload =
        authMode === "register"
          ? {
              username: authUsername.trim(),
              password: authPassword,
              purpose: authPurpose,
              location: position
                ? {
                    lat: position.lat,
                    lng: position.lng,
                    accuracy: position.accuracy,
                  }
                : undefined,
            }
          : { username: authUsername.trim(), password: authPassword };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

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
    } catch (e) {
      setAuthError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setIsAuthSubmitting(false);
    }
  }

  return (
    <div style={{ height: "100vh", width: "100vw", position: "relative" }}>
      <MapContainer
        center={initialCenter}
        zoom={2}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FollowLocation
          position={position}
          follow={followUser}
          onUserMove={() => setFollowUser(false)}
        />

        {position && (
          <>
            {typeof position.accuracy === "number" && (
              <Circle
                center={[position.lat, position.lng]}
                radius={position.accuracy}
                pathOptions={{ color: "#2563eb", fillColor: "#60a5fa" }}
              />
            )}
            <CircleMarker
              center={[position.lat, position.lng]}
              radius={7}
              pathOptions={{ color: "#1d4ed8", fillColor: "#3b82f6" }}
            >
              <Popup>
                You are here
                <br />
                {position.lat.toFixed(6)}, {position.lng.toFixed(6)}
              </Popup>
            </CircleMarker>
          </>
        )}

        {savedLocations.map((loc, idx) => (
          <Marker
            key={`${loc.lat},${loc.lng},${idx}`}
            position={[loc.lat, loc.lng]}
            icon={divIcon({
              className: "",
              html: `
                <div style="display:flex; flex-direction:column; align-items:center; transform: translateY(-6px);">
                  <div style="font-size:12px; line-height:1; padding:3px 6px; border-radius:10px; background:rgba(255,255,255,0.95); border:1px solid rgba(0,0,0,0.10); color:#111827; white-space:nowrap;">
                    ${escapeHtml(loc.username?.trim() ? loc.username : "a")}
                  </div>
                  <div style="width:12px; height:12px; margin-top:4px; border-radius:9999px; background:#ef4444; border:2px solid #b91c1c;"></div>
                </div>
              `,
              iconSize: [120, 36],
              iconAnchor: [60, 30],
            })}
          >
            <Popup>
              {loc.username?.trim() ? loc.username : "a"}
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {(isLocating || error) && (
        <div
          style={{
            position: "absolute",
            top: 12,
            left: 12,
            right: 12,
            zIndex: 1000,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              display: "inline-block",
              background: "rgba(255,255,255,0.9)",
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 14,
              color: "#111827",
            }}
          >
            {error ? `Location error: ${error}` : "Getting your location…"}
          </div>
        </div>
      )}

      <div
        style={{
          position: "fixed",
          bottom: 12,
          left: 12,
          zIndex: 2000,
          display: "flex",
          gap: 8,
          alignItems: "flex-start",
        }}
      >
        <button
          type="button"
          onClick={() => setFollowUser(true)}
          disabled={!position}
          style={{
            background: "rgba(255,255,255,0.95)",
            color: "#111827",
            border: "1px solid rgba(0,0,0,0.10)",
            borderRadius: 9999,
            padding: "10px 12px",
            fontSize: 14,
            opacity: !position ? 0.6 : 1,
            cursor: !position ? "not-allowed" : "pointer",
            touchAction: "manipulation",
            whiteSpace: "nowrap",
          }}
        >
          {followUser ? "Following" : "Center me"}
        </button>

        <button
          type="button"
          onClick={saveCurrentLocation}
          disabled={!position || isSaving || !user}
          style={{
            background: "#111827",
            color: "white",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 9999,
            padding: "10px 12px",
            fontSize: 14,
            opacity: !position || isSaving || !user ? 0.6 : 1,
            cursor: !position || isSaving || !user ? "not-allowed" : "pointer",
            touchAction: "manipulation",
            whiteSpace: "nowrap",
          }}
        >
          {isSaving ? "Saving…" : "Save location"}
        </button>
        {saveMessage && (
          <div style={{ marginTop: 8, fontSize: 13, color: "#111827" }}>
            <span
              style={{
                display: "inline-block",
                background: "rgba(255,255,255,0.9)",
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 10,
                padding: "6px 10px",
              }}
            >
              {saveMessage}
            </span>
          </div>
        )}
      </div>

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
                    border: "1px solid rgba(0,0,0,0.12)",
                    marginBottom: 12,
                    background: "white",
                  }}
                >
                  <option value="friends">friends</option>
                  <option value="hangout">hangout</option>
                  <option value="hookup">hookup</option>
                  <option value="social">social</option>
                </select>
              </>
            )}

            {authError && (
              <div style={{ color: "#b91c1c", fontSize: 13, marginBottom: 10 }}>
                {authError}
              </div>
            )}

            <button
              type="button"
              onClick={submitAuth}
              disabled={isAuthSubmitting}
              style={{
                width: "100%",
                background: "#111827",
                color: "white",
                border: "1px solid rgba(255,255,255,0.08)",
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
