"use client";

import { useState, useEffect, useCallback, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { createClient, type ArenaRow } from "@/lib/supabase";
import { getProfilesForArena, getVotedPairs, getMyProfile, type ArenaProfile } from "@/lib/arenas";
import {
  getTopTagsForProfiles,
  getTopTagsForProfile,
  getMyVotedTags,
  voteForTag,
  type TagEntry,
} from "@/lib/tags";
import {
  getImageVotesForProfiles,
  sortImageUrlsByVotes,
} from "@/lib/image_votes";
import { useAuth, useImpersonation } from "@/context/AuthContext";
import ProfileTags from "./ProfileTags";
import Link from "next/link";
import gsap from "gsap";

interface SwipeArenaProps {
  arena: ArenaRow;
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

function fallback(name: string) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0F0F1A&color=8888AA&size=400&bold=true`;
}

export default function SwipeArena({ arena }: SwipeArenaProps) {
  const { user } = useAuth();
  const { isImpersonating, profile: impProfile } = useImpersonation();
  const [profiles, setProfiles] = useState<ArenaProfile[]>([]);
  const [pair, setPair] = useState<[ArenaProfile, ArenaProfile] | null>(null);
  const [votedPairs, setVotedPairs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const [swipeCount, setSwipeCount] = useState(0);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);
  const [showSignInGate, setShowSignInGate] = useState(false);

  // ── Tags state ──────────────────────────────────────────────────────────────
  const [pairTags, setPairTags] = useState<Map<string, TagEntry[]>>(new Map());
  const [myVotedTags, setMyVotedTags] = useState<Map<string, Set<string>>>(new Map());

  // ── Swipe overlay state ──────────────────────────────────────────────────
  const [swipeOverlay, setSwipeOverlay] = useState<{ side: "left" | "right"; intensity: number } | null>(null);

  // ── GSAP card refs ─────────────────────────────────────────────────────────
  const leftCardRef = useRef<HTMLDivElement>(null);
  const rightCardRef = useRef<HTMLDivElement>(null);
  const vsRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Swipe drag state ─────────────────────────────────────────────────────
  const dragStartX = useRef<number | null>(null);
  const dragDelta = useRef(0);
  const isDragging = useRef(false);

  // ── Image preload cache ────────────────────────────────────────────────────
  const preloadedUrls = useRef<Set<string>>(new Set());
  const nextPairRef = useRef<[ArenaProfile, ArenaProfile] | null>(null);

  // ── Image votes state (for sorting display images) ────────────────────────
  const [pairImageVotes, setPairImageVotes] = useState<Map<string, Map<string, number>>>(new Map());

  const preloadImages = useCallback((profiles: ArenaProfile[]) => {
    profiles.forEach((p) => {
      const urls = p.image_urls?.length ? p.image_urls : p.image_url ? [p.image_url] : [];
      urls.forEach((url) => {
        if (url && !preloadedUrls.current.has(url)) {
          preloadedUrls.current.add(url);
          const img = new window.Image();
          img.decoding = "async";
          img.src = url;
        }
      });
    });
  }, []);

  const pickRandomPair = useCallback(
    (profileList: ArenaProfile[], voted: Set<string>) => {
      if (profileList.length < 2) return;
      const available: [ArenaProfile, ArenaProfile][] = [];
      for (let i = 0; i < profileList.length; i++) {
        for (let j = i + 1; j < profileList.length; j++) {
          const key = pairKey(profileList[i].id, profileList[j].id);
          if (!voted.has(key)) available.push([profileList[i], profileList[j]]);
        }
      }
      if (available.length === 0) { setExhausted(true); setPair(null); return; }

      if (nextPairRef.current) {
        const [a, b] = nextPairRef.current;
        const key = pairKey(a.id, b.id);
        if (!voted.has(key)) {
          setPair(nextPairRef.current);
          nextPairRef.current = null;
          const remaining = available.filter(([x, y]) => pairKey(x.id, y.id) !== key);
          if (remaining.length > 0) {
            const next = remaining[Math.floor(Math.random() * remaining.length)];
            nextPairRef.current = next;
            preloadImages(next);
          }
          return;
        }
        nextPairRef.current = null;
      }

      const chosen = available[Math.floor(Math.random() * available.length)];
      setPair(chosen);
      const remaining = available.filter(([a, b]) => pairKey(a.id, b.id) !== pairKey(chosen[0].id, chosen[1].id));
      if (remaining.length > 0) {
        const next = remaining[Math.floor(Math.random() * remaining.length)];
        nextPairRef.current = next;
        preloadImages(next);
      }
    },
    [preloadImages]
  );

  useEffect(() => {
    async function init() {
      setLoading(true); setError(null); setExhausted(false);
      const [data, voted, myProfile] = await Promise.all([
        getProfilesForArena(arena),
        user ? getVotedPairs(user.id, arena.slug === "all" ? null : arena.id) : Promise.resolve(new Set<string>()),
        user ? getMyProfile(user.id) : Promise.resolve(null),
      ]);
      // Exclude your own profile AND the impersonated profile from matchups
      let filteredData = myProfile ? data.filter((p) => p.id !== myProfile.id) : data;
      if (impProfile) filteredData = filteredData.filter((p) => p.id !== impProfile.id);
      if (filteredData.length < 2) {
        setError(filteredData.length === 0 ? "No profiles in this arena yet." : "Need at least 2 profiles to battle.");
        setLoading(false); return;
      }
      setProfiles(filteredData); setVotedPairs(voted);
      pickRandomPair(filteredData, voted); setLoading(false);
      preloadImages(filteredData);
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arena.id, user?.id]);

  useEffect(() => {
    if (!pair) return;
    const ids = [pair[0].id, pair[1].id];
    Promise.all([
      getTopTagsForProfiles(ids),
      getImageVotesForProfiles(ids),
      user ? getMyVotedTags(pair[0].id, user.id) : Promise.resolve(new Set<string>()),
      user ? getMyVotedTags(pair[1].id, user.id) : Promise.resolve(new Set<string>()),
    ]).then(([tags, imageVotes, vt0, vt1]) => {
      setPairTags(tags as Map<string, TagEntry[]>);
      setPairImageVotes(imageVotes as Map<string, Map<string, number>>);
      if (user) {
        setMyVotedTags(new Map([[pair[0].id, vt0 as Set<string>], [pair[1].id, vt1 as Set<string>]]));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair?.[0]?.id, pair?.[1]?.id, user?.id]);

  // ── GSAP entrance animation when pair changes ──────────────────────────────
  useEffect(() => {
    if (!pair) return;
    const left = leftCardRef.current;
    const right = rightCardRef.current;
    const vs = vsRef.current;
    if (!left || !right) return;

    gsap.set([left, right], { clearProps: "transform,opacity" });
    gsap.fromTo(left,
      { x: -80, opacity: 0, scale: 0.85, rotation: -8 },
      { x: 0, opacity: 1, scale: 1, rotation: 0, duration: 0.55, ease: "back.out(1.4)" }
    );
    gsap.fromTo(right,
      { x: 80, opacity: 0, scale: 0.85, rotation: 8 },
      { x: 0, opacity: 1, scale: 1, rotation: 0, duration: 0.55, ease: "back.out(1.4)", delay: 0.06 }
    );
    if (vs) {
      gsap.fromTo(vs,
        { scale: 0, rotation: -20 },
        { scale: 1, rotation: 0, duration: 0.45, ease: "back.out(3)", delay: 0.18 }
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair?.[0]?.id, pair?.[1]?.id]);

  const handleVote = async (winner: ArenaProfile, loser: ArenaProfile) => {
    if (animating) return;
    if (!user) { setShowSignInGate(true); return; }
    setAnimating(true);

    const key = pairKey(winner.id, loser.id);
    const newVoted = new Set(votedPairs);
    newVoted.add(key);
    setVotedPairs(newVoted);

    // Server-side record_match resolves root arena for ELO — just pass arena.id
    const effectiveArenaId = arena.id;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createClient() as any;

    let eloData: { winner_elo_before?: number; winner_elo_after?: number; loser_elo_before?: number; loser_elo_after?: number } | null = null;

    if (isImpersonating && impProfile) {
      // Admin voting as impersonated seeded profile
      const { data, error: rpcError } = await supabase.rpc("admin_vote_as_profile", {
        p_arena_id: effectiveArenaId,
        p_winner_id: winner.id,
        p_loser_id: loser.id,
        p_acting_as: impProfile.id,
      });
      if (rpcError) console.error("admin_vote_as_profile error:", rpcError);
      eloData = data;
    } else {
      // Normal voting
      const { data, error: rpcError } = await supabase.rpc("record_match", {
        p_arena_id: effectiveArenaId,
        p_winner_id: winner.id,
        p_loser_id: loser.id,
        p_voter_id: user?.id ?? null,
      });
      if (rpcError) console.error("record_match error:", rpcError);
      // record_match RETURNS TABLE → Supabase wraps as array; unwrap first row
      // Also handle the case where .rpc() returns a single object (some client versions)
      if (Array.isArray(data) && data.length > 0) {
        eloData = data[0];
      } else if (data && typeof data === "object" && !Array.isArray(data)) {
        eloData = data;
      } else {
        eloData = null;
      }
    }

    const newWinnerElo: number = eloData?.winner_elo_after ?? winner.elo_rating;
    const newLoserElo: number  = eloData?.loser_elo_after  ?? loser.elo_rating;
    const eloGain = newWinnerElo - (eloData?.winner_elo_before ?? winner.elo_rating);

    // If ELO data is missing (RPC error or empty response), compute expected gain client-side
    const displayGain = eloGain !== 0
      ? eloGain
      : Math.round(32 * (1 - 1 / (1 + Math.pow(10, (loser.elo_rating - winner.elo_rating) / 400))));

    setLastResult(`${winner.name} mogs! +${displayGain} ELO`);
    const winnerIsLeft = winner.id === pair![0].id;

    const updatedProfiles = profiles.map((p) => {
      if (p.id === winner.id) return { ...p, elo_rating: newWinnerElo, wins: p.wins + 1, matches: p.matches + 1 };
      if (p.id === loser.id) return { ...p, elo_rating: newLoserElo, losses: p.losses + 1, matches: p.matches + 1 };
      return p;
    });
    setProfiles(updatedProfiles);
    setSwipeCount((c) => c + 1);

    // GSAP Tinder-style exit: winner scales up, loser flies off with rotation
    const winnerEl = winnerIsLeft ? leftCardRef.current : rightCardRef.current;
    const loserEl = winnerIsLeft ? rightCardRef.current : leftCardRef.current;
    const loserDir = winnerIsLeft ? 1 : -1;

    if (winnerEl && loserEl) {
      const tl = gsap.timeline({
        onComplete: () => {
          setSwipeOverlay(null);
          pickRandomPair(updatedProfiles, newVoted);
          setLastResult(null);
          setAnimating(false);
        },
      });
      // Winner pulses with golden glow
      tl.to(winnerEl, { scale: 1.08, duration: 0.25, ease: "power2.out" })
        // Loser flies away Tinder-style
        .to(loserEl, {
          x: loserDir * 300, opacity: 0, scale: 0.7,
          rotation: loserDir * 25, duration: 0.5, ease: "power3.in",
        }, "<0.05")
        .to(winnerEl, { scale: 1, duration: 0.3, ease: "elastic.out(1,0.5)" }, "-=0.15")
        .to({}, { duration: 0.2 });
    } else {
      setTimeout(() => { pickRandomPair(updatedProfiles, newVoted); setLastResult(null); setAnimating(false); }, 900);
    }
  };

  const handleTagVote = async (profileId: string, tag: string) => {
    if (!user) return;
    const { error: tagErr } = await voteForTag(profileId, tag, user.id);
    if (tagErr) return;
    setMyVotedTags((prev) => {
      const next = new Map(prev);
      const cur = new Set(next.get(profileId) ?? []);
      cur.add(tag); next.set(profileId, cur); return next;
    });
    const refreshed = await getTopTagsForProfile(profileId, 3);
    setPairTags((prev) => { const next = new Map(prev); next.set(profileId, refreshed); return next; });
  };

  // ── Touch swipe handlers (Tinder-style) ──────────────────────────────────────
  function handleSwipeStart(e: React.TouchEvent) {
    if (animating) return;
    dragStartX.current = e.touches[0].clientX;
    isDragging.current = true;
    dragDelta.current = 0;
  }

  function handleSwipeMove(e: React.TouchEvent) {
    if (!isDragging.current || dragStartX.current === null || !pair || animating) return;
    const delta = e.touches[0].clientX - dragStartX.current;
    dragDelta.current = delta;

    const left = leftCardRef.current;
    const right = rightCardRef.current;
    if (!left || !right) return;

    const norm = Math.min(Math.abs(delta) / 120, 1);
    const dir = delta > 0 ? 1 : -1;

    // Both cards tilt and follow the drag
    gsap.set(left, {
      x: delta * 0.4,
      rotation: dir * norm * 6,
      scale: delta > 0 ? 1 + norm * 0.05 : 1 - norm * 0.04,
    });
    gsap.set(right, {
      x: delta * 0.4,
      rotation: dir * norm * 6,
      scale: delta < 0 ? 1 + norm * 0.05 : 1 - norm * 0.04,
    });

    // Show MOGS/NOPE overlay
    if (norm > 0.15) {
      setSwipeOverlay({
        side: delta > 0 ? "left" : "right",
        intensity: norm,
      });
    } else {
      setSwipeOverlay(null);
    }
  }

  function handleSwipeEnd() {
    if (!isDragging.current || !pair || animating) return;
    isDragging.current = false;
    const delta = dragDelta.current;
    const threshold = 70;

    setSwipeOverlay(null);

    if (Math.abs(delta) > threshold) {
      if (delta > threshold) {
        handleVote(pair[0], pair[1]);
      } else if (delta < -threshold) {
        handleVote(pair[1], pair[0]);
      }
    } else {
      const left = leftCardRef.current;
      const right = rightCardRef.current;
      if (left) gsap.to(left, { x: 0, rotation: 0, scale: 1, duration: 0.5, ease: "elastic.out(1,0.4)" });
      if (right) gsap.to(right, { x: 0, rotation: 0, scale: 1, duration: 0.5, ease: "elastic.out(1,0.4)" });
    }
    dragStartX.current = null;
    dragDelta.current = 0;
  }

  // ── Tinder Card Component ──────────────────────────────────────────────────
  function TinderCard({
    profile,
    imageUrls,
    side,
    onVote,
    showMogs,
    showNope,
  }: {
    profile: ArenaProfile;
    imageUrls: string[];
    side: "left" | "right";
    onVote: () => void;
    showMogs: boolean;
    showNope: boolean;
  }) {
    const [imgIdx, setImgIdx] = useState(0);
    const imgs = imageUrls.length > 0 ? imageUrls : [profile.image_url ?? fallback(profile.name)];
    const currentImg = imgs[imgIdx] ?? fallback(profile.name);
    const winRate = profile.wins + profile.losses > 0 ? Math.round((profile.wins / (profile.wins + profile.losses)) * 100) : null;

    // Auto-cycle images every 3.5 seconds
    useEffect(() => {
      if (imgs.length <= 1) return;
      const timer = setInterval(() => {
        setImgIdx((prev) => (prev + 1) % imgs.length);
      }, 3500);
      return () => clearInterval(timer);
    }, [imgs.length]);

    // Reset image index when profile changes
    useEffect(() => { setImgIdx(0); }, [profile.id]);

    function prevImg(e: ReactMouseEvent) { e.stopPropagation(); setImgIdx((prev) => (prev - 1 + imgs.length) % imgs.length); }
    function nextImg(e: ReactMouseEvent) { e.stopPropagation(); setImgIdx((prev) => (prev + 1) % imgs.length); }

    return (
      <button
        onClick={onVote}
        disabled={animating}
        className="relative w-full overflow-hidden text-left focus:outline-none active:scale-[0.98] transition-transform"
        style={{
          borderRadius: "20px",
          aspectRatio: "3/4.5",
          background: "var(--bg-primary)",
        }}
      >
        {/* Photo */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={currentImg}
          alt={profile.name}
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
          onError={(e) => { (e.target as HTMLImageElement).onerror = null; (e.target as HTMLImageElement).src = fallback(profile.name); }}
        />

        {/* Image nav dots */}
        {imgs.length > 1 && (
          <div className="absolute top-3 left-3 right-3 flex gap-1 z-20">
            {imgs.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setImgIdx(i); }}
                className="flex-1 h-[3px] rounded-full transition-all"
                style={{
                  background: i === imgIdx ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.25)",
                }}
              />
            ))}
          </div>
        )}

        {/* Prev/Next arrows */}
        {imgs.length > 1 && (
          <>
            <div
              onClick={prevImg}
              className="absolute left-1 top-1/2 -translate-y-1/2 z-20 w-7 h-7 flex items-center justify-center rounded-full cursor-pointer transition-opacity opacity-40 hover:opacity-90"
              style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
            >
              <span className="text-white text-xs font-black">&#8249;</span>
            </div>
            <div
              onClick={nextImg}
              className="absolute right-1 top-1/2 -translate-y-1/2 z-20 w-7 h-7 flex items-center justify-center rounded-full cursor-pointer transition-opacity opacity-40 hover:opacity-90"
              style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
            >
              <span className="text-white text-xs font-black">&#8250;</span>
            </div>
          </>
        )}

        {/* ELO badge */}
        <div
          className="absolute top-3 right-3 z-20 flex items-center gap-1 px-2.5 py-1 rounded-full"
          style={{ background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", border: "1px solid rgba(240,192,64,0.3)" }}
        >
          <span className="text-xs font-black" style={{ color: "var(--gold)" }}>{profile.elo_rating}</span>
        </div>

        {/* Bottom gradient */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: "linear-gradient(to top, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 30%, transparent 55%)"
        }} />

        {/* Name + info overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4 z-10">
          <h3 className="text-white font-heading tracking-wide text-2xl leading-tight mb-0.5">{profile.name}</h3>
          <div className="flex items-center gap-2 text-xs">
            {profile.country && (
              <span className="opacity-70">{profile.country}</span>
            )}
            <span style={{ color: "var(--text-muted)" }}>{profile.wins}W-{profile.losses}L</span>
            {winRate !== null && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold"
                style={{ background: "rgba(253,41,123,0.15)", color: "var(--accent)" }}>
                {winRate}%
              </span>
            )}
          </div>
        </div>

        {/* MOGS overlay (green) */}
        {showMogs && (
          <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none"
            style={{ background: "rgba(34,197,94,0.15)" }}>
            <span className="font-heading text-6xl tracking-widest"
              style={{
                color: "#22C55E",
                textShadow: "0 0 30px rgba(34,197,94,0.8)",
                transform: "rotate(-15deg)",
                border: "4px solid #22C55E",
                borderRadius: "12px",
                padding: "8px 24px",
              }}>
              MOGS
            </span>
          </div>
        )}

        {/* NOPE overlay (red) */}
        {showNope && (
          <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none"
            style={{ background: "rgba(239,68,68,0.15)" }}>
            <span className="font-heading text-6xl tracking-widest"
              style={{
                color: "#EF4444",
                textShadow: "0 0 30px rgba(239,68,68,0.8)",
                transform: "rotate(15deg)",
                border: "4px solid #EF4444",
                borderRadius: "12px",
                padding: "8px 24px",
              }}>
              NOPE
            </span>
          </div>
        )}

        {/* Tap hint glow */}
        <div className="absolute inset-0 rounded-[20px] pointer-events-none opacity-0 hover:opacity-100 transition-opacity"
          style={{ boxShadow: "inset 0 0 40px rgba(255,255,255,0.05)" }} />
      </button>
    );
  }

  /* ── Loading ──────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4" style={{ height: "70vh" }}>
        <div className="w-14 h-14 rounded-full border-4 border-transparent animate-spin"
          style={{ borderTopColor: "var(--accent)", borderRightColor: "rgba(253,41,123,0.25)", boxShadow: "0 0 20px rgba(253,41,123,0.3)" }} />
        <p className="font-heading tracking-widest text-sm" style={{ color: "var(--text-muted)" }}>LOADING BATTLES</p>
      </div>
    );
  }

  /* ── Error ───────────────────────────────────────────── */
  if (error) {
    return (
      <div className="text-center mt-16 px-6">
        <div className="text-6xl mb-4">&#9876;&#65039;</div>
        <p className="font-bold text-lg mb-2 text-white">{error}</p>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Add profiles via the Admin panel or assign them to this category.</p>
      </div>
    );
  }

  /* ── All seen ────────────────────────────────────────── */
  if (exhausted) {
    return (
      <div className="flex flex-col items-center text-center mt-12 px-4 max-w-sm mx-auto">
        <div className="text-7xl mb-5 crown-float" style={{ filter: "drop-shadow(0 0 16px rgba(253,41,123,0.5))" }}>&#127942;</div>
        <h2 className="text-white font-heading tracking-wide text-4xl mb-2">Arena Conquered!</h2>
        <p className="text-sm mb-8" style={{ color: "var(--text-muted)" }}>
          You&apos;ve voted on every matchup in <span style={{ color: "var(--accent)", fontWeight: 800 }}>{arena.name}</span>.
        </p>
        <Link href="/swipe" className="btn-accent rounded-xl px-8 py-4 text-base font-black uppercase tracking-wider inline-block">
          Try Another Arena &rarr;
        </Link>
      </div>
    );
  }

  if (!pair) return null;

  const leftImgs   = sortImageUrlsByVotes(pair[0].image_urls, pairImageVotes.get(pair[0].id) ?? new Map<string, number>());
  const rightImgs  = sortImageUrlsByVotes(pair[1].image_urls, pairImageVotes.get(pair[1].id) ?? new Map<string, number>());

  const leftShowMogs = swipeOverlay?.side === "left" && swipeOverlay.intensity > 0.3;
  const rightShowMogs = swipeOverlay?.side === "right" && swipeOverlay.intensity > 0.3;
  const leftShowNope = swipeOverlay?.side === "right" && swipeOverlay.intensity > 0.3;
  const rightShowNope = swipeOverlay?.side === "left" && swipeOverlay.intensity > 0.3;

  /* ── Battle screen ───────────────────────────────────── */
  return (
    <div ref={containerRef} className="max-w-lg mx-auto px-3 py-2 relative">

      {/* Arena header */}
      <div className="text-center mb-3">
        <div className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full mb-2"
          style={{ background: "rgba(0,0,0,0.8)", border: "1px solid var(--border)", backdropFilter: "blur(8px)" }}>
          <span className="text-xs font-black uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>{arena.name}</span>
          {swipeCount > 0 && (
            <>
              <span style={{ color: "var(--border)" }}>&middot;</span>
              <span className="text-xs font-black" style={{ color: "var(--text-faint)" }}>{swipeCount}</span>
            </>
          )}
        </div>
        <div className="flex items-center justify-center gap-3">
          <span className="font-heading tracking-wide text-4xl text-white" style={{ lineHeight: 1 }}>WHO</span>
          <span className="font-heading tracking-wide text-4xl" style={{ color: "var(--accent)", lineHeight: 1, textShadow: "0 0 20px rgba(253,41,123,0.4)" }}>MOGS?</span>
        </div>
      </div>

      {/* Result flash */}
      {lastResult && (
        <div className="text-center mb-3" style={{ animation: "resultSlide 0.35s ease-out both" }}>
          <span className="inline-block font-black px-5 py-2 rounded-full text-sm uppercase tracking-widest"
            style={{ background: "linear-gradient(135deg, #FD297B, #FF5864)", color: "#fff", boxShadow: "0 0 30px rgba(253,41,123,0.6)" }}>
            {lastResult}
          </span>
        </div>
      )}

      {/* ── Cards area (touch-enabled) ── */}
      <div
        className="flex gap-3 items-start justify-center"
        onTouchStart={handleSwipeStart}
        onTouchMove={handleSwipeMove}
        onTouchEnd={handleSwipeEnd}
      >
        {/* ── Left card ── */}
        <div ref={leftCardRef} className="flex flex-col items-center flex-1" style={{ maxWidth: "200px" }}>
          <div className="relative w-full">
            {/* Tags float above the card — grow upward so the card stays fixed */}
            <div className="absolute left-0 right-0 z-20" style={{ bottom: "100%" }}>
              <ProfileTags
                tags={pairTags.get(pair[0].id) ?? []}
                myVotedTags={myVotedTags.get(pair[0].id) ?? new Set()}
                onVote={user ? (tag) => handleTagVote(pair[0].id, tag) : null}
              />
            </div>
            <TinderCard
              profile={pair[0]}
              imageUrls={leftImgs}
              side="left"
              onVote={() => handleVote(pair[0], pair[1])}
              showMogs={leftShowMogs}
              showNope={leftShowNope}
            />
          </div>
        </div>

        {/* VS badge */}
        <div ref={vsRef} className="flex flex-col items-center justify-center shrink-0 pt-16">
          <div className="relative">
            <span className="font-heading tracking-wide text-4xl"
              style={{
                color: "var(--accent)",
                textShadow: "0 0 24px rgba(253,41,123,0.6), 0 0 48px rgba(253,41,123,0.2)",
                lineHeight: 1,
              }}>
              VS
            </span>
          </div>
        </div>

        {/* ── Right card ── */}
        <div ref={rightCardRef} className="flex flex-col items-center flex-1" style={{ maxWidth: "200px" }}>
          <div className="relative w-full">
            {/* Tags float above the card — grow upward so the card stays fixed */}
            <div className="absolute left-0 right-0 z-20" style={{ bottom: "100%" }}>
              <ProfileTags
                tags={pairTags.get(pair[1].id) ?? []}
                myVotedTags={myVotedTags.get(pair[1].id) ?? new Set()}
                onVote={user ? (tag) => handleTagVote(pair[1].id, tag) : null}
              />
            </div>
            <TinderCard
              profile={pair[1]}
              imageUrls={rightImgs}
              side="right"
              onVote={() => handleVote(pair[1], pair[0])}
              showMogs={rightShowMogs}
              showNope={rightShowNope}
            />
          </div>
        </div>
      </div>

      {/* ── Skip button ── */}
      <div className="flex items-center justify-center mt-4">
        <button
          onClick={() => pickRandomPair(profiles, votedPairs)}
          disabled={animating}
          className="text-[11px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-full transition-all active:scale-95 hover:opacity-80"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--border)",
            color: "var(--text-muted)",
          }}>
          skip
        </button>
      </div>

      {/* Sign-in gate modal */}
      {showSignInGate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(0,0,0,0.92)", backdropFilter: "blur(8px)" }}
          onClick={() => setShowSignInGate(false)}>
          <div className="max-w-xs w-full rounded-2xl p-8 text-center"
            style={{ background: "var(--bg-card)", border: "1px solid rgba(253,41,123,0.25)", boxShadow: "0 0 40px rgba(253,41,123,0.1)" }}
            onClick={(e) => e.stopPropagation()}>
            <div className="text-5xl mb-4" style={{ filter: "drop-shadow(0 0 12px rgba(253,41,123,0.4))" }}>&#9876;&#65039;</div>
            <h2 className="text-white font-black text-xl mb-2 tracking-tight">Join the Arena</h2>
            <p className="text-sm mb-6 leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Sign in to vote in battles, track your history, and compete on the leaderboard.
            </p>
            <Link href="/profile" className="block btn-accent rounded-xl px-6 py-3 text-sm font-black uppercase tracking-wider"
              onClick={() => setShowSignInGate(false)}>Sign In with Google &rarr;</Link>
            <button onClick={() => setShowSignInGate(false)} className="mt-4 text-xs font-bold hover:underline" style={{ color: "var(--text-muted)" }}>Maybe later</button>
          </div>
        </div>
      )}
    </div>
  );
}
