import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "./supabaseAdmin";

const SESSION_COOKIE = "mf_session";
const SESSION_DAYS = 30;

type User = {
  id: string;
  username: string;
  purpose: "friends" | "hangout" | "hookup" | "social";
  gender?: string | null;
  avatar_url?: string | null;
  bio?: string | null;
};

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(password, salt, 32, {
    N: 16384,
    r: 8,
    p: 1,
  });
  return `scrypt:16384:8:1:${salt.toString("base64")}:${derivedKey.toString(
    "base64",
  )}`;
}

export function verifyPassword(password: string, passwordHash: string) {
  const parts = passwordHash.split(":");
  if (parts.length !== 6) return false;
  const [algo, nStr, rStr, pStr, saltB64, dkB64] = parts;
  if (algo !== "scrypt") return false;

  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(dkB64, "base64");
  const actual = crypto.scryptSync(password, salt, expected.length, { N, r, p });
  return crypto.timingSafeEqual(expected, actual);
}

export async function createSession(userId: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) throw new Error("Supabase is not configured on the server.");

  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  const { error } = await supabase.from("sessions").insert({
    user_id: userId,
    token,
    expires_at: expiresAt.toISOString(),
  });
  if (error) throw new Error(error.message);

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });

  return token;
}

export async function clearSessionCookie() {
  (await cookies()).set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

function parseBearerToken(value: string | null) {
  if (!value) return null;
  const m = value.match(/^Bearer\s+(.+)$/i);
  const token = m?.[1]?.trim();
  return token ? token : null;
}

async function getUserForSessionToken(token: string): Promise<User | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("user_id,expires_at")
    .eq("token", token)
    .maybeSingle();

  if (sessionError || !session) return null;
  if (new Date(session.expires_at).getTime() < Date.now()) return null;

  const selectWithProfile = "id,username,purpose,gender,avatar_url,bio";
  const selectCore = "id,username,purpose,gender";

  const withProfile = await supabase
    .from("users")
    .select(selectWithProfile)
    .eq("id", session.user_id)
    .maybeSingle();

  if (!withProfile.error && withProfile.data) {
    const user = withProfile.data as unknown as {
      id: string;
      username: string;
      purpose: User["purpose"];
      gender?: string | null;
      avatar_url?: string | null;
      bio?: string | null;
    };
    return {
      id: user.id,
      username: user.username,
      purpose: user.purpose,
      gender: user.gender ?? null,
      avatar_url: user.avatar_url ?? null,
      bio: user.bio ?? null,
    } satisfies User;
  }

  // Back-compat: older DB schema may not have `avatar_url`/`bio`.
  const core = await supabase
    .from("users")
    .select(selectCore)
    .eq("id", session.user_id)
    .maybeSingle();

  if (core.error || !core.data) return null;

  const user = core.data as unknown as {
    id: string;
    username: string;
    purpose: User["purpose"];
    gender?: string | null;
  };

  return {
    id: user.id,
    username: user.username,
    purpose: user.purpose,
    gender: user.gender ?? null,
    avatar_url: null,
    bio: null,
  } satisfies User;
}

export async function getSessionUser(request?: Request): Promise<User | null> {
  const headerToken = request ? parseBearerToken(request.headers.get("authorization")) : null;
  if (headerToken) {
    return getUserForSessionToken(headerToken);
  }

  const cookieToken = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookieToken) return null;

  return getUserForSessionToken(cookieToken);
}
