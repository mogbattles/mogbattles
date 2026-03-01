"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { useAuth } from "@/context/AuthContext";
import { COUNTRIES, codeToFlag } from "@/lib/countries";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useDb() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) as any;
}

// Height helpers
function inchesToDisplay(totalInches: number): string {
  const ft = Math.floor(totalInches / 12);
  const ins = totalInches % 12;
  return `${ft}'${ins}"`;
}

const FEET_OPTIONS = [4, 5, 6, 7];
const INCH_OPTIONS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

interface PhotoSlot {
  file: File | null;
  preview: string;
}
const EMPTY_SLOT: PhotoSlot = { file: null, preview: "" };

// ─── Country search dropdown ─────────────────────────────────────────────────

function CountryPicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (name: string) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync display when external value changes (e.g. on reset)
  useEffect(() => { setQuery(value); }, [value]);

  const filtered = query.trim()
    ? COUNTRIES.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : [];

  function select(name: string) {
    setQuery(name);
    onChange(name);
    setOpen(false);
  }

  // Close on outside click
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        {/* Flag preview inside input */}
        {value && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg pointer-events-none select-none">
            {codeToFlag(COUNTRIES.find((c) => c.name === value)?.code ?? "")}
          </span>
        )}
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            onChange(""); // clear confirmed selection while typing
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search country…"
          disabled={disabled}
          className={`w-full rounded-xl py-3 text-white focus:outline-none transition-colors disabled:opacity-50 ${value ? "pl-10 pr-4" : "px-4"}`}
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", caretColor: "var(--accent)" }}
          onFocusCapture={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border-hover)"; }}
          onBlurCapture={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
        />
      </div>

      {open && filtered.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-xl overflow-hidden shadow-xl max-h-64 overflow-y-auto"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          {filtered.map((c) => (
            <li key={c.code}>
              <button
                type="button"
                onMouseDown={() => select(c.name)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                style={{ color: "#fff" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-card)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                <span className="text-xl shrink-0">{codeToFlag(c.code)}</span>
                <span className="text-sm">{c.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function OnboardingPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = useDb();

  const [checking, setChecking] = useState(true);

  // Form fields
  const [name, setName] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other" | "">("");
  const [heightFt, setHeightFt] = useState(5);
  const [heightIn, setHeightIn] = useState(10);
  const [weightLbs, setWeightLbs] = useState("");
  const [country, setCountry] = useState("");
  const [photos, setPhotos] = useState<PhotoSlot[]>([
    { ...EMPTY_SLOT }, { ...EMPTY_SLOT }, { ...EMPTY_SLOT }, { ...EMPTY_SLOT },
  ]);

  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState("");
  const [error, setError] = useState<string | null>(null);

  const fileRefs = useRef<(HTMLInputElement | null)[]>([null, null, null, null]);

  // Redirect if not logged in; skip if already onboarded
  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/profile"); return; }

    supabase
      .from("profiles")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }: { data: { id: string } | null }) => {
        if (data) {
          router.push("/profile");
        } else {
          const prefix = user.email?.split("@")[0] ?? "";
          setName(prefix);
          setChecking(false);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  function handleFileSelect(idx: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const preview = URL.createObjectURL(file);
    setPhotos((prev) => {
      const next = [...prev];
      next[idx] = { file, preview };
      return next;
    });
    e.target.value = "";
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => {
      const next = [...prev];
      URL.revokeObjectURL(next[idx].preview);
      next[idx] = { ...EMPTY_SLOT };
      for (let i = idx; i < next.length - 1; i++) {
        next[i] = next[i + 1];
        next[i + 1] = { ...EMPTY_SLOT };
      }
      return next;
    });
  }

  const hasPhoto = photos.some((p) => p.file !== null);
  const totalHeightIn = heightFt * 12 + heightIn;

  async function handleSubmit() {
    setError(null);
    if (!name.trim())     { setError("Display name is required."); return; }
    if (!gender)          { setError("Please select your gender."); return; }
    if (!weightLbs || parseFloat(weightLbs) <= 0) { setError("Please enter your weight."); return; }
    if (!country.trim())  { setError("Please select your country."); return; }
    if (!hasPhoto)        { setError("Upload at least one photo."); return; }

    setUploading(true);

    const imageUrls: string[] = [];
    for (let i = 0; i < photos.length; i++) {
      const slot = photos[i];
      if (!slot.file) continue;
      setUploadStep(`Uploading photo ${i + 1}…`);
      const ext = slot.file.name.split(".").pop() ?? "jpg";
      const path = `${user!.id}/${Date.now()}-${i}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("profile-images")
        .upload(path, slot.file, { cacheControl: "3600", upsert: false });
      if (upErr) {
        setError(`Photo ${i + 1} upload failed: ${upErr.message}`);
        setUploading(false);
        setUploadStep("");
        return;
      }
      const { data: urlData } = supabase.storage.from("profile-images").getPublicUrl(path);
      imageUrls.push(urlData.publicUrl);
    }

    setUploadStep("Creating your profile…");

    const { data: insertedProfile, error: insertErr } = await supabase
      .from("profiles")
      .insert({
        name: name.trim(),
        category: null,
        image_url: imageUrls[0] ?? null,
        image_urls: imageUrls,
        user_id: user!.id,
        is_test_profile: false,
        elo_rating: 1200,
        total_wins: 0,
        total_losses: 0,
        total_matches: 0,
        gender,
        height_in: totalHeightIn,
        weight_lbs: parseFloat(weightLbs),
        country: country.trim(),
      })
      .select("id")
      .single();

    if (insertErr) {
      setError(`Failed to create profile: ${insertErr.message}`);
      setUploading(false);
      setUploadStep("");
      return;
    }

    // ── Insert into "all", "members", and root gender arena so new users appear on leaderboard immediately
    setUploadStep("Joining the arena…");
    const [{ data: allArena }, { data: membersArena }] = await Promise.all([
      supabase.from("arenas").select("id").eq("slug", "all").maybeSingle(),
      supabase.from("arenas").select("id").eq("slug", "members").maybeSingle(),
    ]);

    // Determine root gender arena (men/women) based on selected gender
    const rootGenderSlug = gender === "female" ? "women" : "men";
    const { data: rootGenderArena } = await supabase
      .from("arenas").select("id").eq("slug", rootGenderSlug).maybeSingle();

    const statsRows = [];
    if (allArena && insertedProfile) {
      statsRows.push({ arena_id: allArena.id, profile_id: insertedProfile.id, elo_rating: 1200, wins: 0, losses: 0, matches: 0 });
    }
    if (membersArena && insertedProfile) {
      statsRows.push({ arena_id: membersArena.id, profile_id: insertedProfile.id, elo_rating: 1200, wins: 0, losses: 0, matches: 0 });
    }
    if (rootGenderArena && insertedProfile) {
      statsRows.push({ arena_id: rootGenderArena.id, profile_id: insertedProfile.id, elo_rating: 1200, wins: 0, losses: 0, matches: 0 });
    }
    if (statsRows.length > 0) {
      await supabase.from("arena_profile_stats").insert(statsRows);
    }

    router.push("/profile?welcome=1");
  }

  if (authLoading || checking) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-10 pb-28">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="text-5xl mb-3">⚔️</div>
        <h1
          className="text-3xl font-black mb-1"
          style={{
            background: "linear-gradient(90deg, #FD297B 0%, #FF5864 40%, #FF655B 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Enter the Arena
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Set up your profile to join the battles and rankings
        </p>
      </div>

      <div className="space-y-6">

        {/* ── Display Name ─────────────────────────────────────────────────── */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
            Display Name <span style={{ color: "var(--accent)" }}>*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="How you appear in battles"
            maxLength={60}
            disabled={uploading}
            className="w-full rounded-xl px-4 py-3 text-white focus:outline-none transition-colors disabled:opacity-50"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", caretColor: "var(--accent)" }}
            onFocus={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border-hover)"; }}
            onBlur={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
          />
        </div>

        {/* ── Gender ───────────────────────────────────────────────────────── */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
            Gender <span style={{ color: "var(--accent)" }}>*</span>
          </label>
          <div className="flex gap-3">
            {(["male", "female", "other"] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGender(g)}
                disabled={uploading}
                className="flex-1 py-3 rounded-xl border font-bold text-sm transition-colors capitalize disabled:opacity-50"
                style={
                  gender === g
                    ? { background: "rgba(253,41,123,0.1)", border: "1px solid rgba(253,41,123,0.4)", color: "var(--accent)" }
                    : { background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-muted)" }
                }
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        {/* ── Height ───────────────────────────────────────────────────────── */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
            Height <span style={{ color: "var(--accent)" }}>*</span>
            {" "}
            <span className="font-normal normal-case" style={{ color: "var(--text-faint)" }}>
              — {inchesToDisplay(totalHeightIn)}
            </span>
          </label>
          <div className="flex gap-3">
            <div className="flex-1">
              <select
                value={heightFt}
                onChange={(e) => setHeightFt(Number(e.target.value))}
                disabled={uploading}
                className="w-full rounded-xl px-4 py-3 text-white focus:outline-none transition-colors disabled:opacity-50"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
              >
                {FEET_OPTIONS.map((f) => (
                  <option key={f} value={f}>{f} ft</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <select
                value={heightIn}
                onChange={(e) => setHeightIn(Number(e.target.value))}
                disabled={uploading}
                className="w-full rounded-xl px-4 py-3 text-white focus:outline-none transition-colors disabled:opacity-50"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
              >
                {INCH_OPTIONS.map((i) => (
                  <option key={i} value={i}>{i} in</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* ── Weight ───────────────────────────────────────────────────────── */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
            Weight (lbs) <span style={{ color: "var(--accent)" }}>*</span>
          </label>
          <input
            type="number"
            value={weightLbs}
            onChange={(e) => setWeightLbs(e.target.value)}
            placeholder="e.g. 175"
            min={50}
            max={500}
            disabled={uploading}
            className="w-full rounded-xl px-4 py-3 text-white focus:outline-none transition-colors disabled:opacity-50"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", caretColor: "var(--accent)" }}
            onFocus={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border-hover)"; }}
            onBlur={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
          />
        </div>

        {/* ── Country ──────────────────────────────────────────────────────── */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
            Country <span style={{ color: "var(--accent)" }}>*</span>
          </label>
          <CountryPicker
            value={country}
            onChange={setCountry}
            disabled={uploading}
          />
        </div>

        {/* ── Photos ───────────────────────────────────────────────────────── */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
            Photos <span style={{ color: "var(--accent)" }}>*</span>{" "}
            <span className="font-normal normal-case" style={{ color: "var(--text-faint)" }}>
              1–4 photos · clear face shots work best
            </span>
          </label>
          <div className="grid grid-cols-4 gap-2">
            {photos.map((slot, idx) => {
              const isLocked = idx > 0 && !photos[idx - 1].file;
              return (
                <div key={idx} className="aspect-[3/4] relative">
                  <input
                    ref={(el) => { fileRefs.current[idx] = el; }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileSelect(idx, e)}
                  />
                  {slot.preview ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={slot.preview}
                        alt={`Photo ${idx + 1}`}
                        className="w-full h-full object-cover rounded-xl"
                        style={{ border: "1px solid var(--border)" }}
                      />
                      <div className="absolute bottom-1 left-1 bg-black/70 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full">
                        {idx + 1}
                      </div>
                      <button
                        onClick={() => removePhoto(idx)}
                        disabled={uploading}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 text-white rounded-full flex items-center justify-center text-xs font-bold shadow-md transition-colors disabled:opacity-40"
                        style={{ background: "#EF4444" }}
                      >
                        ×
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => !isLocked && !uploading && fileRefs.current[idx]?.click()}
                      disabled={isLocked || uploading}
                      className="w-full h-full rounded-xl border-2 border-dashed transition-colors flex flex-col items-center justify-center gap-1"
                      style={
                        isLocked || uploading
                          ? { borderColor: "var(--bg-card)", opacity: 0.3, cursor: "not-allowed" }
                          : { borderColor: "var(--border)", cursor: "pointer" }
                      }
                      onMouseEnter={(e) => {
                        if (!isLocked && !uploading) (e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isLocked && !uploading) (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
                      }}
                    >
                      <span className="text-2xl" style={{ color: "var(--text-muted)" }}>+</span>
                      <span className="text-[10px] font-semibold" style={{ color: "var(--text-faint)" }}>{idx + 1}</span>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Error ────────────────────────────────────────────────────────── */}
        {error && (
          <p className="text-sm rounded-xl px-4 py-3" style={{ color: "#EF4444", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
            {error}
          </p>
        )}

        {/* ── Submit ───────────────────────────────────────────────────────── */}
        <button
          onClick={handleSubmit}
          disabled={uploading || !name.trim() || !gender || !country.trim() || !hasPhoto}
          className="btn-accent gold-pulse-btn w-full font-black py-4 rounded-xl transition-colors text-lg disabled:opacity-40"
        >
          {uploading ? uploadStep || "Uploading…" : "Enter the Arena ⚔️"}
        </button>

        <p className="text-xs text-center" style={{ color: "var(--text-faint)" }}>
          Your profile will be visible to all voters. Use photos of yourself that you own.
        </p>
      </div>
    </div>
  );
}
