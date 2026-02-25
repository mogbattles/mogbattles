"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/explore",     label: "Explore", icon: "🧭",  activeIcon: "🧭"  },
  { href: "/swipe",       label: "Battle",  icon: "⚔️",  activeIcon: "⚔️"  },
  { href: "/leaderboard", label: "Ranks",   icon: "🏆",  activeIcon: "🏆"  },
  { href: "/live",        label: "Live",    icon: "🔴",  activeIcon: "🔴"  },
  { href: "/profile",     label: "Me",      icon: "👤",  activeIcon: "👤"  },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-50"
      style={{
        background: "linear-gradient(0deg, rgba(7,9,15,0.99) 0%, rgba(11,14,25,0.97) 80%, transparent 100%)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderTop: "1px solid #1B2338",
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
            // Treat "/" as /explore since it redirects there
            (tab.href === "/explore" && pathname === "/");

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 relative select-none"
              style={{ WebkitTapHighlightColor: "transparent" }}
            >
              {/* Gold indicator bar at top */}
              <span
                className="absolute top-0 left-1/2 rounded-b-full transition-all duration-300"
                style={{
                  width:      isActive ? "36px" : "0px",
                  height:     "3px",
                  background: "#F0C040",
                  boxShadow:  isActive ? "0 0 10px rgba(240,192,64,0.9), 0 0 20px rgba(240,192,64,0.4)" : "none",
                  transform:  "translateX(-50%)",
                  opacity:    isActive ? 1 : 0,
                  transition: "width 0.25s ease, opacity 0.2s ease, box-shadow 0.25s ease",
                }}
              />

              {/* Icon */}
              <span
                className="leading-none transition-all duration-200"
                style={{
                  fontSize:   isActive ? "22px" : "20px",
                  transform:  isActive ? "scale(1.18)" : "scale(1)",
                  filter:     isActive
                    ? "drop-shadow(0 0 5px rgba(240,192,64,0.7))"
                    : "grayscale(0.3) brightness(0.6)",
                  transition: "all 0.2s ease",
                }}
              >
                {tab.icon}
              </span>

              {/* Label */}
              <span
                className="text-[9px] font-black tracking-widest uppercase transition-colors duration-200"
                style={{ color: isActive ? "#F0C040" : "#3D5070" }}
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
