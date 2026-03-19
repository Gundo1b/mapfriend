"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Friend = {
  id: string;
  username: string;
};

type Me = {
  id: string;
  username: string;
};

type Message = {
  id: string;
  createdAt: string;
  fromUserId: string;
  toUserId: string;
  body: string;
};

export default function ChatPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Friend | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [unreadByUsername, setUnreadByUsername] = useState<Record<string, number>>({});
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const lastInboxSinceRef = useRef<string>(new Date(Date.now() - 60_000).toISOString());
  const lastConversationSinceRef = useRef<string | null>(null);

  const friendsSorted = useMemo(() => {
    return [...friends].sort((a, b) => a.username.localeCompare(b.username));
  }, [friends]);

  const notificationSupported = typeof window !== "undefined" && "Notification" in window;
  const notificationPermission =
    typeof window !== "undefined" && "Notification" in window ? Notification.permission : "default";
  const notificationSecureContext = typeof window !== "undefined" ? window.isSecureContext : true;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("mf_notifications_enabled");
    setNotificationsEnabled(stored === "true");
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const meRes = await fetch("/api/me", { method: "GET" });
        const meData = (await meRes.json().catch(() => null)) as
          | { ok: true; user: Me | null }
          | { ok: false; error: string }
          | null;
        if (!meRes.ok || !meData || !("ok" in meData) || !meData.ok) {
          throw new Error((meData as { error?: string } | null)?.error || "Failed.");
        }
        if (!cancelled) setMe(meData.user);

        const res = await fetch("/api/friends", { method: "GET" });
        if (res.status === 401) {
          if (!cancelled) setFriends([]);
          return;
        }

        const data = (await res.json().catch(() => null)) as
          | { ok: true; friends: Array<{ id: string; username: string | null }> }
          | { ok: false; error: string }
          | null;

        if (!res.ok || !data || !("ok" in data) || !data.ok) {
          throw new Error((data as { error?: string } | null)?.error || "Failed.");
        }

        const next = (data.friends ?? [])
          .filter((f): f is { id: string; username: string } => !!f.username)
          .map((f) => ({ id: f.id, username: f.username }));

        if (!cancelled) setFriends(next);
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

  useEffect(() => {
    if (!selected) return;

    let cancelled = false;
    const friend = selected;
    lastConversationSinceRef.current = null;
    setMessages([]);
    setMessageError(null);

    async function loadConversation() {
      try {
        const res = await fetch(`/api/messages?with=${encodeURIComponent(friend.username)}`);
        const data = (await res.json().catch(() => null)) as
          | {
              ok: true;
              messages: Message[];
            }
          | { ok: false; error: string }
          | null;

        if (!res.ok || !data || !("ok" in data) || !data.ok) {
          throw new Error((data as { error?: string } | null)?.error || "Failed.");
        }

        if (cancelled) return;
        setMessages(data.messages ?? []);

        for (const m of data.messages ?? []) knownMessageIdsRef.current.add(m.id);
        const last = (data.messages ?? []).at(-1)?.createdAt ?? null;
        lastConversationSinceRef.current = last;
        setUnreadByUsername((prev) => ({ ...prev, [friend.username]: 0 }));
      } catch (e) {
        if (!cancelled) setMessageError(e instanceof Error ? e.message : "Failed.");
      }
    }

    void loadConversation();

    const interval = window.setInterval(async () => {
      if (cancelled) return;

      const since = lastConversationSinceRef.current;
      try {
        const qs = since
          ? `?with=${encodeURIComponent(friend.username)}&since=${encodeURIComponent(since)}`
          : `?with=${encodeURIComponent(friend.username)}`;
        const res = await fetch(`/api/messages${qs}`);
        const data = (await res.json().catch(() => null)) as
          | { ok: true; messages: Message[] }
          | { ok: false; error: string }
          | null;
        if (!res.ok || !data || !("ok" in data) || !data.ok) return;

        const next = (data.messages ?? []).filter((m) => !knownMessageIdsRef.current.has(m.id));
        if (next.length === 0) return;

        setMessages((prev) => [...prev, ...next]);
        for (const m of next) knownMessageIdsRef.current.add(m.id);
        lastConversationSinceRef.current = next.at(-1)?.createdAt ?? lastConversationSinceRef.current;
      } catch {
        // ignore polling errors
      }
    }, 1200);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [selected]);

  useEffect(() => {
    if (!me) return;

    let cancelled = false;

    const interval = window.setInterval(async () => {
      if (cancelled) return;

      const since = lastInboxSinceRef.current;
      try {
        const res = await fetch(`/api/messages/inbox?since=${encodeURIComponent(since)}`);
        if (!res.ok) return;

        const data = (await res.json().catch(() => null)) as
          | {
              ok: true;
              messages: Array<
                Message & {
                  fromUsername: string | null;
                }
              >;
            }
          | { ok: false; error: string }
          | null;

        if (!data || !("ok" in data) || !data.ok) return;

        const incoming = (data.messages ?? []).filter(
          (m) => m.toUserId === me.id && !knownMessageIdsRef.current.has(m.id),
        );

        if (incoming.length === 0) return;

        for (const m of incoming) knownMessageIdsRef.current.add(m.id);
        lastInboxSinceRef.current = incoming.at(-1)?.createdAt ?? new Date().toISOString();

        setUnreadByUsername((prev) => {
          const next = { ...prev };
          for (const m of incoming) {
            const from = m.fromUsername ?? "Unknown";
            if (selected?.username === from) continue;
            next[from] = (next[from] ?? 0) + 1;
          }
          return next;
        });
      } catch {
        // ignore polling errors
      }
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [me, selected?.username]);

  async function enableNotifications() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const p = await Notification.requestPermission();
      if (p === "granted") {
        window.localStorage.setItem("mf_notifications_enabled", "true");
        setNotificationsEnabled(true);
      }
    } catch {
      // ignore
    }
  }

  function disableNotifications() {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("mf_notifications_enabled", "false");
    setNotificationsEnabled(false);
  }

  function testNotification() {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    try {
      new Notification("MapFriend", { body: "Notifications are working." });
    } catch {
      // ignore
    }
  }

  async function send() {
    if (!selected || !messageDraft.trim()) return;
    setIsSending(true);
    setMessageError(null);
    try {
      const res = await fetch("/api/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toUsername: selected.username, body: messageDraft.trim() }),
      });

      const data = (await res.json().catch(() => null)) as
        | { ok: true; message: Message | null }
        | { ok: false; error: string }
        | null;

      if (!res.ok || !data || !("ok" in data) || !data.ok) {
        throw new Error((data as { error?: string } | null)?.error || "Failed.");
      }

      if (data.message && !knownMessageIdsRef.current.has(data.message.id)) {
        knownMessageIdsRef.current.add(data.message.id);
        setMessages((prev) => [...prev, data.message as Message]);
        lastConversationSinceRef.current = data.message.createdAt;
      }

      setMessageDraft("");
    } catch (e) {
      setMessageError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setIsSending(false);
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
        <h1 style={{ fontSize: 22, fontWeight: 700 }}>Chat</h1>
      </div>

      <div
        className={`chatGrid ${selected ? "hasSelected" : ""}`}
      >
        <div
          className="friendsPane"
          style={{
            background: "white",
            border: "1px solid rgba(0,0,0,0.08)",
            borderRadius: 16,
            padding: 14,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 10 }}>
              Friends
            </h2>
            {notificationSupported ? (
              notificationPermission !== "granted" ? (
                <button
                  type="button"
                  onClick={enableNotifications}
                  style={{
                    background: "white",
                    color: "#111827",
                    border: "1px solid rgba(0,0,0,0.12)",
                    borderRadius: 9999,
                    padding: "6px 10px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                  title="Enable notifications for new messages (while the app is open)"
                >
                  Enable notifications
                </button>
              ) : notificationsEnabled ? (
                <button
                  type="button"
                  onClick={disableNotifications}
                  style={{
                    background: "rgba(17,24,39,0.95)",
                    color: "white",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: 9999,
                    padding: "6px 10px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                  title="Turn off notifications"
                >
                  Notifications on
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window === "undefined") return;
                    window.localStorage.setItem("mf_notifications_enabled", "true");
                    setNotificationsEnabled(true);
                  }}
                  style={{
                    background: "white",
                    color: "#111827",
                    border: "1px solid rgba(0,0,0,0.12)",
                    borderRadius: 9999,
                    padding: "6px 10px",
                    fontSize: 12,
                    cursor: "pointer",
                  }}
                  title="Turn on notifications"
                >
                  Notifications off
                </button>
              )
            ) : null}
          </div>

          {notificationSupported && !notificationSecureContext ? (
            <div style={{ color: "#b45309", fontSize: 12, marginBottom: 10 }}>
              Notifications need HTTPS (secure origin).
            </div>
          ) : null}
          {notificationSupported && notificationPermission === "denied" ? (
            <div style={{ color: "#b91c1c", fontSize: 12, marginBottom: 10 }}>
              Notifications are blocked in your browser settings for this site.
            </div>
          ) : null}
          {notificationSupported && notificationPermission === "granted" ? (
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button
                type="button"
                onClick={testNotification}
                style={{
                  background: "white",
                  color: "#111827",
                  border: "1px solid rgba(0,0,0,0.12)",
                  borderRadius: 9999,
                  padding: "6px 10px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
                title="Send a test notification"
              >
                Test notification
              </button>
            </div>
          ) : null}

          {loading ? (
            <div style={{ color: "#6b7280" }}>Loading...</div>
          ) : error ? (
            <div style={{ color: "#b91c1c" }}>{error}</div>
          ) : friendsSorted.length === 0 ? (
            <div style={{ color: "#6b7280" }}>
              No friends yet. Accept a friend request in Settings to see it here.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {friendsSorted.map((f) => {
                const active = selected?.username === f.username;
                const unread = unreadByUsername[f.username] ?? 0;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => {
                      setSelected(f);
                      setUnreadByUsername((prev) => ({ ...prev, [f.username]: 0 }));
                    }}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      border: "1px solid rgba(0,0,0,0.08)",
                      borderRadius: 14,
                      padding: 12,
                      background: active
                        ? "rgba(17,24,39,0.95)"
                        : "linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)",
                      color: active ? "white" : "#111827",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                    }}
                  >
                    <span style={{ fontWeight: 700 }}>{f.username}</span>
                    {unread > 0 ? (
                      <span
                        style={{
                          background: active ? "rgba(255,255,255,0.15)" : "#111827",
                          color: "white",
                          borderRadius: 9999,
                          padding: "2px 8px",
                          fontSize: 12,
                        }}
                      >
                        {unread}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {selected ? (
          <div
            className="conversationPane"
            style={{
              background: "white",
              border: "1px solid rgba(0,0,0,0.08)",
              borderRadius: 16,
              padding: 14,
              display: "flex",
              flexDirection: "column",
              minHeight: 420,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <button
                type="button"
                onClick={() => setSelected(null)}
                style={{
                  background: "white",
                  color: "#111827",
                  border: "1px solid rgba(0,0,0,0.12)",
                  borderRadius: 9999,
                  padding: "6px 10px",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Back
              </button>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{selected.username}</div>
            </div>

            {messageError ? (
              <div style={{ color: "#b91c1c", marginBottom: 10 }}>{messageError}</div>
            ) : null}

            <div
              style={{
                flex: 1,
                overflowY: "auto",
                border: "1px solid rgba(0,0,0,0.06)",
                borderRadius: 14,
                padding: 10,
                background: "linear-gradient(180deg, #ffffff 0%, #f9fafb 100%)",
              }}
            >
              {me && messages.length === 0 ? (
                <div style={{ color: "#6b7280" }}>Say hi!</div>
              ) : null}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {messages.map((m) => {
                  const mine = me ? m.fromUserId === me.id : false;
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        justifyContent: mine ? "flex-end" : "flex-start",
                      }}
                    >
                      <div
                        style={{
                          maxWidth: "80%",
                          padding: "8px 10px",
                          borderRadius: 14,
                          background: mine ? "rgba(17,24,39,0.95)" : "white",
                          color: mine ? "white" : "#111827",
                          border: mine ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.08)",
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                        }}
                        title={new Date(m.createdAt).toLocaleString()}
                      >
                        {m.body}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <input
                value={messageDraft}
                onChange={(e) => setMessageDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Message..."
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(0,0,0,0.12)",
                }}
              />
              <button
                type="button"
                onClick={send}
                disabled={isSending || !messageDraft.trim()}
                style={{
                  background: "#111827",
                  color: "white",
                  border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  fontSize: 14,
                  opacity: isSending || !messageDraft.trim() ? 0.7 : 1,
                  cursor: isSending || !messageDraft.trim() ? "not-allowed" : "pointer",
                }}
              >
                {isSending ? "Sending..." : "Send"}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <style jsx>{`
        .chatGrid {
          margin-top: 16px;
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
        }

        .chatGrid.hasSelected .friendsPane {
          display: none;
        }

        @media (min-width: 860px) {
          .chatGrid.hasSelected {
            grid-template-columns: minmax(240px, 1fr) 2fr;
          }

          .chatGrid.hasSelected .friendsPane {
            display: block;
          }
        }
      `}</style>
    </main>
  );
}
