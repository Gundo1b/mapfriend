import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { createSession, hashPassword } from "../../../lib/auth";

type RegisterPayload = {
  username: string;
  password: string;
  purpose: "friends" | "hangout" | "hookup" | "social";
  location?: { lat: number; lng: number; accuracy?: number };
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
  const location = payload?.location;

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

  const lat = location?.lat;
  const lng = location?.lng;
  const accuracy = location?.accuracy;
  const hasValidLocation =
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180;

  if (!hasValidLocation) {
    return Response.json(
      { ok: false, error: "Location is required to register." },
      { status: 400 },
    );
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
    .select("id,username,purpose,gender")
    .single();

  if (insertError) {
    return Response.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  const { error: locationError } = await supabase.from("locations").insert({
    user_id: inserted.id,
    lat,
    lng,
    accuracy: typeof accuracy === "number" && Number.isFinite(accuracy) ? accuracy : null,
  });

  if (locationError) {
    await supabase.from("users").delete().eq("id", inserted.id);
    return Response.json({ ok: false, error: locationError.message }, { status: 500 });
  }

  const token = await createSession(inserted.id);

  return Response.json({ ok: true, token, user: inserted });
}
