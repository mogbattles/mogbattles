"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { getMutualFollows, type FollowProfile } from "@/lib/follows";

function Avatar({ src, name, size = 36 }: { src: string | null; name: string; size?: number }) {
  const fallback = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=111827&color=888&size=${size * 2}&bold=true`;
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

function RankLabel({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-sm">👑</span>;
  if (rank === 2) return <span className="text-sm">🥈</span>;
  if (rank === 3) return <span className="text-sm">🥉</span>;
  return (
    <span className="text-xs font-black w-5 text-center" style={{ color: "#253147" }}>
      {rank}
    </span>
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
      // Sort by ELO descending
      const sorted = [...data].sort((a, b) => b.elo_rating - a.elo_rating);
      setFriends(sorted);
      setLoading(false);
    });
  }, [user, authLoading, router]);

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      {/* Back */}
      <Link
        href="/leaderboard"
        className="inline-flex items-center gap-1.5 text-xs font-bold mb-8 transition-opacity hover:opacity-70"
        style={{ color: "#3D5070" }}
      >
        ← Leaderboards
      </Link>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-3xl font-black text-white">🤝 Friends</h1>
        </div>
        <p className="text-sm" style={{ color: "#3D5070" }}>
          People you mutually follow, ranked by ELO
        </p>
      </div>

      {loading ? (
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #1B2338" }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex items-center gap-3 px-4 py-3"
              style={{
                borderBottom: i < 5 ? "1px solid #1B2338" : "none",
                background: "#111827",
              }}
            >
              <div className="w-5 h-3 rounded animate-pulse" style={{ background: "#1B2338" }} />
              <div className="w-9 h-9 rounded-full shrink-0 animate-pulse" style={{ background: "#1B2338" }} />
              <div className="flex-1">
                <div className="h-3 rounded-full mb-1.5 animate-pulse" style={{ background: "#1B2338", width: "60%" }} />
              </div>
              <div className="h-4 w-12 rounded-lg animate-pulse" style={{ background: "#1B2338" }} />
            </div>
          ))}
        </div>
      ) : friends.length === 0 ? (
        <div
          className="rounded-2xl p-8 text-center"
          style={{ background: "#111827", border: "1px solid #1B2338" }}
        >
          <p className="text-4xl mb-3">🤝</p>
          <p className="font-bold text-white mb-1">No friends yet</p>
          <p className="text-sm mb-5" style={{ color: "#3D5070" }}>
            Follow someone and have them follow you back to become friends.
          </p>
          <Link
            href="/leaderboard/members"
            className="inline-block py-2.5 px-5 rounded-xl font-black text-sm uppercase tracking-wide"
            style={{
              background: "rgba(240,192,64,0.15)",
              border: "1px solid rgba(240,192,64,0.4)",
              color: "#F0C040",
            }}
          >
            Browse Players
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid #1B2338" }}>
          {friends.map((friend, i) => (
            <Link
              key={friend.user_id}
              href={`/players/${friend.user_id}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/5"
              style={{
                borderBottom: i < friends.length - 1 ? "1px solid #1B2338" : "none",
                background: "#111827",
              }}
            >
              {/* Rank */}
              <div className="w-5 flex justify-center shrink-0">
                <RankLabel rank={i + 1} />
              </div>

              {/* Avatar */}
              <Avatar src={friend.image_url} name={friend.name} size={36} />

              {/* Name */}
              <div className="flex-1 min-w-0">
                <p className="font-black text-white text-sm truncate">{friend.name}</p>
              </div>

              {/* ELO */}
              <p className="font-black text-sm shrink-0" style={{ color: "#F0C040" }}>
                {friend.elo_rating}
              </p>

              {/* Message */}
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
        <p className="text-center text-xs mt-4" style={{ color: "#253147" }}>
          {friends.length} friend{friends.length !== 1 ? "s" : ""}
        </p>
      )}
    </div>
  );
}
