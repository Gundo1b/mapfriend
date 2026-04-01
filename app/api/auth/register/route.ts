import { getSupabaseAdmin } from "../../../lib/supabaseAdmin";
import { createSession, hashPassword } from "../../../lib/auth";

type RegisterPayload = {
  username: string;
  password: string;
  purpose: "friends" | "hangout" | "hookup" | "social";
  bio?: string;
  location?: { lat: number; lng: number; accuracy?: number };
};

const PURPOSES = new Set(["friends", "hangout", "hookup", "social"] as const);

export async function POST(request: Request) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return Response.json(
      { ok: false, error: "Supabase is not configured on the server." },
      { status: 500 },
    );
  }

  let payload: RegisterPayload;
  let avatarFile: File | null = null;
  let bio = "";

  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      payload = {
        username: formData.get("username")?.toString() ?? "",
        password: formData.get("password")?.toString() ?? "",
        purpose: formData.get("purpose")?.toString() as RegisterPayload["purpose"],
      };
      bio = formData.get("bio")?.toString() ?? "";
      const avatar = formData.get("avatarFile");
      if (avatar instanceof File) {
        avatarFile = avatar;
      }

      const latValue = formData.get("lat")?.toString();
      const lngValue = formData.get("lng")?.toString();
      const accuracyValue = formData.get("accuracy")?.toString();
      const lat = latValue ? Number(latValue) : undefined;
      const lng = lngValue ? Number(lngValue) : undefined;
      const accuracy = accuracyValue ? Number(accuracyValue) : undefined;
      if (
        typeof lat === "number" &&
        !Number.isNaN(lat) &&
        typeof lng === "number" &&
        !Number.isNaN(lng)
      ) {
        payload.location = { lat, lng, accuracy };
      }
    } else {
      payload = (await request.json()) as RegisterPayload;
      bio = payload?.bio ?? "";
    }
  } catch {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const username = payload?.username?.trim();
  const password = payload?.password ?? "";
  const purpose = payload?.purpose;
  const location = payload?.location;

  if (!username || username.length < 3 || username.length > 24) {
    return Response.json(
      { ok: false, error: "Username must be 3–24 characters." },
      { status: 400 },
    );
  }
  if (password.length < 6 || password.length > 128) {
    return Response.json(
      { ok: false, error: "Password must be at least 6 characters." },
      { status: 400 },
    );
  }
  if (!purpose || !PURPOSES.has(purpose)) {
    return Response.json({ ok: false, error: "Invalid purpose." }, { status: 400 });
  }

  const bioValue = typeof bio === "string" ? bio.trim() : "";
  if (!bioValue) {
    return Response.json({ ok: false, error: "Bio is required to register." }, { status: 400 });
  }

  if (!avatarFile) {
    return Response.json({ ok: false, error: "Profile photo is required to register." }, { status: 400 });
  }

  const bucket = "avatars";
  const filename = `${username}-${Date.now()}-${avatarFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  let { error: uploadError } = await supabase
    .storage
    .from(bucket)
    .upload(filename, avatarFile, { upsert: true });

  if (uploadError) {
    const shouldCreateBucket =
      uploadError.status === 404 ||
      uploadError.message?.toLowerCase().includes("bucket not found") ||
      uploadError.message?.toLowerCase().includes("not found");

    if (shouldCreateBucket) {
      const { error: createError } = await supabase.storage.createBucket(bucket, { public: true });
      if (createError && createError.status !== 409) {
        return Response.json(
          { ok: false, error: createError.message || "Failed to create avatar bucket." },
          { status: 500 },
        );
      }
      const retry = await supabase.storage.from(bucket).upload(filename, avatarFile, { upsert: true });
      uploadError = retry.error;
    }
  }

  if (uploadError) {
    return Response.json({ ok: false, error: uploadError.message || "Avatar upload failed." }, { status: 500 });
  }

  const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filename);
  if (!publicUrlData?.publicUrl) {
    return Response.json({ ok: false, error: "Failed to generate public avatar URL." }, { status: 500 });
  }

  const avatarUrl = publicUrlData.publicUrl;

  const lat = location?.lat;
  const lng = location?.lng;
  const accuracy = location?.accuracy;
  const hasValidLocation =
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    typeof lng === "number" &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180;

  if (!hasValidLocation) {
    return Response.json(
      { ok: false, error: "Location is required to register." },
      { status: 400 },
    );
  }

  const { data: existing, error: existingError } = await supabase
    .from("users")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (existingError) {
    return Response.json({ ok: false, error: existingError.message }, { status: 500 });
  }
  if (existing) {
    return Response.json(
      { ok: false, error: "Username already exists." },
      { status: 409 },
    );
  }

  const passwordHash = hashPassword(password);

  const { data: inserted, error: insertError } = await supabase
    .from("users")
    .insert({
      username,
      password_hash: passwordHash,
      purpose,
      bio: bioValue,
      avatar_url: avatarUrl,
    })
    .select("id,username,purpose,gender,avatar_url,bio")
    .single();

  if (insertError) {
    await supabase.storage.from("avatars").remove([filename]).catch(() => null);
    return Response.json({ ok: false, error: insertError.message }, { status: 500 });
  }

  const { error: locationError } = await supabase.from("locations").insert({
    user_id: inserted.id,
    lat,
    lng,
    accuracy: typeof accuracy === "number" && Number.isFinite(accuracy) ? accuracy : null,
  });

  if (locationError) {
    await supabase.from("users").delete().eq("id", inserted.id);
    await supabase.storage.from("avatars").remove([filename]).catch(() => null);
    return Response.json({ ok: false, error: locationError.message }, { status: 500 });
  }

  const token = await createSession(inserted.id);

  return Response.json({ ok: true, token, user: inserted });
}
