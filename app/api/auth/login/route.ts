import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { createSession, verifyPassword } from "../../../lib/auth";

type LoginPayload = {
  username: string;
  password: string;
  location?: { lat: number; lng: number; accuracy?: number };
};

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return Response.json(
      { ok: false, error: "Supabase is not configured on the server." },
      { status: 500 },
    );
  }

  let payload: LoginPayload;
  try {
    payload = (await request.json()) as LoginPayload;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const username = payload?.username?.trim();
  const password = payload?.password ?? "";
  const location = payload?.location;

  if (!username || !password) {
    return Response.json(
      { ok: false, error: "Missing username/password." },
      { status: 400 },
    );
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

  if (location && !hasValidLocation) {
    return Response.json(
      { ok: false, error: "Missing/invalid lat,lng." },
      { status: 400 },
    );
  }

  const { data: user, error } = await supabase
    .from("users")
    .select("id,username,purpose,gender,password_hash")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!user || !verifyPassword(password, user.password_hash)) {
    return Response.json({ ok: false, error: "Invalid credentials." }, { status: 401 });
  }

  if (hasValidLocation) {
    const { error: locationError } = await supabase.from("locations").insert({
      user_id: user.id,
      lat,
      lng,
      accuracy: typeof accuracy === "number" && Number.isFinite(accuracy) ? accuracy : null,
    });

    if (locationError) {
      return Response.json({ ok: false, error: locationError.message }, { status: 500 });
    }
  }

  const token = await createSession(user.id);

  return Response.json({
    ok: true,
    token,
    user: {
      id: user.id,
      username: user.username,
      purpose: user.purpose,
      gender: (user as unknown as { gender?: string | null }).gender ?? null,
    },
  });
}
