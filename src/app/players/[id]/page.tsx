"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getProfileById, getMyGlobalRank, type ArenaProfile } from "@/lib/arenas";
import { countryFlagByName } from "@/lib/countries";
import { useAuth } from "@/context/AuthContext";
import {
  followUser,
  unfollowUser,
  isFollowing,
  isMutualFollow,
  getFollowCounts,
} from "@/lib/follows";

function inchesToDisplay(inches: number): string {
  return `${Math.floor(inches / 12)}'${inches % 12}"`;
}

function RankBadge({ rank }: { rank: number }) {
  const label = rank === 1 ? "👑 #1" : rank === 2 ? "🥈 #2" : rank === 3 ? "🥉 #3" : `#${rank}`;
  return (
    <span
      className="text-sm font-black px-3 py-1 rounded-full"
      style={{
        background: rank === 1
          ? "rgba(240,192,64,0.15)"
          : "rgba(255,255,255,0.06)",
        border: rank === 1
          ? "1px solid rgba(240,192,64,0.4)"
          : "1px solid rgba(255,255,255,0.12)",
        color: rank === 1 ? "var(--gold)" : "var(--text-secondary)",
      }}
    >
      {label}
    </span>
  );
}

function fallback(name: string) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1a1a1a&color=888&size=400&bold=true`;
}

export default function PlayerPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const { user, permissions } = useAuth();

  const [profile, setProfile] = useState<ArenaProfile | null | "loading">("loading");
  const [rank, setRank] = useState<number | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [following, setFollowing] = useState(false);
  const [mutual, setMutual] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [followingCount, setFollowingCount] = useState(0);

  useEffect(() => {
    if (!id) return;
    Promise.all([getProfileById(id), getMyGlobalRank(id)]).then(([p, r]) => {
      setProfile(p);
      setRank(r);
    });
  }, [id]);

  useEffect(() => {
    const targetUserId = (profile && profile !== "loading") ? profile.user_id ?? null : null;
    if (!user || !targetUserId || user.id === targetUserId) return;

    Promise.all([
      isFollowing(user.id, targetUserId),
      isMutualFollow(user.id, targetUserId),
      getFollowCounts(targetUserId),
    ]).then(([f, m, counts]) => {
      setFollowing(f);
      setMutual(m);
      setFollowerCount(counts.followers);
      setFollowingCount(counts.following);
    });
  }, [user, profile]);

  const handleFollow = async () => {
    const targetUserId = (profile && profile !== "loading") ? profile.user_id ?? null : null;
    if (!user || !targetUserId) return;
    setFollowLoading(true);
    const { error } = await followUser(user.id, targetUserId);
    if (!error) {
      setFollowing(true);
      setFollowerCount((c) => c + 1);
      const m = await isMutualFollow(user.id, targetUserId);
      setMutual(m);
    }
    setFollowLoading(false);
  };

  const handleUnfollow = async () => {
    const targetUserId = (profile && profile !== "loading") ? profile.user_id ?? null : null;
    if (!user || !targetUserId) return;
    setFollowLoading(true);
    const { error } = await unfollowUser(user.id, targetUserId);
    if (!error) {
      setFollowing(false);
      setMutual(false);
      setFollowerCount((c) => Math.max(0, c - 1));
    }
    setFollowLoading(false);
  };

  const images =
    profile && profile !== "loading"
      ? profile.image_urls.filter(Boolean).length > 0
        ? profile.image_urls.filter(Boolean)
        : profile.image_url
        ? [profile.image_url]
        : []
      : [];

  const hasMultiple = images.length > 1;

  const resetTimer = useCallback(() => {
    if (!hasMultiple) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrentIdx((prev) => (prev + 1) % images.length);
    }, 3500);
  }, [hasMultiple, images.length]);

  useEffect(() => {
    resetTimer();
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [resetTimer]);

  if (profile === "loading") {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-20">
        <p className="text-lg mb-3" style={{ color: "var(--text-muted)" }}>Player not found.</p>
        <Link href="/leaderboard" className="text-sm underline" style={{ color: "var(--text-secondary)" }}>
          ← Back to leaderboard
        </Link>
      </div>
    );
  }

  const flag = countryFlagByName(profile.country);
  const currentImage = images[currentIdx] ?? null;
  const winRate = profile.matches > 0 ? Math.round((profile.wins / profile.matches) * 100) : 0;

  const targetUserId = profile.user_id ?? null;
  const isOwnProfile = user?.id === targetUserId;
  const canFollow = !!(user && permissions.isMember && targetUserId && !isOwnProfile);

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      {/* Back */}
      <Link
        href="/leaderboard"
        className="inline-flex items-center gap-1.5 text-xs font-bold mb-6 transition-opacity hover:opacity-70"
        style={{ color: "var(--text-muted)" }}
      >
        ← All Leaderboards
      </Link>

      {/* Photo card */}
      <div
        className="relative rounded-2xl overflow-hidden mb-5"
        style={{ aspectRatio: "3/4", background: "var(--bg-primary)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={currentImage ?? fallback(profile.name)}
          alt={profile.name}
          className="w-full h-full object-cover"
          onError={(e) => { (e.target as HTMLImageElement).src = fallback(profile.name); }}
        />

        <div
          className="absolute inset-x-0 bottom-0 h-24 pointer-events-none"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)" }}
        />

        {rank !== null && (
          <div
            className="absolute top-3 left-3 text-sm font-black px-3 py-1.5 rounded-full"
            style={{
              background: "rgba(0,0,0,0.8)",
              border: rank === 1 ? "1px solid rgba(240,192,64,0.5)" : "1px solid rgba(255,255,255,0.12)",
              backdropFilter: "blur(8px)",
              color: rank === 1 ? "var(--gold)" : "var(--text-secondary)",
            }}
          >
            {rank === 1 ? "👑 #1" : rank === 2 ? "🥈 #2" : rank === 3 ? "🥉 #3" : `#${rank}`}
          </div>
        )}

        {hasMultiple && (
          <>
            <button
              onClick={() => { setCurrentIdx((prev) => (prev - 1 + images.length) % images.length); resetTimer(); }}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 flex items-center justify-center rounded-full"
              style={{ background: "rgba(0,0,0,0.72)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.9)", fontSize: "18px", lineHeight: 1, backdropFilter: "blur(6px)" }}
            >
              ‹
            </button>
            <button
              onClick={() => { setCurrentIdx((prev) => (prev + 1) % images.length); resetTimer(); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 flex items-center justify-center rounded-full"
              style={{ background: "rgba(0,0,0,0.72)", border: "1px solid rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.9)", fontSize: "18px", lineHeight: 1, backdropFilter: "blur(6px)" }}
            >
              ›
            </button>
          </>
        )}

        {hasMultiple && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5 z-10">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={() => { setCurrentIdx(i); resetTimer(); }}
                className="rounded-full transition-all"
                style={{
                  width: i === currentIdx ? "18px" : "6px",
                  height: "6px",
                  background: i === currentIdx ? "var(--accent)" : "rgba(255,255,255,0.3)",
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Name + category */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <h1 className="text-2xl font-black text-[color:var(--text-primary)] leading-tight">{profile.name}</h1>
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            {(profile.categories?.length ? profile.categories : profile.category ? [profile.category] : []).map((cat) => (
              <span
                key={cat}
                className="text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide"
                style={{
                  color: "var(--text-muted)",
                  background: "rgba(255,255,255,0.05)",
                  border: "1px solid rgba(255,255,255,0.1)",
                }}
              >
                {cat.replace(/_/g, " ")}
              </span>
            ))}
            {flag && (
              <span className="text-xl" title={profile.country ?? ""}>{flag}</span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-2xl font-black" style={{ color: "var(--gold)" }}>{profile.elo_rating}</p>
          <p className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>ELO</p>
        </div>
      </div>

      {/* Follower counts */}
      {targetUserId && (
        <div className="flex items-center gap-4 mb-4">
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            <span className="font-black text-[color:var(--text-primary)]">{followerCount}</span> followers
          </span>
          <span className="text-sm" style={{ color: "var(--text-muted)" }}>
            <span className="font-black text-[color:var(--text-primary)]">{followingCount}</span> following
          </span>
          {mutual && (
            <span
              className="text-xs font-bold px-2 py-0.5 rounded-full"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "var(--text-secondary)",
              }}
            >
              🤝 Friends
            </span>
          )}
        </div>
      )}

      {/* Follow / Message buttons */}
      {canFollow && (
        <div className="flex gap-2 mb-5">
          <button
            onClick={following ? handleUnfollow : handleFollow}
            disabled={followLoading}
            className="flex-1 py-2.5 rounded-xl font-black text-sm uppercase tracking-wide transition-opacity disabled:opacity-50"
            style={following ? {
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "#aaa",
            } : {
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-hover)",
              color: "var(--accent)",
            }}
          >
            {followLoading ? "…" : following ? "✓ Following" : "+ Follow"}
          </button>

          {mutual && (
            <Link
              href={`/messages/${targetUserId}`}
              className="flex-1 py-2.5 rounded-xl font-black text-sm uppercase tracking-wide text-center transition-opacity hover:opacity-80"
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)",
                color: "var(--text-secondary)",
              }}
            >
              💬 Message
            </Link>
          )}
        </div>
      )}

      {/* Rank badge row */}
      {rank !== null && (
        <div className="mb-5">
          <RankBadge rank={rank} />
        </div>
      )}

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: "Wins", value: profile.wins, color: "#3DD68C" },
          { label: "Losses", value: profile.losses, color: "#FF4545" },
          { label: "Battles", value: profile.matches, color: "var(--text-secondary)" },
        ].map(({ label, value, color }) => (
          <div
            key={label}
            className="rounded-xl p-3 text-center"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
          >
            <p className="font-black text-xl text-[color:var(--text-primary)]">{value}</p>
            <p className="text-xs font-bold uppercase tracking-wide mt-0.5" style={{ color }}>{label}</p>
          </div>
        ))}
      </div>

      {/* Win rate bar */}
      {profile.matches > 0 && (
        <div
          className="rounded-xl p-4 mb-5"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-black uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              Win Rate
            </p>
            <span className="font-black text-[color:var(--text-primary)] text-sm">{winRate}%</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${winRate}%`,
                background: "var(--text-primary)",
              }}
            />
          </div>
        </div>
      )}

      {/* Physical stats */}
      {(profile.height_in || profile.weight_lbs || profile.country) && (
        <div
          className="rounded-xl p-4 mb-6"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <p className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)" }}>
            Stats
          </p>
          <div className="space-y-2.5">
            {profile.country && (
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>Country</span>
                <span className="text-[color:var(--text-primary)] text-sm font-semibold">
                  {flag} {profile.country}
                </span>
              </div>
            )}
            {profile.height_in != null && (
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>Height</span>
                <span className="text-[color:var(--text-primary)] text-sm font-semibold">
                  {inchesToDisplay(profile.height_in)}
                </span>
              </div>
            )}
            {profile.weight_lbs != null && (
              <div className="flex justify-between items-center">
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>Weight</span>
                <span className="text-[color:var(--text-primary)] text-sm font-semibold">
                  {profile.weight_lbs} lbs
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <Link
        href="/swipe"
        className="btn-accent gold-pulse-btn block text-center w-full py-3.5 rounded-xl font-black text-base uppercase tracking-wider"
      >
        ⚔️ Battle in Arena
      </Link>
    </div>
  );
}
