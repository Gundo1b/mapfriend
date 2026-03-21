"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { loadMapPrefs, type MapPrefs } from "./lib/clientPrefs";

type Position = {
  lat: number;
  lng: number;
  accuracy?: number;
};

const LOCATION_UPDATE_MIN_METERS = 50;
const LOCATION_UPDATE_MIN_MS = 30_000;
const LOCATION_UPDATE_MAX_ACCURACY_METERS = 200;

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  // Haversine
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

function MapRefSetter({ onMap }: { onMap: (map: LeafletMap) => void }) {
  const map = useMap();

  useEffect(() => {
    onMap(map);
  }, [map, onMap]);

  return null;
}

export function Map() {
  const initialPrefs = useMemo(() => loadMapPrefs(), []);
  const [map, setMap] = useState<LeafletMap | null>(null);
  const [position, setPosition] = useState<Position | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(true);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);
  const [mapPrefs, setMapPrefs] = useState<MapPrefs>(initialPrefs);
  const [purposeFilter, setPurposeFilter] = useState<User["purpose"] | "all">(
    initialPrefs.defaultPurposeFilter,
  );
  const [autoFitPeopleOnOpen, setAutoFitPeopleOnOpen] = useState<boolean>(
    initialPrefs.autoFitPeopleOnOpen,
  );
  const [user, setUser] = useState<User | null>(null);
  const [friendRequests, setFriendRequests] = useState<Record<string, FriendRequestEntry>>(
    {},
  );
  const [friends, setFriends] = useState<Set<string>>(new Set());
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [authUsername, setAuthUsername] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPurpose, setAuthPurpose] = useState<User["purpose"]>("friends");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false);
  const [hasCheckedAuth, setHasCheckedAuth] = useState(false);
  const [hasAutoFitted, setHasAutoFitted] = useState(false);

  const lastLocationSentRef = useRef<{ lat: number; lng: number; at: number } | null>(
    null,
  );
  const locationSendInFlightRef = useRef(false);

  useEffect(() => {
    function onPrefsChanged(e: Event) {
      const next = (e as CustomEvent<MapPrefs> | null)?.detail ?? loadMapPrefs();
      setMapPrefs(next);
      setPurposeFilter(next.defaultPurposeFilter);
      setAutoFitPeopleOnOpen(next.autoFitPeopleOnOpen);
      if (next.autoFitPeopleOnOpen) setHasAutoFitted(false);
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
        // Optimistic timestamping to avoid bursts while a request is in-flight.
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

  useEffect(() => {
    if (!autoFitPeopleOnOpen) return;
    if (!map || hasAutoFitted || filteredLocations.length === 0) return;
    fitVisiblePeople();
    setHasAutoFitted(true);
  }, [autoFitPeopleOnOpen, filteredLocations.length, hasAutoFitted, map]);

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
          : {
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
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={20}
        />
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png"
          subdomains="abcd"
          maxZoom={20}
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
              <div style={{ display: "flex", gap: 10, alignItems: "center", minWidth: 220 }}>
                <div
                  style={{
                    width: 44,
                    height: 44,
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
                  {loc.avatar_url ? (
                    <img
                      src={loc.avatar_url}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <div style={{ fontWeight: 900, color: "var(--mf-muted)" }}>
                      {(loc.username?.trim() ? loc.username : "U").slice(0, 1).toUpperCase()}
                    </div>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 900 }}>
                    {loc.username?.trim() ? loc.username : "Unknown"}
                  </div>
                  {loc.bio?.trim() ? (
                    <div
                      style={{
                        color: "var(--mf-muted)",
                        fontSize: 12,
                        marginTop: 2,
                        lineHeight: 1.3,
                      }}
                    >
                      {loc.bio}
                    </div>
                  ) : null}

                  {loc.purpose ? (
                    <div style={{ marginTop: 6 }}>
                      <span
                        style={{
                          display: "inline-block",
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
                    </div>
                  ) : null}
                </div>
              </div>
              {loc.username?.trim() &&
              (!user || loc.username.trim() !== user.username) &&
              !friends.has(loc.username.trim().toLowerCase()) ? (
                <div style={{ marginTop: 10, minWidth: 160 }}>
                  <button
                    type="button"
                    onClick={() => sendFriendRequest(loc.username as string)}
                    disabled={
                      friendRequests[loc.username.trim()]?.status === "sending" ||
                      friendRequests[loc.username.trim()]?.status === "sent"
                    }
                    style={{
                      width: "100%",
                      background: "var(--mf-primary)",
                      color: "var(--mf-primary-text)",
                      border: "1px solid var(--mf-border)",
                      borderRadius: 10,
                      padding: "8px 10px",
                      fontSize: 13,
                      opacity:
                        friendRequests[loc.username.trim()]?.status === "sending" ||
                        friendRequests[loc.username.trim()]?.status === "sent"
                          ? 0.7
                          : 1,
                      cursor:
                        friendRequests[loc.username.trim()]?.status === "sending" ||
                        friendRequests[loc.username.trim()]?.status === "sent"
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    {friendRequests[loc.username.trim()]?.status === "sending"
                      ? "Sending..."
                      : friendRequests[loc.username.trim()]?.status === "sent"
                        ? "Request sent"
                        : user
                          ? "Send friend request"
                          : "Login to add friend"}
                  </button>
                  {friendRequests[loc.username.trim()]?.status === "error" && (
                    <div style={{ marginTop: 6, color: "var(--mf-danger)", fontSize: 12 }}>
                      {friendRequests[loc.username.trim()]?.error || "Failed."}
                    </div>
                  )}
                </div>
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
              background: "var(--mf-surface)",
              border: "1px solid var(--mf-border)",
              borderRadius: 10,
              padding: "10px 12px",
              fontSize: 14,
              color: "var(--mf-text)",
            }}
          >
            {error ? `Location error: ${error}` : "Getting your location…"}
          </div>
        </div>
      )}

      <div
        className="mapControls"
      >
        <div
          className="control"
          aria-hidden="true"
          style={{
            background: "var(--mf-surface)",
            color: "var(--mf-text)",
            border: "1px solid var(--mf-border)",
            borderRadius: 9999,
            padding: 6,
            height: 40,
            width: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flex: "0 0 auto",
          }}
          title="MapFriend"
        >
          <img
            src="/logo.png"
            alt=""
            style={{ width: 26, height: 26, objectFit: "contain" }}
          />
        </div>
        <button
          className="control"
          type="button"
          onClick={fitVisiblePeople}
          disabled={filteredLocations.length === 0 || !map}
          style={{
            background: "var(--mf-surface)",
            color: "var(--mf-text)",
            border: "1px solid var(--mf-border)",
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
            background: "var(--mf-surface)",
            color: "var(--mf-text)",
            border: "1px solid var(--mf-border)",
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

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
