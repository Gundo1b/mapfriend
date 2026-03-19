"use client";

import { useEffect, useMemo, useState } from "react";

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

export default function SettingsPage() {
  const [incoming, setIncoming] = useState<IncomingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [responding, setResponding] = useState<Record<string, RespondState>>({});

  const incomingSorted = useMemo(() => {
    return [...incoming].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [incoming]);

  useEffect(() => {
    let cancelled = false;

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

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

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
    <main
      style={{
        minHeight: "100vh",
        padding: "24px 16px 96px",
        background: "linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)",
        color: "#111827",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 10,
        }}
      >
        <img
          src="/logo.png"
          alt="MapFriend"
          style={{ width: 32, height: 32, objectFit: "contain" }}
        />
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Settings</h1>
      </div>
      <div
        style={{
          marginTop: 16,
          background: "white",
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 16,
          padding: 14,
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
          Friend requests
        </h2>

        {loading ? (
          <div style={{ color: "#6b7280" }}>Loading...</div>
        ) : error ? (
          <div style={{ color: "#b91c1c" }}>{error}</div>
        ) : incomingSorted.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No pending requests.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {incomingSorted.map((req) => (
              <div
                key={req.id}
                style={{
                  border: "1px solid rgba(0,0,0,0.08)",
                  borderRadius: 14,
                  padding: 12,
                  background: "linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)",
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: 4 }}>
                  {req.from.username ?? "Unknown user"}
                </div>
                <div style={{ color: "#6b7280", fontSize: 12, marginBottom: 10 }}>
                  Sent {new Date(req.createdAt).toLocaleString()}
                </div>

                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => respond(req.id, "accept")}
                    disabled={responding[req.id]?.status === "sending"}
                    style={{
                      flex: 1,
                      background: "#111827",
                      color: "white",
                      border: "1px solid rgba(255,255,255,0.08)",
                      borderRadius: 12,
                      padding: "10px 12px",
                      fontSize: 14,
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
                    style={{
                      flex: 1,
                      background: "white",
                      color: "#111827",
                      border: "1px solid rgba(0,0,0,0.12)",
                      borderRadius: 12,
                      padding: "10px 12px",
                      fontSize: 14,
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
                  <div style={{ marginTop: 8, color: "#b91c1c", fontSize: 13 }}>
                    {responding[req.id]?.error || "Failed."}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
