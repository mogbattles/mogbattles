"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getLeaderboardForArena, type ArenaProfile } from "@/lib/arenas";
import { getTopTagsForProfiles, type TagEntry } from "@/lib/tags";
import { countryFlagByName } from "@/lib/countries";

interface LeaderboardEntry extends ArenaProfile {
  rank: number;
}

function avatarUrl(name: string) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0F0F1A&color=555&size=96&bold=true`;
}

function RankLabel({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-lg">👑</span>;
  if (rank === 2) return <span className="text-lg">🥈</span>;
  if (rank === 3) return <span className="text-lg">🥉</span>;
  return (
    <span className="font-black text-xs" style={{ color: "#2A2A3D" }}>
      #{rank}
    </span>
  );
}

export default function LeaderboardTable({ arenaId, arenaSlug }: { arenaId: string; arenaSlug?: string }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [topTags, setTopTags] = useState<Map<string, TagEntry[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchData = async () => {
    const data = await getLeaderboardForArena(arenaId, { membersOnly: arenaSlug === "members" });
    setEntries(data);
    setLoading(false);

    if (data.length > 0) {
      const tagMap = await getTopTagsForProfiles(data.map((e) => e.id));
      setTopTags(tagMap);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      if (!document.hidden) fetchData();
    }, 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arenaId]);

  const filtered = search.trim()
    ? entries.filter((e) =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        (e.country ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : entries;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div
          className="w-8 h-8 rounded-full border-2 animate-spin"
          style={{ borderColor: "#8B5CF6", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center mt-16">
        <p className="text-lg font-bold text-white mb-1">No battles yet.</p>
        <p className="text-sm" style={{ color: "#4A4A66" }}>Be the first to vote!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or country…"
        className="w-full rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none transition-colors"
        style={{ background: "#0F0F1A", border: "1px solid #222233" }}
        onFocus={(e) => { e.target.style.borderColor = "#8B5CF6"; }}
        onBlur={(e) => { e.target.style.borderColor = "#222233"; }}
      />

      {filtered.length === 0 && (
        <p className="text-center text-sm py-8" style={{ color: "#2A2A3D" }}>
          No results for &ldquo;{search}&rdquo;
        </p>
      )}

      <div className="space-y-2">
        {filtered.map((entry) => {
          const flag = countryFlagByName(entry.country);
          const tags = topTags.get(entry.id) ?? [];
          const isTop = entry.rank <= 3;
          const topBorder =
            entry.rank === 1 ? "rgba(240,192,64,0.25)"
            : entry.rank === 2 ? "rgba(192,192,192,0.18)"
            : "rgba(180,100,40,0.18)";

          return (
            <Link
              key={entry.id}
              href={`/players/${entry.id}`}
              className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl transition-all"
              style={{
                background: entry.rank === 1 ? "rgba(240,192,64,0.04)"
                  : entry.rank === 2 ? "rgba(192,192,192,0.03)"
                  : entry.rank === 3 ? "rgba(180,100,40,0.03)"
                  : "#0F0F1A",
                border: `1px solid ${isTop ? topBorder : "#222233"}`,
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.5)";
                (e.currentTarget as HTMLElement).style.boxShadow = "0 0 14px rgba(139,92,246,0.07)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.borderColor = isTop ? topBorder : "#222233";
                (e.currentTarget as HTMLElement).style.boxShadow = "none";
              }}
            >
              {/* Rank */}
              <div className="w-8 text-center shrink-0">
                <RankLabel rank={entry.rank} />
              </div>

              {/* Avatar */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={entry.image_url || avatarUrl(entry.name)}
                alt={entry.name}
                className="rounded-full object-cover shrink-0"
                style={{
                  width: "44px",
                  height: "44px",
                  border: entry.rank === 1
                    ? "2px solid rgba(240,192,64,0.5)"
                    : "2px solid #222233",
                }}
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  img.onerror = null;
                  img.src = avatarUrl(entry.name);
                }}
              />

              {/* Name + tags + record */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-white font-black truncate text-sm sm:text-base">
                    {entry.name}
                  </h3>
                  {flag && <span className="text-base shrink-0">{flag}</span>}
                </div>

                {tags.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {tags.map(({ tag }) => (
                      <span
                        key={tag}
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{
                          color: "#4A4A66",
                          background: "#1A1A28",
                          border: "1px solid #2A2A3D",
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <p className="text-xs mt-0.5" style={{ color: "#2A2A3D" }}>
                  {entry.wins}W – {entry.losses}L · {entry.matches} battles
                </p>
              </div>

              {/* ELO */}
              <div className="text-right shrink-0">
                <span
                  className="font-black text-lg sm:text-xl"
                  style={{ color: entry.rank === 1 ? "#F0C040" : "#6D28D9" }}
                >
                  {entry.elo_rating}
                </span>
                <p
                  className="text-[10px] font-black uppercase tracking-widest"
                  style={{ color: "#2A2A3D" }}
                >
                  ELO
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
