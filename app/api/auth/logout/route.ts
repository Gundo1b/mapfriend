import { clearSessionCookie, getSessionUser } from "../../../lib/auth";
import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { cookies } from "next/headers";

export async function POST() {
  const supabase = getSupabaseAdmin();
  const token = (await cookies()).get("mf_session")?.value;

  const user = await getSessionUser();

  if (supabase && token && user) {
    await supabase.from("sessions").delete().eq("token", token);
  }

  await clearSessionCookie();
  return Response.json({ ok: true });
}

