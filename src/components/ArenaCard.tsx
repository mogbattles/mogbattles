"use client";

import Link from "next/link";
import NavIcon from "./NavIcon";

interface ArenaCardProps {
  name: string;
  slug: string;
  description: string | null;
  is_official: boolean;
  is_verified: boolean;
  player_count: number;
  mode: "swipe" | "leaderboard" | "explore";
  emoji?: string;
  variant?: "default" | "more" | "highlighted";
  thumbnail_url?: string | null;
  arena_tier?: "official" | "moderator" | "custom";
}

// Map arena slug → NavIcon name for clean SVG icons
const ARENA_ICON_NAMES: Record<string, string> = {
  all: "globe",
  members: "users",
  friends: "handshake",
  "public-figures": "mic",
  actors: "clapperboard",
  looksmaxxers: "gem",
  "psl-icons": "eye",
  singers: "music",
  athletes: "trophy",
  streamers: "tv",
  politicians: "landmark",
  "political-commentators": "mic",
  models: "shirt",
};

// Reusable arena icon component (exported for ArenaDropdown, LeaderboardHome, etc.)
export function ArenaIcon({ slug, size = 24, className }: { slug: string; size?: number; className?: string }) {
  const name = ARENA_ICON_NAMES[slug] ?? "swipe";
  return <NavIcon name={name} size={size} className={className} />;
}

