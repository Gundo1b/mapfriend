import { getSessionUser } from "../../lib/auth";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  return Response.json({ ok: true, user });
}

type PatchPayload = {
  gender?: string;
};

const ALLOWED_GENDERS = new Set(["male", "female", "nonbinary", "other", "prefer_not_say"]);

export async function PATCH(request: Request) {
  const user = await getSessionUser(request);
  if (!user) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return Response.json(
      { ok: false, error: "Supabase is not configured on the server." },
      { status: 500 },
    );
  }

  let payload: PatchPayload;
  try {
    payload = (await request.json()) as PatchPayload;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const gender = payload?.gender?.trim();
  if (!gender || !ALLOWED_GENDERS.has(gender)) {
    return Response.json({ ok: false, error: "Invalid gender." }, { status: 400 });
  }

  const { error } = await supabase.from("users").update({ gender }).eq("id", user.id);
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({ ok: true });
}
