"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
  getExploreArenas,
  searchProfiles,
  getFeaturedBattles,
  getHeadToHead,
  getUserVoteForFeaturedPair,
  getSharedArenaId,
  type ArenaWithCount,
  type FeaturedBattle,
  type HeadToHeadStats,
} from "@/lib/arenas";
import ArenaCard, { ARENA_EMOJIS } from "@/components/ArenaCard";
import { useAuth } from "@/context/AuthContext";
import { createBrowserClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";

function supabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type ProfileHit = {
  id: string;
  name: string;
  image_url: string | null;
  category: string | null;
};

// ─── Battle of the Day card (interactive voting) ─────────────────────────────

function BattleOfDayCard({
  battle,
  h2h,
  user,
}: {
  battle: FeaturedBattle;
  h2h: HeadToHeadStats | null;
  user: User | null;
}) {
  // votedFor: null = not voted, string = the profile ID the user picked
  const [votedFor, setVotedFor] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  // Local adjustments so the UI reflects the cast vote immediately
  const [aWinsAdj, setAWinsAdj] = useState(0);
  const [totalAdj, setTotalAdj] = useState(0);

  const pa = battle.profile_a;
  const pb = battle.profile_b;

  // Load existing vote when user logs in — must be before any conditional return
  useEffect(() => {
    if (!user || !pa || !pb) { setVotedFor(null); return; }
    getUserVoteForFeaturedPair(user.id, pa.id, pb.id).then(setVotedFor);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, pa?.id, pb?.id]);

  // Guard: need both profiles to render
  if (!pa || !pb) return null;

  // Computed stats (merge DB h2h with local optimistic adjustments)
  const total = (h2h?.total ?? 0) + totalAdj;
  const aWins = (h2h?.a_wins ?? 0) + aWinsAdj;
  const aPct = total > 0 ? Math.round((aWins / total) * 100) : 50;
  const bPct = 100 - aPct;

  function fallback(name: string) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=111827&color=888&size=200&bold=true`;
  }

  async function handleVote(winnerId: string) {
    if (!pa || !pb) return; // narrow for TypeScript (always true past the guard above)
    if (!user) { setShowSignIn(true); return; }
    if (voting) return;
    if (winnerId === votedFor) return; // already picked this side

    const loserId = winnerId === pa.id ? pb.id : pa.id;
    const wasFirstVote = votedFor === null;
    const prevVotedFor = votedFor;

    // Optimistic update
    setVotedFor(winnerId);

    if (wasFirstVote) {
      setTotalAdj((t) => t + 1);
      if (winnerId === pa.id) setAWinsAdj((a) => a + 1);
    } else {
      // Switching: remove old vote count, add new
      if (prevVotedFor === pa.id) setAWinsAdj((a) => a - 1);
      if (winnerId === pa.id) setAWinsAdj((a) => a + 1);
    }

    // Only persist the first vote to DB (record_match enforces uniqueness via ON CONFLICT DO NOTHING)
    if (wasFirstVote) {
      setVoting(true);
      const arenaId = await getSharedArenaId(pa.id, pb.id);
      if (arenaId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase() as any).rpc("record_match", {
          p_arena_id: arenaId,
          p_winner_id: winnerId,
          p_loser_id: loserId,
          p_voter_id: user.id,
        });
      }
      setVoting(false);
    }
    // Switching vote is shown visually but the original DB vote is preserved
  }

  return (
    <>
      <div
        className="rounded-2xl overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0D1120 0%, #111827 100%)",
          border: "1px solid rgba(240,192,64,0.2)",
          boxShadow: "0 0 30px rgba(240,192,64,0.05)",
        }}
      >
        {/* Header */}
        <div
          className="px-4 pt-3 pb-2 flex items-center justify-between border-b"
          style={{ borderColor: "rgba(240,192,64,0.12)" }}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm">⚔️</span>
            <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#F0C040" }}>
              Battle of the Day
            </span>
          </div>
          <div className="flex items-center gap-2">
            {battle.label && (
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full" style={{ color: "#3D5070", background: "#141A2C" }}>
                {battle.label}
              </span>
            )}
            {votedFor && (
              <span className="text-[9px] font-black px-2 py-0.5 rounded-full" style={{ background: "rgba(240,192,64,0.12)", color: "#F0C040", border: "1px solid rgba(240,192,64,0.2)" }}>
                ✓ Voted
              </span>
            )}
          </div>
        </div>

        {/* Side-by-side photo buttons */}
        <div className="flex relative" style={{ aspectRatio: "2/1.2" }}>

          {/* ── Profile A ── */}
          <button
            onClick={() => handleVote(pa.id)}
            disabled={voting}
            className="flex-1 relative overflow-hidden text-left"
            style={{
              outline: votedFor === pa.id ? "2px solid #F0C040" : "2px solid transparent",
              outlineOffset: "-2px",
              cursor: voting ? "default" : "pointer",
              transition: "outline-color 0.25s",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pa.image_url ?? fallback(pa.name)}
              alt={pa.name}
              className="w-full h-full object-cover object-top transition-all duration-300"
              style={{ opacity: votedFor && votedFor !== pa.id ? 0.55 : 1 }}
              onError={(e) => { (e.target as HTMLImageElement).src = fallback(pa.name); }}
            />
            {/* Gradient */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: "linear-gradient(to top, rgba(7,9,15,0.9) 0%, rgba(7,9,15,0.1) 55%, transparent 100%)" }}
            />

            {/* Your pick badge */}
            {votedFor === pa.id && (
              <div
                className="absolute top-2 left-2 px-2 py-0.5 rounded-full text-[9px] font-black"
                style={{ background: "#F0C040", color: "#07090F" }}
              >
                👑 YOUR PICK
              </div>
            )}

            {/* Switch hint (hover on non-voted side) */}
            {votedFor && votedFor !== pa.id && (
              <div
                className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                style={{ background: "rgba(7,9,15,0.45)" }}
              >
                <span
                  className="text-white font-black text-[10px] px-3 py-1 rounded-full"
                  style={{ background: "rgba(240,192,64,0.25)", border: "1px solid rgba(240,192,64,0.5)" }}
                >
                  Switch pick
                </span>
              </div>
            )}

            {/* Name */}
            <p className="absolute bottom-7 left-2 right-2 text-white font-black text-xs leading-tight truncate">
              {pa.name}
            </p>

            {/* % — large and prominent */}
            <span
              className="absolute bottom-2 left-2 font-black"
              style={{ fontSize: "18px", color: votedFor === pa.id ? "#F0C040" : "#8096B0", lineHeight: 1 }}
            >
              {aPct}%
            </span>
          </button>

          {/* VS badge */}
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
            <div
              className="w-7 h-7 flex items-center justify-center rounded-full font-black text-[10px]"
              style={{ background: "#07090F", border: "2px solid rgba(240,192,64,0.35)", color: "#F0C040" }}
            >
              VS
            </div>
          </div>

          {/* ── Profile B ── */}
          <button
            onClick={() => handleVote(pb.id)}
            disabled={voting}
            className="flex-1 relative overflow-hidden text-left"
            style={{
              outline: votedFor === pb.id ? "2px solid #F0C040" : "2px solid transparent",
              outlineOffset: "-2px",
              cursor: voting ? "default" : "pointer",
              transition: "outline-color 0.25s",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pb.image_url ?? fallback(pb.name)}
              alt={pb.name}
              className="w-full h-full object-cover object-top transition-all duration-300"
              style={{ opacity: votedFor && votedFor !== pb.id ? 0.55 : 1 }}
              onError={(e) => { (e.target as HTMLImageElement).src = fallback(pb.name); }}
            />
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: "linear-gradient(to top, rgba(7,9,15,0.9) 0%, rgba(7,9,15,0.1) 55%, transparent 100%)" }}
            />

            {votedFor === pb.id && (
              <div
                className="absolute top-2 right-2 px-2 py-0.5 rounded-full text-[9px] font-black"
                style={{ background: "#F0C040", color: "#07090F" }}
              >
                👑 YOUR PICK
              </div>
            )}

            {votedFor && votedFor !== pb.id && (
              <div
                className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-200 pointer-events-none"
                style={{ background: "rgba(7,9,15,0.45)" }}
              >
                <span
                  className="text-white font-black text-[10px] px-3 py-1 rounded-full"
                  style={{ background: "rgba(240,192,64,0.25)", border: "1px solid rgba(240,192,64,0.5)" }}
                >
                  Switch pick
                </span>
              </div>
            )}

            <p className="absolute bottom-7 left-2 right-2 text-white font-black text-xs leading-tight truncate text-right">
              {pb.name}
            </p>

            <span
              className="absolute bottom-2 right-2 font-black"
              style={{ fontSize: "18px", color: votedFor === pb.id ? "#F0C040" : "#8096B0", lineHeight: 1 }}
            >
              {bPct}%
            </span>
          </button>
        </div>

        {/* Vote bar */}
        <div className="px-3 pt-3 pb-1">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[10px] font-black" style={{ color: votedFor === pa.id ? "#F0C040" : "#3D5070", minWidth: "30px" }}>{aPct}%</span>
            <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "#141A2C" }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{ width: `${aPct}%`, background: "linear-gradient(90deg, #F0C040, #FFD96A 50%, #4D9FFF)" }}
              />
            </div>
            <span className="text-[10px] font-black text-right" style={{ color: votedFor === pb.id ? "#F0C040" : "#3D5070", minWidth: "30px" }}>{bPct}%</span>
          </div>
          <p className="text-center text-[9px] font-bold" style={{ color: "#253147" }}>
            {total > 0 ? `${total.toLocaleString()} vote${total === 1 ? "" : "s"} cast` : "Be the first to vote"}
          </p>
        </div>

        {/* CTA or voted indicator */}
        <div className="px-3 pb-3 pt-2">
          {!user ? (
            <button
              onClick={() => setShowSignIn(true)}
              className="block w-full text-center py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-colors"
              style={{ background: "rgba(240,192,64,0.1)", color: "#F0C040", border: "1px solid rgba(240,192,64,0.2)" }}
            >
              Sign in to vote →
            </button>
          ) : !votedFor ? (
            <p className="text-center text-[9px] font-bold uppercase tracking-widest" style={{ color: "#3D5070" }}>
              Tap a photo to cast your vote
            </p>
          ) : (
            <p className="text-center text-[9px] font-bold uppercase tracking-widest" style={{ color: "#253147" }}>
              Tap the other side to switch · <span style={{ color: "#3D5070" }}>first vote recorded</span>
            </p>
          )}
        </div>
      </div>

      {/* Sign-in prompt modal */}
      {showSignIn && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(7,9,15,0.92)", backdropFilter: "blur(8px)" }}
          onClick={() => setShowSignIn(false)}
        >
          <div
            className="max-w-xs w-full rounded-2xl p-8 text-center"
            style={{
              background: "#0D1120",
              border: "1px solid rgba(240,192,64,0.25)",
              boxShadow: "0 0 40px rgba(240,192,64,0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-5xl mb-4" style={{ filter: "drop-shadow(0 0 12px rgba(240,192,64,0.4))" }}>⚔️</div>
            <h2 className="text-white font-black text-xl mb-2 tracking-tight">Join the Arena</h2>
            <p className="text-sm mb-6 leading-relaxed" style={{ color: "#4D6080" }}>
              Sign in to cast your vote, track your history, and compete on the leaderboard.
            </p>
            <Link
              href="/profile"
              className="block btn-gold rounded-xl px-6 py-3 text-sm font-black uppercase tracking-wider"
              onClick={() => setShowSignIn(false)}
            >
              Sign In with Google →
            </Link>
            <button onClick={() => setShowSignIn(false)} className="mt-4 text-xs font-bold hover:underline" style={{ color: "#3D5070" }}>
              Maybe later
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Coming Up card ───────────────────────────────────────────────────────────

function ComingUpCard({ battle }: { battle: FeaturedBattle }) {
  const pa = battle.profile_a;
  const pb = battle.profile_b;
  if (!pa || !pb) return null;

  function fallback(name: string) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=111827&color=888&size=120&bold=true`;
  }

  return (
    <div
      className="rounded-2xl p-3.5"
      style={{ background: "#0D1120", border: "1px solid rgba(77,159,255,0.2)" }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm">📅</span>
        <span className="text-[10px] font-black uppercase tracking-widest" style={{ color: "#4D9FFF" }}>
          Coming Up
        </span>
        {battle.label && (
          <span
            className="ml-auto text-[9px] font-black px-2 py-0.5 rounded-full"
            style={{ background: "rgba(77,159,255,0.12)", color: "#4D9FFF", border: "1px solid rgba(77,159,255,0.25)" }}
          >
            {battle.label}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pa.image_url ?? fallback(pa.name)} alt={pa.name}
            className="w-14 h-14 rounded-xl object-cover object-top"
            style={{ border: "1px solid rgba(77,159,255,0.25)" }}
            onError={(e) => { (e.target as HTMLImageElement).src = fallback(pa.name); }}
          />
          <p className="text-white font-black text-[10px] text-center truncate w-full">{pa.name}</p>
        </div>
        <span className="font-black text-xs shrink-0" style={{ color: "#1B2338" }}>VS</span>
        <div className="flex flex-col items-center gap-1 flex-1 min-w-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={pb.image_url ?? fallback(pb.name)} alt={pb.name}
            className="w-14 h-14 rounded-xl object-cover object-top"
            style={{ border: "1px solid rgba(77,159,255,0.25)" }}
            onError={(e) => { (e.target as HTMLImageElement).src = fallback(pb.name); }}
          />
          <p className="text-white font-black text-[10px] text-center truncate w-full">{pb.name}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Search dropdown ──────────────────────────────────────────────────────────

function SearchDropdown({
  query, profiles, arenas, onClose,
}: {
  query: string;
  profiles: ProfileHit[];
  arenas: ArenaWithCount[];
  onClose: () => void;
}) {
  if (!query.trim() || (profiles.length === 0 && arenas.length === 0)) return null;

  return (
    <div
      className="absolute left-0 right-0 top-full mt-1.5 rounded-2xl overflow-hidden z-50"
      style={{
        background: "rgba(9,12,22,0.98)",
        border: "1px solid rgba(240,192,64,0.15)",
        boxShadow: "0 20px 50px rgba(0,0,0,0.8)",
        backdropFilter: "blur(20px)",
      }}
    >
      {profiles.length > 0 && (
        <div>
          <p className="px-4 pt-3 pb-1 text-[9px] font-black uppercase tracking-widest" style={{ color: "#253147" }}>People</p>
          {profiles.map((p) => (
            <Link key={p.id} href={`/players/${p.id}`} onClick={onClose}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.image_url ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=111827&color=888&size=48&bold=true`}
                alt="" className="w-8 h-8 rounded-full object-cover shrink-0"
                style={{ border: "1px solid #1B2338" }}
                onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=111827&color=888&size=48&bold=true`; }}
              />
              <div className="min-w-0">
                <p className="text-white font-bold text-sm truncate">{p.name}</p>
                {p.category && (
                  <p className="text-[10px] font-bold uppercase" style={{ color: "#3D5070" }}>{p.category.replace(/_/g, " ")}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
      {arenas.length > 0 && (
        <div>
          <p className="px-4 pt-3 pb-1 text-[9px] font-black uppercase tracking-widest" style={{ color: "#253147" }}>Arenas</p>
          {arenas.slice(0, 5).map((a) => (
            <Link key={a.id} href={`/swipe/${a.slug}`} onClick={onClose}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors"
            >
              <span className="text-xl shrink-0">{ARENA_EMOJIS[a.slug] ?? "⚔️"}</span>
              <div className="min-w-0">
                <p className="text-white font-bold text-sm truncate">{a.name}</p>
                <p className="text-[10px] font-bold" style={{ color: "#3D5070" }}>{a.player_count} players</p>
              </div>
            </Link>
          ))}
        </div>
      )}
      <div style={{ height: "8px" }} />
    </div>
  );
}

// ─── Main Explore Page ────────────────────────────────────────────────────────

export default function ExplorePage() {
  const { user } = useAuth();
  const [arenas, setArenas] = useState<ArenaWithCount[]>([]);
  const [arenasLoading, setArenasLoading] = useState(true);
  const [featured, setFeatured] = useState<{ bod: FeaturedBattle | null; upcoming: FeaturedBattle | null }>({ bod: null, upcoming: null });
  const [h2h, setH2h] = useState<HeadToHeadStats | null>(null);

  // Search
  const [query, setQuery] = useState("");
  const [profileResults, setProfileResults] = useState<ProfileHit[]>([]);
  const [arenaResults, setArenaResults] = useState<ArenaWithCount[]>([]);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load on mount
  useEffect(() => {
    getExploreArenas({ sort: "popular" }).then((data) => {
      setArenas(data);
      setArenasLoading(false);
    });
    getFeaturedBattles().then((battles) => {
      const bod = battles.find((b) => b.type === "battle_of_day") ?? null;
      const upcoming = battles.find((b) => b.type === "upcoming") ?? null;
      setFeatured({ bod, upcoming });
      if (bod?.profile_a && bod?.profile_b) {
        getHeadToHead(bod.profile_a.id, bod.profile_b.id).then(setH2h);
      }
    });
  }, []);

  // Close search when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setProfileResults([]);
        setArenaResults([]);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const runSearch = useCallback((q: string) => {
    if (!q.trim()) { setProfileResults([]); setArenaResults([]); return; }
    Promise.all([
      searchProfiles(q, 6),
      getExploreArenas({ search: q, sort: "popular" }),
    ]).then(([p, a]) => {
      setProfileResults(p as ProfileHit[]);
      setArenaResults(a);
    });
  }, []);

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(val), 220);
  }

  function clearSearch() {
    setQuery("");
    setProfileResults([]);
    setArenaResults([]);
  }

  const hasFeatured = !!(featured.bod?.profile_a && featured.bod?.profile_b);
  const hasUpcoming = !!(featured.upcoming?.profile_a && featured.upcoming?.profile_b);
  const hasSidebar = hasFeatured || hasUpcoming;

  return (
    <div className="max-w-6xl mx-auto px-4 py-5">

      {/* ── Search bar ── */}
      <div ref={searchRef} className="relative mb-6">
        <div
          className="flex items-center gap-2 px-4 py-3 rounded-2xl"
          style={{
            background: "#111827",
            border: `1px solid ${query ? "rgba(240,192,64,0.3)" : "#1B2338"}`,
            boxShadow: query ? "0 0 12px rgba(240,192,64,0.06)" : "none",
          }}
        >
          <span className="text-base shrink-0" style={{ color: "#3D5070" }}>🔍</span>
          <input
            type="search"
            placeholder="Search arenas or people…"
            value={query}
            onChange={handleQueryChange}
            className="flex-1 bg-transparent text-white placeholder:text-zinc-600 text-sm focus:outline-none"
          />
          {query ? (
            <button onClick={clearSearch} className="text-zinc-600 hover:text-zinc-400 text-sm shrink-0">✕</button>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-widest shrink-0 hidden sm:inline" style={{ color: "#1B2338" }}>⌘K</span>
          )}
          {/* Create arena + icon */}
          <div className="relative group/create shrink-0">
            <Link
              href={user ? "/arenas/new" : "/profile"}
              className="flex items-center justify-center w-7 h-7 rounded-lg font-black text-base transition-colors"
              style={{ color: "#3D5070", background: "#141A2C", border: "1px solid #253147" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.color = "#F0C040";
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(240,192,64,0.3)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.color = "#3D5070";
                (e.currentTarget as HTMLElement).style.borderColor = "#253147";
              }}
            >
              +
            </Link>
            {/* Tooltip */}
            <div
              className="absolute right-0 top-full mt-1.5 px-2 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap pointer-events-none opacity-0 group-hover/create:opacity-100 transition-opacity duration-150 z-50"
              style={{ background: "#141A2C", border: "1px solid #253147", color: "#8096B0" }}
            >
              Create Arena
            </div>
          </div>
        </div>
        <SearchDropdown
          query={query}
          profiles={profileResults}
          arenas={arenaResults}
          onClose={clearSearch}
        />
      </div>

      {/* ── Two-column layout ── */}
      <div className={`flex flex-col gap-5 ${hasSidebar ? "lg:flex-row" : ""}`}>

        {/* ── Left / main: arenas + quick actions ── */}
        <div className="flex-1 min-w-0">
            {/* Arena grid */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-black uppercase tracking-widest" style={{ color: "#3D5070" }}>
              🌐 Arenas
            </h2>
          </div>

          {arenasLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 h-28 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {arenas.map((arena) => (
                <ArenaCard
                  key={arena.id}
                  name={arena.name}
                  slug={arena.slug}
                  description={arena.description}
                  is_official={arena.is_official}
                  is_verified={arena.is_verified}
                  player_count={arena.player_count}
                  mode="explore"
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Right sidebar: featured battles ── */}
        {hasSidebar && (
          <div className="lg:w-64 xl:w-72 shrink-0 flex flex-col gap-4">
            {hasFeatured && featured.bod && (
              <BattleOfDayCard battle={featured.bod} h2h={h2h} user={user} />
            )}
            {hasUpcoming && featured.upcoming && (
              <ComingUpCard battle={featured.upcoming} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
