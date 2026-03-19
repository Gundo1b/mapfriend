import { getSessionUser } from "../../lib/auth";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

export async function GET() {
  const me = await getSessionUser();
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

  const { data: rows, error } = await supabase
    .from("friend_requests")
    .select("id,created_at,from_user_id,to_user_id,status")
    .eq("status", "accepted")
    .or(`from_user_id.eq.${me.id},to_user_id.eq.${me.id}`)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const friendIds = Array.from(
    new Set(
      (rows ?? [])
        .map((r) =>
          (r.from_user_id as string) === me.id
            ? (r.to_user_id as string)
            : (r.from_user_id as string),
        )
        .filter(Boolean),
    ),
  );

  let usersById = new Map<string, { username: string }>();
  if (friendIds.length) {
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("id,username")
      .in("id", friendIds);

    if (usersError) {
      return Response.json({ ok: false, error: usersError.message }, { status: 500 });
    }

    usersById = new Map(
      (users ?? []).map((u) => [u.id as string, { username: u.username as string }]),
    );
  }

  return Response.json({
    ok: true,
    friends: friendIds
      .map((id) => ({ id, username: usersById.get(id)?.username ?? null }))
      .filter((f) => !!f.username),
  });
}

