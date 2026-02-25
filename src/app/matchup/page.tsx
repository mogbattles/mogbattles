"use client";

import { useState, useEffect, useRef } from "react";
import { searchProfiles, getHeadToHead, type HeadToHeadStats } from "@/lib/arenas";

interface SearchResult {
  id: string;
  name: string;
  image_url: string | null;
  category: string | null;
}

function ProfileAvatar({ profile, size = "md" }: { profile: SearchResult | null; size?: "sm" | "md" | "lg" }) {
  const sz = size === "lg" ? "w-20 h-20" : size === "md" ? "w-12 h-12" : "w-8 h-8";
  if (!profile) {
    return (
      <div className={`${sz} rounded-full bg-zinc-800 border-2 border-dashed border-zinc-700 flex items-center justify-center`}>
        <span className="text-zinc-600 text-lg">?</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={profile.image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&background=27272a&color=888&size=80`}
      alt={profile.name}
      className={`${sz} rounded-full object-cover border-2 border-zinc-700`}
      onError={(e) => {
        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&background=27272a&color=888&size=80`;
      }}
    />
  );
}

function ProfileSearch({
  label,
  value,
  onSelect,
  exclude,
}: {
  label: string;
  value: SearchResult | null;
  onSelect: (p: SearchResult) => void;
  exclude?: string;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); setOpen(false); return; }
    setLoading(true);
    const t = setTimeout(async () => {
      const data = await searchProfiles(query, 8);
      setResults(data.filter((p) => p.id !== exclude));
      setOpen(true);
      setLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [query, exclude]);

  function select(p: SearchResult) {
    onSelect(p);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div ref={ref} className="flex-1 min-w-0">
      <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-2">{label}</p>
      {value ? (
        <div className="flex items-center gap-3 bg-zinc-900 border border-zinc-700 rounded-xl p-3">
          <ProfileAvatar profile={value} />
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold truncate">{value.name}</p>
            {value.category && (
              <p className="text-zinc-500 text-xs capitalize">{value.category.replace("_", " ")}</p>
            )}
          </div>
          <button
            onClick={() => onSelect({ id: "", name: "", image_url: null, category: null })}
            className="text-zinc-600 hover:text-white text-sm shrink-0"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            placeholder="Search by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-3 text-white placeholder:text-zinc-600 text-sm focus:outline-none focus:border-orange-500 transition-colors"
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 text-xs animate-pulse">
              …
            </div>
          )}
          {open && results.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-zinc-900 border border-zinc-700 rounded-xl shadow-xl overflow-hidden">
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => select(p)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-800 transition-colors text-left"
                >
                  <ProfileAvatar profile={p} size="sm" />
                  <div>
                    <p className="text-white text-sm font-semibold">{p.name}</p>
                    {p.category && (
                      <p className="text-zinc-500 text-xs capitalize">{p.category.replace("_", " ")}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function MatchupPage() {
  const [profileA, setProfileA] = useState<SearchResult | null>(null);
  const [profileB, setProfileB] = useState<SearchResult | null>(null);
  const [stats, setStats] = useState<HeadToHeadStats | null>(null);
  const [loading, setLoading] = useState(false);

  // Auto-fetch when both selected
  useEffect(() => {
    if (profileA?.id && profileB?.id) {
      setLoading(true);
      getHeadToHead(profileA.id, profileB.id).then((data) => {
        setStats(data);
        setLoading(false);
      });
    } else {
      setStats(null);
    }
  }, [profileA?.id, profileB?.id]);

  function handleSelectA(p: SearchResult) {
    setProfileA(p.id ? p : null);
  }
  function handleSelectB(p: SearchResult) {
    setProfileB(p.id ? p : null);
  }

  const aWinPct = stats && stats.total > 0 ? Math.round((stats.a_wins / stats.total) * 100) : 0;
  const bWinPct = stats && stats.total > 0 ? Math.round((stats.b_wins / stats.total) * 100) : 0;

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-black text-white mb-1">🥊 Head-to-Head</h1>
        <p className="text-zinc-500 text-sm">
          See how the community voted between any two people
        </p>
      </div>

      {/* Search inputs */}
      <div className="flex gap-4 items-start mb-8">
        <ProfileSearch
          label="Person 1"
          value={profileA}
          onSelect={handleSelectA}
          exclude={profileB?.id}
        />
        <div className="pt-8 shrink-0">
          <span className="text-2xl font-black text-orange-500">VS</span>
        </div>
        <ProfileSearch
          label="Person 2"
          value={profileB}
          onSelect={handleSelectB}
          exclude={profileA?.id}
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="text-center py-12">
          <div className="text-zinc-400 animate-pulse text-sm">Loading matchup data…</div>
        </div>
      )}

      {/* No data yet */}
      {!profileA && !profileB && !loading && (
        <div className="text-center py-12">
          <div className="text-5xl mb-4">🔍</div>
          <p className="text-zinc-400">Search for two people to see how voters compare them</p>
          <p className="text-zinc-600 text-sm mt-2">
            e.g. search &ldquo;Cristiano&rdquo; vs &ldquo;Beckham&rdquo;
          </p>
        </div>
      )}

      {/* Results */}
      {stats && !loading && (
        <div className="space-y-6">
          {/* Big stat */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-6">
              {/* Profile A */}
              <div className="text-center flex-1">
                <ProfileAvatar profile={profileA} size="lg" />
                <p className="text-white font-black text-base mt-2 truncate">{stats.profile_a.name}</p>
                <p className="text-orange-400 font-black text-3xl mt-1">{aWinPct}%</p>
                <p className="text-zinc-500 text-xs">{stats.a_wins} wins</p>
              </div>

              {/* VS divider */}
              <div className="text-center px-4">
                <span className="text-zinc-600 font-black text-xl">VS</span>
                <p className="text-zinc-600 text-xs mt-1">{stats.total} votes</p>
              </div>

              {/* Profile B */}
              <div className="text-center flex-1">
                <ProfileAvatar profile={profileB} size="lg" />
                <p className="text-white font-black text-base mt-2 truncate">{stats.profile_b.name}</p>
                <p className="text-orange-400 font-black text-3xl mt-1">{bWinPct}%</p>
                <p className="text-zinc-500 text-xs">{stats.b_wins} wins</p>
              </div>
            </div>

            {/* Win bar */}
            {stats.total > 0 ? (
              <div>
                <div className="flex rounded-full overflow-hidden h-3 gap-0.5">
                  <div
                    className="bg-orange-500 transition-all duration-700"
                    style={{ width: `${aWinPct}%` }}
                  />
                  <div
                    className="bg-zinc-700 transition-all duration-700"
                    style={{ width: `${bWinPct}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-zinc-500 text-xs">{stats.profile_a.name}</span>
                  <span className="text-zinc-500 text-xs">{stats.profile_b.name}</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-zinc-500 text-sm">No head-to-head battles yet</p>
                <p className="text-zinc-600 text-xs mt-1">
                  These two haven&apos;t been matched up in the swipe arena yet
                </p>
              </div>
            )}
          </div>

          {/* Consensus statement */}
          {stats.total > 0 && (
            <div className="text-center">
              {aWinPct > bWinPct ? (
                <p className="text-zinc-300 text-sm">
                  <span className="text-white font-bold">{aWinPct}%</span> of voters think{" "}
                  <span className="text-orange-400 font-bold">{stats.profile_a.name}</span> mogs{" "}
                  {stats.profile_b.name}
                </p>
              ) : bWinPct > aWinPct ? (
                <p className="text-zinc-300 text-sm">
                  <span className="text-white font-bold">{bWinPct}%</span> of voters think{" "}
                  <span className="text-orange-400 font-bold">{stats.profile_b.name}</span> mogs{" "}
                  {stats.profile_a.name}
                </p>
              ) : (
                <p className="text-zinc-300 text-sm">
                  The community is{" "}
                  <span className="text-orange-400 font-bold">perfectly split</span> on this one!
                </p>
              )}
            </div>
          )}

          {/* ELO comparison */}
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
            <p className="text-zinc-500 text-xs font-bold uppercase tracking-wider mb-3">
              Global ELO
            </p>
            <div className="flex items-center gap-4">
              <div className="flex-1 text-center">
                <p className="text-orange-400 font-black text-2xl">{stats.a_elo}</p>
                <p className="text-zinc-500 text-xs truncate">{stats.profile_a.name}</p>
              </div>
              <div className="text-zinc-700 font-bold">vs</div>
              <div className="flex-1 text-center">
                <p className="text-orange-400 font-black text-2xl">{stats.b_elo}</p>
                <p className="text-zinc-500 text-xs truncate">{stats.profile_b.name}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
