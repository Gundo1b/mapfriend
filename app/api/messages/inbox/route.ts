import { getSessionUser } from "../../../lib/auth";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";

function isValidIsoDate(value: string) {
  const t = Date.parse(value);
  return Number.isFinite(t);
}

export async function GET(request: Request) {
  const me = await getSessionUser(request);
  if (!me) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return Response.json(
      { ok: false, error: "Supabase is not configured on the server." },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  const since = url.searchParams.get("since")?.trim() ?? null;
  if (since && !isValidIsoDate(since)) {
    return Response.json(
      { ok: false, error: "Invalid ?since (must be ISO date)." },
      { status: 400 },
    );
  }

  let query = supabase
    .from("messages")
    .select("id,created_at,from_user_id,to_user_id,body")
    .eq("to_user_id", me.id)
    .order("created_at", { ascending: true })
    .limit(200);

  if (since) query = query.gt("created_at", since);

  const { data: messages, error } = await query;
  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const fromIds = Array.from(
    new Set((messages ?? []).map((m) => m.from_user_id as string).filter(Boolean)),
  );

  let usersById = new Map<string, { username: string }>();
  if (fromIds.length) {
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id,username")
      .in("id", fromIds);

    if (usersError) {
      return Response.json({ ok: false, error: usersError.message }, { status: 500 });
    }

    usersById = new Map(
      (users ?? []).map((u) => [u.id as string, { username: u.username as string }]),
    );
  }

  return Response.json({
    ok: true,
    messages: (messages ?? []).map((m) => ({
      id: m.id as string,
      createdAt: m.created_at as string,
      fromUserId: m.from_user_id as string,
      toUserId: m.to_user_id as string,
      fromUsername: usersById.get(m.from_user_id as string)?.username ?? null,
      body: m.body as string,
    })),
  });
}
