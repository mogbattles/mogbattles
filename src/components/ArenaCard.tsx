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
  thumbnail_url?: string | null;
}

export const ARENA_EMOJIS: Record<string, string> = {
  all: "\uD83C\uDF0D",
  members: "\uD83D\uDC65",
  friends: "\uD83E\uDD1D",
  "public-figures": "\uD83C\uDF99\uFE0F",
  actors: "\uD83C\uDFAC",
  looksmaxxers: "\uD83D\uDC8E",
  "psl-icons": "\uD83D\uDC41",
  singers: "\uD83C\uDFB5",
  athletes: "\uD83C\uDFC6",
  streamers: "\uD83D\uDCFA",
  politicians: "\uD83C\uDFDB\uFE0F",
  "political-commentators": "\uD83C\uDF99",
  models: "\uD83D\uDC57",
};

// Arena background gradients (used when no thumbnail is provided)
const ARENA_GRADIENTS: Record<string, string> = {
  all: "linear-gradient(135deg, #1a0533 0%, #0d1117 50%, #0a0a12 100%)",
  actors: "linear-gradient(135deg, #1a0a2e 0%, #2d1b4e 50%, #0a0a12 100%)",
  athletes: "linear-gradient(135deg, #0a1628 0%, #1a2744 50%, #0a0a12 100%)",
  singers: "linear-gradient(135deg, #2a0a1e 0%, #1a0a2e 50%, #0a0a12 100%)",
  models: "linear-gradient(135deg, #1a0a2e 0%, #0a1628 50%, #0a0a12 100%)",
  looksmaxxers: "linear-gradient(135deg, #1a1a00 0%, #2a1a00 50%, #0a0a12 100%)",
  streamers: "linear-gradient(135deg, #1a0033 0%, #330033 50%, #0a0a12 100%)",
  default: "linear-gradient(135deg, #141420 0%, #0F0F1A 50%, #0a0a12 100%)",
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
  thumbnail_url,
}: ArenaCardProps) {
  const icon = emoji ?? ARENA_EMOJIS[slug] ?? "\u2694\uFE0F";
  const gradient = ARENA_GRADIENTS[slug] ?? ARENA_GRADIENTS.default;

  // ── "More arenas" wide card ─────────────────────────────────────────────────
  if (variant === "more") {
    return (
      <Link href="/explore"
        className="group block rounded-2xl p-5 relative overflow-hidden transition-all duration-200 active:scale-[0.99]"
        style={{ background: "linear-gradient(90deg, #141420 0%, #0A0A12 100%)", border: "1px solid #222233" }}>
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-3xl">{"\uD83C\uDF10"}</span>
              <h3 className="text-white font-black text-xl">More Arenas</h3>
            </div>
            <p className="text-sm" style={{ color: "#4A4A66" }}>Search, filter &amp; create custom arenas</p>
          </div>
          <span className="font-black text-2xl group-hover:translate-x-1 transition-transform" style={{ color: "#A78BFA" }}>{"\u2192"}</span>
        </div>
      </Link>
    );
  }

  // ── Explore mode: PS5-style horizontal card with image ───────────────────────
  if (mode === "explore") {
    return (
      <div className="group shrink-0 w-[260px] sm:w-[280px] rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1"
        style={{
          background: "#0F0F1A",
          border: "1px solid #222233",
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.5)";
          (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 40px rgba(139,92,246,0.15), 0 4px 20px rgba(0,0,0,0.6)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "#222233";
          (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.4)";
        }}
      >
        {/* Image area */}
        <div className="relative" style={{ aspectRatio: "16/10" }}>
          {thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnail_url} alt={name}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="w-full h-full flex items-center justify-center"
              style={{ background: gradient }}>
              <span className="text-5xl opacity-60 group-hover:opacity-90 group-hover:scale-110 transition-all duration-300">{icon}</span>
            </div>
          )}
          {/* Gradient overlay */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: "linear-gradient(to top, rgba(15,15,26,1) 0%, rgba(15,15,26,0.3) 40%, transparent 100%)"
          }} />
          {/* Player count badge */}
          <div className="absolute bottom-2 right-3 z-10">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(0,0,0,0.6)", color: "#888", backdropFilter: "blur(4px)" }}>
              {player_count} players
            </span>
          </div>
          {/* Official badge */}
          {is_verified && (
            <div className="absolute top-2 right-2 z-10">
              <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                style={{ color: "#F0C040", background: "rgba(0,0,0,0.6)", border: "1px solid rgba(240,192,64,0.3)" }}>
                {"\u2713"} OFFICIAL
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="px-4 pt-1 pb-3">
          <h3 className="text-white font-heading tracking-wide text-lg leading-tight mb-0.5">{name}</h3>
          {description && (
            <p className="text-xs leading-snug line-clamp-1 mb-2.5" style={{ color: "#4A4A66" }}>{description}</p>
          )}
          {!description && <div className="mb-2.5" />}

          {/* Action buttons */}
          <div className="flex gap-2">
            <Link href={`/swipe/${slug}`}
              className="flex-1 text-center py-2 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all"
              style={{
                background: "rgba(139,92,246,0.1)",
                color: "#A78BFA",
                border: "1px solid rgba(139,92,246,0.25)",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.2)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.1)"; }}>
              {"\u2694\uFE0F"} Battle
            </Link>
            <Link href={`/leaderboard/${slug}`}
              className="flex-1 text-center py-2 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all"
              style={{
                background: "rgba(240,192,64,0.08)",
                color: "#F0C040",
                border: "1px solid rgba(240,192,64,0.25)",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(240,192,64,0.15)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(240,192,64,0.08)"; }}>
              {"\uD83C\uDFC6"} Ranks
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Swipe / leaderboard mode: single link card ──────────────────────────────
  const href = `/${mode}/${slug}`;
  const actionLabel = mode === "leaderboard" ? "Rankings \u2192" : "Battle \u2192";

  return (
    <Link href={href}
      className="group block rounded-2xl p-4 relative overflow-hidden transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
      style={{ background: "#0F0F1A", border: "1px solid #222233" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.5)";
        (e.currentTarget as HTMLElement).style.boxShadow = "0 0 18px rgba(139,92,246,0.10)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "#222233";
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
      }}>
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl pointer-events-none"
        style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(139,92,246,0.06) 0%, transparent 70%)" }} />
      <div className="relative">
        <div className="flex items-start justify-between mb-2">
          <span className="text-2xl">{icon}</span>
          {is_verified && (
            <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full"
              style={{ color: "#F0C040", background: "rgba(240,192,64,0.1)", border: "1px solid rgba(240,192,64,0.2)" }}>
              {"\u2713"} OFFICIAL
            </span>
          )}
          {!is_official && (
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
              style={{ color: "#4A4A66", background: "#1A1A28", border: "1px solid #2A2A3D" }}>CUSTOM</span>
          )}
        </div>
        <h3 className="text-white font-black text-base leading-tight mb-1">{name}</h3>
        {description && <p className="text-xs leading-snug mb-2 line-clamp-2" style={{ color: "#4A4A66" }}>{description}</p>}
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs font-bold" style={{ color: "#2A2A3D" }}>{player_count} {player_count === 1 ? "player" : "players"}</span>
          <span className="font-black text-xs group-hover:translate-x-1 transition-transform" style={{ color: "#A78BFA" }}>{actionLabel}</span>
        </div>
      </div>
    </Link>
  );
}
