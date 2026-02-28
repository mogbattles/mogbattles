"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createClient, type ArenaRow } from "@/lib/supabase";
import { getProfilesForArena, getPublicArenas, getVotedPairs, getMyProfile, type ArenaProfile } from "@/lib/arenas";
import {
  getTopTagsForProfiles,
  getTopTagsForProfile,
  getMyVotedTags,
  voteForTag,
  type TagEntry,
} from "@/lib/tags";
import {
  getImageVotesForProfiles,
  getMyVotedImages,
  toggleImageVote,
  sortImageUrlsByVotes,
} from "@/lib/image_votes";
import { useAuth } from "@/context/AuthContext";
import ProfileCard from "./ProfileCard";
import ProfileTags from "./ProfileTags";
import TagPopup from "./TagPopup";
import Link from "next/link";
import gsap from "gsap";

interface SwipeArenaProps {
  arena: ArenaRow;
}

function pairKey(a: string, b: string): string {
  return [a, b].sort().join(":");
}

export default function SwipeArena({ arena }: SwipeArenaProps) {
  const { user } = useAuth();
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
  const [hoveredCard, setHoveredCard] = useState<"left" | "right" | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Category arena map ───────────────────────────────────────────────
  const categoryArenaMap = useRef<Record<string, string>>({});

  // ── Emote reactions state ──────────────────────────────────────────────────
  const [emotes, setEmotes] = useState<{ id: number; emoji: string; x: number }[]>([]);
  const emoteIdRef = useRef(0);

  // ── GSAP card refs ─────────────────────────────────────────────────────────
  const leftCardRef = useRef<HTMLDivElement>(null);
  const rightCardRef = useRef<HTMLDivElement>(null);
  const vsRef = useRef<HTMLDivElement>(null);

  // ── Swipe drag state ─────────────────────────────────────────────────────
  const dragStartX = useRef<number | null>(null);
  const dragDelta = useRef(0);
  const isDragging = useRef(false);

  // ── Image preload cache ────────────────────────────────────────────────────
  const preloadedUrls = useRef<Set<string>>(new Set());
  const nextPairRef = useRef<[ArenaProfile, ArenaProfile] | null>(null);

  // ── Image votes state ────────────────────────────────────────────────────────
  const [pairImageVotes, setPairImageVotes] = useState<Map<string, Map<string, number>>>(new Map());
  const [myVotedImagesMap, setMyVotedImagesMap] = useState<Map<string, Set<string>>>(new Map());

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
          if (!voted.has(key)) {
            available.push([profileList[i], profileList[j]]);
          }
        }
      }

      if (available.length === 0) {
        setExhausted(true);
        setPair(null);
        return;
      }

      if (nextPairRef.current) {
        const [a, b] = nextPairRef.current;
        const key = pairKey(a.id, b.id);
        if (!voted.has(key)) {
          setPair(nextPairRef.current);
          nextPairRef.current = null;
          const remaining = available.filter(
            ([x, y]) => pairKey(x.id, y.id) !== key
          );
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

      const remaining = available.filter(
        ([a, b]) => pairKey(a.id, b.id) !== pairKey(chosen[0].id, chosen[1].id)
      );
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
      setLoading(true);
      setError(null);
      setExhausted(false);

      const [data, voted, myProfile] = await Promise.all([
        getProfilesForArena(arena),
        user ? getVotedPairs(user.id, arena.slug === "all" ? null : arena.id) : Promise.resolve(new Set<string>()),
        user ? getMyProfile(user.id) : Promise.resolve(null),
      ]);

      if (arena.slug === "all") {
        const allArenas = await getPublicArenas();
        const map: Record<string, string> = {};
        allArenas
          .filter((a) => a.is_official && a.category && a.slug !== "all" && a.slug !== "members")
          .forEach((a) => { map[a.category!] = a.id; });
        categoryArenaMap.current = map;
      }

      const filteredData = myProfile
        ? data.filter((p) => p.id !== myProfile.id)
        : data;

      if (filteredData.length < 2) {
        setError(
          filteredData.length === 0
            ? "No profiles in this arena yet."
            : "Need at least 2 profiles to battle."
        );
        setLoading(false);
        return;
      }

      setProfiles(filteredData);
      setVotedPairs(voted);
      pickRandomPair(filteredData, voted);
      setLoading(false);

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
      user ? getMyVotedImages(pair[0].id, user.id) : Promise.resolve(new Set<string>()),
      user ? getMyVotedImages(pair[1].id, user.id) : Promise.resolve(new Set<string>()),
    ]).then(([tags, imageVotes, vt0, vt1, vi0, vi1]) => {
      setPairTags(tags as Map<string, TagEntry[]>);
      setPairImageVotes(imageVotes as Map<string, Map<string, number>>);
      if (user) {
        setMyVotedTags(new Map([[pair[0].id, vt0 as Set<string>], [pair[1].id, vt1 as Set<string>]]));
        setMyVotedImagesMap(new Map([[pair[0].id, vi0 as Set<string>], [pair[1].id, vi1 as Set<string>]]));
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
      { x: -50, opacity: 0, scale: 0.9 },
      { x: 0, opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.7)" }
    );
    gsap.fromTo(right,
      { x: 50, opacity: 0, scale: 0.9 },
      { x: 0, opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.7)", delay: 0.08 }
    );
    if (vs) {
      gsap.fromTo(vs,
        { scale: 0, rotation: -15 },
        { scale: 1, rotation: 0, duration: 0.4, ease: "back.out(2.5)", delay: 0.2 }
      );
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pair?.[0]?.id, pair?.[1]?.id]);

  const handleVote = async (winner: ArenaProfile, loser: ArenaProfile) => {
    if (animating) return;
    if (!user) {
      setShowSignInGate(true);
      return;
    }
    setAnimating(true);

    const key = pairKey(winner.id, loser.id);
    const newVoted = new Set(votedPairs);
    newVoted.add(key);
    setVotedPairs(newVoted);

    let effectiveArenaId = arena.id;
    if (arena.slug === "all") {
      const sharedCat = winner.categories.find((c) => loser.categories.includes(c));
      if (sharedCat && categoryArenaMap.current[sharedCat]) {
        effectiveArenaId = categoryArenaMap.current[sharedCat];
      } else {
        const fallbackCat =
          winner.categories.find((c) => categoryArenaMap.current[c]) ??
          loser.categories.find((c) => categoryArenaMap.current[c]);
        if (fallbackCat) {
          effectiveArenaId = categoryArenaMap.current[fallbackCat];
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createClient() as any;
    const { data: eloData, error: rpcError } = await supabase.rpc("record_match", {
      p_arena_id: effectiveArenaId,
      p_winner_id: winner.id,
      p_loser_id: loser.id,
      p_voter_id: user?.id ?? null,
    });

    if (rpcError) console.error("record_match error:", rpcError);

    const newWinnerElo: number = eloData?.winner_elo_after ?? winner.elo_rating;
    const newLoserElo: number  = eloData?.loser_elo_after  ?? loser.elo_rating;
    const eloGain = newWinnerElo - (eloData?.winner_elo_before ?? winner.elo_rating);

    setLastResult(`${winner.name} mogs! +${eloGain} ELO`);
    const winnerIsLeftForEmote = winner.id === pair![0].id;
    spawnEmotes(winnerIsLeftForEmote ? "left" : "right");

    const updatedProfiles = profiles.map((p) => {
      if (p.id === winner.id)
        return { ...p, elo_rating: newWinnerElo, wins: p.wins + 1, matches: p.matches + 1 };
      if (p.id === loser.id)
        return { ...p, elo_rating: newLoserElo, losses: p.losses + 1, matches: p.matches + 1 };
      return p;
    });

    setProfiles(updatedProfiles);
    setSwipeCount((c) => c + 1);

    // GSAP exit animation — winner scales up, loser slides away
    const winnerIsLeft = winner.id === pair![0].id;
    const winnerEl = winnerIsLeft ? leftCardRef.current : rightCardRef.current;
    const loserEl = winnerIsLeft ? rightCardRef.current : leftCardRef.current;
    const loserDir = winnerIsLeft ? 1 : -1;

    if (winnerEl && loserEl) {
      const tl = gsap.timeline({
        onComplete: () => {
          pickRandomPair(updatedProfiles, newVoted);
          setLastResult(null);
          setAnimating(false);
        },
      });
      tl.to(winnerEl, { scale: 1.06, duration: 0.3, ease: "power2.out" })
        .to(loserEl, {
          x: loserDir * 150, opacity: 0, scale: 0.85,
          rotation: loserDir * 6, duration: 0.45, ease: "power3.in",
        }, "<0.05")
        .to(winnerEl, { scale: 1, duration: 0.25, ease: "power2.inOut" }, "-=0.2")
        .to({}, { duration: 0.15 });
    } else {
      setTimeout(() => {
        pickRandomPair(updatedProfiles, newVoted);
        setLastResult(null);
        setAnimating(false);
      }, 900);
    }
  };

  const handleTagVote = async (profileId: string, tag: string) => {
    if (!user) return;
    const { error: tagErr } = await voteForTag(profileId, tag, user.id);
    if (tagErr) return;

    setMyVotedTags((prev) => {
      const next = new Map(prev);
      const cur = new Set(next.get(profileId) ?? []);
      cur.add(tag);
      next.set(profileId, cur);
      return next;
    });

    const refreshed = await getTopTagsForProfile(profileId, 3);
    setPairTags((prev) => {
      const next = new Map(prev);
      next.set(profileId, refreshed);
      return next;
    });
  };

  const handleImageVote = async (profileId: string, imageUrl: string, currentlyVoted: boolean) => {
    if (!user) return;

    setMyVotedImagesMap((prev) => {
      const next = new Map(prev);
      const cur = new Set(next.get(profileId) ?? []);
      if (currentlyVoted) cur.delete(imageUrl);
      else cur.add(imageUrl);
      next.set(profileId, cur);
      return next;
    });

    setPairImageVotes((prev) => {
      const next = new Map(prev);
      const profileMap = new Map(next.get(profileId) ?? []);
      const current = profileMap.get(imageUrl) ?? 0;
      profileMap.set(imageUrl, Math.max(0, current + (currentlyVoted ? -1 : 1)));
      next.set(profileId, profileMap);
      return next;
    });

    const { error: imgErr } = await toggleImageVote(profileId, imageUrl, user.id, currentlyVoted);
    if (imgErr) {
      setMyVotedImagesMap((prev) => {
        const next = new Map(prev);
        const cur = new Set(next.get(profileId) ?? []);
        if (currentlyVoted) cur.add(imageUrl);
        else cur.delete(imageUrl);
        next.set(profileId, cur);
        return next;
      });
      setPairImageVotes((prev) => {
        const next = new Map(prev);
        const profileMap = new Map(next.get(profileId) ?? []);
        const current = profileMap.get(imageUrl) ?? 0;
        profileMap.set(imageUrl, Math.max(0, current + (currentlyVoted ? 1 : -1)));
        next.set(profileId, profileMap);
        return next;
      });
    }
  };

  function handleCardEnter(side: "left" | "right") {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setHoveredCard(side);
  }
  function handleCardLeave() {
    hideTimerRef.current = setTimeout(() => setHoveredCard(null), 120);
  }

  // ── Emote burst on vote ─────────────────────────────────────────────────
  function spawnEmotes(side: "left" | "right") {
    const reactions = ["🔥", "💀", "👑", "⚔️", "😤", "💪"];
    const newEmotes = Array.from({ length: 5 }, () => {
      emoteIdRef.current += 1;
      return {
        id: emoteIdRef.current,
        emoji: reactions[Math.floor(Math.random() * reactions.length)],
        x: (side === "left" ? 25 : 75) + (Math.random() - 0.5) * 30,
      };
    });
    setEmotes((prev) => [...prev, ...newEmotes]);
    setTimeout(() => {
      setEmotes((prev) => prev.filter((e) => !newEmotes.find((n) => n.id === e.id)));
    }, 1200);
  }

  // ── Touch swipe handlers for mobile ──────────────────────────────────────
  function handleSwipeStart(e: React.TouchEvent) {
    dragStartX.current = e.touches[0].clientX;
    isDragging.current = true;
    dragDelta.current = 0;
  }

  function handleSwipeMove(e: React.TouchEvent) {
    if (!isDragging.current || dragStartX.current === null || !pair) return;
    const delta = e.touches[0].clientX - dragStartX.current;
    dragDelta.current = delta;

    const left = leftCardRef.current;
    const right = rightCardRef.current;
    if (!left || !right) return;

    // Tilt both cards based on swipe direction
    const norm = Math.min(Math.abs(delta) / 150, 1);
    const dir = delta > 0 ? 1 : -1;
    gsap.set(left, {
      x: delta * 0.3,
      rotation: dir * norm * 4,
      scale: delta > 0 ? 1 + norm * 0.04 : 1 - norm * 0.03,
    });
    gsap.set(right, {
      x: delta * 0.3,
      rotation: dir * norm * 4,
      scale: delta < 0 ? 1 + norm * 0.04 : 1 - norm * 0.03,
    });
  }

  function handleSwipeEnd() {
    if (!isDragging.current || !pair) return;
    isDragging.current = false;
    const delta = dragDelta.current;
    const threshold = 80;

    if (Math.abs(delta) > threshold && !animating) {
      // Swipe right = pick left card, swipe left = pick right card
      if (delta > threshold) {
        handleVote(pair[0], pair[1]);
        spawnEmotes("left");
      } else if (delta < -threshold) {
        handleVote(pair[1], pair[0]);
        spawnEmotes("right");
      }
    } else {
      // Snap back
      const left = leftCardRef.current;
      const right = rightCardRef.current;
      if (left) gsap.to(left, { x: 0, rotation: 0, scale: 1, duration: 0.4, ease: "elastic.out(1,0.5)" });
      if (right) gsap.to(right, { x: 0, rotation: 0, scale: 1, duration: 0.4, ease: "elastic.out(1,0.5)" });
    }
    dragStartX.current = null;
    dragDelta.current = 0;
  }

  /* ── Loading ──────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4" style={{ height: "60vh" }}>
        <div
          className="w-12 h-12 rounded-full border-4 border-transparent animate-spin"
          style={{
            borderTopColor: "#8B5CF6",
            borderRightColor: "rgba(139,92,246,0.25)",
            boxShadow: "0 0 16px rgba(139,92,246,0.3)",
          }}
        />
        <p
          className="font-black uppercase tracking-widest text-xs"
          style={{ color: "#4A4A66" }}
        >
          Loading battles…
        </p>
      </div>
    );
  }

  /* ── Error ───────────────────────────────────────────── */
  if (error) {
    return (
      <div className="text-center mt-16 px-6">
        <div className="text-5xl mb-4">⚔️</div>
        <p className="font-bold text-lg mb-2 text-white">{error}</p>
        <p className="text-sm" style={{ color: "#4A4A66" }}>
          Add profiles via the Admin panel or assign them to this category.
        </p>
      </div>
    );
  }

  /* ── All seen ────────────────────────────────────────── */
  if (exhausted) {
    return (
      <div className="flex flex-col items-center text-center mt-12 px-4 max-w-sm mx-auto">
        <div
          className="text-7xl mb-5 crown-float"
          style={{ filter: "drop-shadow(0 0 16px rgba(139,92,246,0.5))" }}
        >
          🏆
        </div>
        <h2 className="text-white font-heading tracking-wide text-4xl mb-2">
          Arena Conquered!
        </h2>
        <p className="text-sm mb-8" style={{ color: "#4A4A66" }}>
          You&apos;ve voted on every matchup in{" "}
          <span style={{ color: "#A78BFA", fontWeight: 800 }}>{arena.name}</span>.
        </p>
        <Link
          href="/swipe"
          className="btn-purple rounded-xl px-8 py-4 text-base font-black uppercase tracking-wider inline-block"
        >
          Try Another Arena →
        </Link>
      </div>
    );
  }

  if (!pair) return null;

  const leftVotes  = pairImageVotes.get(pair[0].id) ?? new Map<string, number>();
  const rightVotes = pairImageVotes.get(pair[1].id) ?? new Map<string, number>();
  const leftImgs   = sortImageUrlsByVotes(pair[0].image_urls, leftVotes);
  const rightImgs  = sortImageUrlsByVotes(pair[1].image_urls, rightVotes);

  /* ── Battle screen ───────────────────────────────────── */
  return (
    <div className="max-w-4xl mx-auto px-3 py-4">

      {/* Arena header pill + title */}
      <div className="text-center mb-4">
        <div
          className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full mb-3"
          style={{ background: "#0F0F1A", border: "1px solid #222233" }}
        >
          <span className="text-xs font-black uppercase tracking-widest" style={{ color: "#4A4A66" }}>
            {arena.name}
          </span>
          {swipeCount > 0 && (
            <>
              <span style={{ color: "#222233", fontSize: "10px" }}>·</span>
              <span className="text-xs font-black" style={{ color: "#2A2A3D" }}>
                {swipeCount} battles
              </span>
            </>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 leading-none">
          <span className="font-heading tracking-wide text-4xl sm:text-5xl text-white" style={{ lineHeight: 1 }}>WHO</span>
          <span
            className="font-heading tracking-wide text-4xl sm:text-5xl purple-glow-text"
            style={{ color: "#A78BFA", lineHeight: 1 }}
          >
            MOGS?
          </span>
        </div>
      </div>

      {/* Result flash */}
      {lastResult && (
        <div
          className="text-center mb-4"
          style={{ animation: "resultSlide 0.35s ease-out both" }}
        >
          <span
            className="inline-block font-black px-6 py-2.5 rounded-full text-sm uppercase tracking-widest"
            style={{
              background: "linear-gradient(160deg, #A78BFA, #8B5CF6)",
              color: "#fff",
              boxShadow: "0 0 24px rgba(139,92,246,0.55)",
            }}
          >
            {lastResult}
          </span>
        </div>
      )}

      {/* Emote particles */}
      {emotes.map((e) => (
        <div
          key={e.id}
          className="fixed pointer-events-none z-50"
          style={{
            left: `${e.x}%`,
            bottom: "40%",
            fontSize: "28px",
            animation: "emoteFloat 1.2s ease-out forwards",
          }}
        >
          {e.emoji}
        </div>
      ))}

      {/* Cards row */}
      <div
        className="flex gap-3 sm:gap-5 items-start justify-center overflow-visible"
        onTouchStart={handleSwipeStart}
        onTouchMove={handleSwipeMove}
        onTouchEnd={handleSwipeEnd}
      >

        {/* ── Left card ── */}
        <div
          ref={leftCardRef}
          className="flex flex-col items-center"
          style={{ flex: "1 1 0", maxWidth: "220px", position: "relative" }}
          onMouseEnter={() => handleCardEnter("left")}
          onMouseLeave={handleCardLeave}
        >
          <ProfileTags
            tags={pairTags.get(pair[0].id) ?? []}
            myVotedTags={myVotedTags.get(pair[0].id) ?? new Set()}
            onVote={user ? (tag) => handleTagVote(pair[0].id, tag) : null}
          />

          <div className="relative w-full">
            <ProfileCard
              key={pair[0].id}
              name={pair[0].name}
              imageUrl={leftImgs[0] ?? pair[0].image_url}
              imageUrls={leftImgs}
              eloRating={pair[0].elo_rating}
              wins={pair[0].wins}
              losses={pair[0].losses}
              country={pair[0].country}
              heightIn={pair[0].height_in}
              weightLbs={pair[0].weight_lbs}
              onClick={() => handleVote(pair[0], pair[1])}
              side="left"
            />

            {hoveredCard === "left" && (
              <TagPopup
                side="left"
                profileName={pair[0].name}
                existingTags={pairTags.get(pair[0].id) ?? []}
                myVotedTags={myVotedTags.get(pair[0].id) ?? new Set()}
                userId={user?.id ?? null}
                onVote={(tag) => handleTagVote(pair[0].id, tag)}
                images={leftImgs}
                imageVotes={leftVotes}
                myVotedImages={myVotedImagesMap.get(pair[0].id)}
                onImageVote={(url, voted) => handleImageVote(pair[0].id, url, voted)}
              />
            )}
          </div>
        </div>

        {/* VS badge */}
        <div ref={vsRef} className="flex flex-col items-center justify-center shrink-0 gap-2 pt-7">
          <span
            className="font-heading tracking-wide leading-none vs-text text-4xl sm:text-5xl"
            style={{ color: "#8B5CF6" }}
          >
            VS
          </span>
          {!user && (
            <span
              className="text-[9px] font-black uppercase tracking-widest"
              style={{ color: "#222233" }}
            >
              tap
            </span>
          )}
        </div>

        {/* ── Right card ── */}
        <div
          ref={rightCardRef}
          className="flex flex-col items-center"
          style={{ flex: "1 1 0", maxWidth: "220px", position: "relative" }}
          onMouseEnter={() => handleCardEnter("right")}
          onMouseLeave={handleCardLeave}
        >
          <ProfileTags
            tags={pairTags.get(pair[1].id) ?? []}
            myVotedTags={myVotedTags.get(pair[1].id) ?? new Set()}
            onVote={user ? (tag) => handleTagVote(pair[1].id, tag) : null}
          />

          <div className="relative w-full">
            <ProfileCard
              key={pair[1].id}
              name={pair[1].name}
              imageUrl={rightImgs[0] ?? pair[1].image_url}
              imageUrls={rightImgs}
              eloRating={pair[1].elo_rating}
              wins={pair[1].wins}
              losses={pair[1].losses}
              country={pair[1].country}
              heightIn={pair[1].height_in}
              weightLbs={pair[1].weight_lbs}
              onClick={() => handleVote(pair[1], pair[0])}
              side="right"
            />

            {hoveredCard === "right" && (
              <TagPopup
                side="right"
                profileName={pair[1].name}
                existingTags={pairTags.get(pair[1].id) ?? []}
                myVotedTags={myVotedTags.get(pair[1].id) ?? new Set()}
                userId={user?.id ?? null}
                onVote={(tag) => handleTagVote(pair[1].id, tag)}
                images={rightImgs}
                imageVotes={rightVotes}
                myVotedImages={myVotedImagesMap.get(pair[1].id)}
                onImageVote={(url, voted) => handleImageVote(pair[1].id, url, voted)}
              />
            )}
          </div>
        </div>

      </div>

      {/* Skip */}
      <div className="text-center mt-5">
        <button
          onClick={() => pickRandomPair(profiles, votedPairs)}
          className="btn-dark px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest"
        >
          Skip →
        </button>
      </div>

      {/* Sign-in gate modal */}
      {showSignInGate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(5,5,8,0.92)", backdropFilter: "blur(8px)" }}
          onClick={() => setShowSignInGate(false)}
        >
          <div
            className="max-w-xs w-full rounded-2xl p-8 text-center"
            style={{
              background: "#0F0F1A",
              border: "1px solid rgba(139,92,246,0.25)",
              boxShadow: "0 0 40px rgba(139,92,246,0.1)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="text-5xl mb-4"
              style={{ filter: "drop-shadow(0 0 12px rgba(139,92,246,0.4))" }}
            >
              ⚔️
            </div>
            <h2 className="text-white font-black text-xl mb-2 tracking-tight">
              Join the Arena
            </h2>
            <p className="text-sm mb-6 leading-relaxed" style={{ color: "#4A4A66" }}>
              Sign in to vote in battles, track your history, and compete on the leaderboard.
            </p>
            <Link
              href="/profile"
              className="block btn-purple rounded-xl px-6 py-3 text-sm font-black uppercase tracking-wider"
              onClick={() => setShowSignInGate(false)}
            >
              Sign In with Google →
            </Link>
            <button
              onClick={() => setShowSignInGate(false)}
              className="mt-4 text-xs font-bold hover:underline"
              style={{ color: "#4A4A66" }}
            >
              Maybe later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
