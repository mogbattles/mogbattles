"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import {
  getArenaBySlug,
  getProfilesForArena,
  addMemberToArena,
  removeMemberFromArena,
  searchProfiles,
  type ArenaProfile,
} from "@/lib/arenas";
import type { ArenaRow } from "@/lib/supabase";
import Link from "next/link";

export default function ManageArenaPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const { user, loading: authLoading } = useAuth();

  const [arena, setArena] = useState<ArenaRow | null>(null);
  const [members, setMembers] = useState<ArenaProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; image_url: string | null; category: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      router.push("/profile");
      return;
    }

    async function load() {
      const arenaData = await getArenaBySlug(slug);
      if (!arenaData) {
        router.push("/swipe");
        return;
      }
      if (arenaData.creator_id !== user!.id) {
        setMessage("You are not the owner of this arena.");
        setLoading(false);
        return;
      }
      setArena(arenaData);
      const profileData = await getProfilesForArena(arenaData);
      setMembers(profileData);
      setLoading(false);
    }

    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, user, authLoading]);

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const results = await searchProfiles(q);
    // Filter out already-members
    const memberIds = new Set(members.map((m) => m.id));
    setSearchResults(results.filter((r) => !memberIds.has(r.id)));
    setSearching(false);
  };

  const handleAdd = async (profileId: string, profileName: string) => {
    if (!arena || !user) return;
    setMessage(null);
    const { error } = await addMemberToArena(arena.id, profileId, user.id);
    if (error) {
      setMessage(`❌ ${error}`);
    } else {
      setMessage(`✅ ${profileName} added to arena.`);
      setSearchQuery("");
      setSearchResults([]);
      // Reload members
      const updated = await getProfilesForArena(arena);
      setMembers(updated);
    }
  };

  const handleRemove = async (profileId: string, profileName: string) => {
    if (!arena) return;
    setMessage(null);
    const { error } = await removeMemberFromArena(arena.id, profileId);
    if (error) {
      setMessage(`❌ ${error}`);
    } else {
      setMessage(`✅ ${profileName} removed.`);
      setMembers((prev) => prev.filter((m) => m.id !== profileId));
    }
  };

  const handleCopyInviteLink = () => {
    if (!arena) return;
    const link = `${window.location.origin}/join/${arena.invite_token}`;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div
          className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
          style={{ borderColor: "#8B5CF6", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  if (message && !arena) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] px-4 text-center gap-4">
        <p className="font-bold" style={{ color: "#EF4444" }}>{message}</p>
        <Link href="/swipe" className="text-sm underline" style={{ color: "#4A4A66" }}>
          ← Go back
        </Link>
      </div>
    );
  }

  if (!arena) return null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-6">
        <Link href={`/swipe/${arena.slug}`} className="text-xs" style={{ color: "#4A4A66" }}>
          ← View arena
        </Link>
        <h1 className="text-2xl font-black text-white mt-2">
          Manage: {arena.name}
        </h1>
        <p className="text-sm mt-1" style={{ color: "#4A4A66" }}>
          {members.length} members ·{" "}
          <span className="capitalize">{arena.visibility}</span> ·{" "}
          <span className="capitalize">{arena.arena_type}</span>
        </p>
      </div>

      {/* Feedback message */}
      {message && (
        <div className="mb-4 rounded-xl px-4 py-3 text-sm" style={{ background: "#141420", border: "1px solid #222233", color: "#ccc" }}>
          {message}
        </div>
      )}

      {/* Invite link (for private arenas) */}
      {arena.visibility === "private" && (
        <div className="mb-6 rounded-xl p-4" style={{ background: "#0F0F1A", border: "1px solid #222233" }}>
          <h3 className="text-white font-bold text-sm mb-2">🔒 Invite Link</h3>
          <div className="flex gap-2">
            <code className="flex-1 text-xs rounded-lg px-3 py-2 truncate" style={{ background: "#141420", color: "#4A4A66" }}>
              {typeof window !== "undefined"
                ? `${window.location.origin}/join/${arena.invite_token}`
                : `…/join/${arena.invite_token}`}
            </code>
            <button
              onClick={handleCopyInviteLink}
              className="text-xs font-bold px-3 py-2 rounded-lg transition-colors shrink-0"
              style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", color: "#A78BFA" }}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {/* Add member search */}
      <div className="mb-6">
        <h3 className="text-white font-bold text-sm mb-3">Add a profile</h3>
        <div className="relative">
          <input
            type="text"
            placeholder="Search by name…"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full rounded-xl px-4 py-3 text-white text-sm focus:outline-none transition-colors"
            style={{ background: "#0F0F1A", border: "1px solid #222233", caretColor: "#8B5CF6" }}
            onFocus={(e) => { (e.target as HTMLElement).style.borderColor = "rgba(139,92,246,0.5)"; }}
            onBlur={(e) => { (e.target as HTMLElement).style.borderColor = "#222233"; }}
          />
          {searching && (
            <span className="absolute right-3 top-3 text-xs" style={{ color: "#4A4A66" }}>
              Searching…
            </span>
          )}
        </div>

        {searchResults.length > 0 && (
          <div className="mt-2 rounded-xl overflow-hidden" style={{ background: "#0F0F1A", border: "1px solid #222233" }}>
            {searchResults.map((r) => (
              <button
                key={r.id}
                onClick={() => handleAdd(r.id, r.name)}
                className="w-full flex items-center gap-3 px-4 py-2.5 transition-colors text-left"
                style={{ borderBottom: "1px solid #141420" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#141420"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    r.image_url ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(r.name)}&background=0F0F1A&color=555&size=64`
                  }
                  alt={r.name}
                  className="w-8 h-8 rounded-full object-cover shrink-0"
                  style={{ border: "1px solid #222233" }}
                />
                <div>
                  <p className="text-white text-sm font-semibold">{r.name}</p>
                  {r.category && (
                    <p className="text-xs capitalize" style={{ color: "#4A4A66" }}>
                      {r.category.replace("_", " ")}
                    </p>
                  )}
                </div>
                <span className="ml-auto text-xs font-bold" style={{ color: "#A78BFA" }}>Add +</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Members list */}
      <div>
        <h3 className="text-white font-bold text-sm mb-3">
          Members ({members.length})
        </h3>
        {members.length === 0 ? (
          <p className="text-sm" style={{ color: "#2A2A3D" }}>
            No members yet. Search above to add profiles.
          </p>
        ) : (
          <div className="space-y-2">
            {members.map((m) => (
              <div
                key={m.id}
                className="flex items-center gap-3 rounded-xl px-4 py-3"
                style={{ background: "#0F0F1A", border: "1px solid #222233" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    m.image_url ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(m.name)}&background=0F0F1A&color=555&size=80`
                  }
                  alt={m.name}
                  className="w-10 h-10 rounded-full object-cover shrink-0"
                  style={{ border: "1px solid #222233" }}
                />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold text-sm truncate">
                    {m.name}
                  </p>
                  <p className="text-xs" style={{ color: "#4A4A66" }}>
                    {m.elo_rating} ELO · {m.wins}W {m.losses}L
                  </p>
                </div>
                <button
                  onClick={() => handleRemove(m.id, m.name)}
                  className="text-xs font-bold transition-colors shrink-0"
                  style={{ color: "#4A4A66" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#EF4444"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#4A4A66"; }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Battle this arena link */}
      <div className="mt-8 pt-6" style={{ borderTop: "1px solid #222233" }}>
        <Link
          href={`/swipe/${arena.slug}`}
          className="btn-purple gold-pulse-btn block text-center font-black py-3 rounded-xl"
        >
          ⚔️ Battle this arena →
        </Link>
      </div>
    </div>
  );
}
