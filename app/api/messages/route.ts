import { getSessionUser } from "../../lib/auth";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

type SendPayload = {
  toUsername?: string;
  body?: string;
};

function isValidIsoDate(value: string) {
  const t = Date.parse(value);
  return Number.isFinite(t);
}

async function isFriends(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  meId: string,
  otherId: string,
) {
  if (!supabase) return false;
  const { data, error } = await supabase
    .from("friend_requests")
    .select("id")
    .eq("status", "accepted")
    .or(
      `and(from_user_id.eq.${meId},to_user_id.eq.${otherId}),and(from_user_id.eq.${otherId},to_user_id.eq.${meId})`,
    )
    .limit(1);

  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
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
  const withUsername = url.searchParams.get("with")?.trim();
  const since = url.searchParams.get("since")?.trim() ?? null;

  if (!withUsername) {
    return Response.json({ ok: false, error: "Missing ?with=username." }, { status: 400 });
  }

  if (since && !isValidIsoDate(since)) {
    return Response.json(
      { ok: false, error: "Invalid ?since (must be ISO date)." },
      { status: 400 },
    );
  }

  const { data: other, error: otherError } = await supabase
    .from("users")
    .select("id,username")
    .eq("username", withUsername)
    .maybeSingle();

  if (otherError) {
    return Response.json({ ok: false, error: otherError.message }, { status: 500 });
  }

  if (!other) {
    return Response.json({ ok: false, error: "User not found." }, { status: 404 });
  }

  if (other.id === me.id) {
    return Response.json({ ok: true, with: { id: other.id, username: other.username }, messages: [] });
  }

  try {
    const friends = await isFriends(supabase, me.id, other.id as string);
    if (!friends) {
      return Response.json({ ok: false, error: "You are not friends." }, { status: 403 });
    }
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed." },
      { status: 500 },
    );
  }

  let query = supabase
    .from("messages")
    .select("id,created_at,from_user_id,to_user_id,body")
    .or(
      `and(from_user_id.eq.${me.id},to_user_id.eq.${other.id}),and(from_user_id.eq.${other.id},to_user_id.eq.${me.id})`,
    )
    .order("created_at", { ascending: true })
    .limit(200);

  if (since) {
    query = query.gt("created_at", since);
  }

  const { data: messages, error } = await query;

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    with: { id: other.id as string, username: other.username as string },
    messages: (messages ?? []).map((m) => ({
      id: m.id as string,
      createdAt: m.created_at as string,
      fromUserId: m.from_user_id as string,
      toUserId: m.to_user_id as string,
      body: m.body as string,
    })),
  });
}

export async function POST(request: Request) {
  let payload: SendPayload;
  try {
    payload = (await request.json()) as SendPayload;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const me = await getSessionUser(request);
  if (!me) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const toUsername = payload?.toUsername?.trim();
  const body = payload?.body?.trim();
  if (!toUsername || !body) {
    return Response.json(
      { ok: false, error: "Missing/invalid toUsername or body." },
      { status: 400 },
    );
  }

  if (body.length > 2000) {
    return Response.json({ ok: false, error: "Message too long." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return Response.json(
      { ok: false, error: "Supabase is not configured on the server." },
      { status: 500 },
    );
  }

  const { data: other, error: otherError } = await supabase
    .from("users")
    .select("id,username")
    .eq("username", toUsername)
    .maybeSingle();

  if (otherError) {
    return Response.json({ ok: false, error: otherError.message }, { status: 500 });
  }

  if (!other) {
    return Response.json({ ok: false, error: "User not found." }, { status: 404 });
  }

  if (other.id === me.id) {
    return Response.json({ ok: false, error: "You cannot message yourself." }, { status: 400 });
  }

  try {
    const friends = await isFriends(supabase, me.id, other.id as string);
    if (!friends) {
      return Response.json({ ok: false, error: "You are not friends." }, { status: 403 });
    }
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message : "Failed." },
      { status: 500 },
    );
  }

  const { data: inserted, error: insertError } = await supabase
    .from("messages")
    .insert({ from_user_id: me.id, to_user_id: other.id, body })
    .select("id,created_at,from_user_id,to_user_id,body")
    .maybeSingle();

  if (insertError) {
    return Response.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  return Response.json({
    ok: true,
    message: inserted
      ? {
          id: inserted.id as string,
          createdAt: inserted.created_at as string,
          fromUserId: inserted.from_user_id as string,
          toUserId: inserted.to_user_id as string,
          body: inserted.body as string,
        }
      : null,
  });
}
