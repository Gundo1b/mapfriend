import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

type LocationPayload = {
  lat: number;
  lng: number;
  accuracy?: number;
};

export async function GET() {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return Response.json(
      { ok: false, error: "Supabase is not configured on the server." },
      { status: 500 },
    );
  }

  const { data, error } = await supabase
    .from("locations")
    .select("lat,lng")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true, locations: data ?? [] });
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

  const { error } = await supabase.from("locations").insert({
    lat,
    lng,
    accuracy: typeof accuracy === "number" && Number.isFinite(accuracy) ? accuracy : null,
  });

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
