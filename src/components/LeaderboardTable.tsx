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
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1a1a1a&color=555&size=96&bold=true`;
}

function RankLabel({ rank }: { rank: number }) {
  if (rank === 1) return (
    <div className="rank-badge rank-badge-1">
      <span className="text-sm font-black" style={{ color: "var(--gold)" }}>1</span>
    </div>
  );
  if (rank === 2) return (
    <div className="rank-badge rank-badge-2">
      <span className="text-sm font-black" style={{ color: "var(--silver)" }}>2</span>
    </div>
  );
  if (rank === 3) return (
    <div className="rank-badge rank-badge-3">
      <span className="text-sm font-black" style={{ color: "var(--bronze)" }}>3</span>
    </div>
  );
  return (
    <div className="rank-badge rank-badge-default">
      <span className="text-xs font-black" style={{ color: "var(--text-faint)" }}>#{rank}</span>
    </div>
  );
}

export default function LeaderboardTable({ arenaId, arenaSlug, isSubCategory }: { arenaId: string; arenaSlug?: string; isSubCategory?: boolean }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [topTags, setTopTags] = useState<Map<string, TagEntry[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [arenaSpecific, setArenaSpecific] = useState(false);

  const fetchData = async (useArenaSpecific = false) => {
    setLoading(true);
    const data = await getLeaderboardForArena(arenaId, {
      membersOnly: arenaSlug === "members",
      arenaSpecific: useArenaSpecific,
    });
    setEntries(data);
    setLoading(false);

    if (data.length > 0) {
      const tagMap = await getTopTagsForProfiles(data.map((e) => e.id));
      setTopTags(tagMap);
    }
  };

  useEffect(() => {
    fetchData(arenaSpecific);
    const interval = setInterval(() => {
      if (!document.hidden) fetchData(arenaSpecific);
    }, 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arenaId, arenaSpecific]);

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
          style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="text-center mt-16">
        <p className="text-lg font-bold text-[color:var(--text-primary)] mb-1">No battles yet.</p>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Be the first to vote!</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ELO mode toggle — only for sub-category arenas */}
      {isSubCategory && (
        <div className="flex rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
          <button
            onClick={() => setArenaSpecific(false)}
            className="flex-1 py-2 text-xs font-black uppercase tracking-widest transition-colors"
            style={{
              background: !arenaSpecific ? "var(--bg-elevated)" : "transparent",
              color: !arenaSpecific ? "var(--accent)" : "var(--text-muted)",
              borderRight: "1px solid var(--border)",
            }}
          >
            Global ELO
          </button>
          <button
            onClick={() => setArenaSpecific(true)}
            className="flex-1 py-2 text-xs font-black uppercase tracking-widest transition-colors"
            style={{
              background: arenaSpecific ? "var(--bg-elevated)" : "transparent",
              color: arenaSpecific ? "var(--gold)" : "var(--text-muted)",
            }}
          >
            Arena ELO
          </button>
        </div>
      )}

      {/* Search */}
      <input
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or country..."
        className="w-full rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none transition-colors"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        onFocus={(e) => { e.target.style.borderColor = "var(--accent)"; }}
        onBlur={(e) => { e.target.style.borderColor = "var(--border)"; }}
      />

      {filtered.length === 0 && (
        <p className="text-center text-sm py-8" style={{ color: "var(--text-faint)" }}>
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

          const rowBg =
            entry.rank === 1 ? "rgba(240,192,64,0.04)"
            : entry.rank === 2 ? "rgba(192,192,192,0.03)"
            : entry.rank === 3 ? "rgba(180,100,40,0.03)"
            : "var(--bg-card)";

          const hoverGlow =
            entry.rank === 1 ? "0 0 20px rgba(240,192,64,0.15)"
            : entry.rank === 2 ? "0 0 20px rgba(192,192,192,0.12)"
            : entry.rank === 3 ? "0 0 20px rgba(180,100,40,0.12)"
            : "0 0 14px rgba(0,0,0,0.2)";

          return (
            <Link
              key={entry.id}
              href={`/players/${entry.id}`}
              className={`flex items-center gap-3 sm:gap-4 p-3 sm:p-4 rounded-xl rank-row${isTop ? " rank-row-top" : ""}`}
              style={{
                background: rowBg,
                border: `1px solid ${isTop ? topBorder : "var(--border)"}`,
                transition: "all 0.3s ease",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "scale(1.01)";
                el.style.borderColor = isTop ? topBorder : "var(--border-hover)";
                el.style.boxShadow = hoverGlow;
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "scale(1)";
                el.style.borderColor = isTop ? topBorder : "var(--border)";
                el.style.boxShadow = "none";
              }}
            >
              {/* Rank */}
              <div className="w-9 flex items-center justify-center shrink-0">
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
                    : entry.rank === 2
                    ? "2px solid rgba(192,192,192,0.35)"
                    : entry.rank === 3
                    ? "2px solid rgba(180,100,40,0.35)"
                    : "2px solid var(--border)",
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
                  <h3 className="text-[color:var(--text-primary)] font-black truncate text-sm sm:text-base">
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
                          color: "var(--text-muted)",
                          background: "var(--bg-elevated)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <p className="text-xs mt-0.5" style={{ color: "var(--text-faint)" }}>
                  {entry.wins}W – {entry.losses}L · {entry.matches} battles
                </p>
              </div>

              {/* ELO */}
              <div className="text-right shrink-0">
                <span
                  className="font-black text-lg sm:text-xl"
                  style={{ color: entry.rank === 1 ? "var(--gold)" : arenaSpecific ? "#D97706" : "var(--text-primary)" }}
                >
                  {entry.elo_rating}
                </span>
                <p
                  className="text-[10px] font-black uppercase tracking-widest"
                  style={{ color: "var(--text-faint)" }}
                >
                  {arenaSpecific ? "ARENA" : "ELO"}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
