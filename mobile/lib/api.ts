import Constants from "expo-constants";
import { Platform } from "react-native";

export function getApiBaseUrl() {
  const env = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (env) return env.replace(/\/+$/, "");

  // Sensible defaults for local development.
  // - Android emulator: use host loopback alias
  // - iOS simulator / web: localhost
  if (__DEV__ && Platform.OS === "android") return "http://10.0.2.2:3000";
  return "http://localhost:3000";
}

export type ApiError = { status: number; message: string };

export async function apiFetchJson<T>(
  path: string,
  opts?: {
    method?: string;
    token?: string | null;
    body?: unknown;
    signal?: AbortSignal;
  },
): Promise<T> {
  const base = getApiBaseUrl();
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;

  const res = await fetch(url, {
    method: opts?.method ?? "GET",
    headers: {
      "content-type": "application/json",
      ...(opts?.token ? { authorization: `Bearer ${opts.token}` } : null),
    },
    body: typeof opts?.body === "undefined" ? undefined : JSON.stringify(opts.body),
    signal: opts?.signal,
  });

  const json = (await res.json().catch(() => null)) as unknown;

  if (!res.ok) {
    const msg =
      (json as { error?: string } | null)?.error ||
      (json as { message?: string } | null)?.message ||
      `Request failed (${res.status}).`;
    throw { status: res.status, message: msg } satisfies ApiError;
  }

  return json as T;
}

export function getAppVersionLabel() {
  const ver = Constants.expoConfig?.version ?? "dev";
  const name = Constants.expoConfig?.name ?? "MapFriend";
  return `${name} ${ver}`;
}

