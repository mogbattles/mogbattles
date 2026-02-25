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
  // Hydration-safe: localStorage only read on client, after mount
  const [recentSlugs, setRecentSlugs] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  // Fetch arenas once
  useEffect(() => {
    getPublicArenas().then(setArenas);
  }, []);

  // Read recently-viewed from localStorage after mount (client only)
  useEffect(() => {
    setRecentSlugs(getRecentlyViewed());
  }, []);

  // Refresh recently-viewed whenever the dropdown opens
  useEffect(() => {
    if (open) setRecentSlugs(getRecentlyViewed());
  }, [open]);

  // Close on outside click
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

  // Sort arenas: recently viewed first, then the rest
  const sorted = [...arenas].sort((a, b) => {
    const ai = recentSlugs.indexOf(a.slug);
    const bi = recentSlugs.indexOf(b.slug);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  // Apply filter
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
        className="
          flex items-center gap-2 bg-zinc-900 border border-zinc-700
          hover:border-orange-500/60 rounded-xl px-4 py-2.5
          text-white font-bold text-sm transition-colors w-full
        "
      >
        <span>{displayIcon}</span>
        <span className="flex-1 text-left">{displayName}</span>
        <span className={`text-zinc-500 text-xs transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="
          absolute top-full left-4 right-4 mt-1 z-50
          bg-zinc-900 border border-zinc-700 rounded-2xl
          shadow-2xl shadow-black/60 overflow-hidden
        ">
          {/* Filter chips */}
          <div className="flex gap-2 p-3 pb-2 border-b border-zinc-800">
            {(["all", "official", "open", "request"] as FilterMode[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`text-xs font-bold px-2.5 py-1 rounded-full border transition-colors ${
                  filter === f
                    ? "bg-orange-500 border-orange-500 text-white"
                    : "bg-zinc-800 border-zinc-700 text-zinc-400 hover:border-zinc-500"
                }`}
              >
                {f === "all" ? "All" : f === "official" ? "Official" : f === "open" ? "Open" : "Invite Only"}
              </button>
            ))}
          </div>

          {/* Arena list */}
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-6">No arenas match this filter</p>
            ) : (
              filtered.map((arena) => {
                const isActive = arena.slug === currentSlug;
                const isRecent = recentSlugs.includes(arena.slug);
                return (
                  <button
                    key={arena.id}
                    onClick={() => navigate(arena.slug)}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3 text-left
                      hover:bg-zinc-800 transition-colors
                      ${isActive ? "bg-orange-500/10" : ""}
                    `}
                  >
                    <span className="text-xl shrink-0">{ARENA_EMOJIS[arena.slug] ?? "⚔️"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold text-sm ${isActive ? "text-orange-400" : "text-white"}`}>
                          {arena.name}
                        </span>
                        {isActive && <span className="text-[10px] text-orange-400 font-bold">● NOW</span>}
                        {!isActive && isRecent && (
                          <span className="text-[10px] text-zinc-600 font-bold">RECENT</span>
                        )}
                      </div>
                      <p className="text-zinc-600 text-xs">
                        {arena.player_count} players
                        {!arena.is_official && ` · ${arena.arena_type}`}
                      </p>
                    </div>
                    {isActive && <span className="text-orange-500 text-sm">✓</span>}
                  </button>
                );
              })
            )}
          </div>

          {/* Explore link */}
          <div className="border-t border-zinc-800 p-2">
            <button
              onClick={() => { setOpen(false); router.push("/explore"); }}
              className="w-full text-center text-zinc-500 hover:text-zinc-300 text-xs py-2 transition-colors"
            >
              🌐 Browse all arenas &amp; create your own →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
