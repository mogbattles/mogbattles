"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { createArena } from "@/lib/arenas";
import Link from "next/link";

export default function NewArenaPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [arenaType, setArenaType] = useState<"fixed" | "open" | "request">("fixed");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "#8B5CF6", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] px-4 text-center">
        <div className="text-4xl mb-4">🔒</div>
        <h2 className="text-white font-black text-xl mb-2">Sign in required</h2>
        <p className="text-sm mb-6" style={{ color: "#4A4A66" }}>
          You need to be signed in to create an arena.
        </p>
        <Link
          href="/profile"
          className="btn-purple font-bold px-6 py-3 rounded-xl transition-colors"
        >
          Sign In →
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Arena name is required.");
      return;
    }
    setSubmitting(true);
    setError(null);

    const { data, error: createError } = await createArena({
      name: name.trim(),
      description: description.trim(),
      visibility,
      arena_type: arenaType,
      creator_id: user.id,
    });

    if (createError || !data) {
      setError(createError ?? "Something went wrong. Please try again.");
      setSubmitting(false);
      return;
    }

    router.push(`/arenas/${data.slug}/manage`);
  };

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <div className="mb-8">
        <Link href="/swipe" className="text-xs" style={{ color: "#4A4A66" }}>
          ← Back
        </Link>
        <h1 className="text-3xl font-black text-white mt-3">Create Arena</h1>
        <p className="text-sm mt-1" style={{ color: "#4A4A66" }}>
          Build your own mogging community.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name */}
        <div>
          <label className="block font-semibold text-sm mb-2" style={{ color: "#ccc" }}>
            Arena Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Chess Players, F1 Drivers, K-Pop Idols…"
            maxLength={60}
            className="w-full rounded-xl px-4 py-3 text-white focus:outline-none transition-colors"
            style={{ background: "#0F0F1A", border: "1px solid #222233", caretColor: "#8B5CF6" }}
            onFocus={(e) => { (e.target as HTMLElement).style.borderColor = "rgba(139,92,246,0.5)"; }}
            onBlur={(e) => { (e.target as HTMLElement).style.borderColor = "#222233"; }}
          />
        </div>

        {/* Description */}
        <div>
          <label className="block font-semibold text-sm mb-2" style={{ color: "#ccc" }}>
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this arena about?"
            rows={2}
            className="w-full rounded-xl px-4 py-3 text-white focus:outline-none transition-colors resize-none"
            style={{ background: "#0F0F1A", border: "1px solid #222233", caretColor: "#8B5CF6" }}
            onFocus={(e) => { (e.target as HTMLElement).style.borderColor = "rgba(139,92,246,0.5)"; }}
            onBlur={(e) => { (e.target as HTMLElement).style.borderColor = "#222233"; }}
          />
        </div>

        {/* Visibility */}
        <div>
          <label className="block font-semibold text-sm mb-3" style={{ color: "#ccc" }}>
            Visibility
          </label>
          <div className="grid grid-cols-2 gap-3">
            {(["public", "private"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVisibility(v)}
                className="py-3 px-4 rounded-xl border-2 text-sm font-bold transition-all"
                style={
                  visibility === v
                    ? { borderColor: "rgba(139,92,246,0.5)", background: "rgba(139,92,246,0.1)", color: "#A78BFA" }
                    : { borderColor: "#222233", background: "#0F0F1A", color: "#4A4A66" }
                }
              >
                {v === "public" ? "🌍 Public" : "🔒 Private"}
                <p className="font-normal text-xs mt-0.5" style={{ color: visibility === v ? "rgba(167,139,250,0.7)" : "#2A2A3D" }}>
                  {v === "public" ? "Anyone can find it" : "Invite link only"}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Arena type */}
        <div>
          <label className="block font-semibold text-sm mb-3" style={{ color: "#ccc" }}>
            Who can join?
          </label>
          <div className="space-y-2">
            {(
              [
                { value: "fixed", label: "Fixed list", desc: "You add/remove people manually" },
                { value: "open",  label: "Open",       desc: "Anyone can add themselves" },
                { value: "request", label: "Request only", desc: "People request to join, you approve" },
              ] as const
            ).map(({ value, label, desc }) => (
              <button
                key={value}
                type="button"
                onClick={() => setArenaType(value)}
                className="w-full text-left py-3 px-4 rounded-xl border-2 text-sm transition-all"
                style={
                  arenaType === value
                    ? { borderColor: "rgba(139,92,246,0.5)", background: "rgba(139,92,246,0.1)" }
                    : { borderColor: "#222233", background: "#0F0F1A" }
                }
              >
                <span className="font-bold" style={{ color: arenaType === value ? "#A78BFA" : "#ccc" }}>
                  {label}
                </span>
                <span className="block text-xs mt-0.5" style={{ color: arenaType === value ? "rgba(167,139,250,0.7)" : "#2A2A3D" }}>
                  {desc}
                </span>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-sm" style={{ color: "#EF4444" }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn-purple gold-pulse-btn w-full font-black py-4 rounded-xl transition-colors text-base disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create Arena →"}
        </button>
      </form>
    </div>
  );
}
