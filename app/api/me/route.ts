import { getSessionUser } from "../../lib/auth";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  return Response.json({ ok: true, user });
}
