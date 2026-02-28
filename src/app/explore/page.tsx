"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import {
  getExploreArenas,
  searchProfiles,
  getFeaturedBattles,
  getHeadToHead,
  getUserVoteForFeaturedPair,
  getSharedArenaId,
  getTopProfilesForArena,
  type ArenaWithCount,
  type FeaturedBattle,
  type HeadToHeadStats,
} from "@/lib/arenas";
import ArenaCard, { ARENA_EMOJIS } from "@/components/ArenaCard";
import { useAuth } from "@/context/AuthContext";
import { createBrowserClient } from "@supabase/ssr";
import type { User } from "@supabase/supabase-js";
import {
  getCategoryChildren,
  getCategoryAncestors,
  getCategoryDescendantIds,
  getCategoryDescendants,
} from "@/lib/categories";
import type { CategoryRow } from "@/lib/supabase";

function supabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

type ProfileHit = {
  id: string;
  name: string;
  image_url: string | null;
  category: string | null;
};

type ForumThread = {
  id: string;
  title: string;
  content: string | null;
  reply_count: number;
  author_name: string | null;
  created_at: string;
};

type ArticlePreview = {
  id: string;
  title: string;
  content: string | null;
  image_url: string | null;
  published_at: string;
  slug: string;
  author_display: string | null;
};

type NewsPost = {
  id: string;
  title: string;
  content: string | null;
  image_url: string | null;
  published_at: string;
};

type TopPlayer = { id: string; name: string; image_url: string | null; elo_rating: number };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// ─── Countdown Timer ─────────────────────────────────────────────────────────

