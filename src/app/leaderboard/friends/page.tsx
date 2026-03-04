"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getMutualFollows, type FollowProfile } from "@/lib/follows";
import { getTier, type Gender } from "@/lib/tiers";

function Avatar({ src, name, size = 36 }: { src: string | null; name: string; size?: number }) {
  const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1a1a1a&color=888&size=${size * 2}&bold=true`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src ?? fallback}
      alt={name}
      width={size}
      height={size}
      className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size }}
      onError={(e) => { (e.target as HTMLImageElement).src = fallback; }}
    />
  );
}

function TierIcon({ elo, gender }: { elo: number; gender?: Gender }) {
  const tier = getTier(elo, gender);
  return (
    <div
      className={`rank-badge ${tier.cssClass}`}
      title={tier.name}
      style={{ width: 36, height: 36, minWidth: 36, borderRadius: 0 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={tier.iconUrl}
        alt={tier.name}
        className="w-full h-full object-cover"
      />
    </div>
  );
}

export default function FriendsLeaderboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [friends, setFriends] = useState<FollowProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace("/profile"); return; }
    getMutualFollows(user.id).then((data) => {
      const sorted = [...data].sort((a, b) => b.elo_rating - a.elo_rating);
      setFriends(sorted);
      setLoading(false);
    });
  }, [user, authLoading, router]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      {/* Back */}
      <Link
        href="/leaderboard"
        className="inline-flex items-center gap-1.5 text-xs font-bold mb-8 transition-opacity hover:opacity-70"
        style={{ color: "var(--text-muted)" }}
      >
        ← Leaderboards
      </Link>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-3xl font-black text-[color:var(--text-primary)]">🤝 Friends</h1>
        </div>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          People you mutually follow, ranked by ELO
        </p>
      </div>

      {loading ? (
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3"
              style={{
                borderBottom: i < 5 ? "1px solid var(--border)" : "none",
                background: "var(--bg-card)",
              }}
            >
              <div className="w-5 h-3 rounded animate-pulse" style={{ background: "var(--border)" }} />
              <div className="w-9 h-9 rounded-full shrink-0 animate-pulse" style={{ background: "var(--border)" }} />
              <div className="flex-1">
                <div className="h-3 rounded-full mb-1.5 animate-pulse" style={{ background: "var(--border)", width: "60%" }} />
              </div>
              <div className="h-4 w-12 rounded-lg animate-pulse" style={{ background: "var(--border)" }} />
            </div>
          ))}
        </div>
      ) : friends.length === 0 ? (
        <div
          className="rounded-2xl p-8 text-center"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <p className="text-4xl mb-3">🤝</p>
          <p className="font-bold text-[color:var(--text-primary)] mb-1">No friends yet</p>
          <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
            Follow someone and have them follow you back to become friends.
          </p>
          <Link
            href="/leaderboard/members"
            className="inline-block py-2.5 px-5 rounded-xl font-black text-sm uppercase tracking-wide"
            style={{
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-hover)",
              color: "var(--text-primary)",
            }}
          >
            Browse Players
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          {friends.map((friend, i) => (
            <Link
              key={friend.user_id}
              href={`/players/${friend.user_id}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/5"
              style={{
                borderBottom: i < friends.length - 1 ? "1px solid var(--border)" : "none",
                background: "var(--bg-card)",
              }}
            >
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-black w-4 text-right" style={{ color: "var(--text-faint)" }}>
                  {i + 1}
                </span>
                <TierIcon elo={friend.elo_rating} gender={friend.gender === "female" ? "female" : "male"} />
                <div className="flex flex-col">
                  <span className="font-black text-base leading-tight" style={{ color: "var(--text-primary)" }}>
                    {friend.elo_rating}
                  </span>
                  <span className="text-[9px] font-black uppercase tracking-widest leading-tight" style={{ color: "var(--text-faint)" }}>
                    {getTier(friend.elo_rating, friend.gender === "female" ? "female" : "male").name}
                  </span>
                </div>
              </div>
              <Avatar src={friend.image_url} name={friend.name} size={36} />
              <div className="flex-1 min-w-0">
                <p className="font-black text-[color:var(--text-primary)] text-sm truncate">{friend.name}</p>
              </div>
              <Link
                href={`/messages/${friend.user_id}`}
                onClick={(e) => e.stopPropagation()}
                className="ml-1 text-sm shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                title="Send message"
              >
                💬
              </Link>
            </Link>
          ))}
        </div>
      )}

      {friends.length > 0 && (
        <p className="text-center text-xs mt-4" style={{ color: "var(--text-faint)" }}>
          {friends.length} friend{friends.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
