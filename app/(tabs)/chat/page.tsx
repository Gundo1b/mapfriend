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
  const [isMounted, setIsMounted] = useState(false);
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
  const [notificationSupported, setNotificationSupported] = useState(false);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermission>("default");
  const [notificationSecureContext, setNotificationSecureContext] = useState(true);

  const knownMessageIdsRef = useRef<Set<string>>(new Set());
  const lastInboxSinceRef = useRef<string>(new Date(Date.now() - 60_000).toISOString());
  const lastConversationSinceRef = useRef<string | null>(null);
  const messagesPaneRef = useRef<HTMLDivElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);

  const friendsSorted = useMemo(() => {
    return [...friends].sort((a, b) => a.username.localeCompare(b.username));
  }, [friends]);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("mf_notifications_enabled");
    setNotificationsEnabled(stored === "true");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setNotificationSecureContext(window.isSecureContext);
    const supported = "Notification" in window;
    setNotificationSupported(supported);
    if (supported) setNotificationPermission(Notification.permission);
  }, []);

  useEffect(() => {
    // Mobile keyboard-friendly height: use VisualViewport when available.
    if (typeof window === "undefined") return;

    const root = document.documentElement;

    function setAppHeight(px: number) {
      root.style.setProperty("--appHeight", `${Math.max(0, Math.round(px))}px`);
    }

    function update() {
      const vv = window.visualViewport;
      setAppHeight(vv?.height ?? window.innerHeight);
    }

    update();

    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);

    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, []);

  function scrollToBottom(behavior: ScrollBehavior) {
    messagesEndRef.current?.scrollIntoView({ block: "end", behavior });
  }

  function handleMessagesScroll() {
    const el = messagesPaneRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldAutoScrollRef.current = distanceFromBottom < 80;
  }

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
    shouldAutoScrollRef.current = true;

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
        scrollToBottom("auto");
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
        if (shouldAutoScrollRef.current) scrollToBottom("smooth");
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
    if (shouldAutoScrollRef.current) scrollToBottom("smooth");
  }, [messages.length, selected?.username]);

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
        shouldAutoScrollRef.current = true;
        scrollToBottom("smooth");
      }

      setMessageDraft("");
    } catch (e) {
      setMessageError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setIsSending(false);
    }
  }

  function initialsFor(username: string) {
    const clean = username.trim();
    if (!clean) return "?";
    const parts = clean.split(/\s+/g).filter(Boolean);
    const first = (parts[0]?.[0] ?? clean[0] ?? "?").toUpperCase();
    const second =
      parts.length >= 2 ? (parts[1]?.[0] ?? "").toUpperCase() : (clean[1] ?? "").toUpperCase();
    return (first + second).slice(0, 2);
  }

  function formatTime(iso: string) {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  return (
    <main className="chatRoot">
      <header className="topBar">
        <div className="topBarLeft">
          <img src="/logo.png" alt="" aria-hidden="true" className="topBarLogo" />
          <div className="topBarTitle">Messages</div>
        </div>
        <div className="topBarRight">
          {me && (
             <div className="listHeaderSub">
                @{me.username}
             </div>
          )}
        </div>
      </header>

      <div className={`chatGrid ${selected ? "hasSelected" : ""}`}>
        <section className="friendsPane">
          <div className="listCard">
            <div className="listHeader">
              <div className="listHeaderTitle">Recent Chats</div>
            </div>

            {loading ? (
              <div className="muted" style={{ padding: 20, textAlign: "center" }}>
                <div className="spinner" />
              </div>
            ) : error ? (
              <div className="errorText" style={{ padding: 12 }}>
                {error}
              </div>
            ) : friendsSorted.length === 0 ? (
              <div className="muted" style={{ padding: 24, textAlign: "center", fontSize: 14 }}>
                No friends yet. Add people from the Explore tab to start chatting!
              </div>
            ) : (
              <div className="friendList">
                {friendsSorted.map((f) => {
                  const active = selected?.username === f.username;
                  const unread = unreadByUsername[f.username] ?? 0;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      className={`friendRow ${active ? "active" : ""}`}
                      onClick={() => {
                        setSelected(f);
                        setUnreadByUsername((prev) => ({ ...prev, [f.username]: 0 }));
                      }}
                    >
                      <div className="avatar" aria-hidden="true">
                        {initialsFor(f.username)}
                      </div>
                      <div className="friendMeta">
                        <div className="friendName">{f.username}</div>
                        <div className="friendSub">{unread > 0 ? "New message" : "Active now"}</div>
                      </div>
                      <div className="friendRight">
                        {unread > 0 ? <div className="unreadBadge">{unread}</div> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {selected ? (
          <section className="conversationPane" aria-label={`Chat with ${selected.username}`}>
            <div className="convHeader">
              <button type="button" className="backBtn" onClick={() => setSelected(null)}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
              </button>
              <div className="avatar avatarSmall" aria-hidden="true">
                {initialsFor(selected.username)}
              </div>
              <div className="convTitleWrap">
                <div className="convTitle">{selected.username}</div>
                <div className="convSubtitle">Online</div>
              </div>
            </div>

            {messageError ? <div className="notice noticeError">{messageError}</div> : null}

            <div
              className="messagesPane"
              ref={messagesPaneRef}
              onScroll={handleMessagesScroll}
            >
              {me && messages.length === 0 ? (
                <div className="emptyChat">
                  <div className="avatar avatarLarge">{initialsFor(selected.username)}</div>
                  <h3>{selected.username}</h3>
                  <p>Say hello to start your conversation!</p>
                </div>
              ) : null}
              <div className="messageList">
                {messages.map((m) => {
                  const mine = me ? m.fromUserId === me.id : false;
                  return (
                    <div key={m.id} className={`msgRow ${mine ? "mine" : "theirs"}`}>
                      <div className={`bubble ${mine ? "bubbleMine" : "bubbleTheirs"}`}>
                        <div className="bubbleBody">{m.body}</div>
                        <div className="bubbleTime">{formatTime(m.createdAt)}</div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <div className="composer">
              <input
                className="composerInput"
                value={messageDraft}
                onChange={(e) => setMessageDraft(e.target.value)}
                onFocus={() => {
                  shouldAutoScrollRef.current = true;
                  window.setTimeout(() => scrollToBottom("auto"), 50);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Type a message..."
                aria-label="Message"
              />
              <button
                type="button"
                className="sendBtn"
                onClick={send}
                disabled={isSending || !messageDraft.trim()}
              >
                {isSending ? "..." : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>}
              </button>
            </div>
          </section>
        ) : (
          <section className="noSelectionPane">
             <div className="noSelectionContent">
                <div className="noSelectionIcon">💬</div>
                <h3>Your Messages</h3>
                <p>Select a friend from the list to start chatting.</p>
             </div>
          </section>
        )}
      </div>

      <style jsx>{`
        .chatRoot {
          height: var(--appHeight, 100dvh);
          padding: 12px 12px 96px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          background: var(--mf-bg);
          color: var(--mf-text);
          transition: background 0.2s, color 0.2s;
        }

        .topBar {
          position: sticky;
          top: 0;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 12px 16px;
          border-radius: 20px;
          background: var(--mf-surface);
          border: 1px solid var(--mf-border);
          backdrop-filter: blur(10px);
          margin-bottom: 12px;
        }

        .topBarLeft {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .topBarLogo {
          width: 32px;
          height: 32px;
          object-fit: contain;
          border-radius: 10px;
        }

        .topBarTitle {
          font-size: 20px;
          font-weight: 800;
          letter-spacing: -0.5px;
        }

        .chatGrid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
          flex: 1 1 auto;
          min-height: 0;
        }

        .friendsPane {
          display: flex;
          flex-direction: column;
        }

        .listCard {
          border-radius: 24px;
          background: var(--mf-surface);
          border: 1px solid var(--mf-border);
          overflow: hidden;
          flex: 1;
          display: flex;
          flex-direction: column;
        }

        .listHeader {
          padding: 18px 20px 14px;
          border-bottom: 1px solid var(--mf-border);
        }

        .listHeaderTitle {
          font-weight: 800;
          font-size: 16px;
          opacity: 0.9;
        }

        .friendList {
          display: flex;
          flex-direction: column;
          overflow-y: auto;
        }

        .friendRow {
          width: 100%;
          text-align: left;
          display: grid;
          grid-template-columns: 48px 1fr auto;
          align-items: center;
          gap: 14px;
          padding: 14px 20px;
          background: transparent;
          border: none;
          color: inherit;
          cursor: pointer;
          transition: background 0.15s;
          border-bottom: 1px solid var(--mf-border);
        }

        .friendRow:last-child {
          border-bottom: none;
        }

        .friendRow:hover {
          background: var(--mf-surface-2);
        }

        .friendRow.active {
          background: var(--mf-surface-2);
          border-left: 4px solid var(--mf-primary);
          padding-left: 16px;
        }

        .avatar {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          background: var(--mf-surface-2);
          border: 1px solid var(--mf-border);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          color: var(--mf-text);
          user-select: none;
          font-size: 16px;
        }

        .avatarSmall {
          width: 38px;
          height: 38px;
          font-size: 13px;
        }

        .avatarLarge {
          width: 80px;
          height: 80px;
          font-size: 28px;
          margin-bottom: 16px;
        }

        .friendMeta {
          min-width: 0;
        }

        .friendName {
          font-weight: 700;
          font-size: 15px;
          margin-bottom: 2px;
        }

        .friendSub {
          font-size: 13px;
          color: var(--mf-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .unreadBadge {
          min-width: 20px;
          height: 20px;
          padding: 0 6px;
          border-radius: 10px;
          background: var(--mf-primary);
          color: var(--mf-primary-text);
          font-weight: 800;
          font-size: 11px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .conversationPane {
          border-radius: 24px;
          background: var(--mf-surface);
          border: 1px solid var(--mf-border);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        .convHeader {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-bottom: 1px solid var(--mf-border);
          background: var(--mf-surface);
        }

        .backBtn {
          background: transparent;
          border: none;
          color: var(--mf-text);
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .convTitleWrap {
          min-width: 0;
        }

        .convTitle {
          font-weight: 800;
          font-size: 16px;
        }

        .convSubtitle {
          font-size: 12px;
          color: var(--mf-primary);
          font-weight: 600;
        }

        .messagesPane {
          flex: 1;
          padding: 20px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          background: var(--mf-bg);
        }

        .messageList {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .emptyChat {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 40px;
          color: var(--mf-muted);
        }

        .emptyChat h3 {
          color: var(--mf-text);
          margin: 0 0 8px;
          font-size: 20px;
        }

        .msgRow {
          display: flex;
        }

        .msgRow.mine {
          justify-content: flex-end;
        }

        .msgRow.theirs {
          justify-content: flex-start;
        }

        .bubble {
          max-width: 75%;
          padding: 10px 14px;
          border-radius: 18px;
          position: relative;
        }

        .bubbleMine {
          background: var(--mf-primary);
          color: var(--mf-primary-text);
          border-bottom-right-radius: 4px;
        }

        .bubbleTheirs {
          background: var(--mf-surface-2);
          color: var(--mf-text);
          border-bottom-left-radius: 4px;
          border: 1px solid var(--mf-border);
        }

        .bubbleBody {
          font-size: 15px;
          line-height: 1.4;
          word-break: break-word;
        }

        .bubbleTime {
          font-size: 10px;
          margin-top: 4px;
          opacity: 0.7;
          text-align: right;
        }

        .composer {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 16px 20px;
          border-top: 1px solid var(--mf-border);
          background: var(--mf-surface);
        }

        .composerInput {
          flex: 1;
          border-radius: 24px;
          padding: 12px 18px;
          border: 1px solid var(--mf-border);
          background: var(--mf-surface-2);
          color: var(--mf-text);
          outline: none;
          font-size: 15px;
        }

        .sendBtn {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          background: var(--mf-primary);
          color: var(--mf-primary-text);
          border: none;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: transform 0.1s;
        }

        .sendBtn:active {
          transform: scale(0.9);
        }

        .sendBtn:disabled {
          opacity: 0.5;
        }

        .noSelectionPane {
          display: none;
          flex: 1;
          align-items: center;
          justify-content: center;
          background: var(--mf-surface);
          border-radius: 24px;
          border: 1px solid var(--mf-border);
        }

        .noSelectionContent {
          text-align: center;
          max-width: 300px;
        }

        .noSelectionIcon {
          font-size: 48px;
          margin-bottom: 16px;
        }

        .noSelectionContent h3 {
          font-size: 20px;
          margin: 0 0 8px;
        }

        .noSelectionContent p {
          color: var(--mf-muted);
          font-size: 15px;
        }

        .spinner {
          width: 24px;
          height: 24px;
          border: 3px solid var(--mf-border);
          border-top-color: var(--mf-primary);
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
          margin: 0 auto;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 919px) {
          .chatGrid.hasSelected .friendsPane {
            display: none;
          }
        }

        @media (min-width: 920px) {
          .chatGrid {
            grid-template-columns: 350px 1fr;
          }
          .backBtn {
            display: none;
          }
          .noSelectionPane {
            display: flex;
          }
        }
      `}</style>
    </main>
  );
}
