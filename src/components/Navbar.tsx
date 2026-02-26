"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { getTotalUnreadCount } from "@/lib/messaging";
import { createClient } from "@/lib/supabase";

const NAV_LINKS = [
  { href: "/explore",     label: "Explore",      icon: "🧭" },
  { href: "/swipe",       label: "Battle",        icon: "⚔️" },
  { href: "/live",        label: "Live",          icon: "🔴" },
  { href: "/leaderboard", label: "Leaderboards",  icon: "🏆" },
  { href: "/messages",    label: "Messages",      icon: "💬" },
  { href: "/profile",     label: "Profile",       icon: "👤" },
];

const MENU_ITEMS = [
  { href: "/news",     label: "News",            icon: "📰", desc: "Latest MogBattles updates" },
  { href: "/articles", label: "Articles",        icon: "📝", desc: "In-depth pieces by mods & admins" },
  { href: "/forum",    label: "Forum",           icon: "💬", desc: "4chan-style community boards" },
  { href: "/about",    label: "About MogBattles",icon: "ℹ️", desc: "What is this place?" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  // Load + poll unread count
  useEffect(() => {
    if (!user) { setUnreadCount(0); return; }
    getTotalUnreadCount(user.id).then(setUnreadCount);

    const supabase = createClient();
    const channel = supabase
      .channel("navbar-unread")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "direct_messages" },
        () => { getTotalUnreadCount(user.id).then(setUnreadCount); }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "direct_messages" },
        () => { getTotalUnreadCount(user.id).then(setUnreadCount); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close on route change
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-40 flex items-center justify-between px-4"
      style={{
        height: "56px",
        background: "linear-gradient(180deg, rgba(7,9,15,0.97) 0%, rgba(12,16,32,0.85) 100%)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        borderBottom: "1px solid #1B2338",
      }}
    >
      {/* Logo */}
      <Link href="/explore" className="flex items-center gap-2 shrink-0">
        <span className="text-xl leading-none" style={{ filter: "drop-shadow(0 0 6px rgba(240,192,64,0.5))" }}>
          ⚔️
        </span>
        <span
          className="text-base font-black tracking-widest uppercase"
          style={{
            background: "linear-gradient(90deg, #FFD700 0%, #F0C040 50%, #FF8040 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          MOGBATTLES
        </span>
      </Link>

      {/* Desktop nav links */}
      <nav className="hidden lg:flex items-center gap-1">
        {NAV_LINKS.map((link) => {
          const isActive =
            pathname === link.href ||
            pathname.startsWith(link.href + "/") ||
            (link.href === "/explore" && pathname === "/");
          const showBadge = link.href === "/messages" && unreadCount > 0 && user;
          return (
            <Link
              key={link.href}
              href={link.href}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold transition-all duration-150"
              style={{
                color: isActive ? "#F0C040" : "#4D6080",
                background: isActive ? "rgba(240,192,64,0.08)" : "transparent",
                border: isActive ? "1px solid rgba(240,192,64,0.15)" : "1px solid transparent",
              }}
            >
              <span className="text-sm leading-none">{link.icon}</span>
              <span>{link.label}</span>
              {showBadge && (
                <span
                  className="absolute -top-1 -right-1 text-[9px] font-black rounded-full flex items-center justify-center"
                  style={{
                    background: "#EF4444",
                    color: "#fff",
                    minWidth: "16px",
                    height: "16px",
                    padding: "0 3px",
                  }}
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Right side: community menu */}
      <div ref={menuRef} className="relative flex items-center shrink-0">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold transition-all duration-150"
          style={{
            color: menuOpen ? "#F0C040" : "#4D6080",
            background: menuOpen ? "rgba(240,192,64,0.08)" : "#141A2C",
            border: menuOpen ? "1px solid rgba(240,192,64,0.2)" : "1px solid #1B2338",
          }}
        >
          <span className="text-sm leading-none">☰</span>
          <span className="hidden sm:inline text-xs">Community</span>
        </button>

        {/* Dropdown */}
        {menuOpen && (
          <div
            className="absolute right-0 top-full mt-2 w-60 rounded-2xl overflow-hidden z-50"
            style={{
              background: "rgba(9,12,22,0.98)",
              border: "1px solid #1B2338",
              boxShadow: "0 20px 50px rgba(0,0,0,0.8)",
              backdropFilter: "blur(20px)",
            }}
          >
            <div className="p-1.5">
              {MENU_ITEMS.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="flex items-start gap-3 px-3 py-2.5 rounded-xl transition-colors"
                    style={{
                      background: isActive ? "rgba(240,192,64,0.08)" : "transparent",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)";
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    <span className="text-lg leading-none mt-0.5">{item.icon}</span>
                    <div className="min-w-0">
                      <p
                        className="text-sm font-bold leading-tight"
                        style={{ color: isActive ? "#F0C040" : "#C8D8E8" }}
                      >
                        {item.label}
                      </p>
                      <p className="text-[10px] leading-tight mt-0.5" style={{ color: "#3D5070" }}>
                        {item.desc}
                      </p>
                    </div>
                  </Link>
                );
              })}
            </div>

            {/* Footer hint */}
            <div
              className="px-4 py-2 border-t text-[9px] font-bold uppercase tracking-widest"
              style={{ borderColor: "#1B2338", color: "#253147" }}
            >
              ELO-rated · Real faces · Open battles
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
