import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { createSession, hashPassword } from "../../../lib/auth";

type RegisterPayload = {
  username: string;
  password: string;
  purpose: "friends" | "hangout" | "hookup" | "social";
};

const PURPOSES = new Set(["friends", "hangout", "hookup", "social"] as const);

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return Response.json(
      { ok: false, error: "Supabase is not configured on the server." },
      { status: 500 },
    );
  }

  let payload: RegisterPayload;
  try {
    payload = (await request.json()) as RegisterPayload;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const username = payload?.username?.trim();
  const password = payload?.password ?? "";
  const purpose = payload?.purpose;

  if (!username || username.length < 3 || username.length > 24) {
    return Response.json(
      { ok: false, error: "Username must be 3–24 characters." },
      { status: 400 },
    );
  }
  if (password.length < 6 || password.length > 128) {
    return Response.json(
      { ok: false, error: "Password must be at least 6 characters." },
      { status: 400 },
    );
  }
  if (!purpose || !PURPOSES.has(purpose)) {
    return Response.json({ ok: false, error: "Invalid purpose." }, { status: 400 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("users")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (existingError) {
    return Response.json({ ok: false, error: existingError.message }, { status: 500 });
  }
  if (existing) {
    return Response.json(
      { ok: false, error: "Username already exists." },
      { status: 409 },
    );
  }

  const passwordHash = hashPassword(password);

  const { data: inserted, error: insertError } = await supabase
    .from("users")
    .insert({ username, password_hash: passwordHash, purpose })
    .select("id,username,purpose")
    .single();

  if (insertError) {
    return Response.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  await createSession(inserted.id);

  return Response.json({ ok: true, user: inserted });
}

