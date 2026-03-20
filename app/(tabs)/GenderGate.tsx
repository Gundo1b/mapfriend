"use client";

import { useEffect, useMemo, useState } from "react";

type Me = {
  id: string;
  username: string;
  purpose: string;
  gender?: string | null;
};

const GENDER_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "nonbinary", label: "Non-binary" },
  { value: "other", label: "Other" },
  { value: "prefer_not_say", label: "Prefer not to say" },
] as const;

export function GenderGate() {
  const [open, setOpen] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [gender, setGender] = useState<(typeof GENDER_OPTIONS)[number]["value"]>("prefer_not_say");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const shouldPrompt = useMemo(() => !!me && !me.gender, [me]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/me", { method: "GET" });
        const data = (await res.json().catch(() => null)) as
          | { ok: true; user: Me | null }
          | { ok: false; error: string }
          | null;

        if (cancelled) return;
        if (!res.ok || !data || !("ok" in data) || !data.ok) return;

        setMe(data.user);
      } catch {
        // ignore
      }
    }

    void load();

    function onFocus() {
      void load();
    }

    function onAuthChanged() {
      void load();
    }

    window.addEventListener("focus", onFocus);
    window.addEventListener("mf:auth-changed" as unknown as "focus", onAuthChanged);
    const interval = window.setInterval(() => {
      void load();
    }, 5_000);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("mf:auth-changed" as unknown as "focus", onAuthChanged);
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (shouldPrompt) setOpen(true);
    else setOpen(false);
  }, [shouldPrompt]);

  async function save() {
    if (!me) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gender }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; error: string }
        | null;

      if (!res.ok || !data || !("ok" in data) || !data.ok) {
        throw new Error((data as { error?: string } | null)?.error || "Failed.");
      }

      setMe((prev) => (prev ? { ...prev, gender } : prev));
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setSaving(false);
    }
  }

  if (!open || !me) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2500,
        background: "rgba(17, 24, 39, 0.55)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "white",
          borderRadius: 16,
          padding: 16,
          border: "1px solid rgba(0,0,0,0.08)",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>
          Choose your gender
        </div>
        <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 12 }}>
          This is required to finish setting up your profile.
        </div>

        <label style={{ display: "block", fontSize: 13, marginBottom: 6 }}>
          Gender
        </label>
        <select
          value={gender}
          onChange={(e) => setGender(e.target.value as typeof gender)}
          disabled={saving}
          style={{
            width: "100%",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.12)",
            marginBottom: 10,
            background: "white",
          }}
        >
          {GENDER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {error ? (
          <div style={{ color: "#b91c1c", fontSize: 13, marginBottom: 10 }}>
            {error}
          </div>
        ) : null}

        <button
          type="button"
          onClick={save}
          disabled={saving}
          style={{
            width: "100%",
            background: "#111827",
            color: "white",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            padding: "10px 12px",
            fontSize: 14,
            opacity: saving ? 0.7 : 1,
            cursor: saving ? "not-allowed" : "pointer",
          }}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}
