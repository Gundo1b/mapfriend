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
} from "react-leaflet";
import { divIcon, latLngBounds, type Map as LeafletMap } from "leaflet";

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
};

type User = {
  username: string;
  purpose: "friends" | "hangout" | "hookup" | "social";
};

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

function MapRefSetter({ onMap }: { onMap: (map: LeafletMap) => void }) {
  const map = useMap();

  useEffect(() => {
    onMap(map);
  }, [map, onMap]);

  return null;
}

export function Map() {
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(true);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);
  const [purposeFilter, setPurposeFilter] = useState<User["purpose"] | "all">("all");
  const [user, setUser] = useState<User | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPurpose, setAuthPurpose] = useState<User["purpose"]>("friends");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
  const [hasAutoFitted, setHasAutoFitted] = useState(false);

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

  const filteredLocations = useMemo(() => {
    if (purposeFilter === "all") return savedLocations;
    return savedLocations.filter((l) => l.purpose === purposeFilter);
  }, [purposeFilter, savedLocations]);

  useEffect(() => {
    if (!map || hasAutoFitted || filteredLocations.length === 0) return;
    fitVisiblePeople();
    setHasAutoFitted(true);
  }, [filteredLocations.length, hasAutoFitted, map]);

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

  function fitVisiblePeople() {
    if (!map || filteredLocations.length === 0) return;

    const points = filteredLocations.map((l) => [l.lat, l.lng] as [number, number]);
    const bounds = latLngBounds(points);
    map.fitBounds(bounds, { padding: [40, 40] });
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

        <MapRefSetter onMap={setMap} />

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

        {filteredLocations.map((loc, idx) => (
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
                  ${
                    loc.purpose
                      ? `<div style="font-size:11px; line-height:1; margin-top:3px; padding:2px 6px; border-radius:9999px; background:${
                          (PURPOSE_COLORS[loc.purpose] ?? DEFAULT_COLORS).badgeBg
                        }; border:1px solid ${
                          (PURPOSE_COLORS[loc.purpose] ?? DEFAULT_COLORS).badgeBorder
                        }; color:${
                          (PURPOSE_COLORS[loc.purpose] ?? DEFAULT_COLORS).badgeText
                        }; white-space:nowrap;">${escapeHtml(loc.purpose)}</div>`
                      : ""
                  }
                  <div style="width:12px; height:12px; margin-top:4px; border-radius:9999px; background:${
                    (loc.purpose ? PURPOSE_COLORS[loc.purpose] : DEFAULT_COLORS).dot
                  }; border:2px solid ${
                    (loc.purpose ? PURPOSE_COLORS[loc.purpose] : DEFAULT_COLORS).dotBorder
                  };"></div>
                </div>
              `,
              iconSize: [140, 56],
              iconAnchor: [70, 48],
            })}
          >
            <Popup>
              {loc.username?.trim() ? loc.username : "a"}
              {loc.purpose ? (
                <>
                  <br />
                  <span
                    style={{
                      display: "inline-block",
                      marginTop: 6,
                      padding: "2px 8px",
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
                </>
              ) : null}
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
        className="mapControls"
      >
        <button
          className="control"
          type="button"
          onClick={fitVisiblePeople}
          disabled={filteredLocations.length === 0 || !map}
          style={{
            background: "rgba(255,255,255,0.95)",
            color: "#111827",
            border: "1px solid rgba(0,0,0,0.10)",
            borderRadius: 9999,
            padding: "10px 12px",
            fontSize: 14,
            opacity: filteredLocations.length === 0 || !map ? 0.6 : 1,
            cursor: filteredLocations.length === 0 || !map ? "not-allowed" : "pointer",
            touchAction: "manipulation",
            whiteSpace: "nowrap",
          }}
          title={
            purposeFilter === "all"
              ? "Zoom to all people"
              : `Zoom to people matching: ${purposeFilter}`
          }
        >
          People (
          {purposeFilter === "all"
            ? filteredLocations.length
            : `${filteredLocations.length}/${savedLocations.length}`}
          )
        </button>

        <select
          className="control controlSelect"
          value={purposeFilter}
          onChange={(e) => setPurposeFilter(e.target.value as User["purpose"] | "all")}
          style={{
            background: "rgba(255,255,255,0.95)",
            color: "#111827",
            border: "1px solid rgba(0,0,0,0.10)",
            borderRadius: 9999,
            padding: "10px 12px",
            fontSize: 14,
            height: 40,
          }}
          title="Filter people by purpose"
        >
          <option value="all">All purposes</option>
          {PURPOSES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

      </div>

      <style jsx>{`
        .mapControls {
          position: fixed;
          top: 64px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 2000;
          display: flex;
          gap: 8px;
          align-items: flex-start;
          flex-wrap: wrap;
          justify-content: center;
          max-width: calc(100vw - 24px);
        }

        @media (max-width: 520px) {
          .mapControls {
            top: 12px;
            left: 12px;
            right: 12px;
            transform: none;
            display: flex;
            flex-wrap: nowrap;
            align-items: center;
            justify-content: flex-start;
            gap: 8px;
            padding: 6px;
            border-radius: 9999px;
            border: 1px solid rgba(0, 0, 0, 0.08);
            background: rgba(255, 255, 255, 0.75);
            backdrop-filter: blur(10px);
            overflow-x: auto;
            -webkit-overflow-scrolling: touch;
          }

          .control {
            flex: 0 0 auto;
            white-space: nowrap;
          }

          .controlSelect {
            flex: 1 1 auto;
            min-width: 140px;
          }
        }
      `}</style>

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
                  {PURPOSES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
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
