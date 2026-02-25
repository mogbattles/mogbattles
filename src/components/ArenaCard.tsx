"use client";

import Link from "next/link";

interface ArenaCardProps {
  name: string;
  slug: string;
  description: string | null;
  is_official: boolean;
  is_verified: boolean;
  player_count: number;
  mode: "swipe" | "leaderboard" | "explore";
  emoji?: string;
  variant?: "default" | "more";
}

export const ARENA_EMOJIS: Record<string, string> = {
  all: "🌍",
  members: "👥",
  friends: "🤝",
  "public-figures": "🎙️",
  actors: "🎬",
  looksmaxxers: "💎",
  "psl-icons": "👁",
  singers: "🎵",
  athletes: "🏆",
  streamers: "📺",
  politicians: "🏛️",
  "political-commentators": "🎙",
  models: "👗",
};

export default function ArenaCard({
  name,
  slug,
  description,
  is_official,
  is_verified,
  player_count,
  mode,
  emoji,
  variant = "default",
}: ArenaCardProps) {
  const icon = emoji ?? ARENA_EMOJIS[slug] ?? "⚔️";

  // ── "More arenas" wide card ─────────────────────────────────────────────────
  if (variant === "more") {
    return (
      <Link
        href="/explore"
        className="group col-span-2 block rounded-2xl p-5 relative overflow-hidden transition-all duration-200 active:scale-[0.99]"
        style={{ background: "linear-gradient(90deg, #141A2C 0%, #0C1020 100%)", border: "1px solid #1B2338" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "#F0C040";
          (e.currentTarget as HTMLElement).style.boxShadow = "0 0 20px rgba(240,192,64,0.10)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "#1B2338";
          (e.currentTarget as HTMLElement).style.boxShadow = "none";
        }}
      >
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-3xl">🌐</span>
              <h3 className="text-white font-black text-xl">More Arenas</h3>
            </div>
            <p className="text-sm" style={{ color: "#3D5070" }}>
              Search, filter &amp; create custom arenas
            </p>
          </div>
          <span className="font-black text-2xl group-hover:translate-x-1 transition-transform" style={{ color: "#F0C040" }}>
            →
          </span>
        </div>
      </Link>
    );
  }

  // ── Explore mode: two action buttons (Battle + Ranks) ───────────────────────
  if (mode === "explore") {
    return (
      <div
        className="group rounded-2xl p-4 relative overflow-hidden transition-all duration-200 hover:scale-[1.02]"
        style={{ background: "#111827", border: "1px solid #1B2338" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "#F0C040";
          (e.currentTarget as HTMLElement).style.boxShadow = "0 0 18px rgba(240,192,64,0.10)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "#1B2338";
          (e.currentTarget as HTMLElement).style.boxShadow = "none";
        }}
      >
        {/* Ambient glow */}
        <div
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(240,192,64,0.05) 0%, transparent 70%)" }}
        />
        <div className="relative flex flex-col h-full">
          {/* Icon + badge */}
          <div className="flex items-start justify-between mb-2">
            <span className="text-2xl">{icon}</span>
            {is_verified && (
              <span
                className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                style={{ color: "#F0C040", background: "rgba(240,192,64,0.1)", border: "1px solid rgba(240,192,64,0.2)" }}
              >
                ✓ OFFICIAL
              </span>
            )}
            {!is_official && (
              <span
                className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                style={{ color: "#3D5070", background: "#1B2338", border: "1px solid #253147" }}
              >
                CUSTOM
              </span>
            )}
          </div>

          {/* Name */}
          <h3 className="text-white font-black text-base leading-tight mb-1">{name}</h3>

          {/* Description */}
          {description && (
            <p className="text-xs leading-snug line-clamp-2 mb-2" style={{ color: "#3D5070" }}>
              {description}
            </p>
          )}

          {/* Player count */}
          <p className="text-xs font-bold mb-2.5" style={{ color: "#253147" }}>
            {player_count} {player_count === 1 ? "player" : "players"}
          </p>

          {/* Two action buttons */}
          <div className="flex gap-1.5 mt-auto">
            <Link
              href={`/swipe/${slug}`}
              className="flex-1 text-center py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wide transition-colors"
              style={{
                background: "rgba(240,192,64,0.08)",
                color: "#F0C040",
                border: "1px solid rgba(240,192,64,0.2)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(240,192,64,0.15)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(240,192,64,0.08)";
              }}
            >
              ⚔️ Battle
            </Link>
            <Link
              href={`/leaderboard/${slug}`}
              className="flex-1 text-center py-1.5 rounded-xl text-[11px] font-black uppercase tracking-wide transition-colors"
              style={{
                background: "rgba(77,159,255,0.08)",
                color: "#4D9FFF",
                border: "1px solid rgba(77,159,255,0.2)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(77,159,255,0.15)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.background = "rgba(77,159,255,0.08)";
              }}
            >
              🏆 Ranks
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Swipe / leaderboard mode: single link card ──────────────────────────────
  const href = `/${mode}/${slug}`;
  const actionLabel = mode === "leaderboard" ? "Rankings →" : "Battle →";

  return (
    <Link
      href={href}
      className="group block rounded-2xl p-4 relative overflow-hidden transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
      style={{ background: "#111827", border: "1px solid #1B2338" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "#F0C040";
        (e.currentTarget as HTMLElement).style.boxShadow = "0 0 18px rgba(240,192,64,0.10)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "#1B2338";
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
      }}
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl pointer-events-none"
        style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(240,192,64,0.05) 0%, transparent 70%)" }}
      />
      <div className="relative">
        <div className="flex items-start justify-between mb-2">
          <span className="text-2xl">{icon}</span>
          {is_verified && (
            <span
              className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full"
              style={{ color: "#F0C040", background: "rgba(240,192,64,0.1)", border: "1px solid rgba(240,192,64,0.2)" }}
            >
              ✓ OFFICIAL
            </span>
          )}
          {!is_official && (
            <span
              className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
              style={{ color: "#3D5070", background: "#1B2338", border: "1px solid #253147" }}
            >
              CUSTOM
            </span>
          )}
        </div>
        <h3 className="text-white font-black text-base leading-tight mb-1">{name}</h3>
        {description && (
          <p className="text-xs leading-snug mb-2 line-clamp-2" style={{ color: "#3D5070" }}>
            {description}
          </p>
        )}
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs font-bold" style={{ color: "#253147" }}>
            {player_count} {player_count === 1 ? "player" : "players"}
          </span>
          <span className="font-black text-xs group-hover:translate-x-1 transition-transform" style={{ color: "#F0C040" }}>
            {actionLabel}
          </span>
        </div>
      </div>
    </Link>
  );
}
