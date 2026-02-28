"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { getPublicArenas, type ArenaWithCount } from "@/lib/arenas";
import { ARENA_EMOJIS } from "./ArenaCard";

const RECENTLY_VIEWED_KEY = "mogbattles_recent_arenas";
const MAX_RECENT = 5;

export function trackArenaView(slug: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(RECENTLY_VIEWED_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    const updated = [slug, ...list.filter((s) => s !== slug)].slice(0, MAX_RECENT);
    localStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(updated));
  } catch {}
}

function getRecentlyViewed(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(RECENTLY_VIEWED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

type FilterMode = "all" | "official" | "open" | "request";

interface ArenaDropdownProps {
  currentSlug: string;
}

export default function ArenaDropdown({ currentSlug }: ArenaDropdownProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [arenas, setArenas] = useState<ArenaWithCount[]>([]);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [recentSlugs, setRecentSlugs] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getPublicArenas().then(setArenas);
  }, []);

  useEffect(() => {
    setRecentSlugs(getRecentlyViewed());
  }, []);

  useEffect(() => {
    if (open) setRecentSlugs(getRecentlyViewed());
  }, [open]);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const currentArena = arenas.find((a) => a.slug === currentSlug);

  const sorted = [...arenas].sort((a, b) => {
    const ai = recentSlugs.indexOf(a.slug);
    const bi = recentSlugs.indexOf(b.slug);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  const filtered = sorted.filter((a) => {
    if (filter === "official") return a.is_official;
    if (filter === "open") return a.arena_type === "open";
    if (filter === "request") return a.arena_type === "request";
    return true;
  });

  function navigate(slug: string) {
    trackArenaView(slug);
    setOpen(false);
    router.push(`/swipe/${slug}`);
  }

  const displayName = currentArena?.name ?? currentSlug;
  const displayIcon = ARENA_EMOJIS[currentSlug] ?? "⚔️";

  return (
    <div ref={ref} className="relative px-4 pt-3 pb-1">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-white font-bold text-sm transition-all w-full"
        style={{
          background: "#0F0F1A",
          border: `1px solid ${open ? "rgba(139,92,246,0.4)" : "#222233"}`,
          boxShadow: open ? "0 0 12px rgba(139,92,246,0.1)" : "none",
        }}
      >
        <span>{displayIcon}</span>
        <span className="flex-1 text-left">{displayName}</span>
        <span
          className="text-xs transition-transform duration-200"
          style={{
            color: "#4A4A66",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
          }}
        >
          ▼
        </span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className="absolute top-full left-4 right-4 mt-1 z-50 rounded-2xl overflow-hidden"
          style={{
            background: "#0F0F1A",
            border: "1px solid #222233",
            boxShadow: "0 16px 48px rgba(0,0,0,0.7), 0 0 20px rgba(139,92,246,0.05)",
            animation: "scaleIn 0.15s ease-out both",
          }}
        >
          {/* Filter chips */}
          <div className="flex gap-2 p-3 pb-2" style={{ borderBottom: "1px solid #1A1A28" }}>
            {(["all", "official", "open", "request"] as FilterMode[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className="text-xs font-bold px-2.5 py-1 rounded-full transition-all"
                style={{
                  background: filter === f
                    ? "linear-gradient(135deg, #8B5CF6, #6D28D9)"
                    : "#1A1A28",
                  border: `1px solid ${filter === f ? "#8B5CF6" : "#222233"}`,
                  color: filter === f ? "#fff" : "#4A4A66",
                }}
              >
                {f === "all" ? "All" : f === "official" ? "Official" : f === "open" ? "Open" : "Invite Only"}
              </button>
            ))}
          </div>

          {/* Arena list */}
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: "#4A4A66" }}>No arenas match this filter</p>
            ) : (
              filtered.map((arena) => {
                const isActive = arena.slug === currentSlug;
                const isRecent = recentSlugs.includes(arena.slug);
                return (
                  <button
                    key={arena.id}
                    onClick={() => navigate(arena.slug)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors"
                    style={{
                      background: isActive ? "rgba(139,92,246,0.08)" : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = "#1A1A28";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    <span className="text-xl shrink-0">{ARENA_EMOJIS[arena.slug] ?? "⚔️"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className="font-semibold text-sm"
                          style={{ color: isActive ? "#A78BFA" : "#fff" }}
                        >
                          {arena.name}
                        </span>
                        {isActive && (
                          <span className="text-[10px] font-bold" style={{ color: "#8B5CF6" }}>● NOW</span>
                        )}
                        {!isActive && isRecent && (
                          <span className="text-[10px] font-bold" style={{ color: "#353548" }}>RECENT</span>
                        )}
                      </div>
                      <p className="text-xs" style={{ color: "#353548" }}>
                        {arena.player_count} players
                        {!arena.is_official && ` · ${arena.arena_type}`}
                      </p>
                    </div>
                    {isActive && <span className="text-sm" style={{ color: "#8B5CF6" }}>✓</span>}
                  </button>
                );
              })
            )}
          </div>

          {/* Explore link */}
          <div className="p-2" style={{ borderTop: "1px solid #1A1A28" }}>
            <button
              onClick={() => { setOpen(false); router.push("/explore"); }}
              className="w-full text-center text-xs py-2 transition-colors"
              style={{ color: "#4A4A66" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "#A78BFA"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "#4A4A66"; }}
            >
              Browse all arenas &amp; create your own →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