// Arena background gradients (used when no thumbnail is provided)
const ARENA_GRADIENTS: Record<string, string> = {
  all: "linear-gradient(135deg, #151515 0%, #0d0d0d 50%, #0a0a0a 100%)",
  actors: "linear-gradient(135deg, #141414 0%, #1a1a1a 50%, #0a0a0a 100%)",
  athletes: "linear-gradient(135deg, #0f1215 0%, #161a1e 50%, #0a0a0a 100%)",
  singers: "linear-gradient(135deg, #171214 0%, #141214 50%, #0a0a0a 100%)",
  models: "linear-gradient(135deg, #141416 0%, #0f1215 50%, #0a0a0a 100%)",
  looksmaxxers: "linear-gradient(135deg, #151510 0%, #1a1610 50%, #0a0a0a 100%)",
  streamers: "linear-gradient(135deg, #141418 0%, #1a161a 50%, #0a0a0a 100%)",
  default: "linear-gradient(135deg, var(--bg-card) 0%, var(--bg-card) 50%, #0a0a0a 100%)",
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
  arena_tier,
}: ArenaCardProps) {
  const iconName = ARENA_ICON_NAMES[slug] ?? "swipe";
  const gradient = ARENA_GRADIENTS[slug] ?? ARENA_GRADIENTS.default;

  // ── "More arenas" wide card ─────────────────────────────────────────────────
  if (variant === "more") {
    return (
      <Link href="/explore"
        className="group block rounded-2xl p-5 relative overflow-hidden transition-all duration-200 active:scale-[0.99]"
        style={{ background: "linear-gradient(90deg, var(--bg-card) 0%, var(--bg-primary) 100%)", border: "1px solid var(--border)" }}>
        <div className="relative flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <NavIcon name="globe" size={32} className="opacity-80" />
              <h3 className="text-[color:var(--text-primary)] font-black text-xl">More Arenas</h3>
            </div>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>Search, filter &amp; create custom arenas</p>
          </div>
          <span className="font-black text-2xl group-hover:translate-x-1 transition-transform" style={{ color: "var(--text-secondary)" }}>{"\u2192"}</span>
        </div>
      </Link>
    );
  }

  // ── Highlighted variant: bigger featured arena card ─────────────────────────
  if (variant === "highlighted") {
    return (
      <div className="group flex-1 min-w-0 rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.02] hover:-translate-y-1"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.4)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)";
          (e.currentTarget as HTMLElement).style.boxShadow = "0 12px 48px rgba(0,0,0,0.3), 0 4px 20px rgba(0,0,0,0.6)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
          (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 24px rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.4)";
        }}
      >
        {/* Image area — taller aspect for highlighted */}
        <div className="relative" style={{ aspectRatio: "16/9" }}>
          {thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnail_url} alt={name}
              className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="w-full h-full flex items-center justify-center"
              style={{ background: gradient }}>
              <NavIcon name={iconName} size={72} className="opacity-60 group-hover:opacity-90 group-hover:scale-110 transition-all duration-300" />
            </div>
          )}
          {/* Gradient overlay */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.4) 40%, transparent 100%)"
          }} />
          {/* Player count badge */}
          <div className="absolute bottom-2 right-3 z-10">
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full"
              style={{ background: "rgba(0,0,0,0.6)", color: "var(--text-muted)", backdropFilter: "blur(4px)" }}>
              {player_count.toLocaleString()} players
            </span>
          </div>
          {/* Official badge */}
          {is_verified && (
            <div className="absolute top-3 right-3 z-10">
              <span className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full"
                style={{ color: "var(--gold)", background: "rgba(0,0,0,0.6)", border: "1px solid rgba(240,192,64,0.3)" }}>
                {"\u2713"} OFFICIAL
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="px-5 pt-2 pb-4">
          <h3 className="text-[color:var(--text-primary)] font-heading tracking-wide text-xl sm:text-2xl leading-tight mb-1">{name}</h3>
          {description && (
            <p className="text-xs sm:text-sm leading-snug line-clamp-2 mb-3" style={{ color: "var(--text-muted)" }}>{description}</p>
          )}
          {!description && <div className="mb-3" />}

          {/* Action buttons — slightly bigger for highlighted */}
          <div className="flex gap-2">
            <Link href={`/swipe/${slug}`}
              className="flex-1 text-center py-2.5 rounded-xl text-[12px] font-black uppercase tracking-wide transition-all"
              style={{
                background: "var(--bg-elevated)",
                color: "var(--accent)",
                border: "1px solid var(--border)",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}>
              Swipe
            </Link>
            <Link href={`/leaderboard/${slug}`}
              className="flex-1 text-center py-2.5 rounded-xl text-[12px] font-black uppercase tracking-wide transition-all"
              style={{
                background: "rgba(240,192,64,0.1)",
                color: "var(--gold)",
                border: "1px solid rgba(240,192,64,0.3)",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(240,192,64,0.18)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(240,192,64,0.1)"; }}>
              Ranks
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Explore mode: PS5-style horizontal card with image ───────────────────────
  if (mode === "explore") {
    return (
      <div className="group shrink-0 w-[260px] sm:w-[280px] rounded-2xl overflow-hidden transition-all duration-300 hover:scale-[1.03] hover:-translate-y-1"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border)",
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)";
          (e.currentTarget as HTMLElement).style.boxShadow = "0 8px 40px rgba(0,0,0,0.25), 0 4px 20px rgba(0,0,0,0.6)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
          (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(0,0,0,0.4)";
        }}
      >
        {/* Image area */}
        <div className="relative" style={{ aspectRatio: "16/10" }}>
          {thumbnail_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnail_url} alt={name}
              className="w-full h-full object-cover object-top transition-transform duration-500 group-hover:scale-105" />
          ) : (
            <div className="w-full h-full flex items-center justify-center"
              style={{ background: gradient }}>
              <NavIcon name={iconName} size={56} className="opacity-60 group-hover:opacity-90 group-hover:scale-110 transition-all duration-300" />
            </div>
          )}
          {/* Gradient overlay */}
          <div className="absolute inset-0 pointer-events-none" style={{
            background: "linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0.3) 40%, transparent 100%)"
          }} />
          {/* Player count badge */}
          <div className="absolute bottom-2 right-3 z-10">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: "rgba(0,0,0,0.6)", color: "var(--text-muted)", backdropFilter: "blur(4px)" }}>
              {player_count} players
            </span>
          </div>
          {/* Tier badge */}
          {is_verified && (
            <div className="absolute top-2 right-2 z-10">
              <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                style={{ color: "var(--gold)", background: "rgba(0,0,0,0.6)", border: "1px solid rgba(240,192,64,0.3)" }}>
                {"\u2713"} OFFICIAL
              </span>
            </div>
          )}
          {!is_verified && arena_tier === "moderator" && (
            <div className="absolute top-2 right-2 z-10">
              <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                style={{ color: "#60A5FA", background: "rgba(0,0,0,0.6)", border: "1px solid rgba(59,130,246,0.3)" }}>
                {"\uD83D\uDEE1\uFE0F"} MOD
              </span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="px-4 pt-1 pb-3">
          <h3 className="text-[color:var(--text-primary)] font-heading tracking-wide text-lg leading-tight mb-0.5">{name}</h3>
          {description && (
            <p className="text-xs leading-snug line-clamp-1 mb-2.5" style={{ color: "var(--text-muted)" }}>{description}</p>
          )}
          {!description && <div className="mb-2.5" />}

          {/* Action buttons */}
          <div className="flex gap-2">
            <Link href={`/swipe/${slug}`}
              className="flex-1 text-center py-2 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all"
              style={{
                background: "var(--bg-elevated)",
                color: "var(--accent)",
                border: "1px solid var(--border)",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}>
              Swipe
            </Link>
            <Link href={`/leaderboard/${slug}`}
              className="flex-1 text-center py-2 rounded-xl text-[11px] font-black uppercase tracking-wide transition-all"
              style={{
                background: "rgba(240,192,64,0.08)",
                color: "var(--gold)",
                border: "1px solid rgba(240,192,64,0.25)",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(240,192,64,0.15)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(240,192,64,0.08)"; }}>
              Ranks
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Swipe / leaderboard mode: single link card ──────────────────────────────
  const href = `/${mode}/${slug}`;
  const actionLabel = mode === "leaderboard" ? "Rankings \u2192" : "Swipe \u2192";

  return (
    <Link href={href}
      className="group block rounded-2xl p-4 relative overflow-hidden transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)";
        (e.currentTarget as HTMLElement).style.boxShadow = "0 0 18px rgba(0,0,0,0.2)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
        (e.currentTarget as HTMLElement).style.boxShadow = "none";
      }}>
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl pointer-events-none"
        style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(255,255,255,0.03) 0%, transparent 70%)" }} />
      <div className="relative">
        <div className="flex items-start justify-between mb-2">
          <ArenaIcon slug={slug} size={28} />
          {is_verified && (
            <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full"
              style={{ color: "var(--gold)", background: "rgba(240,192,64,0.1)", border: "1px solid rgba(240,192,64,0.2)" }}>
              {"\u2713"} OFFICIAL
            </span>
          )}
          {arena_tier === "moderator" && (
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
              style={{ color: "#60A5FA", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)" }}>MOD</span>
          )}
          {!is_official && arena_tier !== "moderator" && (
            <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
              style={{ color: "var(--text-muted)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>CUSTOM</span>
          )}
        </div>
        <h3 className="text-[color:var(--text-primary)] font-black text-base leading-tight mb-1">{name}</h3>
        {description && <p className="text-xs leading-snug mb-2 line-clamp-2" style={{ color: "var(--text-muted)" }}>{description}</p>}
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs font-bold" style={{ color: "var(--text-faint)" }}>{player_count} {player_count === 1 ? "player" : "players"}</span>
          <span className="font-black text-xs group-hover:translate-x-1 transition-transform" style={{ color: "var(--text-secondary)" }}>{actionLabel}</span>
        </div>
      </div>
    </Link>
  );
}
