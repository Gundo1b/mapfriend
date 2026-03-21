"use client";

import * as SecureStore from "expo-secure-store";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { apiFetchJson, type ApiError } from "@/lib/api";

const TOKEN_KEY = "mf_token";

export type Purpose = "friends" | "hangout" | "hookup" | "social";

export type SessionUser = {
  id: string;
  username: string;
  purpose: Purpose;
  gender?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
};

export type SessionLocation = { lat: number; lng: number; accuracy?: number };

type AuthContextValue = {
  token: string | null;
  user: SessionUser | null;
  isHydrated: boolean;
  login: (username: string, password: string, opts?: { location?: SessionLocation }) => Promise<void>;
  register: (opts: {
    username: string;
    password: string;
    purpose: Purpose;
    location: SessionLocation;
  }) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      try {
        const saved = await SecureStore.getItemAsync(TOKEN_KEY);
        if (cancelled) return;
        setToken(saved ?? null);

        if (saved) {
          const me = await apiFetchJson<{ ok: true; user: SessionUser | null }>("/api/me", {
            token: saved,
          });
          if (!cancelled) setUser(me.user);
        } else {
          if (!cancelled) setUser(null);
        }
      } catch {
        if (!cancelled) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) setIsHydrated(true);
      }
    }

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    async function refresh() {
      if (!token) {
        setUser(null);
        return;
      }
      const me = await apiFetchJson<{ ok: true; user: SessionUser | null }>("/api/me", { token });
      setUser(me.user);
    }

    async function login(
      username: string,
      password: string,
      opts?: { location?: SessionLocation },
    ) {
      const res = await apiFetchJson<{ ok: true; token: string; user: SessionUser }>(
        "/api/auth/login",
        { method: "POST", body: { username, password, location: opts?.location } },
      );

      await SecureStore.setItemAsync(TOKEN_KEY, res.token);
      setToken(res.token);
      setUser(res.user);
    }

    async function register(opts: {
      username: string;
      password: string;
      purpose: Purpose;
      location: { lat: number; lng: number; accuracy?: number };
    }) {
      const res = await apiFetchJson<{ ok: true; token: string; user: SessionUser }>(
        "/api/auth/register",
        {
          method: "POST",
          body: {
            username: opts.username,
            password: opts.password,
            purpose: opts.purpose,
            location: opts.location,
          },
        },
      );

      await SecureStore.setItemAsync(TOKEN_KEY, res.token);
      setToken(res.token);
      setUser(res.user);
    }

    async function logout() {
      const t = token;
      setToken(null);
      setUser(null);
      await SecureStore.deleteItemAsync(TOKEN_KEY);

      // Best-effort: invalidate server session.
      if (t) {
        try {
          await apiFetchJson<{ ok: true }>("/api/auth/logout", { method: "POST", token: t });
        } catch {
          // ignore
        }
      }
    }

    return { token, user, isHydrated, login, register, logout, refresh };
  }, [token, user, isHydrated]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>.");
  return ctx;
}

export function asApiMessage(e: unknown) {
  const err = e as ApiError | null;
  if (err && typeof err.status === "number" && typeof err.message === "string") {
    return err.message;
  }
  return e instanceof Error ? e.message : "Failed.";
}
