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
      <div className={`${sz} rounded-full flex items-center justify-center`} style={{ background: "var(--bg-card)", border: "2px dashed var(--border)" }}>
        <span className="text-lg" style={{ color: "var(--text-faint)" }}>?</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={profile.image_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&background=1a1a1a&color=888&size=80`}
      alt={profile.name}
      className={`${sz} rounded-full object-cover`}
      style={{ border: "2px solid var(--border)" }}
      onError={(e) => {
        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(profile.name)}&background=1a1a1a&color=888&size=80`;
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
      <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>{label}</p>
      {value ? (
        <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <ProfileAvatar profile={value} />
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold truncate">{value.name}</p>
            {value.category && (
              <p className="text-xs capitalize" style={{ color: "var(--text-muted)" }}>{value.category.replace("_", " ")}</p>
            )}
          </div>
          <button
            onClick={() => onSelect({ id: "", name: "", image_url: null, category: null })}
            className="text-sm shrink-0" style={{ color: "var(--text-muted)" }}
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
            className="w-full rounded-xl px-3 py-3 text-[color:var(--text-primary)] text-sm focus:outline-none transition-colors"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border)", caretColor: "var(--accent)" }}
            onFocus={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border-hover)"; }}
            onBlur={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs animate-pulse" style={{ color: "var(--text-muted)" }}>
              …
            </div>
          )}
          {open && results.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-xl shadow-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
              {results.map((p) => (
                <button
                  key={p.id}
                  onClick={() => select(p)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 transition-colors text-left"
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-card)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                >
                  <ProfileAvatar profile={p} size="sm" />
                  <div>
                    <p className="text-[color:var(--text-primary)] text-sm font-semibold">{p.name}</p>
                    {p.category && (
                      <p className="text-xs capitalize" style={{ color: "var(--text-muted)" }}>{p.category.replace("_", " ")}</p>
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
        <h1 className="text-3xl font-black text-[color:var(--text-primary)] mb-1">🥊 Head-to-Head</h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
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
          <span className="text-2xl font-black" style={{ color: "var(--accent)" }}>VS</span>
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
          <div className="text-sm animate-pulse" style={{ color: "var(--text-muted)" }}>Loading matchup data…</div>
        </div>
      )}

      {/* No data yet */}
      {!profileA && !profileB && !loading && (
        <div className="text-center py-12">
          <div className="text-5xl mb-4">🔍</div>
          <p style={{ color: "var(--text-muted)" }}>Search for two people to see how voters compare them</p>
          <p className="text-sm mt-2" style={{ color: "var(--text-faint)" }}>
            e.g. search &ldquo;Cristiano&rdquo; vs &ldquo;Beckham&rdquo;
          </p>
        </div>
      )}

      {/* Results */}
      {stats && !loading && (
        <div className="space-y-6">
          {/* Big stat */}
          <div className="rounded-2xl p-6" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between mb-6">
              {/* Profile A */}
              <div className="text-center flex-1">
                <ProfileAvatar profile={profileA} size="lg" />
                <p className="text-[color:var(--text-primary)] font-black text-base mt-2 truncate">{stats.profile_a.name}</p>
                <p className="font-black text-3xl mt-1" style={{ color: "var(--text-secondary)" }}>{aWinPct}%</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{stats.a_wins} wins</p>
              </div>

              {/* VS divider */}
              <div className="text-center px-4">
                <span className="font-black text-xl" style={{ color: "var(--text-faint)" }}>VS</span>
                <p className="text-xs mt-1" style={{ color: "var(--text-faint)" }}>{stats.total} votes</p>
              </div>

              {/* Profile B */}
              <div className="text-center flex-1">
                <ProfileAvatar profile={profileB} size="lg" />
                <p className="text-[color:var(--text-primary)] font-black text-base mt-2 truncate">{stats.profile_b.name}</p>
                <p className="font-black text-3xl mt-1" style={{ color: "var(--text-secondary)" }}>{bWinPct}%</p>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>{stats.b_wins} wins</p>
              </div>
            </div>

            {/* Win bar */}
            {stats.total > 0 ? (
              <div>
                <div className="flex rounded-full overflow-hidden h-3 gap-0.5">
                  <div
                    className="transition-all duration-700"
                    style={{ width: `${aWinPct}%`, background: "var(--text-primary)" }}
                  />
                  <div
                    className="transition-all duration-700"
                    style={{ width: `${bWinPct}%`, background: "var(--border)" }}
                  />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{stats.profile_a.name}</span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{stats.profile_b.name}</span>
                </div>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>No head-to-head battles yet</p>
                <p className="text-xs mt-1" style={{ color: "var(--text-faint)" }}>
                  These two haven&apos;t been matched up in the swipe arena yet
                </p>
              </div>
            )}
          </div>

          {/* Consensus statement */}
          {stats.total > 0 && (
            <div className="text-center">
              {aWinPct > bWinPct ? (
                <p className="text-sm" style={{ color: "#ccc" }}>
                  <span className="text-[color:var(--text-primary)] font-bold">{aWinPct}%</span> of voters think{" "}
                  <span className="font-bold" style={{ color: "var(--text-secondary)" }}>{stats.profile_a.name}</span> mogs{" "}
                  {stats.profile_b.name}
                </p>
              ) : bWinPct > aWinPct ? (
                <p className="text-sm" style={{ color: "#ccc" }}>
                  <span className="text-[color:var(--text-primary)] font-bold">{bWinPct}%</span> of voters think{" "}
                  <span className="font-bold" style={{ color: "var(--text-secondary)" }}>{stats.profile_b.name}</span> mogs{" "}
                  {stats.profile_a.name}
                </p>
              ) : (
                <p className="text-sm" style={{ color: "#ccc" }}>
                  The community is{" "}
                  <span className="font-bold" style={{ color: "var(--text-secondary)" }}>perfectly split</span> on this one!
                </p>
              )}
            </div>
          )}

          {/* ELO comparison */}
          <div className="rounded-2xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "var(--text-muted)" }}>
              Global ELO
            </p>
            <div className="flex items-center gap-4">
              <div className="flex-1 text-center">
                <p className="font-black text-2xl" style={{ color: "var(--gold)" }}>{stats.a_elo}</p>
                <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{stats.profile_a.name}</p>
              </div>
              <div className="font-bold" style={{ color: "var(--text-faint)" }}>vs</div>
              <div className="flex-1 text-center">
                <p className="font-black text-2xl" style={{ color: "var(--gold)" }}>{stats.b_elo}</p>
                <p className="text-xs truncate" style={{ color: "var(--text-muted)" }}>{stats.profile_b.name}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
