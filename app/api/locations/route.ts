import { getSupabaseAdmin } from "../../lib/supabaseAdmin";
import { getSessionUser } from "../../lib/auth";

type LocationPayload = {
  lat: number;
  lng: number;
  accuracy?: number;
};

export async function GET(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return Response.json(
      { ok: false, error: "Supabase is not configured on the server." },
      { status: 500 },
    );
  }

  const user = await getSessionUser(request);
  if (!user) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("locations")
    .select("lat,lng,user_id,created_at")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const latestByUser = new Map<string, { lat: number; lng: number; user_id: string | null }>();
  for (const row of data ?? []) {
    const userId = (row.user_id as string | null) ?? null;
    if (!userId) continue;
    if (!latestByUser.has(userId)) {
      latestByUser.set(userId, { lat: row.lat, lng: row.lng, user_id: userId });
    }
  }

  const locations = Array.from(latestByUser.values());

  const userIds = Array.from(
    new Set(locations.map((l) => l.user_id).filter((id): id is string => !!id)),
  );

  let usersById = new Map<string, { username: string; purpose: string }>();
  if (userIds.length) {
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id,username,purpose")
      .in("id", userIds);

    if (usersError) {
      return Response.json({ ok: false, error: usersError.message }, { status: 500 });
    }

    usersById = new Map(
      (users ?? []).map((u) => [
        u.id as string,
        { username: u.username as string, purpose: u.purpose as string },
      ]),
    );
  }

  return Response.json({
    ok: true,
    locations: locations.map((l) => ({
      lat: l.lat,
      lng: l.lng,
      username: l.user_id ? usersById.get(l.user_id)?.username ?? null : null,
      purpose: l.user_id ? usersById.get(l.user_id)?.purpose ?? null : null,
    })),
  });
}

export async function POST(request: Request) {
  let payload: LocationPayload;
  try {
    payload = (await request.json()) as LocationPayload;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const lat = payload?.lat;
  const lng = payload?.lng;
  const accuracy = payload?.accuracy;

  const isValid =
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180;

  if (!isValid) {
    return Response.json(
      { ok: false, error: "Missing/invalid lat,lng." },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return Response.json(
      { ok: false, error: "Supabase is not configured on the server." },
      { status: 500 },
    );
  }

  const user = await getSessionUser(request);
  if (!user) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const { error } = await supabase.from("locations").insert({
    user_id: user.id,
    lat,
    lng,
    accuracy: typeof accuracy === "number" && Number.isFinite(accuracy) ? accuracy : null,
  });

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
