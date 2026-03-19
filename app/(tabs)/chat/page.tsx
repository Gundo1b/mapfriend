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
          <div className="topBarTitle">Chats</div>
        </div>
        <div className="topBarRight">
          {isMounted && notificationSupported ? (
            notificationPermission !== "granted" ? (
              <button type="button" className="pillBtn" onClick={enableNotifications}>
                Enable notifications
              </button>
            ) : notificationsEnabled ? (
              <button type="button" className="pillBtn pillBtnOn" onClick={disableNotifications}>
                Notifications on
              </button>
              ) : (
                <button
                  type="button"
                  className="pillBtn"
                  onClick={() => {
                    window.localStorage.setItem("mf_notifications_enabled", "true");
                    setNotificationsEnabled(true);
                  }}
                >
                  Notifications off
              </button>
            )
          ) : null}
        </div>
      </header>

      <div className={`chatGrid ${selected ? "hasSelected" : ""}`}>
        <section className="friendsPane">
          {isMounted && notificationSupported && !notificationSecureContext ? (
            <div className="notice noticeWarn">Notifications need HTTPS (secure origin).</div>
          ) : null}
          {isMounted && notificationSupported && notificationPermission === "denied" ? (
            <div className="notice noticeError">
              Notifications are blocked in your browser settings for this site.
            </div>
          ) : null}
          {isMounted && notificationSupported && notificationPermission === "granted" ? (
            <div style={{ padding: "0 6px 10px" }}>
              <button type="button" className="pillBtn" onClick={testNotification}>
                Test notification
              </button>
            </div>
          ) : null}

          <div className="listCard">
            <div className="listHeader">
              <div className="listHeaderTitle">Friends</div>
              <div className="listHeaderSub">
                {me ? `@${me.username}` : "Login to chat"}
              </div>
            </div>

            {loading ? (
              <div className="muted" style={{ padding: 12 }}>
                Loading...
              </div>
            ) : error ? (
              <div className="errorText" style={{ padding: 12 }}>
                {error}
              </div>
            ) : friendsSorted.length === 0 ? (
              <div className="muted" style={{ padding: 12 }}>
                No friends yet. Accept a friend request in Settings to see it here.
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
                        <div className="friendSub">{unread > 0 ? "New messages" : "Tap to chat"}</div>
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
              <button type="button" className="iconBtn" onClick={() => setSelected(null)}>
                Back
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
              {me && messages.length === 0 ? <div className="muted">Say hi!</div> : null}
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
                placeholder="Message"
                aria-label="Message"
              />
              <button
                type="button"
                className="sendBtn"
                onClick={send}
                disabled={isSending || !messageDraft.trim()}
              >
                {isSending ? "Sending..." : "Send"}
              </button>
            </div>
          </section>
        ) : null}
      </div>

      <style jsx>{`
        .chatRoot {
          height: var(--appHeight, 100dvh);
          padding: 12px 12px 96px;
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          background: #0b141a;
          color: #e9edef;
        }

        .topBar {
          position: sticky;
          top: 0;
          z-index: 10;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding: 10px 10px;
          border-radius: 18px;
          background: rgba(17, 27, 33, 0.92);
          border: 1px solid rgba(255, 255, 255, 0.08);
          backdrop-filter: blur(10px);
        }

        .topBarLeft {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .topBarLogo {
          width: 28px;
          height: 28px;
          object-fit: contain;
          border-radius: 8px;
        }

        .topBarTitle {
          font-size: 18px;
          font-weight: 800;
          letter-spacing: 0.2px;
        }

        .topBarRight {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 0 0 auto;
        }

        .pillBtn {
          background: rgba(255, 255, 255, 0.06);
          color: #e9edef;
          border: 1px solid rgba(255, 255, 255, 0.10);
          border-radius: 9999px;
          padding: 7px 10px;
          font-size: 12px;
          cursor: pointer;
          white-space: nowrap;
        }

        .pillBtnOn {
          background: rgba(0, 168, 132, 0.18);
          border-color: rgba(0, 168, 132, 0.35);
        }

        .chatGrid {
          margin-top: 12px;
          display: grid;
          grid-template-columns: 1fr;
          gap: 12px;
          flex: 1 1 auto;
          min-height: 0;
        }

        .friendsPane {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .notice {
          border-radius: 14px;
          padding: 10px 12px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(17, 27, 33, 0.92);
          font-size: 12px;
        }

        .noticeWarn {
          color: #ffd18b;
        }

        .noticeError {
          color: #ffb4b4;
        }

        .listCard {
          border-radius: 18px;
          background: rgba(17, 27, 33, 0.92);
          border: 1px solid rgba(255, 255, 255, 0.08);
          overflow: hidden;
        }

        .listHeader {
          padding: 14px 14px 10px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .listHeaderTitle {
          font-weight: 800;
          font-size: 14px;
        }

        .listHeaderSub {
          margin-top: 2px;
          color: rgba(233, 237, 239, 0.65);
          font-size: 12px;
        }

        .friendList {
          display: flex;
          flex-direction: column;
        }

        .friendRow {
          width: 100%;
          text-align: left;
          display: grid;
          grid-template-columns: 40px 1fr auto;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          background: transparent;
          border: none;
          color: inherit;
          cursor: pointer;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }

        .friendRow:last-child {
          border-bottom: none;
        }

        .friendRow:hover {
          background: rgba(255, 255, 255, 0.04);
        }

        .friendRow.active {
          background: rgba(0, 168, 132, 0.16);
        }

        .avatar {
          width: 40px;
          height: 40px;
          border-radius: 9999px;
          background: rgba(255, 255, 255, 0.08);
          border: 1px solid rgba(255, 255, 255, 0.10);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          letter-spacing: 0.5px;
          color: #e9edef;
          user-select: none;
        }

        .avatarSmall {
          width: 34px;
          height: 34px;
          font-size: 12px;
        }

        .friendMeta {
          min-width: 0;
        }

        .friendName {
          font-weight: 800;
          font-size: 14px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .friendSub {
          margin-top: 2px;
          font-size: 12px;
          color: rgba(233, 237, 239, 0.65);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .friendRight {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .unreadBadge {
          min-width: 22px;
          height: 22px;
          padding: 0 7px;
          border-radius: 9999px;
          background: #00a884;
          color: #052b24;
          font-weight: 900;
          font-size: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .conversationPane {
          border-radius: 18px;
          background: rgba(17, 27, 33, 0.92);
          border: 1px solid rgba(255, 255, 255, 0.08);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          min-height: 0;
        }

        .convHeader {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 12px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(17, 27, 33, 0.96);
        }

        .iconBtn {
          background: rgba(255, 255, 255, 0.06);
          color: #e9edef;
          border: 1px solid rgba(255, 255, 255, 0.10);
          border-radius: 9999px;
          padding: 7px 10px;
          font-size: 12px;
          cursor: pointer;
        }

        .convTitleWrap {
          min-width: 0;
        }

        .convTitle {
          font-weight: 900;
          font-size: 14px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .convSubtitle {
          margin-top: 2px;
          font-size: 12px;
          color: rgba(233, 237, 239, 0.65);
        }

        .messagesPane {
          flex: 1;
          padding: 12px;
          overflow: auto;
          min-height: 0;
          scroll-padding-bottom: 140px;
          background: radial-gradient(circle at 20% 20%, rgba(0, 168, 132, 0.10), transparent 45%),
            radial-gradient(circle at 80% 10%, rgba(255, 255, 255, 0.06), transparent 40%),
            #0b141a;
        }

        .messageList {
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-bottom: 6px;
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
          max-width: min(520px, 82%);
          padding: 9px 10px 7px;
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22);
        }

        .bubbleMine {
          background: rgba(0, 168, 132, 0.22);
          border-color: rgba(0, 168, 132, 0.35);
        }

        .bubbleTheirs {
          background: rgba(17, 27, 33, 0.92);
          border-color: rgba(255, 255, 255, 0.10);
        }

        .bubbleBody {
          white-space: pre-wrap;
          word-break: break-word;
          font-size: 14px;
          line-height: 1.35;
        }

        .bubbleTime {
          margin-top: 4px;
          font-size: 11px;
          color: rgba(233, 237, 239, 0.65);
          text-align: right;
        }

        .composer {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 8px;
          padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          background: rgba(17, 27, 33, 0.96);
        }

        .composerInput {
          width: 100%;
          border-radius: 9999px;
          padding: 10px 12px;
          border: 1px solid rgba(255, 255, 255, 0.10);
          background: rgba(255, 255, 255, 0.06);
          color: #e9edef;
          outline: none;
        }

        .composerInput::placeholder {
          color: rgba(233, 237, 239, 0.55);
        }

        .sendBtn {
          border-radius: 9999px;
          padding: 10px 14px;
          border: 1px solid rgba(0, 168, 132, 0.35);
          background: #00a884;
          color: #052b24;
          font-weight: 900;
          cursor: pointer;
        }

        .sendBtn:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }

        .muted {
          color: rgba(233, 237, 239, 0.65);
        }

        .errorText {
          color: #ffb4b4;
        }

        /* Mobile: show conversation full screen */
        .chatGrid.hasSelected .friendsPane {
          display: none;
        }

        @media (min-width: 920px) {
          .chatRoot {
            padding-left: 16px;
            padding-right: 16px;
          }

          .chatGrid.hasSelected {
            grid-template-columns: minmax(320px, 1fr) 2fr;
            align-items: start;
          }

          .chatGrid.hasSelected .friendsPane {
            display: flex;
          }

          .conversationPane {
            min-height: calc(100vh - 12px - 12px - 96px - 56px);
          }

          .iconBtn {
            display: none;
          }
        }
      `}</style>
    </main>
  );
}
