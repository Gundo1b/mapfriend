"use client";

import { useEffect, useRef, useState } from "react";

type InboxMessage = {
  id: string;
  createdAt: string;
  fromUserId: string;
  toUserId: string;
  fromUsername: string | null;
  body: string;
};

const ENABLED_KEY = "mf_notifications_enabled";

export function InboxNotifier() {
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [secureContext, setSecureContext] = useState(true);

  const knownIdsRef = useRef<Set<string>>(new Set());
  const sinceRef = useRef<string>(new Date(Date.now() - 60_000).toISOString());

  useEffect(() => {
    if (typeof window === "undefined") return;

    setSecureContext(window.isSecureContext);
    const isSupported = "Notification" in window;
    setSupported(isSupported);
    if (isSupported) setPermission(Notification.permission);

    const stored = window.localStorage.getItem(ENABLED_KEY);
    setEnabled(stored === "true");

    function onStorage(e: StorageEvent) {
      if (e.key === ENABLED_KEY) setEnabled(e.newValue === "true");
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!secureContext || !supported) return;
    if (!enabled) return;
    if (permission !== "granted") return;

    let cancelled = false;

    const interval = window.setInterval(async () => {
      if (cancelled) return;
      try {
        const res = await fetch(
          `/api/messages/inbox?since=${encodeURIComponent(sinceRef.current)}`,
          { method: "GET" },
        );
        if (!res.ok) return;

        const data = (await res.json().catch(() => null)) as
          | { ok: true; messages: InboxMessage[] }
          | { ok: false; error: string }
          | null;

        if (!data || !("ok" in data) || !data.ok) return;

        const incoming = (data.messages ?? []).filter((m) => !knownIdsRef.current.has(m.id));
        if (incoming.length === 0) return;

        for (const m of incoming) knownIdsRef.current.add(m.id);
        sinceRef.current = incoming.at(-1)?.createdAt ?? sinceRef.current;

        // System notifications (best-effort; works while the app is open)
        for (const m of incoming) {
          const title = m.fromUsername ?? "New message";
          try {
            const n = new Notification(title, {
              body: m.body.slice(0, 160),
              tag: `mf:${m.fromUserId}`,
            });
            n.onclick = () => {
              try {
                window.focus();
              } catch {
                // ignore
              }
            };
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [enabled, permission, secureContext, supported]);

  return null;
}

