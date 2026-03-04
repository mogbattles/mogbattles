"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth, usePermissions } from "@/context/AuthContext";
import { createArena } from "@/lib/arenas";
import { getCategoryChildren } from "@/lib/categories";
import type { CategoryRow } from "@/lib/supabase";
import Link from "next/link";

export default function NewArenaPage() {
  const { user, loading } = useAuth();
  const permissions = usePermissions();
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [arenaType, setArenaType] = useState<"fixed" | "open" | "request">("fixed");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<CategoryRow[]>([]);
  const [arenaTier, setArenaTier] = useState<"official" | "moderator" | "custom">("custom");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [rootCategories, setRootCategories] = useState<CategoryRow[]>([]);
  const [selectedRoot, setSelectedRoot] = useState<CategoryRow | null>(null);

  // Load categories for the picker — show Men/Women tabs
  // If there's a single hidden root (e.g. "Humans"), skip it and show its children.
  useEffect(() => {
    getCategoryChildren(null).then(async (roots) => {
      let tabs = roots;
      if (roots.length === 1) {
        const children = await getCategoryChildren(roots[0].id);
        if (children.length > 0) tabs = children;
      }
      setRootCategories(tabs);
      if (tabs.length > 0) {
        setSelectedRoot(tabs[0]);
        getCategoryChildren(tabs[0].id).then(setCategoryOptions);
      }
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] px-4 text-center">
        <div className="text-4xl mb-4">🔒</div>
        <h2 className="text-[color:var(--text-primary)] font-black text-xl mb-2">Sign in required</h2>
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
          You need to be signed in to create an arena.
        </p>
        <Link
          href="/profile"
          className="btn-accent font-bold px-6 py-3 rounded-xl transition-colors"
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
      thumbnail_url: thumbnailUrl.trim() || null,
      category_id: categoryId,
      arena_tier: arenaTier,
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
        <Link href="/swipe" className="text-xs" style={{ color: "var(--text-muted)" }}>
          ← Back
        </Link>
        <h1 className="text-3xl font-black text-[color:var(--text-primary)] mt-3">Create Arena</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
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
            className="w-full rounded-xl px-4 py-3 text-[color:var(--text-primary)] focus:outline-none transition-colors"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", caretColor: "var(--accent)" }}
            onFocus={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border-hover)"; }}
            onBlur={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
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
            className="w-full rounded-xl px-4 py-3 text-[color:var(--text-primary)] focus:outline-none transition-colors resize-none"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", caretColor: "var(--accent)" }}
            onFocus={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border-hover)"; }}
            onBlur={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
          />
        </div>

        {/* Thumbnail URL */}
        <div>
          <label className="block font-semibold text-sm mb-2" style={{ color: "#ccc" }}>
            Cover Image URL
          </label>
          <input
            type="url"
            value={thumbnailUrl}
            onChange={(e) => setThumbnailUrl(e.target.value)}
            placeholder="https://example.com/image.jpg"
            className="w-full rounded-xl px-4 py-3 text-[color:var(--text-primary)] focus:outline-none transition-colors text-sm"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", caretColor: "var(--accent)" }}
            onFocus={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border-hover)"; }}
            onBlur={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
          />
          <p className="text-[10px] mt-1.5" style={{ color: "var(--text-faint)" }}>
            Paste an image URL for the arena card thumbnail. Leave blank for default.
          </p>
          {thumbnailUrl && (
            <div className="mt-3 rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", maxHeight: "140px" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={thumbnailUrl}
                alt="Preview"
                className="w-full h-full object-cover"
                style={{ maxHeight: "140px" }}
                onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
              />
            </div>
          )}
        </div>

        {/* Category */}
        {(rootCategories.length > 0 || categoryOptions.length > 0) && (
          <div>
            <label className="block font-semibold text-sm mb-2" style={{ color: "#ccc" }}>
              Category
            </label>
            {/* Root category tabs */}
            {rootCategories.length > 1 && (
              <div className="flex gap-2 mb-3">
                {rootCategories.map((root) => (
                  <button
                    key={root.id}
                    type="button"
                    onClick={() => {
                      setSelectedRoot(root);
                      setCategoryId(null);
                      getCategoryChildren(root.id).then(setCategoryOptions);
                    }}
                    className="px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all"
                    style={selectedRoot?.id === root.id ? {
                      background: "var(--bg-elevated)",
                      color: "var(--text-primary)",
                      border: "1px solid var(--border-hover)",
                    } : {
                      background: "var(--bg-card)",
                      color: "var(--text-muted)",
                      border: "1px solid var(--border)",
                    }}>
                    {root.icon ? `${root.icon} ` : ""}{root.name}
                  </button>
                ))}
              </div>
            )}
            {/* Single root label */}
            {rootCategories.length === 1 && selectedRoot && (
              <p className="text-xs font-black uppercase tracking-wider mb-2" style={{ color: "var(--text-secondary)" }}>
                {selectedRoot.icon ? `${selectedRoot.icon} ` : ""}{selectedRoot.name}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setCategoryId(null)}
                className="px-3 py-2 rounded-xl text-xs font-bold transition-all"
                style={!categoryId ? {
                  background: "var(--bg-elevated)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border-hover)",
                } : {
                  background: "var(--bg-card)",
                  color: "var(--text-muted)",
                  border: "1px solid var(--border)",
                }}>
                None
              </button>
              {categoryOptions.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategoryId(cat.id)}
                  className="px-3 py-2 rounded-xl text-xs font-bold transition-all"
                  style={categoryId === cat.id ? {
                    background: "var(--bg-elevated)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border-hover)",
                  } : {
                    background: "var(--bg-card)",
                    color: "var(--text-muted)",
                    border: "1px solid var(--border)",
                  }}>
                  {cat.icon ? `${cat.icon} ` : ""}{cat.name}
                </button>
              ))}
            </div>
            <p className="text-[10px] mt-1.5" style={{ color: "var(--text-faint)" }}>
              Pick a category so people can find your arena when browsing.
            </p>
          </div>
        )}

        {/* Arena Tier (only for moderator+ users) */}
        {(permissions.canCreateOfficialArena || permissions.canCreateModeratorArena) && (
          <div>
            <label className="block font-semibold text-sm mb-3" style={{ color: "#ccc" }}>
              Arena Tier
            </label>
            <div className="space-y-2">
              {permissions.canCreateOfficialArena && (
                <button
                  type="button"
                  onClick={() => setArenaTier("official")}
                  className="w-full text-left py-3 px-4 rounded-xl border-2 text-sm transition-all"
                  style={
                    arenaTier === "official"
                      ? { borderColor: "rgba(240,192,64,0.5)", background: "rgba(240,192,64,0.1)" }
                      : { borderColor: "var(--border)", background: "var(--bg-card)" }
                  }
                >
                  <span className="font-bold" style={{ color: arenaTier === "official" ? "#F0C040" : "#ccc" }}>
                    👑 Official
                  </span>
                  <span className="block text-xs mt-0.5" style={{ color: arenaTier === "official" ? "rgba(240,192,64,0.7)" : "var(--text-faint)" }}>
                    Admin-created. Always affects global ELO economy.
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setArenaTier("moderator")}
                className="w-full text-left py-3 px-4 rounded-xl border-2 text-sm transition-all"
                style={
                  arenaTier === "moderator"
                    ? { borderColor: "rgba(59,130,246,0.5)", background: "rgba(59,130,246,0.1)" }
                    : { borderColor: "var(--border)", background: "var(--bg-card)" }
                }
              >
                <span className="font-bold" style={{ color: arenaTier === "moderator" ? "#60A5FA" : "#ccc" }}>
                  🛡️ Moderator
                </span>
                <span className="block text-xs mt-0.5" style={{ color: arenaTier === "moderator" ? "rgba(96,165,250,0.7)" : "var(--text-faint)" }}>
                  Trusted arena. Affects category-level ELO economy.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setArenaTier("custom")}
                className="w-full text-left py-3 px-4 rounded-xl border-2 text-sm transition-all"
                style={
                  arenaTier === "custom"
                    ? { borderColor: "var(--border-hover)", background: "rgba(0,0,0,0.2)" }
                    : { borderColor: "var(--border)", background: "var(--bg-card)" }
                }
              >
                <span className="font-bold" style={{ color: arenaTier === "custom" ? "var(--text-secondary)" : "#ccc" }}>
                  🎮 Custom
                </span>
                <span className="block text-xs mt-0.5" style={{ color: arenaTier === "custom" ? "var(--text-muted)" : "var(--text-faint)" }}>
                  Community arena. Relative ELO only — does not affect global rankings.
                </span>
              </button>
            </div>
          </div>
        )}

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
                    ? { borderColor: "var(--border-hover)", background: "rgba(0,0,0,0.2)", color: "var(--text-secondary)" }
                    : { borderColor: "var(--border)", background: "var(--bg-card)", color: "var(--text-muted)" }
                }
              >
                {v === "public" ? "🌍 Public" : "🔒 Private"}
                <p className="font-normal text-xs mt-0.5" style={{ color: visibility === v ? "var(--text-muted)" : "var(--text-faint)" }}>
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
                    ? { borderColor: "var(--border-hover)", background: "rgba(0,0,0,0.2)" }
                    : { borderColor: "var(--border)", background: "var(--bg-card)" }
                }
              >
                <span className="font-bold" style={{ color: arenaType === value ? "var(--text-secondary)" : "#ccc" }}>
                  {label}
                </span>
                <span className="block text-xs mt-0.5" style={{ color: arenaType === value ? "var(--text-muted)" : "var(--text-faint)" }}>
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
          className="btn-accent gold-pulse-btn w-full font-black py-4 rounded-xl transition-colors text-base disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create Arena →"}
        </button>
      </form>
    </div>
  );
}
