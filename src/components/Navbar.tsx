"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { getTotalUnreadCount } from "@/lib/messaging";
import { createClient } from "@/lib/supabase";
import NavIcon from "./NavIcon";

const NAV_LINKS = [
  { href: "/explore",     label: "Explore",      icon: "explore" },
  { href: "/swipe",       label: "Swipe",         icon: "swipe" },
  { href: "/live",        label: "Live",           icon: "live" },
  { href: "/leaderboard", label: "Leaderboards",  icon: "leaderboard" },
  { href: "/messages",    label: "Messages",      icon: "messages" },
  { href: "/profile",     label: "Profile",       icon: "profile" },
];

const MENU_ITEMS = [
  { href: "/news",     label: "News",            icon: "news", desc: "Latest MogBattles updates" },
  { href: "/articles", label: "Articles",        icon: "article", desc: "In-depth pieces by mods & admins" },
  { href: "/forum",    label: "Forum",           icon: "forum", desc: "Community boards" },
  { href: "/about",    label: "About MogBattles",icon: "info", desc: "What is this place?" },
];

export default function Navbar() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
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
        background: "var(--nav-bg)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderBottom: "1px solid var(--nav-border)",
      }}
    >
      {/* Logo — gif + clean typography */}
      <Link href="/explore" className="flex items-center gap-2 shrink-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://media.tenor.com/ONQPr0qrCXMAAAAM/wow.gif"
          alt=""
          style={{ width: "28px", height: "28px", borderRadius: "6px" }}
        />
        <span
          style={{
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            fontSize: "24px",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
            lineHeight: "1",
          }}
        >
          Mogbattles
        </span>
        <span
          style={{
            fontSize: "9px",
            fontWeight: 800,
            letterSpacing: "0.1em",
            color: "var(--text-muted)",
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            borderRadius: "6px",
            padding: "2px 6px",
            textTransform: "uppercase",
            lineHeight: "1",
            marginTop: "2px",
          }}
        >
          Beta
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
                color: isActive ? "var(--text-primary)" : "var(--text-muted)",
                background: isActive ? "var(--bg-elevated)" : "transparent",
                border: isActive ? "1px solid var(--border)" : "1px solid transparent",
              }}
            >
              <NavIcon name={link.icon} size={16} />
              <span>{link.label}</span>
              {showBadge && (
                <span
                  className="absolute -top-1 -right-1 text-[9px] font-black rounded-full flex items-center justify-center"
                  style={{
                    background: "var(--danger)",
                    color: "#fff",
                    minWidth: "16px",
                    height: "16px",
                    padding: "0 3px",
                    boxShadow: "0 0 8px rgba(231,76,60,0.5)",
                  }}
                >
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Right side: theme toggle + community menu */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Theme toggle — moon outline (light) / filled moon (dark) */}
        <button
          onClick={toggleTheme}
          className="flex items-center justify-center rounded-full transition-all duration-200"
          style={{
            width: "36px",
            height: "36px",
            background: "transparent",
            border: "1px solid var(--border)",
            color: "var(--text-secondary)",
          }}
          title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill={theme === "dark" ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transition: "all 0.3s ease" }}
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        </button>

        {/* More menu */}
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold transition-all duration-150"
            style={{
              color: menuOpen ? "var(--text-primary)" : "var(--text-muted)",
              background: menuOpen ? "var(--bg-elevated)" : "transparent",
              border: menuOpen ? "1px solid var(--border)" : "1px solid transparent",
            }}
          >
            <NavIcon name="menu" size={16} />
            <span className="hidden sm:inline text-xs">More</span>
          </button>

          {/* Dropdown */}
          {menuOpen && (
            <div
              className="absolute right-0 top-full mt-2 w-60 rounded-2xl overflow-hidden z-50"
              style={{
                background: "var(--nav-bg)",
                border: "1px solid var(--border)",
                boxShadow: "0 20px 50px rgba(0,0,0,0.5), 0 0 30px rgba(0,0,0,0.1)",
                backdropFilter: "blur(24px)",
                animation: "scaleIn 0.15s ease-out",
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
                        background: isActive ? "var(--bg-elevated)" : "transparent",
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) (e.currentTarget as HTMLElement).style.background = "var(--bg-elevated)";
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}
                    >
                      <NavIcon name={item.icon} size={18} className="mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p
                          className="text-sm font-bold leading-tight"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {item.label}
                        </p>
                        <p className="text-[10px] leading-tight mt-0.5" style={{ color: "var(--text-muted)" }}>
                          {item.desc}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* Footer hint */}
              <div
                className="px-4 py-2 text-[9px] font-bold uppercase tracking-widest"
                style={{ borderTop: "1px solid var(--border)", color: "var(--text-faint)" }}
              >
                ELO-rated battles
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
