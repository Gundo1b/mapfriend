import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { createSession, verifyPassword } from "../../../lib/auth";

type LoginPayload = {
  username: string;
  password: string;
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

  if (!username || !password) {
    return Response.json(
      { ok: false, error: "Missing username/password." },
      { status: 400 },
    );
  }

  const { data: user, error } = await supabase
    .from("users")
    .select("id,username,purpose,password_hash")
    .eq("username", username)
    .maybeSingle();

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!user || !verifyPassword(password, user.password_hash)) {
    return Response.json({ ok: false, error: "Invalid credentials." }, { status: 401 });
  }

  const token = await createSession(user.id);

  return Response.json({
    ok: true,
    token,
    user: { id: user.id, username: user.username, purpose: user.purpose },
  });
}