function CountdownTimer() {
  const [timeLeft, setTimeLeft] = useState("");
  useEffect(() => {
    function update() {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setHours(24, 0, 0, 0);
      const diff = tomorrow.getTime() - now.getTime();
      const h = String(Math.floor(diff / 3600000)).padStart(2, "0");
      const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0");
      const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0");
      setTimeLeft(`${h}:${m}:${s}`);
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);
  return (
    <span className="font-heading text-xs tracking-wider" style={{ color: "#F0C040" }}>{timeLeft}</span>
  );
}

// ─── Compact Battle of the Day (sidebar version) ─────────────────────────────

function CompactBattleCard({
  battle, h2h, user,
}: {
  battle: FeaturedBattle;
  h2h: HeadToHeadStats | null;
  user: User | null;
}) {
  const [votedFor, setVotedFor] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [aWinsAdj, setAWinsAdj] = useState(0);
  const [totalAdj, setTotalAdj] = useState(0);
  const pa = battle.profile_a;
  const pb = battle.profile_b;

  useEffect(() => {
    if (!user || !pa || !pb) { setVotedFor(null); return; }
    getUserVoteForFeaturedPair(user.id, pa.id, pb.id).then(setVotedFor);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, pa?.id, pb?.id]);

  if (!pa || !pb) return null;
  const total = (h2h?.total ?? 0) + totalAdj;
  const aWins = (h2h?.a_wins ?? 0) + aWinsAdj;
  const aPct = total > 0 ? Math.round((aWins / total) * 100) : 50;
  const bPct = 100 - aPct;

  function fb(n: string) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(n)}&background=0F0F1A&color=888&size=200&bold=true`;
  }

  async function handleVote(winnerId: string) {
    if (!pa || !pb || !user) { if (!user) setShowSignIn(true); return; }
    if (voting || winnerId === votedFor) return;
    const loserId = winnerId === pa.id ? pb.id : pa.id;
    const wasFirst = votedFor === null;
    const prev = votedFor;
    setVotedFor(winnerId);
    if (wasFirst) { setTotalAdj((t) => t + 1); if (winnerId === pa.id) setAWinsAdj((a) => a + 1); }
    else { if (prev === pa.id) setAWinsAdj((a) => a - 1); if (winnerId === pa.id) setAWinsAdj((a) => a + 1); }
    if (wasFirst) {
      setVoting(true);
      const arenaId = await getSharedArenaId(pa.id, pb.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (arenaId) await (supabase() as any).rpc("record_match", { p_arena_id: arenaId, p_winner_id: winnerId, p_loser_id: loserId, p_voter_id: user.id });
      setVoting(false);
    }
  }

  return (
    <>
      <div className="rounded-2xl overflow-hidden"
        style={{ background: "#0F0F1A", border: "1px solid rgba(139,92,246,0.15)" }}>
        {/* Header */}
        <div className="px-3 pt-2.5 pb-2 flex items-center justify-between border-b" style={{ borderColor: "rgba(139,92,246,0.1)" }}>
          <div className="flex items-center gap-1.5">
            <span className="text-xs">{"\u2694\uFE0F"}</span>
            <span className="font-heading text-xs tracking-wider" style={{ color: "#A78BFA" }}>BATTLE OF THE DAY</span>
          </div>
          <CountdownTimer />
        </div>
        {/* Photos */}
        <div className="flex relative" style={{ aspectRatio: "2/1.1" }}>
          <button onClick={() => handleVote(pa.id)} disabled={voting}
            className="flex-1 relative overflow-hidden text-left"
            style={{ outline: votedFor === pa.id ? "2px solid #8B5CF6" : "2px solid transparent", outlineOffset: "-2px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pa.image_url ?? fb(pa.name)} alt={pa.name}
              className="w-full h-full object-cover object-top"
              style={{ opacity: votedFor && votedFor !== pa.id ? 0.5 : 1 }}
              onError={(e) => { (e.target as HTMLImageElement).src = fb(pa.name); }} />
            <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to top, rgba(5,5,8,0.9) 0%, transparent 60%)" }} />
            {votedFor === pa.id && <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-full text-[8px] font-black" style={{ background: "#8B5CF6", color: "#fff" }}>YOUR PICK</div>}
            <p className="absolute bottom-5 left-1.5 right-1 text-white font-black text-[10px] leading-tight truncate">{pa.name}</p>
            <span className="absolute bottom-1 left-1.5 font-black text-sm" style={{ color: votedFor === pa.id ? "#A78BFA" : "#4A4A66" }}>{aPct}%</span>
          </button>
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
            <div className="w-6 h-6 flex items-center justify-center rounded-full font-black text-[8px]"
              style={{ background: "#050508", border: "2px solid rgba(139,92,246,0.3)", color: "#A78BFA" }}>VS</div>
          </div>
          <button onClick={() => handleVote(pb.id)} disabled={voting}
            className="flex-1 relative overflow-hidden text-left"
            style={{ outline: votedFor === pb.id ? "2px solid #8B5CF6" : "2px solid transparent", outlineOffset: "-2px" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pb.image_url ?? fb(pb.name)} alt={pb.name}
              className="w-full h-full object-cover object-top"
              style={{ opacity: votedFor && votedFor !== pb.id ? 0.5 : 1 }}
              onError={(e) => { (e.target as HTMLImageElement).src = fb(pb.name); }} />
            <div className="absolute inset-0 pointer-events-none" style={{ background: "linear-gradient(to top, rgba(5,5,8,0.9) 0%, transparent 60%)" }} />
            {votedFor === pb.id && <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full text-[8px] font-black" style={{ background: "#8B5CF6", color: "#fff" }}>YOUR PICK</div>}
            <p className="absolute bottom-5 left-1 right-1.5 text-white font-black text-[10px] leading-tight truncate text-right">{pb.name}</p>
            <span className="absolute bottom-1 right-1.5 font-black text-sm" style={{ color: votedFor === pb.id ? "#A78BFA" : "#4A4A66" }}>{bPct}%</span>
          </button>
        </div>
        {/* Vote bar */}
        <div className="px-3 py-2">
          <div className="flex items-center gap-1.5 mb-1">
            <span className="text-[9px] font-black" style={{ color: votedFor === pa.id ? "#A78BFA" : "#4A4A66" }}>{aPct}%</span>
            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#1A1A28" }}>
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${aPct}%`, background: "linear-gradient(90deg, #8B5CF6, #A78BFA 50%, #F0C040)" }} />
            </div>
            <span className="text-[9px] font-black text-right" style={{ color: votedFor === pb.id ? "#A78BFA" : "#4A4A66" }}>{bPct}%</span>
          </div>
          <p className="text-center text-[8px] font-bold" style={{ color: "#2A2A3D" }}>
            {total > 0 ? `${total.toLocaleString()} votes` : "Be the first to vote"}
            {votedFor && " \u2022 Voted"}
          </p>
        </div>
      </div>
      {showSignIn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(5,5,8,0.92)", backdropFilter: "blur(8px)" }} onClick={() => setShowSignIn(false)}>
          <div className="max-w-xs w-full rounded-2xl p-8 text-center"
            style={{ background: "#0F0F1A", border: "1px solid rgba(139,92,246,0.25)", boxShadow: "0 0 40px rgba(139,92,246,0.1)" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="text-5xl mb-4">{"\u2694\uFE0F"}</div>
            <h2 className="text-white font-black text-xl mb-2">Join the Arena</h2>
            <p className="text-sm mb-6" style={{ color: "#4A4A66" }}>Sign in to cast your vote.</p>
            <Link href="/profile" className="block btn-purple rounded-xl px-6 py-3 text-sm font-black uppercase tracking-wider"
              onClick={() => setShowSignIn(false)}>Sign In {"\u2192"}</Link>
            <button onClick={() => setShowSignIn(false)} className="mt-4 text-xs font-bold hover:underline" style={{ color: "#4A4A66" }}>Maybe later</button>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Upcoming Battle mini-card ───────────────────────────────────────────────

function UpcomingBattleCard({ battle }: { battle: FeaturedBattle }) {
  const pa = battle.profile_a;
  const pb = battle.profile_b;
  if (!pa || !pb) return null;

  function fb(n: string) {
    return `https://ui-avatars.com/api/?name=${encodeURIComponent(n)}&background=0F0F1A&color=888&size=80&bold=true`;
  }

  return (
    <div className="rounded-xl p-3 flex items-center gap-3"
      style={{ background: "#0F0F1A", border: "1px solid #222233" }}>
      <div className="flex items-center gap-1 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pa.image_url ?? fb(pa.name)} alt={pa.name}
          className="w-8 h-8 rounded-full object-cover" style={{ border: "1px solid #222233" }}
          onError={(e) => { (e.target as HTMLImageElement).src = fb(pa.name); }} />
        <span className="text-[9px] font-black" style={{ color: "#A78BFA" }}>VS</span>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pb.image_url ?? fb(pb.name)} alt={pb.name}
          className="w-8 h-8 rounded-full object-cover" style={{ border: "1px solid #222233" }}
          onError={(e) => { (e.target as HTMLImageElement).src = fb(pb.name); }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-black text-white truncate">{pa.name} vs {pb.name}</p>
        {battle.label && (
          <p className="text-[9px] font-bold" style={{ color: "#F0C040" }}>{battle.label}</p>
        )}
      </div>
    </div>
  );
}

// ─── Search dropdown ──────────────────────────────────────────────────────────

function SearchDropdown({ query, profiles, arenas, onClose }: {
  query: string; profiles: ProfileHit[]; arenas: ArenaWithCount[]; onClose: () => void;
}) {
  if (!query.trim() || (profiles.length === 0 && arenas.length === 0)) return null;
  return (
    <div className="absolute left-0 right-0 top-full mt-1.5 rounded-2xl overflow-hidden z-50"
      style={{ background: "rgba(10,10,18,0.98)", border: "1px solid rgba(139,92,246,0.15)", boxShadow: "0 20px 50px rgba(0,0,0,0.8)", backdropFilter: "blur(20px)" }}>
      {profiles.length > 0 && (
        <div>
          <p className="px-4 pt-3 pb-1 text-[9px] font-black uppercase tracking-widest" style={{ color: "#2A2A3D" }}>People</p>
          {profiles.map((p) => (
            <Link key={p.id} href={`/players/${p.id}`} onClick={onClose}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.image_url ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=0F0F1A&color=888&size=48&bold=true`}
                alt="" className="w-8 h-8 rounded-full object-cover shrink-0" style={{ border: "1px solid #222233" }}
                onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(p.name)}&background=0F0F1A&color=888&size=48&bold=true`; }} />
              <div className="min-w-0">
                <p className="text-white font-bold text-sm truncate">{p.name}</p>
                {p.category && <p className="text-[10px] font-bold uppercase" style={{ color: "#4A4A66" }}>{p.category.replace(/_/g, " ")}</p>}
              </div>
            </Link>
          ))}
        </div>
      )}
      {arenas.length > 0 && (
        <div>
          <p className="px-4 pt-3 pb-1 text-[9px] font-black uppercase tracking-widest" style={{ color: "#2A2A3D" }}>Arenas</p>
          {arenas.slice(0, 5).map((a) => (
            <Link key={a.id} href={`/swipe/${a.slug}`} onClick={onClose}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors">
              <span className="text-xl shrink-0">{ARENA_EMOJIS[a.slug] ?? "\u2694\uFE0F"}</span>
              <div className="min-w-0">
                <p className="text-white font-bold text-sm truncate">{a.name}</p>
                <p className="text-[10px] font-bold" style={{ color: "#4A4A66" }}>{a.player_count} players</p>
              </div>
            </Link>
          ))}
        </div>
      )}
      <div style={{ height: "8px" }} />
    </div>
  );
}

// ─── Main Explore Page ───────────────────────────────────────────────────────

export default function ExplorePage() {
  const { user } = useAuth();
  const [arenas, setArenas] = useState<ArenaWithCount[]>([]);
  const [arenasLoading, setArenasLoading] = useState(true);
  const [featured, setFeatured] = useState<{ bod: FeaturedBattle | null; upcoming: FeaturedBattle | null }>({ bod: null, upcoming: null });
  const [h2h, setH2h] = useState<HeadToHeadStats | null>(null);
  const [query, setQuery] = useState("");
  const [profileResults, setProfileResults] = useState<ProfileHit[]>([]);
  const [arenaResults, setArenaResults] = useState<ArenaWithCount[]>([]);
  const [topThread, setTopThread] = useState<ForumThread | null>(null);
  const [latestArticle, setLatestArticle] = useState<ArticlePreview | null>(null);
  const [newsPosts, setNewsPosts] = useState<NewsPost[]>([]);
  const [topPlayersMap, setTopPlayersMap] = useState<Record<string, TopPlayer[]>>({});
  const [selectedCategory, setSelectedCategory] = useState<CategoryRow | null>(null);
  const [rootCategories, setRootCategories] = useState<CategoryRow[]>([]);
  const [selectedRoot, setSelectedRoot] = useState<CategoryRow | null>(null);
  const [categoryChildren, setCategoryChildren] = useState<CategoryRow[]>([]);
  const [categoryAncestors, setCategoryAncestors] = useState<{ id: string; name: string; slug: string; depth: number }[]>([]);
  const [categoryLoading, setCategoryLoading] = useState(true);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const officialScrollRef = useRef<HTMLDivElement>(null);
  const moderatorScrollRef = useRef<HTMLDivElement>(null);
  const customScrollRef = useRef<HTMLDivElement>(null);

  // Split arenas: highlighted (All + Members), official, moderator, custom
  const HIGHLIGHTED_SLUGS = ["all", "members"];
  const highlightedArenas = HIGHLIGHTED_SLUGS
    .map((slug) => arenas.find((a) => a.slug === slug))
    .filter(Boolean) as ArenaWithCount[];
  const officialArenas = arenas.filter((a) => a.is_official && !HIGHLIGHTED_SLUGS.includes(a.slug));
  const moderatorArenas = arenas.filter((a) => (a as ArenaWithCount & { arena_tier?: string }).arena_tier === "moderator");
  const customArenas = arenas.filter((a) => !a.is_official && (a as ArenaWithCount & { arena_tier?: string }).arena_tier !== "moderator");

  // Load initial categories — fetch all root categories, auto-select first
  useEffect(() => {
    getCategoryChildren(null).then((roots) => {
      setRootCategories(roots);
      if (roots.length > 0) {
        setSelectedRoot(roots[0]);
        getCategoryChildren(roots[0].id).then((children) => {
          setCategoryChildren(children);
          setCategoryLoading(false);
        });
      } else {
        setCategoryLoading(false);
      }
    });
  }, []);

  // Handle category selection
  const handleCategorySelect = useCallback(async (category: CategoryRow | null) => {
    setSelectedCategory(category);
    setArenasLoading(true);

    if (!category) {
      // Back to "All" — no filter, show root sub-categories
      setCategoryAncestors([]);
      if (selectedRoot) {
        getCategoryChildren(selectedRoot.id).then(setCategoryChildren);
      } else {
        getCategoryChildren(null).then(setCategoryChildren);
      }
      getExploreArenas({ sort: "popular" }).then((data) => { setArenas(data); setArenasLoading(false); });
      return;
    }

    // Load ancestors (breadcrumbs) and children
    const [ancestors, children] = await Promise.all([
      getCategoryAncestors(category.id),
      getCategoryChildren(category.id),
    ]);
    setCategoryAncestors(ancestors);

    // Always show siblings + children so user can navigate freely
    const parentId = category.parent_id ?? selectedRoot?.id ?? null;
    const siblings = await getCategoryChildren(parentId);
    const siblingIds = new Set(siblings.map((s) => s.id));
    // Children that aren't already in siblings list (sub-categories)
    const extraChildren = children.filter((c) => !siblingIds.has(c.id));
    setCategoryChildren([...siblings, ...extraChildren]);

    // Get all descendant IDs + slugs for filtering (matches both category_id and legacy category slug)
    const descendants = await getCategoryDescendants(category.id);
    const data = await getExploreArenas({ sort: "popular", categoryDescendantIds: descendants.ids, categorySlugs: descendants.slugs });
    setArenas(data);
    setArenasLoading(false);
  }, [selectedRoot]);

  // Switch root category (e.g. Men ↔ Women)
  const handleRootSwitch = useCallback(async (root: CategoryRow) => {
    setSelectedRoot(root);
    setSelectedCategory(null);
    setCategoryAncestors([]);
    setArenasLoading(true);
    const children = await getCategoryChildren(root.id);
    setCategoryChildren(children);
    // Filter arenas to this root's descendants (IDs + slugs for legacy matching)
    const descendants = await getCategoryDescendants(root.id);
    const data = await getExploreArenas({ sort: "popular", categoryDescendantIds: descendants.ids, categorySlugs: descendants.slugs });
    setArenas(data);
    setArenasLoading(false);
  }, []);

  useEffect(() => {
    const db = supabase();
    // Arenas — then fetch top 3 players for highlighted arenas
    getExploreArenas({ sort: "popular" }).then(async (data) => {
      // Fix player counts for highlighted arenas — show real profile counts
      const highlighted = data.filter((a) => HIGHLIGHTED_SLUGS.includes(a.slug));
      for (const arena of highlighted) {
        if (arena.slug === "members") {
          // "All Players" — real users + seeded users (exclude official/celebrity profiles)
          const { count } = await db.from("profiles").select("id", { count: "exact", head: true }).eq("is_test_profile", false);
          arena.player_count = count ?? 0;
        } else if (arena.slug === "all") {
          // "All" — count total profiles (everyone)
          const { count } = await db.from("profiles").select("id", { count: "exact", head: true });
          arena.player_count = count ?? 0;
        }
        // Fetch top 3 leaderboard
        // "All Players" excludes official profiles (is_test_profile=true)
        // "All" shows everyone
        const excludeOfficial = arena.slug === "members";
        getTopProfilesForArena(arena.id, 3, { excludeTestProfiles: excludeOfficial }).then((players) => {
          setTopPlayersMap((prev) => ({ ...prev, [arena.id]: players }));
        });
      }
      setArenas(data);
      setArenasLoading(false);
    });
    // Featured battles
    getFeaturedBattles().then((battles) => {
      const bod = battles.find((b) => b.type === "battle_of_day") ?? null;
      const upcoming = battles.find((b) => b.type === "upcoming") ?? null;
      setFeatured({ bod, upcoming });
      if (bod?.profile_a && bod?.profile_b) getHeadToHead(bod.profile_a.id, bod.profile_b.id).then(setH2h);
    });
    // Top forum thread (most replies)
    db.from("forum_threads")
      .select("id, title, content, reply_count, author_name, created_at")
      .order("reply_count", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setTopThread(data[0] as ForumThread);
      });
    // Latest article
    db.from("articles")
      .select("id, title, content, image_url, published_at, slug, author_display")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (data && data.length > 0) setLatestArticle(data[0] as ArticlePreview);
      });
    // News posts
    db.from("news_posts")
      .select("id, title, content, image_url, published_at")
      .eq("is_published", true)
      .order("published_at", { ascending: false })
      .limit(3)
      .then(({ data }) => {
        if (data) setNewsPosts(data as NewsPost[]);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // GSAP stagger for arena cards (horizontal slide-in)
  useEffect(() => {
    if (arenasLoading) return;
    [officialScrollRef, moderatorScrollRef, customScrollRef].forEach((ref) => {
      if (!ref.current) return;
      const cards = ref.current.children;
      if (cards.length === 0) return;
      gsap.fromTo(cards,
        { x: 60, opacity: 0, scale: 0.9 },
        { x: 0, opacity: 1, scale: 1, duration: 0.5, stagger: 0.07, ease: "power2.out" }
      );
    });
  }, [arenasLoading]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setProfileResults([]); setArenaResults([]);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const runSearch = useCallback((q: string) => {
    if (!q.trim()) { setProfileResults([]); setArenaResults([]); return; }
    Promise.all([searchProfiles(q, 6), getExploreArenas({ search: q, sort: "popular" })]).then(([p, a]) => {
      setProfileResults(p as ProfileHit[]); setArenaResults(a);
    });
  }, []);

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value; setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(val), 220);
  }
  function clearSearch() { setQuery(""); setProfileResults([]); setArenaResults([]); }

  const hasFeatured = !!(featured.bod?.profile_a && featured.bod?.profile_b);

  function scrollSection(ref: React.RefObject<HTMLDivElement | null>, dir: "left" | "right") {
    if (!ref.current) return;
    ref.current.scrollBy({ left: dir === "left" ? -300 : 300, behavior: "smooth" });
  }

  // ── Right sidebar feed content ──
  const feedContent = (
    <div className="space-y-4">
      {/* Battle of the Day */}
      {hasFeatured && featured.bod && (
        <CompactBattleCard battle={featured.bod} h2h={h2h} user={user} />
      )}

      {/* Upcoming Battle */}
      {featured.upcoming?.profile_a && featured.upcoming?.profile_b && (
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest mb-2 px-1" style={{ color: "#2A2A3D" }}>
            {"\u{1F525}"} COMING UP
          </p>
          <UpcomingBattleCard battle={featured.upcoming} />
        </div>
      )}

      {/* News Posts */}
      {newsPosts.length > 0 && (
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest mb-2 px-1" style={{ color: "#2A2A3D" }}>
            {"\uD83D\uDCE2"} NEWS
          </p>
          <div className="space-y-2">
            {newsPosts.map((post) => (
              <Link key={post.id} href="/news"
                className="block rounded-xl p-3 transition-all hover:scale-[1.01]"
                style={{ background: "#0F0F1A", border: "1px solid #222233" }}>
                {post.image_url && (
                  <div className="relative rounded-lg overflow-hidden mb-2" style={{ aspectRatio: "16/8" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={post.image_url} alt={post.title} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 pointer-events-none" style={{
                      background: "linear-gradient(to top, rgba(15,15,26,0.8) 0%, transparent 60%)"
                    }} />
                  </div>
                )}
                <p className="text-white text-xs font-bold leading-snug line-clamp-2 mb-1">{post.title}</p>
                {post.content && (
                  <p className="text-[10px] leading-snug line-clamp-2 mb-1" style={{ color: "#4A4A66" }}>
                    {post.content.slice(0, 100)}
                  </p>
                )}
                <p className="text-[9px] font-bold" style={{ color: "#2A2A3D" }}>
                  {timeAgo(post.published_at)}
                </p>
              </Link>
            ))}
            <Link href="/news"
              className="block text-center py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all hover:scale-[1.02]"
              style={{ color: "#4A4A66", background: "#0F0F1A", border: "1px solid #222233" }}>
              All News {"\u2192"}
            </Link>
          </div>
        </div>
      )}

      {/* Top Forum Post */}
      {topThread && (
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest mb-2 px-1" style={{ color: "#2A2A3D" }}>
            {"\uD83D\uDCAC"} TOP POST
          </p>
          <Link href={`/forum/${topThread.id}`}
            className="block rounded-xl p-3 transition-all hover:scale-[1.01]"
            style={{ background: "#0F0F1A", border: "1px solid #222233" }}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[9px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full"
                style={{ color: "#22C55E", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.15)" }}>
                FORUM
              </span>
              <span className="text-[9px] font-bold" style={{ color: "#2A2A3D" }}>
                {topThread.reply_count} {topThread.reply_count === 1 ? "reply" : "replies"}
              </span>
            </div>
            <p className="text-white text-xs font-bold leading-snug line-clamp-2 mb-1">{topThread.title}</p>
            {topThread.content && (
              <p className="text-[10px] leading-snug line-clamp-2 mb-1.5" style={{ color: "#4A4A66" }}>
                {topThread.content.slice(0, 120)}
              </p>
            )}
            <p className="text-[9px] font-bold" style={{ color: "#2A2A3D" }}>
              {topThread.author_name ?? "Anon"} {"\u2022"} {timeAgo(topThread.created_at)}
            </p>
          </Link>
        </div>
      )}

      {/* Latest Article */}
      {latestArticle && (
        <div>
          <p className="text-[9px] font-black uppercase tracking-widest mb-2 px-1" style={{ color: "#2A2A3D" }}>
            {"\uD83D\uDCDD"} LATEST ARTICLE
          </p>
          <Link href={`/articles/${latestArticle.slug}`}
            className="block rounded-xl overflow-hidden transition-all hover:scale-[1.01]"
            style={{ background: "#0F0F1A", border: "1px solid #222233" }}>
            {latestArticle.image_url && (
              <div className="relative" style={{ aspectRatio: "16/8" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={latestArticle.image_url} alt={latestArticle.title}
                  className="w-full h-full object-cover" />
                <div className="absolute inset-0 pointer-events-none" style={{
                  background: "linear-gradient(to top, rgba(15,15,26,1) 0%, transparent 60%)"
                }} />
              </div>
            )}
            <div className="p-3">
              <p className="text-white text-xs font-bold leading-snug line-clamp-2 mb-1">{latestArticle.title}</p>
              {latestArticle.content && (
                <p className="text-[10px] leading-snug line-clamp-2 mb-1.5" style={{ color: "#4A4A66" }}>
                  {latestArticle.content.slice(0, 120)}
                </p>
              )}
              <p className="text-[9px] font-bold" style={{ color: "#2A2A3D" }}>
                {latestArticle.author_display ?? "MogBattles"} {"\u2022"} {timeAgo(latestArticle.published_at)}
              </p>
            </div>
          </Link>
        </div>
      )}

      {/* View all links */}
      <div className="flex gap-2">
        <Link href="/forum"
          className="flex-1 text-center py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all hover:scale-[1.02]"
          style={{ color: "#4A4A66", background: "#0F0F1A", border: "1px solid #222233" }}>
          All Posts {"\u2192"}
        </Link>
        <Link href="/articles"
          className="flex-1 text-center py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all hover:scale-[1.02]"
          style={{ color: "#4A4A66", background: "#0F0F1A", border: "1px solid #222233" }}>
          All Articles {"\u2192"}
        </Link>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-5">

      {/* ── Search bar (full width) ── */}
      <div ref={searchRef} className="relative mb-6">
        <div className="flex items-center gap-2 px-4 py-3 rounded-2xl"
          style={{ background: "#0F0F1A", border: `1px solid ${query ? "rgba(139,92,246,0.3)" : "#222233"}` }}>
          <span className="text-base shrink-0" style={{ color: "#4A4A66" }}>{"\uD83D\uDD0D"}</span>
          <input type="search" placeholder="Search arenas or people..." value={query} onChange={handleQueryChange}
            className="flex-1 bg-transparent text-white text-sm focus:outline-none" style={{ caretColor: "#8B5CF6" }} />
          {query ? (
            <button onClick={clearSearch} className="text-sm shrink-0" style={{ color: "#4A4A66" }}>{"\u2715"}</button>
          ) : (
            <span className="text-[10px] font-bold uppercase tracking-widest shrink-0 hidden sm:inline" style={{ color: "#222233" }}>{"\u2318K"}</span>
          )}
          <Link href={user ? "/arenas/new" : "/profile"}
            className="flex items-center justify-center w-7 h-7 rounded-lg font-black text-base"
            style={{ color: "#4A4A66", background: "#1A1A28", border: "1px solid #2A2A3D" }}>+</Link>
        </div>
        <SearchDropdown query={query} profiles={profileResults} arenas={arenaResults} onClose={clearSearch} />
      </div>

      {/* ── Root Category Tabs + Sub-Category Chips ── */}
      {!categoryLoading && (
        <div className="mb-5">
          {/* Root category tabs (e.g. Men | Women) */}
          {rootCategories.length > 0 && (
            <div className="flex items-center gap-2 mb-3">
              {rootCategories.map((root) => (
                <button key={root.id} onClick={() => handleRootSwitch(root)}
                  className="px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all"
                  style={selectedRoot?.id === root.id ? {
                    background: "rgba(139,92,246,0.15)",
                    color: "#A78BFA",
                    border: "1px solid rgba(139,92,246,0.4)",
                  } : {
                    background: "transparent",
                    color: "#4A4A66",
                    border: "1px solid transparent",
                  }}>
                  {root.icon ? `${root.icon} ` : ""}{root.name}
                </button>
              ))}
              {/* Breadcrumb trail when drilled into a sub-category */}
              {selectedCategory && categoryAncestors.length > 0 && (
                <div className="flex items-center gap-1.5">
                  {categoryAncestors
                    .filter((a) => a.id !== selectedRoot?.id) // root is already shown as tab
                    .map((ancestor) => (
                    <span key={ancestor.id} className="flex items-center gap-1.5">
                      <span className="text-[10px]" style={{ color: "#2A2A3D" }}>{"\u203A"}</span>
                      {ancestor.id === selectedCategory.id ? (
                        <span className="text-[10px] font-black uppercase tracking-wider" style={{ color: "#F0C040" }}>
                          {ancestor.name}
                        </span>
                      ) : (
                        <button
                          onClick={async () => {
                            const { getCategoryById } = await import("@/lib/categories");
                            const cat = await getCategoryById(ancestor.id);
                            if (cat) handleCategorySelect(cat);
                          }}
                          className="text-[10px] font-bold uppercase tracking-wider transition-colors hover:underline"
                          style={{ color: "#A78BFA" }}>
                          {ancestor.name}
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Sub-category chips */}
          {categoryChildren.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-2 arena-scroll-hide" style={{ scrollbarWidth: "none" }}>
              {/* "All" chip — resets to show everything under root */}
              <button onClick={() => handleCategorySelect(null)}
                className="shrink-0 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all hover:scale-[1.03] active:scale-[0.97]"
                style={!selectedCategory ? {
                  background: "rgba(139,92,246,0.15)",
                  color: "#A78BFA",
                  border: "1px solid rgba(139,92,246,0.4)",
                  boxShadow: "0 0 12px rgba(139,92,246,0.1)",
                } : {
                  background: "#0F0F1A",
                  color: "#4A4A66",
                  border: "1px solid #222233",
                }}>
                {"\uD83C\uDF0D"} All
              </button>
              {categoryChildren.map((cat) => (
                <button key={cat.id} onClick={() => handleCategorySelect(cat)}
                  className="shrink-0 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider transition-all hover:scale-[1.03] active:scale-[0.97]"
                  style={selectedCategory?.id === cat.id ? {
                    background: "rgba(139,92,246,0.15)",
                    color: "#A78BFA",
                    border: "1px solid rgba(139,92,246,0.4)",
                    boxShadow: "0 0 12px rgba(139,92,246,0.1)",
                  } : {
                    background: "#0F0F1A",
                    color: "#4A4A66",
                    border: "1px solid #222233",
                  }}>
                  {cat.icon ? `${cat.icon} ` : ""}{cat.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Two-column layout ── */}
      <div className="flex gap-6">

        {/* ── LEFT: Arenas ── */}
        <div className="flex-1 min-w-0">

          {/* Highlighted Arenas: All + Members — compact with leaderboard preview */}
          {!arenasLoading && (highlightedArenas.length > 0) && (
            <div className="mb-6">
              <div className="flex gap-3">
                {highlightedArenas.map((arena) => {
                  const topPlayers = topPlayersMap[arena.id] ?? [];
                  const icon = ARENA_EMOJIS[arena.slug] ?? "\u2694\uFE0F";
                  return (
                    <div key={arena.id}
                      className="group flex-1 min-w-0 rounded-xl overflow-hidden transition-all duration-200 hover:scale-[1.02]"
                      style={{ background: "#0F0F1A", border: "1px solid rgba(139,92,246,0.2)" }}>
                      <div className="px-4 py-3">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-lg shrink-0">{icon}</span>
                            <div className="min-w-0">
                              <h3 className="text-white font-black text-sm leading-tight truncate">{arena.name}</h3>
                              <p className="text-[10px] font-bold" style={{ color: "#4A4A66" }}>{arena.player_count} players</p>
                            </div>
                          </div>
                          {arena.is_verified && (
                            <span className="text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full shrink-0"
                              style={{ color: "#F0C040", background: "rgba(240,192,64,0.1)", border: "1px solid rgba(240,192,64,0.2)" }}>
                              {"\u2713"}
                            </span>
                          )}
                        </div>
                        {/* Top 3 leaderboard preview */}
                        {topPlayers.length > 0 && (
                          <div className="space-y-1.5 mb-3">
                            {topPlayers.map((player, i) => (
                              <div key={player.id} className="flex items-center gap-2">
                                <span className="text-[10px] font-black w-4 text-center" style={{ color: i === 0 ? "#F0C040" : i === 1 ? "#C0C0C0" : "#CD7F32" }}>
                                  {i + 1}
                                </span>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={player.image_url ?? `https://ui-avatars.com/api/?name=${encodeURIComponent(player.name)}&background=0F0F1A&color=888&size=48&bold=true`}
                                  alt={player.name}
                                  className="w-6 h-6 rounded-full object-cover shrink-0"
                                  style={{ border: "1px solid #222233" }}
                                  onError={(e) => { (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(player.name)}&background=0F0F1A&color=888&size=48&bold=true`; }}
                                />
                                <span className="text-[11px] font-bold text-white truncate flex-1">{player.name}</span>
                                <span className="text-[10px] font-bold shrink-0" style={{ color: "#A78BFA" }}>{player.elo_rating}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {topPlayers.length === 0 && <div className="mb-3" />}
                        {/* Action buttons */}
                        <div className="flex gap-2">
                          <Link href={`/swipe/${arena.slug}`}
                            className="flex-1 text-center py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all"
                            style={{ background: "rgba(139,92,246,0.1)", color: "#A78BFA", border: "1px solid rgba(139,92,246,0.25)" }}>
                            {"\u2694\uFE0F"} Battle
                          </Link>
                          <Link href={`/leaderboard/${arena.slug}`}
                            className="flex-1 text-center py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all"
                            style={{ background: "rgba(240,192,64,0.08)", color: "#F0C040", border: "1px solid rgba(240,192,64,0.25)" }}>
                            {"\uD83C\uDFC6"} Ranks
                          </Link>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {arenasLoading && (
            <div className="flex gap-3 mb-6">
              {[0, 1].map((i) => (
                <div key={i} className="flex-1 rounded-xl animate-pulse" style={{ height: "160px", background: "#0F0F1A", border: "1px solid #222233" }} />
              ))}
            </div>
          )}

          {/* Official Arenas (horizontal scroll) */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h2 className="font-heading tracking-wide text-xl sm:text-2xl text-white">OFFICIAL ARENAS</h2>
                <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full hidden sm:inline"
                  style={{ color: "#F0C040", background: "rgba(240,192,64,0.1)", border: "1px solid rgba(240,192,64,0.2)" }}>
                  {"\u2713"} VERIFIED
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => scrollSection(officialScrollRef, "left")}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all hover:scale-110 active:scale-95"
                  style={{ background: "#1A1A28", border: "1px solid #2A2A3D", color: "#888" }}>{"\u2039"}</button>
                <button onClick={() => scrollSection(officialScrollRef, "right")}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all hover:scale-110 active:scale-95"
                  style={{ background: "#1A1A28", border: "1px solid #2A2A3D", color: "#888" }}>{"\u203A"}</button>
              </div>
            </div>
            {arenasLoading ? (
              <div className="flex gap-4 overflow-hidden">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="shrink-0 w-[260px] rounded-2xl animate-pulse" style={{ height: "240px", background: "#0F0F1A", border: "1px solid #222233" }} />
                ))}
              </div>
            ) : (
              <div ref={officialScrollRef}
                className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory arena-scroll-hide"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
                {officialArenas.map((arena) => (
                  <div key={arena.id} className="snap-start">
                    <ArenaCard
                      name={arena.name}
                      slug={arena.slug}
                      description={arena.description}
                      is_official={arena.is_official}
                      is_verified={arena.is_verified}
                      player_count={arena.player_count}
                      mode="explore"
                      thumbnail_url={arena.thumbnail_url}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Moderator Arenas (horizontal scroll) */}
          {!arenasLoading && moderatorArenas.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="font-heading tracking-wide text-xl sm:text-2xl text-white">MODERATOR ARENAS</h2>
                  <span className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full hidden sm:inline"
                    style={{ color: "#60A5FA", background: "rgba(59,130,246,0.1)", border: "1px solid rgba(59,130,246,0.2)" }}>
                    {"\uD83D\uDEE1\uFE0F"} TRUSTED
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => scrollSection(moderatorScrollRef, "left")}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all hover:scale-110 active:scale-95"
                    style={{ background: "#1A1A28", border: "1px solid #2A2A3D", color: "#888" }}>{"\u2039"}</button>
                  <button onClick={() => scrollSection(moderatorScrollRef, "right")}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all hover:scale-110 active:scale-95"
                    style={{ background: "#1A1A28", border: "1px solid #2A2A3D", color: "#888" }}>{"\u203A"}</button>
                </div>
              </div>
              <div ref={moderatorScrollRef}
                className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory arena-scroll-hide"
                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
                {moderatorArenas.map((arena) => (
                  <div key={arena.id} className="snap-start">
                    <ArenaCard
                      name={arena.name}
                      slug={arena.slug}
                      description={arena.description}
                      is_official={arena.is_official}
                      is_verified={arena.is_verified}
                      player_count={arena.player_count}
                      mode="explore"
                      thumbnail_url={arena.thumbnail_url}
                      arena_tier="moderator"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Custom Arenas (horizontal scroll) */}
          {(arenasLoading || customArenas.length > 0) && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <h2 className="font-heading tracking-wide text-xl sm:text-2xl text-white">CUSTOM ARENAS</h2>
                  <span className="text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full hidden sm:inline"
                    style={{ color: "#4A4A66", background: "#1A1A28", border: "1px solid #2A2A3D" }}>
                    COMMUNITY
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Link href={user ? "/arenas/new" : "/profile"}
                    className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full transition-all hover:scale-105"
                    style={{ color: "#A78BFA", background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)" }}>
                    + Create
                  </Link>
                  <button onClick={() => scrollSection(customScrollRef, "left")}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all hover:scale-110 active:scale-95"
                    style={{ background: "#1A1A28", border: "1px solid #2A2A3D", color: "#888" }}>{"\u2039"}</button>
                  <button onClick={() => scrollSection(customScrollRef, "right")}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all hover:scale-110 active:scale-95"
                    style={{ background: "#1A1A28", border: "1px solid #2A2A3D", color: "#888" }}>{"\u203A"}</button>
                </div>
              </div>
              {arenasLoading ? (
                <div className="flex gap-4 overflow-hidden">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="shrink-0 w-[260px] rounded-2xl animate-pulse" style={{ height: "240px", background: "#0F0F1A", border: "1px solid #222233" }} />
                  ))}
                </div>
              ) : (
                <div ref={customScrollRef}
                  className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory arena-scroll-hide"
                  style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
                  {customArenas.map((arena) => (
                    <div key={arena.id} className="snap-start">
                      <ArenaCard
                        name={arena.name}
                        slug={arena.slug}
                        description={arena.description}
                        is_official={arena.is_official}
                        is_verified={arena.is_verified}
                        player_count={arena.player_count}
                        mode="explore"
                        thumbnail_url={arena.thumbnail_url}
                      />
                    </div>
                  ))}
                  {/* Trailing "create" card */}
                  <Link href={user ? "/arenas/new" : "/profile"}
                    className="group shrink-0 w-[260px] sm:w-[280px] rounded-2xl overflow-hidden flex flex-col items-center justify-center gap-3 transition-all duration-300 hover:scale-[1.03] snap-start"
                    style={{ background: "#0F0F1A", border: "1px dashed #2A2A3D", minHeight: "240px" }}>
                    <span className="text-4xl opacity-40 group-hover:opacity-80 group-hover:scale-110 transition-all duration-300">+</span>
                    <span className="text-xs font-black uppercase tracking-wider" style={{ color: "#4A4A66" }}>Create Arena</span>
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Quick Actions */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            <Link href="/swipe/all"
              className="group rounded-2xl p-4 text-center transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, rgba(139,92,246,0.1), rgba(139,92,246,0.03))", border: "1px solid rgba(139,92,246,0.2)" }}>
              <span className="text-3xl block mb-2">{"\u2694\uFE0F"}</span>
              <span className="text-xs font-black uppercase tracking-wider" style={{ color: "#A78BFA" }}>Quick Battle</span>
            </Link>
            <Link href="/leaderboard/all"
              className="group rounded-2xl p-4 text-center transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, rgba(240,192,64,0.1), rgba(240,192,64,0.03))", border: "1px solid rgba(240,192,64,0.2)" }}>
              <span className="text-3xl block mb-2">{"\uD83C\uDFC6"}</span>
              <span className="text-xs font-black uppercase tracking-wider" style={{ color: "#F0C040" }}>Leaderboards</span>
            </Link>
            <Link href="/live"
              className="group rounded-2xl p-4 text-center transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, rgba(239,68,68,0.1), rgba(239,68,68,0.03))", border: "1px solid rgba(239,68,68,0.2)" }}>
              <span className="text-3xl block mb-2">{"\uD83D\uDD34"}</span>
              <span className="text-xs font-black uppercase tracking-wider" style={{ color: "#EF4444" }}>Live</span>
            </Link>
            <Link href="/forum"
              className="group rounded-2xl p-4 text-center transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, rgba(34,197,94,0.1), rgba(34,197,94,0.03))", border: "1px solid rgba(34,197,94,0.2)" }}>
              <span className="text-3xl block mb-2">{"\uD83D\uDCAC"}</span>
              <span className="text-xs font-black uppercase tracking-wider" style={{ color: "#22C55E" }}>Forum</span>
            </Link>
          </div>

          {/* Mobile: show feed below arenas */}
          <div className="lg:hidden">
            {feedContent}
          </div>
        </div>

        {/* ── RIGHT: Feed sidebar (desktop only) ── */}
        <div className="hidden lg:block w-[320px] shrink-0">
          <div className="sticky top-20">
            {feedContent}
          </div>
        </div>

      </div>
    </div>
  );
}
