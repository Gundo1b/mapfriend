import * as Location from "expo-location";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { asApiMessage, type Purpose, useAuth } from "@/lib/auth";

const PURPOSES: Purpose[] = ["friends", "hangout", "hookup", "social"];

export function AuthForm() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [purpose, setPurpose] = useState<Purpose>("friends");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canSubmit = useMemo(() => {
    if (!username.trim() || !password) return false;
    if (mode === "register") return username.trim().length >= 3 && password.length >= 6;
    return true;
  }, [mode, password, username]);

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") {
        await login(username.trim(), password);
        return;
      }

      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        throw new Error("Location permission is required to register.");
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      await register({
        username: username.trim(),
        password,
        purpose,
        location: {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: typeof pos.coords.accuracy === "number" ? pos.coords.accuracy : undefined,
        },
      });
    } catch (e) {
      setError(asApiMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{mode === "login" ? "Login" : "Create account"}</Text>
      <Text style={styles.subtitle}>
        {mode === "login" ? "Sign in to chat with friends." : "Register to appear on the map."}
      </Text>

      <Text style={styles.label}>Username</Text>
      <TextInput
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="yourname"
        placeholderTextColor="rgba(233,237,239,0.55)"
        style={styles.input}
      />

      <Text style={styles.label}>Password</Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="••••••••"
        placeholderTextColor="rgba(233,237,239,0.55)"
        style={styles.input}
      />

      {mode === "register" ? (
        <>
          <Text style={[styles.label, { marginTop: 8 }]}>Purpose</Text>
          <View style={styles.purposeRow}>
            {PURPOSES.map((p) => {
              const active = purpose === p;
              return (
                <Pressable
                  key={p}
                  onPress={() => setPurpose(p)}
                  style={[styles.pill, active ? styles.pillActive : null]}
                >
                  <Text style={[styles.pillText, active ? styles.pillTextActive : null]}>
                    {p}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        onPress={submit}
        disabled={!canSubmit || busy}
        style={[styles.primaryBtn, !canSubmit || busy ? styles.primaryBtnDisabled : null]}
      >
        {busy ? (
          <ActivityIndicator color="#052b24" />
        ) : (
          <Text style={styles.primaryBtnText}>{mode === "login" ? "Login" : "Register"}</Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => {
          setMode((m) => (m === "login" ? "register" : "login"));
          setError(null);
        }}
        style={styles.linkBtn}
      >
        <Text style={styles.linkText}>
          {mode === "login" ? "No account? Register" : "Have an account? Login"}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 18,
    backgroundColor: "rgba(17, 27, 33, 0.92)",
    borderColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    padding: 14,
  },
  title: { fontSize: 18, fontWeight: "800", color: "#e9edef" },
  subtitle: { marginTop: 4, marginBottom: 12, color: "rgba(233,237,239,0.65)" },
  label: { fontSize: 12, fontWeight: "700", color: "rgba(233,237,239,0.75)" },
  input: {
    marginTop: 6,
    marginBottom: 10,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.06)",
    color: "#e9edef",
  },
  purposeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  pill: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  pillActive: {
    borderColor: "rgba(0,168,132,0.35)",
    backgroundColor: "rgba(0,168,132,0.18)",
  },
  pillText: { color: "rgba(233,237,239,0.85)", fontSize: 12, fontWeight: "700" },
  pillTextActive: { color: "#e9edef" },
  error: { color: "#ffb4b4", marginTop: 6, marginBottom: 10 },
  primaryBtn: {
    marginTop: 6,
    borderRadius: 9999,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: "#00a884",
    borderWidth: 1,
    borderColor: "rgba(0,168,132,0.35)",
  },
  primaryBtnDisabled: { opacity: 0.55 },
  primaryBtnText: { color: "#052b24", fontWeight: "900" },
  linkBtn: { marginTop: 10, alignItems: "center" },
  linkText: { color: "rgba(233,237,239,0.75)", fontWeight: "700" },
});
