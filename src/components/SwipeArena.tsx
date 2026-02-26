"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  getMyVotedImages,
  toggleImageVote,
  sortImageUrlsByVotes,
} from "@/lib/image_votes";
import { useAuth } from "@/context/AuthContext";
import ProfileCard from "./ProfileCard";
import ProfileTags from "./ProfileTags";
import TagPopup from "./TagPopup";
import Link from "next/link";

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
  // "left" | "right" | null — which card is hovered (with popup open)
  const [hoveredCard, setHoveredCard] = useState<"left" | "right" | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Image votes state ────────────────────────────────────────────────────────
  // profileId → (imageUrl → count)
  const [pairImageVotes, setPairImageVotes] = useState<Map<string, Map<string, number>>>(new Map());
  const [myVotedImagesMap, setMyVotedImagesMap] = useState<Map<string, Set<string>>>(new Map());

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

      const chosen = available[Math.floor(Math.random() * available.length)];
      setPair(chosen);
    },
    []
  );

  useEffect(() => {
    async function init() {
      setLoading(true);
      setError(null);
      setExhausted(false);

      const [data, voted, myProfile] = await Promise.all([
        getProfilesForArena(arena),
        user ? getVotedPairs(user.id, arena.id) : Promise.resolve(new Set<string>()),
        user ? getMyProfile(user.id) : Promise.resolve(null),
      ]);

      // Never show the logged-in user's own profile as a voting option
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

      // Preload all primary images so battles feel instant
      filteredData.forEach((p) => {
        const url = p.image_urls?.[0] ?? p.image_url;
        if (url) {
          const img = new window.Image();
          img.src = url;
        }
      });
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arena.id, user?.id]);

  // Load tags + image votes when pair changes — all fetches in parallel
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

  const handleVote = async (winner: ArenaProfile, loser: ArenaProfile) => {
    if (animating) return;
    // Auth gate: must be signed in to vote
    if (!user) {
      setShowSignInGate(true);
      return;
    }
    setAnimating(true);

    const key = pairKey(winner.id, loser.id);
    const newVoted = new Set(votedPairs);
    newVoted.add(key);
    setVotedPairs(newVoted);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = createClient() as any;
    const { data: eloData, error: rpcError } = await supabase.rpc("record_match", {
      p_arena_id: arena.id,
      p_winner_id: winner.id,
      p_loser_id: loser.id,
      p_voter_id: user?.id ?? null,
    });

    if (rpcError) console.error("record_match error:", rpcError);

    const newWinnerElo: number = eloData?.winner_elo_after ?? winner.elo_rating;
    const newLoserElo: number  = eloData?.loser_elo_after  ?? loser.elo_rating;
    const eloGain = newWinnerElo - (eloData?.winner_elo_before ?? winner.elo_rating);

    setLastResult(`${winner.name} mogs! +${eloGain} ELO`);

    const updatedProfiles = profiles.map((p) => {
      if (p.id === winner.id)
        return { ...p, elo_rating: newWinnerElo, wins: p.wins + 1, matches: p.matches + 1 };
      if (p.id === loser.id)
        return { ...p, elo_rating: newLoserElo, losses: p.losses + 1, matches: p.matches + 1 };
      return p;
    });

    setProfiles(updatedProfiles);
    setSwipeCount((c) => c + 1);

    setTimeout(() => {
      pickRandomPair(updatedProfiles, newVoted);
      setLastResult(null);
      setAnimating(false);
    }, 1100);
  };

  // Tag vote handler: optimistic update + refresh
  const handleTagVote = async (profileId: string, tag: string) => {
    if (!user) return;
    const { error: tagErr } = await voteForTag(profileId, tag, user.id);
    if (tagErr) return;

    // Optimistic: mark this tag as voted by me
    setMyVotedTags((prev) => {
      const next = new Map(prev);
      const cur = new Set(next.get(profileId) ?? []);
      cur.add(tag);
      next.set(profileId, cur);
      return next;
    });

    // Refresh top tags for this profile
    const refreshed = await getTopTagsForProfile(profileId, 3);
    setPairTags((prev) => {
      const next = new Map(prev);
      next.set(profileId, refreshed);
      return next;
    });
  };

  // Image vote handler: optimistic update
  const handleImageVote = async (profileId: string, imageUrl: string, currentlyVoted: boolean) => {
    if (!user) return;

    // Optimistic update BEFORE the async call so the UI reacts instantly
    // Update myVotedImages
    setMyVotedImagesMap((prev) => {
      const next = new Map(prev);
      const cur = new Set(next.get(profileId) ?? []);
      if (currentlyVoted) cur.delete(imageUrl);
      else cur.add(imageUrl);
      next.set(profileId, cur);
      return next;
    });

    // Update vote counts — ensures the URL is in the map even if it's brand new
    setPairImageVotes((prev) => {
      const next = new Map(prev);
      const profileMap = new Map(next.get(profileId) ?? []);
      const current = profileMap.get(imageUrl) ?? 0;
      profileMap.set(imageUrl, Math.max(0, current + (currentlyVoted ? -1 : 1)));
      next.set(profileId, profileMap);
      return next;
    });

    // Persist to DB (fire and forget — optimistic update already applied above)
    const { error: imgErr } = await toggleImageVote(profileId, imageUrl, user.id, currentlyVoted);
    if (imgErr) {
      // Revert optimistic update on error
      setMyVotedImagesMap((prev) => {
        const next = new Map(prev);
        const cur = new Set(next.get(profileId) ?? []);
        if (currentlyVoted) cur.add(imageUrl); // restore
        else cur.delete(imageUrl); // restore
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

  // Debounced hover helpers to prevent popup flickering
  function handleCardEnter(side: "left" | "right") {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    setHoveredCard(side);
  }
  function handleCardLeave() {
    hideTimerRef.current = setTimeout(() => setHoveredCard(null), 120);
  }

  /* ── Loading ──────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-4" style={{ height: "60vh" }}>
        <div
          className="w-12 h-12 rounded-full border-4 border-transparent animate-spin"
          style={{
            borderTopColor: "#F0C040",
            borderRightColor: "rgba(240,192,64,0.25)",
            boxShadow: "0 0 16px rgba(240,192,64,0.3)",
          }}
        />
        <p
          className="font-black uppercase tracking-widest text-xs"
          style={{ color: "#3D5070" }}
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
        <p className="text-sm" style={{ color: "#3D5070" }}>
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
          style={{ filter: "drop-shadow(0 0 16px rgba(240,192,64,0.5))" }}
        >
          🏆
        </div>
        <h2 className="text-white font-black text-2xl mb-2 tracking-tight">
          Arena Conquered!
        </h2>
        <p className="text-sm mb-8" style={{ color: "#4D6080" }}>
          You&apos;ve voted on every matchup in{" "}
          <span style={{ color: "#F0C040", fontWeight: 800 }}>{arena.name}</span>.
        </p>
        <Link
          href="/swipe"
          className="btn-gold rounded-xl px-8 py-4 text-base font-black uppercase tracking-wider inline-block"
        >
          Try Another Arena →
        </Link>
      </div>
    );
  }

  if (!pair) return null;

  /* ── Pre-compute sorted image arrays once (avoid duplicate work in JSX) ── */
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
          style={{ background: "#111827", border: "1px solid #1B2338" }}
        >
          <span className="text-xs font-black uppercase tracking-widest" style={{ color: "#3D5070" }}>
            {arena.name}
          </span>
          {swipeCount > 0 && (
            <>
              <span style={{ color: "#1B2338", fontSize: "10px" }}>·</span>
              <span className="text-xs font-black" style={{ color: "#253147" }}>
                {swipeCount} battles
              </span>
            </>
          )}
        </div>

        <div className="flex items-center justify-center gap-2 leading-none">
          <span className="text-2xl sm:text-3xl font-black tracking-tight text-white">WHO</span>
          <span
            className="text-2xl sm:text-3xl font-black tracking-tight gold-glow-text"
            style={{ color: "#F0C040" }}
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
              background: "linear-gradient(160deg, #FFD700, #F0C040)",
              color: "#1A1000",
              boxShadow: "0 0 24px rgba(240,192,64,0.55)",
            }}
          >
            👑 {lastResult}
          </span>
        </div>
      )}

      {/* Cards row — overflow-visible so TagPopup can escape */}
      <div className="flex gap-3 sm:gap-5 items-start justify-center overflow-visible">

        {/* ── Left card ── */}
        <div
          className="flex flex-col items-center"
          style={{ flex: "1 1 0", maxWidth: "220px", position: "relative" }}
          onMouseEnter={() => handleCardEnter("left")}
          onMouseLeave={handleCardLeave}
        >
          {/* Top 3 tags */}
          <ProfileTags
            tags={pairTags.get(pair[0].id) ?? []}
            myVotedTags={myVotedTags.get(pair[0].id) ?? new Set()}
            onVote={user ? (tag) => handleTagVote(pair[0].id, tag) : null}
          />

          {/* Profile card — uses vote-sorted image URLs so highest-voted photo shows first */}
          <div className="relative w-full">
            <ProfileCard
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

            {/* Tag popup — opens to the RIGHT */}
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
        <div className="flex flex-col items-center justify-center shrink-0 gap-2 pt-7">
          <span
            className="font-black leading-none vs-text text-3xl sm:text-4xl"
            style={{ color: "#FF6B2B" }}
          >
            VS
          </span>
          {!user && (
            <span
              className="text-[9px] font-black uppercase tracking-widest"
              style={{ color: "#1B2338" }}
            >
              tap
            </span>
          )}
        </div>

        {/* ── Right card ── */}
        <div
          className="flex flex-col items-center"
          style={{ flex: "1 1 0", maxWidth: "220px", position: "relative" }}
          onMouseEnter={() => handleCardEnter("right")}
          onMouseLeave={handleCardLeave}
        >
          {/* Top 3 tags */}
          <ProfileTags
            tags={pairTags.get(pair[1].id) ?? []}
            myVotedTags={myVotedTags.get(pair[1].id) ?? new Set()}
            onVote={user ? (tag) => handleTagVote(pair[1].id, tag) : null}
          />

          {/* Profile card — uses vote-sorted image URLs so highest-voted photo shows first */}
          <div className="relative w-full">
            <ProfileCard
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

            {/* Tag popup — opens to the LEFT */}
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
          style={{ background: "rgba(7,9,15,0.92)", backdropFilter: "blur(8px)" }}
          onClick={() => setShowSignInGate(false)}
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
            <div
              className="text-5xl mb-4"
              style={{ filter: "drop-shadow(0 0 12px rgba(240,192,64,0.4))" }}
            >
              ⚔️
            </div>
            <h2 className="text-white font-black text-xl mb-2 tracking-tight">
              Join the Arena
            </h2>
            <p className="text-sm mb-6 leading-relaxed" style={{ color: "#4D6080" }}>
              Sign in to vote in battles, track your history, and compete on the leaderboard.
            </p>
            <Link
              href="/profile"
              className="block btn-gold rounded-xl px-6 py-3 text-sm font-black uppercase tracking-wider"
              onClick={() => setShowSignInGate(false)}
            >
              Sign In with Google →
            </Link>
            <button
              onClick={() => setShowSignInGate(false)}
              className="mt-4 text-xs font-bold hover:underline"
              style={{ color: "#3D5070" }}
            >
              Maybe later
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
