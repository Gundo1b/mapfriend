import { useLocalSearchParams, useNavigation } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { apiFetchJson } from "@/lib/api";
import { asApiMessage, useAuth } from "@/lib/auth";

type Message = {
  id: string;
  createdAt: string;
  fromUserId: string;
  toUserId: string;
  body: string;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ConversationScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const otherUsername = (username ?? "").toString();
  const { token, user } = useAuth();
  const nav = useNavigation();

  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const knownIdsRef = useRef<Set<string>>(new Set());
  const sinceRef = useRef<string | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const shouldAutoScrollRef = useRef(true);

  useEffect(() => {
    nav.setOptions({ title: otherUsername });
  }, [nav, otherUsername]);

  const header = useMemo(() => otherUsername || "Chat", [otherUsername]);

  function scrollToBottom(behavior: "animated" | "auto") {
    const s = scrollRef.current;
    if (!s) return;
    s.scrollToEnd({ animated: behavior === "animated" });
  }

  async function loadInitial() {
    if (!token || !otherUsername) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetchJson<{ ok: true; messages: Message[] }>(
        `/api/messages?with=${encodeURIComponent(otherUsername)}`,
        { token },
      );
      const msgs = data.messages ?? [];
      setMessages(msgs);
      knownIdsRef.current = new Set(msgs.map((m) => m.id));
      sinceRef.current = msgs.at(-1)?.createdAt ?? null;
      shouldAutoScrollRef.current = true;
      setTimeout(() => scrollToBottom("auto"), 50);
    } catch (e) {
      setError(asApiMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadInitial();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, otherUsername]);

  useEffect(() => {
    if (!token || !otherUsername) return;

    let cancelled = false;
    const interval = setInterval(async () => {
      if (cancelled) return;
      try {
        const since = sinceRef.current;
        const qs = since
          ? `?with=${encodeURIComponent(otherUsername)}&since=${encodeURIComponent(since)}`
          : `?with=${encodeURIComponent(otherUsername)}`;
        const data = await apiFetchJson<{ ok: true; messages: Message[] }>(`/api/messages${qs}`, {
          token,
        });

        const next = (data.messages ?? []).filter((m) => !knownIdsRef.current.has(m.id));
        if (next.length === 0) return;
        for (const m of next) knownIdsRef.current.add(m.id);
        sinceRef.current = next.at(-1)?.createdAt ?? sinceRef.current;
        setMessages((prev) => [...prev, ...next]);
        if (shouldAutoScrollRef.current) setTimeout(() => scrollToBottom("animated"), 50);
      } catch {
        // ignore
      }
    }, 1200);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [otherUsername, token]);

  async function send() {
    if (!token || !otherUsername) return;
    const body = draft.trim();
    if (!body) return;
    setSending(true);
    setError(null);
    try {
      const data = await apiFetchJson<{ ok: true; message: Message | null }>("/api/messages", {
        method: "POST",
        token,
        body: { toUsername: otherUsername, body },
      });
      if (data.message && !knownIdsRef.current.has(data.message.id)) {
        knownIdsRef.current.add(data.message.id);
        sinceRef.current = data.message.createdAt;
        setMessages((prev) => [...prev, data.message as Message]);
      }
      setDraft("");
      shouldAutoScrollRef.current = true;
      setTimeout(() => scrollToBottom("animated"), 50);
    } catch (e) {
      setError(asApiMessage(e));
    } finally {
      setSending(false);
    }
  }

  if (!token || !user) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.error}>Please login first.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 84 : 0}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {header}
        </Text>
        <Text style={styles.headerSub} numberOfLines={1}>
          @ {user.username}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : (
        <>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <ScrollView
            ref={scrollRef}
            style={styles.messagesPane}
            contentContainerStyle={styles.messagesContent}
            onScroll={(e) => {
              const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
              const distanceFromBottom =
                contentSize.height - (contentOffset.y + layoutMeasurement.height);
              shouldAutoScrollRef.current = distanceFromBottom < 120;
            }}
            scrollEventThrottle={32}
          >
            {messages.map((m) => {
              const mine = m.fromUserId === user.id;
              return (
                <View key={m.id} style={[styles.msgRow, mine ? styles.msgRowMine : styles.msgRowTheirs]}>
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    <Text style={styles.bubbleBody}>{m.body}</Text>
                    <Text style={styles.bubbleTime}>{formatTime(m.createdAt)}</Text>
                  </View>
                </View>
              );
            })}
            <View style={{ height: 6 }} />
          </ScrollView>

          <View style={styles.composer}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Message"
              placeholderTextColor="rgba(233,237,239,0.55)"
              style={styles.input}
              onFocus={() => {
                shouldAutoScrollRef.current = true;
                setTimeout(() => scrollToBottom("auto"), 80);
              }}
              multiline={false}
              returnKeyType="send"
              onSubmitEditing={() => void send()}
            />
            <Pressable
              onPress={() => void send()}
              disabled={sending || !draft.trim()}
              style={[styles.sendBtn, sending || !draft.trim() ? styles.btnDisabled : null]}
            >
              <Text style={styles.sendText}>{sending ? "..." : "Send"}</Text>
            </Pressable>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0b141a" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(17,27,33,0.96)",
  },
  headerTitle: { color: "#e9edef", fontSize: 16, fontWeight: "900" },
  headerSub: { color: "rgba(233,237,239,0.65)", marginTop: 2, fontSize: 12 },
  error: { color: "#ffb4b4", paddingHorizontal: 16, paddingTop: 10 },
  messagesPane: { flex: 1 },
  messagesContent: { padding: 12, gap: 8 },
  msgRow: { flexDirection: "row" },
  msgRowMine: { justifyContent: "flex-end" },
  msgRowTheirs: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "82%",
    borderRadius: 16,
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  bubbleMine: { backgroundColor: "rgba(0,168,132,0.22)", borderColor: "rgba(0,168,132,0.35)" },
  bubbleTheirs: { backgroundColor: "rgba(17,27,33,0.92)" },
  bubbleBody: { color: "#e9edef", fontSize: 14, lineHeight: 19 },
  bubbleTime: { color: "rgba(233,237,239,0.65)", fontSize: 11, marginTop: 4, textAlign: "right" },
  composer: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(17,27,33,0.96)",
  },
  input: {
    flex: 1,
    borderRadius: 9999,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "#e9edef",
  },
  sendBtn: {
    borderRadius: 9999,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,168,132,0.35)",
    backgroundColor: "#00a884",
  },
  sendText: { color: "#052b24", fontWeight: "900" },
  btnDisabled: { opacity: 0.6 },
});

