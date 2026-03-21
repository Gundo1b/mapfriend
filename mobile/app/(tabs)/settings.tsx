import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { AuthForm } from "@/components/AuthForm";
import { apiFetchJson, getAppVersionLabel } from "@/lib/api";
import { asApiMessage, useAuth } from "@/lib/auth";
import {
  clearMapPrefs,
  loadMapPrefs,
  saveMapPrefs,
  type MapPrefs,
  type Purpose,
} from "@/lib/prefs";

type IncomingRequest = {
  id: string;
  createdAt: string;
  status: string;
  from: { id: string; username: string | null };
};

const PURPOSES: Array<Purpose | "all"> = ["all", "friends", "hangout", "hookup", "social"];

export default function SettingsTab() {
  const { token, user, isHydrated, logout } = useAuth();
  const [incoming, setIncoming] = useState<IncomingRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [mapPrefs, setMapPrefs] = useState<MapPrefs | null>(null);
  const [prefsBusy, setPrefsBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function hydratePrefs() {
      const p = await loadMapPrefs();
      if (!cancelled) setMapPrefs(p);
    }
    void hydratePrefs();
    return () => {
      cancelled = true;
    };
  }, []);

  const incomingSorted = useMemo(() => {
    return [...incoming].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [incoming]);

  async function load(kind: "initial" | "refresh") {
    if (!token) return;
    if (kind === "initial") setLoading(true);
    if (kind === "refresh") setRefreshing(true);
    setError(null);
    try {
      const data = await apiFetchJson<{ ok: true; incoming: IncomingRequest[] }>(
        "/api/friend-requests",
        { token },
      );
      setIncoming(data.incoming ?? []);
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

  async function respond(id: string, action: "accept" | "decline") {
    if (!token) return;
    setBusyIds((p) => ({ ...p, [id]: true }));
    try {
      await apiFetchJson<{ ok: true; status: string }>("/api/friend-requests", {
        method: "PATCH",
        token,
        body: { id, action },
      });
      setIncoming((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      Alert.alert("Failed", asApiMessage(e));
    } finally {
      setBusyIds((p) => ({ ...p, [id]: false }));
    }
  }

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
        <Text style={styles.header}>Settings</Text>
        <Text style={styles.subheader}>{getAppVersionLabel()}</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account</Text>
          <Text style={styles.muted}>Login to manage your account.</Text>
          <View style={{ marginTop: 10 }}>
            <AuthForm />
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Map preferences</Text>
          {!mapPrefs ? (
            <View style={styles.centerInline}>
              <ActivityIndicator />
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <Pressable
                onPress={async () => {
                  if (prefsBusy) return;
                  const idx = PURPOSES.indexOf(mapPrefs.defaultPurposeFilter);
                  const nextValue = PURPOSES[(idx + 1) % PURPOSES.length] ?? "all";
                  const next = { ...mapPrefs, defaultPurposeFilter: nextValue };
                  setPrefsBusy(true);
                  setMapPrefs(next);
                  await saveMapPrefs(next);
                  setPrefsBusy(false);
                }}
                style={styles.row}
              >
                <Text style={styles.rowLabel}>Default purpose filter</Text>
                <Text style={styles.rowValue}>{mapPrefs.defaultPurposeFilter}</Text>
              </Pressable>

              <Pressable
                onPress={async () => {
                  if (prefsBusy) return;
                  const next = { ...mapPrefs, autoFitPeopleOnOpen: !mapPrefs.autoFitPeopleOnOpen };
                  setPrefsBusy(true);
                  setMapPrefs(next);
                  await saveMapPrefs(next);
                  setPrefsBusy(false);
                }}
                style={styles.row}
              >
                <Text style={styles.rowLabel}>Auto-zoom to people on open</Text>
                <Text style={styles.rowValue}>{mapPrefs.autoFitPeopleOnOpen ? "On" : "Off"}</Text>
              </Pressable>

              <Pressable
                onPress={async () => {
                  if (prefsBusy) return;
                  setPrefsBusy(true);
                  await clearMapPrefs();
                  const p = await loadMapPrefs();
                  setMapPrefs(p);
                  setPrefsBusy(false);
                }}
                style={styles.secondaryAction}
              >
                <Text style={styles.secondaryActionText}>Reset map preferences</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Help</Text>
          <Text style={styles.muted}>If login fails, check your API base URL in mobile/.env.</Text>
        </View>
      </ScrollView>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.root}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load("refresh")} />}
    >
      <Text style={styles.header}>Settings</Text>
      <Text style={styles.subheader}>@{user.username}</Text>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Account</Text>
        <Text style={styles.name}>@{user.username}</Text>
        <Text style={styles.preview}>
          Purpose: {user.purpose}
          {user.gender ? ` · Gender: ${user.gender}` : ""}
        </Text>

        <Pressable
          onPress={() =>
            Alert.alert("Logout", "Are you sure?", [
              { text: "Cancel", style: "cancel" },
              { text: "Logout", style: "destructive", onPress: () => void logout() },
            ])
          }
          style={styles.logoutBtn}
        >
          <Text style={styles.logoutText}>Logout</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Map preferences</Text>
        {!mapPrefs ? (
          <View style={styles.centerInline}>
            <ActivityIndicator />
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <Pressable
              onPress={async () => {
                if (prefsBusy) return;
                const idx = PURPOSES.indexOf(mapPrefs.defaultPurposeFilter);
                const nextValue = PURPOSES[(idx + 1) % PURPOSES.length] ?? "all";
                const next = { ...mapPrefs, defaultPurposeFilter: nextValue };
                setPrefsBusy(true);
                setMapPrefs(next);
                await saveMapPrefs(next);
                setPrefsBusy(false);
              }}
              style={styles.row}
            >
              <Text style={styles.rowLabel}>Default purpose filter</Text>
              <Text style={styles.rowValue}>{mapPrefs.defaultPurposeFilter}</Text>
            </Pressable>

            <Pressable
              onPress={async () => {
                if (prefsBusy) return;
                const next = { ...mapPrefs, autoFitPeopleOnOpen: !mapPrefs.autoFitPeopleOnOpen };
                setPrefsBusy(true);
                setMapPrefs(next);
                await saveMapPrefs(next);
                setPrefsBusy(false);
              }}
              style={styles.row}
            >
              <Text style={styles.rowLabel}>Auto-zoom to people on open</Text>
              <Text style={styles.rowValue}>{mapPrefs.autoFitPeopleOnOpen ? "On" : "Off"}</Text>
            </Pressable>

            <Pressable
              onPress={async () => {
                if (prefsBusy) return;
                setPrefsBusy(true);
                await clearMapPrefs();
                const p = await loadMapPrefs();
                setMapPrefs(p);
                setPrefsBusy(false);
              }}
              style={styles.secondaryAction}
            >
              <Text style={styles.secondaryActionText}>Reset map preferences</Text>
            </Pressable>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Friend requests</Text>
        {loading ? (
          <View style={styles.centerInline}>
            <ActivityIndicator />
          </View>
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : incomingSorted.length === 0 ? (
          <Text style={styles.muted}>No pending requests.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {incomingSorted.map((r) => (
              <View key={r.id} style={styles.requestRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{r.from.username ?? "Unknown user"}</Text>
                  <Text style={styles.preview}>
                    {new Date(r.createdAt).toLocaleString()}
                  </Text>
                </View>
                <Pressable
                  onPress={() => respond(r.id, "accept")}
                  disabled={busyIds[r.id]}
                  style={[styles.primaryBtn, busyIds[r.id] ? styles.btnDisabled : null]}
                >
                  <Text style={styles.primaryBtnText}>Accept</Text>
                </Pressable>
                <Pressable
                  onPress={() => respond(r.id, "decline")}
                  disabled={busyIds[r.id]}
                  style={[styles.secondaryBtn, busyIds[r.id] ? styles.btnDisabled : null]}
                >
                  <Text style={styles.secondaryBtnText}>Decline</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Help</Text>
        <Text style={styles.muted}>
          Version: {getAppVersionLabel()}
        </Text>
      </View>
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
  centerInline: { paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  header: { fontSize: 26, fontWeight: "900", color: "#e9edef" },
  subheader: { color: "rgba(233,237,239,0.65)", marginBottom: 8 },
  card: {
    borderRadius: 18,
    backgroundColor: "rgba(17,27,33,0.92)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    padding: 14,
  },
  cardTitle: { color: "#e9edef", fontSize: 16, fontWeight: "900", marginBottom: 10 },
  error: { color: "#ffb4b4" },
  muted: { color: "rgba(233,237,239,0.65)" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  rowLabel: { color: "#e9edef", fontWeight: "900" },
  rowValue: { color: "rgba(233,237,239,0.65)", fontWeight: "800" },
  secondaryAction: {
    alignSelf: "flex-start",
    borderRadius: 9999,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  secondaryActionText: { color: "#e9edef", fontWeight: "900" },
  requestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  name: { color: "#e9edef", fontWeight: "900" },
  preview: { color: "rgba(233,237,239,0.65)", marginTop: 2, fontSize: 12 },
  primaryBtn: {
    backgroundColor: "#00a884",
    borderWidth: 1,
    borderColor: "rgba(0,168,132,0.35)",
    borderRadius: 9999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  primaryBtnText: { color: "#052b24", fontWeight: "900" },
  secondaryBtn: {
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 9999,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  secondaryBtnText: { color: "#e9edef", fontWeight: "900" },
  btnDisabled: { opacity: 0.6 },
  logoutBtn: {
    marginTop: 12,
    borderRadius: 9999,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  logoutText: { color: "#e9edef", fontWeight: "900" },
});
