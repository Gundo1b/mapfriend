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
import { useColorScheme } from "@/components/useColorScheme";
import Colors from "@/constants/Colors";

type Friend = { id: string; username: string | null };

export default function ChatTab() {
  const { token, user, isHydrated } = useAuth();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

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
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.tint} />
      </View>
    );
  }

  if (!token || !user) {
    return (
      <ScrollView contentContainerStyle={[styles.root, { backgroundColor: theme.background }]}>
        <Text style={[styles.header, { color: theme.text }]}>MapFriend</Text>
        <Text style={styles.subheader}>{getAppVersionLabel()}</Text>
        <AuthForm />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={[styles.root, { backgroundColor: theme.background }]}
      refreshControl={
        <RefreshControl 
          refreshing={refreshing} 
          onRefresh={() => load("refresh")} 
          tintColor={theme.tint}
        />
      }
    >
      <View style={styles.headerRow}>
        <View>
          <Text style={[styles.header, { color: theme.text }]}>Messages</Text>
          <Text style={styles.subheader}>@{user.username}</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.tint} />
        </View>
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : friendsSorted.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>No messages yet.</Text>
          <Text style={styles.emptySub}>Connect with people in Explore to start chatting.</Text>
        </View>
      ) : (
        <View style={[styles.listCard, { 
          backgroundColor: colorScheme === "dark" ? "rgba(17,27,33,0.92)" : "#f9f9f9",
          borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)"
        }]}>
          {friendsSorted.map((f) => (
            <Link key={f.id} href={`/chat/${encodeURIComponent(f.username)}`} asChild>
              <Pressable style={({ pressed }) => [
                styles.row,
                { 
                  backgroundColor: pressed ? (colorScheme === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)") : "transparent",
                  borderBottomColor: colorScheme === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"
                }
              ]}>
                <View style={[styles.avatar, {
                  backgroundColor: colorScheme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
                  borderColor: colorScheme === "dark" ? "rgba(255,255,255,0.10)" : "rgba(0,0,0,0.05)"
                }]}>
                  <Text style={[styles.avatarText, { color: theme.text }]}>
                    {f.username.slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.meta}>
                  <Text style={[styles.name, { color: theme.text }]}>{f.username}</Text>
                  <Text style={styles.preview}>Tap to chat</Text>
                </View>
                <View style={styles.rightSide}>
                  <View style={[styles.dot, { backgroundColor: "#00a884" }]} />
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
    padding: 20,
    gap: 16,
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 8,
  },
  header: { fontSize: 34, fontWeight: "800", letterSpacing: -1 },
  subheader: { color: "rgba(120,120,120,0.7)", fontSize: 16, fontWeight: "600" },
  error: { color: "#ff4d4d", textAlign: "center", padding: 20 },
  emptyContainer: {
    padding: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 20,
    fontWeight: "700",
    color: "rgba(120,120,120,0.9)",
    marginBottom: 8,
  },
  emptySub: {
    fontSize: 14,
    color: "rgba(120,120,120,0.6)",
    textAlign: "center",
  },
  listCard: {
    borderRadius: 28,
    borderWidth: 1,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontWeight: "800", fontSize: 18 },
  meta: { flex: 1 },
  name: { fontWeight: "700", fontSize: 17, marginBottom: 2 },
  preview: { color: "rgba(120,120,120,0.7)", fontSize: 14 },
  rightSide: {
    alignItems: "flex-end",
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  }
});
