import { clearSessionCookie, getSessionUser } from "../../../lib/auth";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { cookies } from "next/headers";

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  const authHeader = request.headers.get("authorization");
  const bearer = authHeader?.match(/^Bearer\\s+(.+)$/i)?.[1]?.trim() ?? null;
  const token = bearer || (await cookies()).get("mf_session")?.value;

  const user = await getSessionUser(request);

  if (supabase && token && user) {
    await supabase.from("sessions").delete().eq("token", token);
  }

  await clearSessionCookie();
  return Response.json({ ok: true });
}
