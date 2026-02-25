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
        <div className="text-zinc-400 animate-pulse">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] px-4 text-center">
        <div className="text-4xl mb-4">🔒</div>
        <h2 className="text-white font-black text-xl mb-2">Sign in required</h2>
        <p className="text-zinc-500 text-sm mb-6">
          You need to be signed in to create an arena.
        </p>
        <Link
          href="/profile"
          className="bg-orange-500 hover:bg-orange-400 text-white font-bold px-6 py-3 rounded-xl transition-colors"
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
        <Link href="/swipe" className="text-zinc-500 hover:text-zinc-300 text-xs">
          ← Back
        </Link>
        <h1 className="text-3xl font-black text-white mt-3">Create Arena</h1>
        <p className="text-zinc-500 text-sm mt-1">
          Build your own mogging community.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Name */}
        <div>
          <label className="block text-zinc-300 font-semibold text-sm mb-2">
            Arena Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Chess Players, F1 Drivers, K-Pop Idols…"
            maxLength={60}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500 transition-colors"
          />
        </div>

        {/* Description */}
        <div>
          <label className="block text-zinc-300 font-semibold text-sm mb-2">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this arena about?"
            rows={2}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500 transition-colors resize-none"
          />
        </div>

        {/* Visibility */}
        <div>
          <label className="block text-zinc-300 font-semibold text-sm mb-3">
            Visibility
          </label>
          <div className="grid grid-cols-2 gap-3">
            {(["public", "private"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setVisibility(v)}
                className={`
                  py-3 px-4 rounded-xl border-2 text-sm font-bold transition-all
                  ${visibility === v
                    ? "border-orange-500 bg-orange-500/10 text-orange-400"
                    : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:border-zinc-500"
                  }
                `}
              >
                {v === "public" ? "🌍 Public" : "🔒 Private"}
                <p className={`font-normal text-xs mt-0.5 ${visibility === v ? "text-orange-400/70" : "text-zinc-600"}`}>
                  {v === "public" ? "Anyone can find it" : "Invite link only"}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Arena type */}
        <div>
          <label className="block text-zinc-300 font-semibold text-sm mb-3">
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
                className={`
                  w-full text-left py-3 px-4 rounded-xl border-2 text-sm transition-all
                  ${arenaType === value
                    ? "border-orange-500 bg-orange-500/10"
                    : "border-zinc-700 bg-zinc-900 hover:border-zinc-500"
                  }
                `}
              >
                <span className={`font-bold ${arenaType === value ? "text-orange-400" : "text-zinc-300"}`}>
                  {label}
                </span>
                <span className={`block text-xs mt-0.5 ${arenaType === value ? "text-orange-400/70" : "text-zinc-600"}`}>
                  {desc}
                </span>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="text-red-400 text-sm">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full bg-orange-500 hover:bg-orange-400 disabled:opacity-50 text-white font-black py-4 rounded-xl transition-colors text-base"
        >
          {submitting ? "Creating…" : "Create Arena →"}
        </button>
      </form>
    </div>
  );
}
