"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { getMyVoteHistory, getMyProfile, getMyGlobalRank, type VoteHistoryRow, type ArenaProfile } from "@/lib/arenas";
import Link from "next/link";

type Tab = "profile" | "history";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=27272a&color=888&size=48`}
      alt={name}
      className="w-9 h-9 rounded-full object-cover border border-zinc-700 shrink-0"
      onError={(e) => {
        (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=27272a&color=888&size=48`;
      }}
    />
  );
}

function CategoryBadges({ profile }: { profile: { category: string | null; categories?: string[] } }) {
  const cats = profile.categories?.length
    ? profile.categories
    : profile.category
    ? [profile.category]
    : [];
  if (cats.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-0.5">
      {cats.map((c) => (
        <span
          key={c}
          className="text-xs bg-zinc-800 border border-zinc-700 text-zinc-400 px-2 py-0.5 rounded-full capitalize"
        >
          {c.replace(/_/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase())}
        </span>
      ))}
    </div>
  );
}

export default function ProfilePage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("profile");
  const [isWelcome, setIsWelcome] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setIsWelcome(params.get("welcome") === "1");
    }
  }, []);

  // ── Auth form state ────────────────────────────────────────────────────────
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // ── Arena profile state ────────────────────────────────────────────────────
  const [arenaProfile, setArenaProfile] = useState<ArenaProfile | null | "loading">("loading");
  const [globalRank, setGlobalRank] = useState<number | null>(null);

  // ── History state ──────────────────────────────────────────────────────────
  const [history, setHistory] = useState<VoteHistoryRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historySearch, setHistorySearch] = useState("");
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Load user's arena profile + global rank when logged in
  useEffect(() => {
    if (!user) { setArenaProfile(null); setGlobalRank(null); return; }
    getMyProfile(user.id).then((p) => {
      setArenaProfile(p);
      if (p) getMyGlobalRank(p.id).then(setGlobalRank);
    });
  }, [user]);

  const [googleLoading, setGoogleLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    setAuthError(null);
    const supabase = createClient();
    // Always use the canonical domain so Supabase redirect URL matching works
    // regardless of whether the user is on www. or the apex domain
    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) {
      setAuthError(error.message);
      setGoogleLoading(false);
    }
    // On success the browser redirects — no need to reset loading state
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setAuthError(null);
    const supabase = createClient();
    const redirectTo = `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) setAuthError(error.message);
    else setSent(true);
    setSending(false);
  };

  // Load history when History tab is first opened
  useEffect(() => {
    if (activeTab === "history" && user && !historyLoaded) {
      setHistoryLoading(true);
      getMyVoteHistory(user.id).then((rows) => {
        setHistory(rows);
        setHistoryLoaded(true);
        setHistoryLoading(false);
      });
    }
  }, [activeTab, user, historyLoaded]);

  // Filter history by search
  const filteredHistory = historySearch.trim()
    ? history.filter((row) => {
        const parts = historySearch
          .toLowerCase()
          .split(/\s+vs\s+/)
          .map((s) => s.trim())
          .filter(Boolean);
        const nameA = row.profile_a.name.toLowerCase();
        const nameB = row.profile_b.name.toLowerCase();
        if (parts.length === 2) {
          return (
            (nameA.includes(parts[0]) && nameB.includes(parts[1])) ||
            (nameA.includes(parts[1]) && nameB.includes(parts[0]))
          );
        }
        return nameA.includes(parts[0]) || nameB.includes(parts[0]);
      })
    : history;

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-zinc-400 animate-pulse">Loading...</div>
      </div>
    );
  }

  // ── Logged out ─────────────────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="text-center mb-10">
          <div className="text-5xl mb-4">👤</div>
          <h1 className="text-3xl font-black text-white mb-2">Sign In</h1>
          <p className="text-zinc-400 text-sm">
            Sign in to create arenas, track your voting history, and enter the rankings.
          </p>
        </div>

        {sent ? (
          <div className="text-center bg-zinc-900 border border-zinc-700 rounded-2xl p-8">
            <div className="text-4xl mb-3">📧</div>
            <h2 className="text-white font-bold text-lg mb-2">Check your inbox</h2>
            <p className="text-zinc-400 text-sm">
              We sent a magic link to{" "}
              <span className="text-orange-400 font-semibold">{email}</span>.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(""); }}
              className="mt-6 text-zinc-500 hover:text-zinc-300 text-sm underline transition-colors"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* ── Google sign-in (primary) ── */}
            <button
              onClick={handleGoogleSignIn}
              disabled={googleLoading}
              className="
                w-full flex items-center justify-center gap-3
                bg-white hover:bg-gray-100 disabled:bg-white/50
                text-gray-800 font-bold py-3 rounded-xl
                transition-colors text-sm shadow-sm
              "
            >
              {googleLoading ? (
                <span className="animate-pulse">Connecting…</span>
              ) : (
                <>
                  {/* Google "G" logo */}
                  <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                    <g fill="none" fillRule="evenodd">
                      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                      <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
                      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                    </g>
                  </svg>
                  Continue with Google
                </>
              )}
            </button>

            {/* ── Divider ── */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-zinc-800" />
              <span className="text-zinc-600 text-xs">or use email</span>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>

            {/* ── Magic link (secondary) ── */}
            <form onSubmit={handleMagicLink} className="space-y-3">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500 transition-colors"
              />
              {authError && <p className="text-red-400 text-sm">{authError}</p>}
              <button
                type="submit"
                disabled={sending}
                className="w-full bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800/50 text-white font-bold py-3 rounded-xl transition-colors text-sm border border-zinc-700"
              >
                {sending ? "Sending..." : "Send Magic Link ✉️"}
              </button>
            </form>

            <p className="text-center text-zinc-600 text-xs">
              No password needed — we&apos;ll email you a one-click login link.
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── Logged in ──────────────────────────────────────────────────────────────
  return (
    <div className="max-w-md mx-auto px-4 py-8">
      {/* Welcome banner */}
      {isWelcome && (
        <div className="mb-6 bg-orange-500/10 border border-orange-500/30 rounded-2xl p-4 text-center">
          <div className="text-2xl mb-1">🎉</div>
          <p className="text-orange-300 font-bold text-sm">
            You&apos;re in the arena! Your profile is live — go see how you rank.
          </p>
          <Link href="/leaderboard" className="text-orange-400 underline text-xs mt-1 inline-block">
            View Leaderboard →
          </Link>
        </div>
      )}

      {/* Avatar + email */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 rounded-full bg-orange-500/20 border-2 border-orange-500/40 flex items-center justify-center mx-auto mb-3">
          <span className="text-2xl">👤</span>
        </div>
        <p className="text-zinc-400 text-sm">{user.email}</p>
      </div>

      {/* Tabs */}
      <div className="flex border border-zinc-800 rounded-xl overflow-hidden mb-6">
        {(["profile", "history"] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
              activeTab === tab
                ? "bg-zinc-800 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {tab === "profile" ? "👤 Profile" : "📜 History"}
          </button>
        ))}
      </div>

      {/* ── Profile tab ── */}
      {activeTab === "profile" && (
        <div className="space-y-3">
          {/* Arena profile card */}
          {arenaProfile === "loading" ? (
            <div className="h-24 bg-zinc-900 rounded-2xl animate-pulse" />
          ) : arenaProfile ? (
            /* User IS in the arena */
            <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-4">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    arenaProfile.image_url ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(arenaProfile.name)}&background=27272a&color=888&size=80`
                  }
                  alt={arenaProfile.name}
                  className="w-14 h-14 rounded-xl object-cover border border-zinc-700 shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-black text-base truncate">{arenaProfile.name}</p>
                  <CategoryBadges profile={arenaProfile} />
                  <div className="flex gap-3 mt-1.5">
                    <span className="text-orange-400 font-black text-sm">{arenaProfile.elo_rating} ELO</span>
                    <span className="text-zinc-500 text-xs self-center">
                      {arenaProfile.wins}W – {arenaProfile.losses}L
                    </span>
                  </div>
                  {(arenaProfile.height_in || arenaProfile.weight_lbs || arenaProfile.country) && (
                    <div className="flex gap-2 mt-1 flex-wrap">
                      {arenaProfile.height_in != null && (
                        <span className="text-zinc-500 text-xs">
                          {Math.floor(arenaProfile.height_in / 12)}&apos;{arenaProfile.height_in % 12}&quot;
                        </span>
                      )}
                      {arenaProfile.weight_lbs != null && (
                        <span className="text-zinc-500 text-xs">{arenaProfile.weight_lbs} lbs</span>
                      )}
                      {arenaProfile.country && (
                        <span className="text-zinc-500 text-xs">{arenaProfile.country}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {globalRank !== null && (
                    <p className="text-orange-400 font-black text-sm">
                      {globalRank === 1 ? "👑 #1" : globalRank === 2 ? "🥈 #2" : globalRank === 3 ? "🥉 #3" : `#${globalRank}`}
                    </p>
                  )}
                  <p className="text-zinc-600 text-xs">Global rank</p>
                  <p className="text-zinc-500 text-xs">{arenaProfile.matches} battles</p>
                </div>
              </div>
              <Link
                href={`/leaderboard`}
                className="mt-3 flex items-center justify-center gap-1 text-zinc-500 hover:text-orange-400 text-xs transition-colors"
              >
                View on Leaderboard →
              </Link>
            </div>
          ) : (
            /* User is NOT yet in the arena */
            <Link
              href="/onboarding"
              className="
                block bg-gradient-to-r from-orange-500/20 to-zinc-900
                border border-orange-500/40 hover:border-orange-500
                rounded-2xl p-5 transition-colors group
              "
            >
              <div className="flex items-center gap-4">
                <div className="text-4xl shrink-0">⚔️</div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-black text-base">Enter the Arena</p>
                  <p className="text-zinc-400 text-sm mt-0.5">
                    Upload your photos and join the ELO rankings
                  </p>
                </div>
                <span className="text-orange-500 text-xl group-hover:translate-x-1 transition-transform shrink-0">
                  →
                </span>
              </div>
            </Link>
          )}

          {/* Quick links */}
          <Link
            href="/arenas/new"
            className="flex items-center justify-between w-full bg-zinc-900 border border-zinc-800 hover:border-orange-500/50 rounded-xl px-4 py-3 transition-colors group"
          >
            <span className="text-white font-semibold">➕ Create Arena</span>
            <span className="text-zinc-500 group-hover:text-orange-400 transition-colors">→</span>
          </Link>
          <Link
            href="/swipe"
            className="flex items-center justify-between w-full bg-zinc-900 border border-zinc-800 hover:border-orange-500/50 rounded-xl px-4 py-3 transition-colors group"
          >
            <span className="text-white font-semibold">⚔️ Battle Arenas</span>
            <span className="text-zinc-500 group-hover:text-orange-400 transition-colors">→</span>
          </Link>
          <Link
            href="/admin"
            className="flex items-center justify-between w-full bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-xl px-4 py-3 transition-colors group"
          >
            <span className="text-zinc-400 font-semibold">🔧 Admin Panel</span>
            <span className="text-zinc-600 group-hover:text-zinc-400 transition-colors">→</span>
          </Link>

          <button
            onClick={signOut}
            className="w-full mt-2 text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-600 rounded-xl py-3 text-sm font-semibold transition-colors"
          >
            Sign Out
          </button>
        </div>
      )}

      {/* ── History tab ── */}
      {activeTab === "history" && (
        <div>
          <input
            type="search"
            placeholder="e.g. Ronaldo  or  Ronaldo vs Messi"
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-2.5 text-white placeholder:text-zinc-600 focus:outline-none focus:border-orange-500 transition-colors text-sm mb-4"
          />

          {historyLoading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-14 bg-zinc-900 rounded-xl animate-pulse" />
              ))}
            </div>
          ) : filteredHistory.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-3xl mb-3">📭</div>
              <p className="text-zinc-400">
                {historySearch
                  ? "No matches found for that search"
                  : "You haven't voted yet. Go battle!"}
              </p>
              {!historySearch && (
                <Link
                  href="/swipe"
                  className="inline-block mt-4 text-orange-400 text-sm underline"
                >
                  Start battling →
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-zinc-600 text-xs mb-2">
                {filteredHistory.length} vote{filteredHistory.length !== 1 ? "s" : ""}
                {historySearch && " found"}
              </p>
              {filteredHistory.map((row) => {
                const aWon = row.winner_id === row.profile_a.id;
                return (
                  <div
                    key={row.id}
                    className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2.5"
                  >
                    <Avatar url={row.profile_a.image_url} name={row.profile_a.name} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-sm font-bold truncate ${aWon ? "text-white" : "text-zinc-500"}`}>
                          {row.profile_a.name}
                        </span>
                        <span className={`text-xs font-black ${aWon ? "text-orange-400" : "text-zinc-600"}`}>
                          {aWon ? "👑 WON" : "lost"}
                        </span>
                        <span className="text-zinc-600 text-xs">vs</span>
                        <span className={`text-sm font-bold truncate ${!aWon ? "text-white" : "text-zinc-500"}`}>
                          {row.profile_b.name}
                        </span>
                        {!aWon && <span className="text-orange-400 text-xs font-black">👑 WON</span>}
                      </div>
                      <p className="text-zinc-600 text-xs mt-0.5">
                        {row.arena.name} · {timeAgo(row.voted_at)}
                      </p>
                    </div>
                    <Avatar url={row.profile_b.image_url} name={row.profile_b.name} />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
