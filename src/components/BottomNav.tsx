"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getTotalUnreadCount } from "@/lib/messaging";
import { createClient } from "@/lib/supabase";

const tabs = [
  { href: "/explore",     label: "Explore",  icon: "🧭" },
  { href: "/swipe",       label: "Battle",   icon: "⚔️" },
  { href: "/leaderboard", label: "Ranks",    icon: "🏆" },
  { href: "/messages",    label: "DMs",      icon: "💬" },
  { href: "/profile",     label: "Me",       icon: "👤" },
];

export default function BottomNav() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) { setUnreadCount(0); return; }
    getTotalUnreadCount(user.id).then(setUnreadCount);

    const supabase = createClient();
    const channel = supabase
      .channel("bottom-nav-unread")
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

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: "var(--nav-bg)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderTop: "1px solid var(--nav-border)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div
        className="max-w-lg mx-auto flex items-stretch"
        style={{ height: "64px" }}
      >
        {tabs.map((tab) => {
          const isActive =
            pathname === tab.href ||
            pathname.startsWith(tab.href + "/") ||
            (tab.href === "/explore" && pathname === "/");

          const showBadge = tab.href === "/messages" && unreadCount > 0 && !!user;

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 relative select-none"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              {/* Accent indicator bar at top */}
              <span
                className="absolute top-0 left-1/2 rounded-b-full transition-all duration-300"
                style={{
                  width:      isActive ? "36px" : "0px",
                  height:     "3px",
                  background: "linear-gradient(90deg, #FD297B, #FF5864)",
                  boxShadow:  isActive ? "0 0 12px var(--accent-glow), 0 0 24px var(--accent-glow)" : "none",
                  transform:  "translateX(-50%)",
                  opacity:    isActive ? 1 : 0,
                  transition: "width 0.25s ease, opacity 0.2s ease, box-shadow 0.25s ease",
                }}
              />

              {/* Icon + unread badge wrapper */}
              <div className="relative">
                <span
                  className="leading-none transition-all duration-200"
                  style={{
                    fontSize:   isActive ? "22px" : "20px",
                    display:    "block",
                    transform:  isActive ? "scale(1.18)" : "scale(1)",
                    filter:     isActive
                      ? "drop-shadow(0 0 6px var(--accent-glow))"
                      : "grayscale(0.4) brightness(0.5)",
                    transition: "all 0.2s ease",
                  }}
                >
                  {tab.icon}
                </span>
                {showBadge && (
                  <span
                    className="absolute -top-1.5 -right-2 text-[8px] font-black rounded-full flex items-center justify-center"
                    style={{
                      background: "var(--danger)",
                      color: "#fff",
                      minWidth: "14px",
                      height: "14px",
                      padding: "0 2px",
                      boxShadow: "0 0 6px rgba(231,76,60,0.5)",
                    }}
                  >
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </div>

              {/* Label */}
              <span
                className="text-[9px] font-black tracking-widest uppercase transition-colors duration-200"
                style={{ color: isActive ? "var(--accent)" : "var(--text-faint)" }}
              >
                {tab.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
