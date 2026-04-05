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
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";
import { SymbolView } from "expo-symbols";

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
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

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
    nav.setOptions({ 
      title: otherUsername,
      headerStyle: {
        backgroundColor: theme.background,
      },
      headerTintColor: theme.text,
      headerTitleStyle: {
        fontWeight: '800',
      }
    });
  }, [nav, otherUsername, theme]);

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
      <View style={[styles.root, styles.center, { backgroundColor: theme.background }]}>
        <Text style={[styles.error, { color: theme.text }]}>Please login first.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 94 : 0}
    >
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.tint} />
        </View>
      ) : (
        <>
          {error ? <Text style={[styles.error, { color: "#ff4d4d" }]}>{error}</Text> : null}

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
            {messages.length === 0 ? (
               <View style={styles.emptyContainer}>
                  <View style={[styles.largeAvatar, { backgroundColor: colorScheme === 'dark' ? '#1c2c35' : '#f0f0f0' }]}>
                    <Text style={[styles.largeAvatarText, { color: theme.text }]}>{otherUsername.slice(0, 2).toUpperCase()}</Text>
                  </View>
                  <Text style={[styles.emptyTitle, { color: theme.text }]}>{otherUsername}</Text>
                  <Text style={styles.emptySub}>Start your conversation</Text>
               </View>
            ) : null}
            {messages.map((m) => {
              const mine = m.fromUserId === user.id;
              return (
                <View key={m.id} style={[styles.msgRow, mine ? styles.msgRowMine : styles.msgRowTheirs]}>
                  <View style={[
                    styles.bubble, 
                    mine ? [styles.bubbleMine, { backgroundColor: colorScheme === 'dark' ? "#00a884" : "#00a884" }] : [styles.bubbleTheirs, { backgroundColor: colorScheme === 'dark' ? "#202c33" : "#e9e9eb", borderColor: colorScheme === 'dark' ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)" }]
                  ]}>
                    <Text style={[styles.bubbleBody, { color: mine ? "white" : theme.text }]}>{m.body}</Text>
                    <Text style={[styles.bubbleTime, { color: mine ? "rgba(255,255,255,0.7)" : "rgba(120,120,120,0.7)" }]}>{formatTime(m.createdAt)}</Text>
                  </View>
                </View>
              );
            })}
            <View style={{ height: 10 }} />
          </ScrollView>

          <View style={[styles.composer, { 
            backgroundColor: theme.background,
            borderTopColor: colorScheme === 'dark' ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)"
          }]}>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Type a message..."
              placeholderTextColor="rgba(120,120,120,0.55)"
              style={[styles.input, { 
                backgroundColor: colorScheme === 'dark' ? "#202c33" : "#f0f0f0",
                color: theme.text,
                borderColor: colorScheme === 'dark' ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)"
              }]}
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
              style={[
                styles.sendBtn, 
                { backgroundColor: "#00a884" },
                sending || !draft.trim() ? styles.btnDisabled : null
              ]}
            >
              {sending ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <SymbolView name="paperplane.fill" size={20} tintColor="white" />
              )}
            </Pressable>
          </View>
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { color: "#ff4d4d", paddingHorizontal: 16, paddingTop: 10, textAlign: 'center' },
  messagesPane: { flex: 1 },
  messagesContent: { padding: 16, gap: 12 },
  msgRow: { flexDirection: "row", marginBottom: 2 },
  msgRowMine: { justifyContent: "flex-end" },
  msgRowTheirs: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "80%",
    borderRadius: 20,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  bubbleMine: { 
    borderBottomRightRadius: 4,
    borderColor: 'transparent',
  },
  bubbleTheirs: { 
    borderBottomLeftRadius: 4,
  },
  bubbleBody: { fontSize: 16, lineHeight: 22 },
  bubbleTime: { fontSize: 11, marginTop: 4, textAlign: "right" },
  composer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderRadius: 24,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    fontSize: 16,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: { opacity: 0.5 },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  largeAvatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  largeAvatarText: {
    fontSize: 32,
    fontWeight: '800',
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 14,
    color: 'rgba(120,120,120,0.7)',
  }
});

