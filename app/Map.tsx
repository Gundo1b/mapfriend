"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Circle,
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
} from "react-leaflet";

type Position = {
  lat: number;
  lng: number;
  accuracy?: number;
};

type SavedLocation = {
  lat: number;
  lng: number;
};

function FollowLocation({ position }: { position: Position | null }) {
  const map = useMap();

  useEffect(() => {
    if (!position) return;
    map.setView([position.lat, position.lng], Math.max(map.getZoom(), 16), {
      animate: true,
    });
  }, [map, position]);

  return null;
}

export function Map() {
  const [position, setPosition] = useState<Position | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savedLocations, setSavedLocations] = useState<SavedLocation[]>([]);

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
    let cancelled = false;

    async function loadSaved() {
      try {
        const res = await fetch("/api/locations", { method: "GET" });
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
  }, []);

  async function saveCurrentLocation() {
    if (!position) return;

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
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(data?.error || `Save failed (${res.status})`);
      }

      setSaveMessage("Saved");
      setSavedLocations((prev) => [{ lat: position.lat, lng: position.lng }, ...prev]);
      setTimeout(() => setSaveMessage(null), 2500);
    } catch (e) {
      setSaveMessage(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setIsSaving(false);
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

        <FollowLocation position={position} />

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
          <CircleMarker
            key={`${loc.lat},${loc.lng},${idx}`}
            center={[loc.lat, loc.lng]}
            radius={6}
            pathOptions={{ color: "#b91c1c", fillColor: "#ef4444" }}
          >
            <Popup>
              hello
            </Popup>
          </CircleMarker>
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
        }}
      >
        <button
          type="button"
          onClick={saveCurrentLocation}
          disabled={!position || isSaving}
          style={{
            background: "#111827",
            color: "white",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 9999,
            padding: "10px 12px",
            fontSize: 14,
            opacity: !position || isSaving ? 0.6 : 1,
            cursor: !position || isSaving ? "not-allowed" : "pointer",
            touchAction: "manipulation",
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
    </div>
  );
}
