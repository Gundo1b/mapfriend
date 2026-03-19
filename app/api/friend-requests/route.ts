import { getSessionUser } from "../../lib/auth";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

type Payload = {
  toUsername?: string;
};

type RespondPayload = {
  id?: string;
  action?: "accept" | "decline";
};

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

  const { data: incoming, error } = await supabase
    .from("friend_requests")
    .select("id,created_at,from_user_id,to_user_id,status")
    .eq("to_user_id", me.id)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  const fromIds = Array.from(
    new Set((incoming ?? []).map((r) => r.from_user_id as string).filter(Boolean)),
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

    usersById = new Map((users ?? []).map((u) => [u.id as string, { username: u.username as string }]));
  }

  return Response.json({
    ok: true,
    incoming: (incoming ?? []).map((r) => ({
      id: r.id as string,
      createdAt: r.created_at as string,
      status: r.status as string,
      from: {
        id: r.from_user_id as string,
        username: usersById.get(r.from_user_id as string)?.username ?? null,
      },
    })),
  });
}

export async function POST(request: Request) {
  let payload: Payload;
  try {
    payload = (await request.json()) as Payload;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const toUsername = payload?.toUsername?.trim();
  if (!toUsername) {
    return Response.json(
      { ok: false, error: "Missing/invalid toUsername." },
      { status: 400 },
    );
  }

  const fromUser = await getSessionUser(request);
  if (!fromUser) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  if (fromUser.username === toUsername) {
    return Response.json(
      { ok: false, error: "You cannot send a friend request to yourself." },
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

  const { data: targetUser, error: targetError } = await supabase
    .from("users")
    .select("id,username")
    .eq("username", toUsername)
    .maybeSingle();

  if (targetError) {
    return Response.json({ ok: false, error: targetError.message }, { status: 500 });
  }

  if (!targetUser) {
    return Response.json({ ok: false, error: "User not found." }, { status: 404 });
  }

  const { error: insertError } = await supabase.from("friend_requests").insert({
    from_user_id: fromUser.id,
    to_user_id: targetUser.id,
    status: "pending",
  });

  if (insertError) {
    // Common case: duplicate request (unique constraint)
    const code = (insertError as unknown as { code?: string }).code;
    if (code === "23505") {
      return Response.json({ ok: true, created: false });
    }
    return Response.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  return Response.json({ ok: true, created: true });
}

export async function PATCH(request: Request) {
  let payload: RespondPayload;
  try {
    payload = (await request.json()) as RespondPayload;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const id = payload?.id?.trim();
  const action = payload?.action;
  if (!id || (action !== "accept" && action !== "decline")) {
    return Response.json(
      { ok: false, error: "Missing/invalid id or action." },
      { status: 400 },
    );
  }

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

  const nextStatus = action === "accept" ? "accepted" : "rejected";

  const { data: updated, error } = await supabase
    .from("friend_requests")
    .update({ status: nextStatus })
    .eq("id", id)
    .eq("to_user_id", me.id)
    .eq("status", "pending")
    .select("id,status")
    .maybeSingle();

  if (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!updated) {
    return Response.json(
      { ok: false, error: "Request not found (or already handled)." },
      { status: 404 },
    );
  }

  return Response.json({ ok: true, status: updated.status as string });
}
