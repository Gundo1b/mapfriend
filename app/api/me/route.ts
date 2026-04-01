import { getSessionUser } from "../../lib/auth";
import { getSupabaseAdmin } from "../../lib/supabaseAdmin";

export async function GET(request: Request) {
  const user = await getSessionUser(request);
  return Response.json({ ok: true, user });
}

type PatchPayload = {
  gender?: string;
  avatarUrl?: string;
  avatar_url?: string;
  bio?: string;
};

const ALLOWED_GENDERS = new Set(["male", "female", "nonbinary", "other", "prefer_not_say"]);
const BIO_MAX_CHARS = 280;
const AVATAR_URL_MAX_CHARS = 500;

function normalizeAvatarUrl(value: unknown): string | null | undefined {
  if (typeof value === "undefined") return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > AVATAR_URL_MAX_CHARS) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

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

  let payload: PatchPayload | null = null;
  let avatarFile: File | null = null;

  try {
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      payload = {
        gender: formData.get("gender")?.toString(),
        avatarUrl: formData.get("avatarUrl")?.toString(),
        avatar_url: formData.get("avatar_url")?.toString(),
        bio: formData.get("bio")?.toString(),
      };
      const avatar = formData.get("avatarFile");
      if (avatar instanceof File) {
        avatarFile = avatar;
      }
    } else {
      payload = (await request.json()) as PatchPayload;
    }
  } catch {
    return Response.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const genderValue = typeof payload?.gender === "string" ? payload.gender.trim() : undefined;
  const avatarUrl = normalizeAvatarUrl(payload?.avatarUrl ?? payload?.avatar_url);
  const bioValue = typeof payload?.bio === "string" ? payload.bio.trim() : undefined;

  const updates: Record<string, unknown> = {};

  if (typeof genderValue !== "undefined") {
    if (!genderValue || !ALLOWED_GENDERS.has(genderValue)) {
      return Response.json({ ok: false, error: "Invalid gender." }, { status: 400 });
    }
    updates.gender = genderValue;
  }

  if (avatarFile) {
    const bucket = "avatars";
    const filename = `${user.id}-${Date.now()}-${avatarFile.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
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
        const result = await supabase.storage.from(bucket).upload(filename, avatarFile, { upsert: true });
        uploadError = result.error;
      }
    }

    if (uploadError) {
      return Response.json({ ok: false, error: uploadError.message || "Avatar upload failed." }, { status: 500 });
    }

    const { data: publicUrlData } = supabase.storage.from(bucket).getPublicUrl(filename);
    if (!publicUrlData?.publicUrl) {
      return Response.json({ ok: false, error: "Failed to generate public avatar URL." }, { status: 500 });
    }

    updates.avatar_url = publicUrlData.publicUrl;
  } else if (typeof avatarUrl !== "undefined") {
    if (avatarUrl === null) {
      updates.avatar_url = null;
    } else {
      updates.avatar_url = avatarUrl;
    }
  }

  if (typeof bioValue !== "undefined") {
    if (!bioValue) {
      updates.bio = null;
    } else if (bioValue.length > BIO_MAX_CHARS) {
      return Response.json(
        { ok: false, error: `Bio must be ${BIO_MAX_CHARS} characters or less.` },
        { status: 400 },
      );
    } else {
      updates.bio = bioValue;
    }
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ ok: false, error: "No updates provided." }, { status: 400 });
  }

  const { error } = await supabase.from("users").update(updates).eq("id", user.id);
  if (error) {
    const msg = error.message || "Failed.";
    if (
      msg.includes("avatar_url") ||
      msg.includes("bio") ||
      msg.toLowerCase().includes("column") ||
      msg.toLowerCase().includes("does not exist")
    ) {
      return Response.json(
        {
          ok: false,
          error:
            "Database schema is missing profile fields. Re-run the latest `supabase/locations.sql` to add `avatar_url` and `bio` columns.",
        },
        { status: 500 },
      );
    }
    return Response.json({ ok: false, error: msg }, { status: 500 });
  }

  return Response.json({ ok: true });
}
