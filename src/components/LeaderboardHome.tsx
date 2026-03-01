"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getPublicArenas, type ArenaWithCount } from "@/lib/arenas";
import { ARENA_EMOJIS } from "./ArenaCard";
import ArenaCard from "./ArenaCard";

// ─── Featured big card (All / All Players) ───────────────────────────────────

function FeaturedCard({ arena }: { arena: ArenaWithCount }) {
  const [hov, setHov] = useState(false);
  const icon = ARENA_EMOJIS[arena.slug] ?? "⚔️";
  return (
    <Link
      href={`/leaderboard/${arena.slug}`}
      className="group block rounded-2xl overflow-hidden relative"
      style={{
        background: "linear-gradient(135deg, var(--bg-card) 0%, var(--bg-primary) 100%)",
        border: `1px solid ${hov ? "var(--border-hover)" : "var(--border)"}`,
        boxShadow: hov ? "0 0 28px rgba(0,0,0,0.2)" : "none",
        transition: "border-color 0.18s ease, box-shadow 0.18s ease",
      }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      {/* Ambient glow blob */}
      <div
        className="absolute -top-12 -right-12 w-52 h-52 rounded-full pointer-events-none transition-opacity duration-300"
        style={{
          background: "radial-gradient(circle, rgba(255,255,255,0.03) 0%, transparent 70%)",
          opacity: hov ? 1 : 0.5,
        }}
      />

      <div className="relative p-6">
        <div className="flex items-start justify-between mb-4">
          <span className="text-5xl leading-none">{icon}</span>
          {arena.is_verified && (
            <span
              className="text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-full"
              style={{
                color: "var(--gold)",
                background: "rgba(240,192,64,0.1)",
                border: "1px solid rgba(240,192,64,0.25)",
              }}
            >
              ✓ OFFICIAL
            </span>
          )}
        </div>

        <h3 className="text-[color:var(--text-primary)] font-heading tracking-wide text-3xl leading-tight mb-1">{arena.name}</h3>
        {arena.description && (
          <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
            {arena.description}
          </p>
        )}

        <div className="flex items-center justify-between mt-auto">
          <span className="text-xs font-bold" style={{ color: "var(--text-faint)" }}>
            {arena.player_count} {arena.player_count === 1 ? "player" : "players"}
          </span>
          <span
            className="btn-accent rounded-xl px-4 py-2 font-black uppercase tracking-wider"
            style={{ fontSize: "11px" }}
          >
            Rankings →
          </span>
        </div>
      </div>
    </Link>
  );
}

// ─── Friends stub card ────────────────────────────────────────────────────────

function FriendsCard() {
  return (
    <Link
      href="/leaderboard/friends"
      className="group block rounded-2xl p-5 relative overflow-hidden mb-4"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🤝</span>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[color:var(--text-primary)] font-black text-lg">Friends</h3>
              <span
                className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full"
                style={{ color: "var(--accent)", background: "var(--bg-elevated)", border: "1px solid var(--border)" }}
              >
                NEW
              </span>
            </div>
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              Rankings among your friends on the platform
            </p>
          </div>
        </div>
        <span
          className="font-black text-xl group-hover:translate-x-1 transition-transform"
          style={{ color: "var(--text-secondary)" }}
        >
          →
        </span>
      </div>
    </Link>
  );
}

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="h-9 w-56 rounded-xl animate-pulse mb-2" style={{ background: "var(--border)" }} />
        <div className="h-4 w-36 rounded-lg animate-pulse" style={{ background: "var(--bg-elevated)" }} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        {[0, 1].map((i) => (
          <div key={i} className="rounded-2xl h-44 animate-pulse" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }} />
        ))}
      </div>
      <div className="rounded-2xl h-20 animate-pulse mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }} />
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="rounded-2xl h-32 animate-pulse" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }} />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function LeaderboardHome() {
  const [arenas, setArenas] = useState<ArenaWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPublicArenas()
      .then((data) => { setArenas(data); setLoading(false); })
      .catch(() => { setError("Could not load leaderboards."); setLoading(false); });
  }, []);

  if (loading) return <Skeleton />;

  if (error) {
    return (
      <div className="text-center py-20">
        <p style={{ color: "#EF4444" }}>{error}</p>
      </div>
    );
  }

  const allArena = arenas.find((a) => a.slug === "all");
  const membersArena = arenas.find((a) => a.slug === "members");
  const categoryArenas = arenas.filter(
    (a) => a.is_official && !["all", "members"].includes(a.slug)
  );
  const customArenas = arenas.filter((a) => !a.is_official);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1
          className="text-3xl sm:text-4xl font-black mb-1"
          style={{
            background: "var(--text-primary)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          LEADERBOARDS
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Rankings across all arenas
        </p>
      </div>

      {/* ── Featured: All + All Players ─────────────────────────────────── */}
      {(allArena || membersArena) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {allArena && <FeaturedCard arena={allArena} />}
          {membersArena && <FeaturedCard arena={membersArena} />}
        </div>
      )}

      {/* ── Friends ─────────────────────────────────────────────────────── */}
      <FriendsCard />

      {/* ── Category arenas ─────────────────────────────────────────────── */}
      {categoryArenas.length > 0 && (
        <>
          <p
            className="text-xs font-black uppercase tracking-widest mb-3 mt-2"
            style={{ color: "var(--text-faint)" }}
          >
            Categories
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            {categoryArenas.map((arena) => (
              <ArenaCard
                key={arena.id}
                name={arena.name}
                slug={arena.slug}
                description={arena.description}
                is_official={arena.is_official}
                is_verified={arena.is_verified}
                player_count={arena.player_count}
                mode="leaderboard"
              />
            ))}
          </div>
        </>
      )}

      {/* ── Custom arenas ────────────────────────────────────────────────── */}
      {customArenas.length > 0 && (
        <>
          <p
            className="text-xs font-black uppercase tracking-widest mb-3 mt-2"
            style={{ color: "var(--text-faint)" }}
          >
            Community
          </p>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {customArenas.map((arena) => (
              <ArenaCard
                key={arena.id}
                name={arena.name}
                slug={arena.slug}
                description={arena.description}
                is_official={arena.is_official}
                is_verified={arena.is_verified}
                player_count={arena.player_count}
                mode="leaderboard"
              />
            ))}
          </div>
        </>
      )}

      {/* More arenas CTA */}
      <div className="grid grid-cols-1">
        <ArenaCard
          name="More"
          slug="more"
          description={null}
          is_official={false}
          is_verified={false}
          player_count={0}
          mode="leaderboard"
          variant="more"
        />
      </div>
    </div>
  );
}
