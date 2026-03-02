"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getLeaderboardForArena, getDailyEloChanges, type ArenaProfile } from "@/lib/arenas";
import { getTopTagsForProfiles, type TagEntry } from "@/lib/tags";
import { countryFlagByName } from "@/lib/countries";
import { getTier } from "@/lib/tiers";

interface LeaderboardEntry extends ArenaProfile {
  rank: number;
}

function avatarUrl(name: string) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=1a1a1a&color=555&size=96&bold=true`;
}

function TierBadge({ elo, size = 42 }: { elo: number; size?: number }) {
  const tier = getTier(elo);
  return (
    <div
      className={`rank-badge ${tier.cssClass}`}
      title={tier.name}
      style={{ width: size, height: size, minWidth: size, borderRadius: 0 }}
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

function EloDelta({ change }: { change: number }) {
  if (change === 0) return null;
  const isPositive = change > 0;
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[10px] sm:text-[11px] font-black leading-none"
      style={{ color: isPositive ? "var(--success)" : "var(--danger)" }}
    >
      <span style={{ fontSize: "8px" }}>{isPositive ? "▲" : "▼"}</span>
      {Math.abs(change)}
    </span>
  );
}

export default function LeaderboardTable({ arenaId, arenaSlug, isSubCategory }: { arenaId: string; arenaSlug?: string; isSubCategory?: boolean }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [topTags, setTopTags] = useState<Map<string, TagEntry[]>>(new Map());
  const [eloChanges, setEloChanges] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [arenaSpecific, setArenaSpecific] = useState(false);

  const fetchData = async (useArenaSpecific = false, isInitial = false) => {
    if (isInitial) setLoading(true);
    const data = await getLeaderboardForArena(arenaId, {
      membersOnly: arenaSlug === "members",
      arenaSpecific: useArenaSpecific,
    });
    setEntries(data);
    if (isInitial) setLoading(false);

    if (data.length > 0) {
      const ids = data.map((e) => e.id);
      const [tagMap, dailyChanges] = await Promise.all([
        getTopTagsForProfiles(ids),
        getDailyEloChanges(ids),
      ]);
      setTopTags(tagMap);
      setEloChanges(dailyChanges);
    }
  };

  useEffect(() => {
    fetchData(arenaSpecific, true);
    const interval = setInterval(() => {
      if (!document.hidden) fetchData(arenaSpecific, false);
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
        className="w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-colors"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-primary)" }}
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
          const tier = getTier(entry.elo_rating);
          const isPslGod = tier.isSpecial;
          const dailyChange = eloChanges.get(entry.id) ?? 0;

          return (
            <Link
              key={entry.id}
              href={`/players/${entry.id}`}
              className={`flex items-center gap-2 sm:gap-4 p-2.5 sm:p-4 rounded-xl rank-row${isPslGod ? " rank-row-psl-god" : ""}`}
              style={{
                background: "var(--bg-card)",
                border: `1px solid ${isPslGod ? "rgba(255,215,0,0.3)" : "var(--border)"}`,
                transition: "all 0.2s ease",
              }}
              onMouseEnter={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "scale(1.005)";
                el.style.borderColor = isPslGod ? "rgba(255,215,0,0.5)" : "var(--border-hover)";
                el.style.boxShadow = isPslGod
                  ? "0 0 24px rgba(255,215,0,0.2)"
                  : "0 0 14px rgba(0,0,0,0.15)";
              }}
              onMouseLeave={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.transform = "scale(1)";
                el.style.borderColor = isPslGod ? "rgba(255,215,0,0.3)" : "var(--border)";
                el.style.boxShadow = "none";
              }}
            >
              {/* Left: Rank # + Tier Icon + ELO + Tier Name + Daily Change */}
              <div className="flex items-center gap-2 sm:gap-3 shrink-0" style={{ minWidth: "120px" }}>
                <span
                  className="text-[10px] sm:text-xs font-black w-4 sm:w-5 text-right"
                  style={{ color: "var(--text-faint)" }}
                >
                  {entry.rank}
                </span>
                <TierBadge elo={entry.elo_rating} size={36} />
                <div className="flex flex-col" style={{ width: "62px" }}>
                  <div className="flex items-center gap-1">
                    <span
                      className="font-black text-base sm:text-lg leading-tight"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {entry.elo_rating}
                    </span>
                    <EloDelta change={dailyChange} />
                  </div>
                  <span
                    className="text-[7px] sm:text-[8px] font-black uppercase tracking-wide leading-tight"
                    style={{ color: isPslGod ? "rgba(255,215,0,0.6)" : "var(--text-faint)", lineHeight: "1.2" }}
                  >
                    {arenaSpecific ? "ARENA" : tier.name}
                  </span>
                </div>
              </div>

              {/* Avatar */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={entry.image_url || avatarUrl(entry.name)}
                alt={entry.name}
                className="object-cover shrink-0"
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "12px",
                  border: "2px solid var(--border)",
                }}
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  img.onerror = null;
                  img.src = avatarUrl(entry.name);
                }}
              />

              {/* Name + tags */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-[color:var(--text-primary)] font-black truncate text-xs sm:text-base">
                    {entry.name}
                  </h3>
                  {flag && <span className="text-sm sm:text-base shrink-0">{flag}</span>}
                </div>

                {tags.length > 0 && (
                  <div className="hidden sm:flex gap-1 mt-1 flex-wrap">
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
              </div>

              {/* Right: W/L record — compact on mobile */}
              <div className="text-right shrink-0">
                <p
                  className="font-black text-[10px] sm:text-sm"
                  style={{ color: "var(--text-primary)" }}
                >
                  <span className="sm:hidden">{entry.wins}–{entry.losses}</span>
                  <span className="hidden sm:inline">{entry.wins}W – {entry.losses}L</span>
                </p>
                <p
                  className="text-[8px] sm:text-[10px] font-bold"
                  style={{ color: "var(--text-faint)" }}
                >
                  {entry.matches}<span className="hidden sm:inline"> battles</span>
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
