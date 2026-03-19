import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Link } from "expo-router";

import { AuthForm } from "@/components/AuthForm";
import { apiFetchJson, getAppVersionLabel } from "@/lib/api";
import { asApiMessage, useAuth } from "@/lib/auth";

type Friend = { id: string; username: string | null };

export default function ChatTab() {
  const { token, user, isHydrated } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const friendsSorted = useMemo(() => {
    return [...friends]
      .filter((f): f is { id: string; username: string } => !!f.username)
      .sort((a, b) => a.username.localeCompare(b.username));
  }, [friends]);

  async function load(kind: "initial" | "refresh") {
    if (!token) return;
    if (kind === "initial") setLoading(true);
    if (kind === "refresh") setRefreshing(true);
    setError(null);
    try {
      const data = await apiFetchJson<{ ok: true; friends: Friend[] }>("/api/friends", {
        token,
      });
      setFriends(data.friends ?? []);
    } catch (e) {
      setError(asApiMessage(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!token) return;
    void load("initial");
  }, [token]);

  if (!isHydrated) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!token || !user) {
    return (
      <ScrollView contentContainerStyle={styles.root}>
        <Text style={styles.header}>MapFriend</Text>
        <Text style={styles.subheader}>{getAppVersionLabel()}</Text>
        <AuthForm />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.root}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load("refresh")} />}
    >
      <Text style={styles.header}>Chats</Text>
      <Text style={styles.subheader}>@{user.username}</Text>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : friendsSorted.length === 0 ? (
        <Text style={styles.muted}>No friends yet. Accept a request in Settings.</Text>
      ) : (
        <View style={styles.listCard}>
          {friendsSorted.map((f) => (
            <Link key={f.id} href={`/chat/${encodeURIComponent(f.username)}`} asChild>
              <Pressable style={styles.row}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{f.username.slice(0, 2).toUpperCase()}</Text>
                </View>
                <View style={styles.meta}>
                  <Text style={styles.name}>{f.username}</Text>
                  <Text style={styles.preview}>Tap to chat</Text>
                </View>
              </Pressable>
            </Link>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    minHeight: "100%",
    padding: 16,
    backgroundColor: "#0b141a",
    gap: 10,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { fontSize: 26, fontWeight: "900", color: "#e9edef" },
  subheader: { color: "rgba(233,237,239,0.65)", marginBottom: 8 },
  error: { color: "#ffb4b4" },
  muted: { color: "rgba(233,237,239,0.65)" },
  listCard: {
    borderRadius: 18,
    backgroundColor: "rgba(17,27,33,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.06)",
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#e9edef", fontWeight: "900" },
  meta: { flex: 1 },
  name: { color: "#e9edef", fontWeight: "900", fontSize: 15 },
  preview: { color: "rgba(233,237,239,0.65)", marginTop: 2 },
});
