"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { countryFlagByName } from "@/lib/countries";
import gsap from "gsap";

interface ProfileCardProps {
  name: string;
  imageUrl: string | null;
  imageUrls?: string[];
  eloRating: number;
  wins: number;
  losses: number;
  country?: string | null;
  heightIn?: number | null;
  weightLbs?: number | null;
  onClick: () => void;
  side: "left" | "right";
}

function fmtHeight(totalIn: number): string {
  const ft = Math.floor(totalIn / 12);
  const ins = totalIn % 12;
  return `${ft}'${ins}"`;
}

function fallback(name: string) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=0F0F1A&color=8888AA&size=400&bold=true`;
}

export default function ProfileCard({
  name,
  imageUrl,
  imageUrls = [],
  eloRating,
  wins,
  losses,
  country,
  heightIn,
  weightLbs,
  onClick,
}: ProfileCardProps) {
  const flag = countryFlagByName(country);

  const images =
    imageUrls.filter(Boolean).length > 0
      ? imageUrls.filter(Boolean)
      : imageUrl
      ? [imageUrl]
      : [];

  const [currentIdx, setCurrentIdx] = useState(0);
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const hasMultiple = images.length > 1;
  const currentImage = images[currentIdx] ?? null;

  const cardRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartX = useRef<number | null>(null);

  // GSAP hover lift effect
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    if (hovered && !pressed) {
      gsap.to(el, {
        y: -4, scale: 1.03, duration: 0.25, ease: "power2.out",
        boxShadow: "0 12px 0 var(--bg-primary), 0 0 32px rgba(0,0,0,0.4), 0 0 60px rgba(0,0,0,0.15)",
        borderColor: "var(--border-hover)",
      });
    } else if (pressed) {
      gsap.to(el, {
        y: 3, scale: 0.97, duration: 0.1, ease: "power2.in",
        boxShadow: "0 2px 0 var(--bg-primary), 0 2px 8px rgba(0,0,0,0.6)",
        borderColor: "var(--border-hover)",
      });
    } else {
      gsap.to(el, {
        y: 0, scale: 1, duration: 0.3, ease: "power2.out",
        boxShadow: "0 6px 0 var(--bg-primary), 0 4px 20px rgba(0,0,0,0.5)",
        borderColor: "var(--border)",
      });
    }
  }, [hovered, pressed]);

  const resetTimer = useCallback(() => {
    if (!hasMultiple) return;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCurrentIdx((prev) => (prev + 1) % images.length);
    }, 3500);
  }, [hasMultiple, images.length]);

  useEffect(() => {
    resetTimer();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [resetTimer]);

  function jumpTo(idx: number, e: React.MouseEvent) {
    e.stopPropagation();
    setCurrentIdx(idx);
    resetTimer();
  }

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || !hasMultiple) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(delta) > 40) {
      e.preventDefault();
      const newIdx =
        delta < 0
          ? (currentIdx + 1) % images.length
          : (currentIdx - 1 + images.length) % images.length;
      setCurrentIdx(newIdx);
      resetTimer();
    }
  }

  const winRate =
    wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : null;

  const cardStyle = {
    maxWidth: "240px",
    borderRadius: "20px",
    overflow: "hidden" as const,
    border: "2px solid var(--border)",
    boxShadow: "0 6px 0 var(--bg-primary), 0 4px 20px rgba(0,0,0,0.5)",
    background: "var(--bg-card)",
    cursor: "pointer",
    userSelect: "none" as const,
  };

  return (
    <div
      ref={cardRef}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setPressed(false); }}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onTouchStart={(e) => { setPressed(true); handleTouchStart(e); }}
      onTouchEnd={(e) => { setPressed(false); handleTouchEnd(e); }}
      className="group relative flex-1"
      style={cardStyle}
    >
      {/* Photo area */}
      <div
        className="aspect-[3/4] relative select-none"
        style={{ background: "var(--bg-primary)" }}
      >
        {/* Hidden preload */}
        {images.map((url, i) =>
          i !== currentIdx && url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt=""
              aria-hidden
              decoding="async"
              className="absolute w-0 h-0 opacity-0 pointer-events-none"
            />
          ) : null
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={currentImage ?? fallback(name)}
          alt={name}
          className="w-full h-full object-cover"
          decoding="async"
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          {...({ fetchPriority: "high" } as any)}
          onError={(e) => {
            const img = e.target as HTMLImageElement;
            img.onerror = null;
            img.src = fallback(name);
          }}
          draggable={false}
        />

        {/* Bottom gradient */}
        <div
          className="absolute bottom-0 left-0 right-0 pointer-events-none"
          style={{
            height: "50%",
            background:
              "linear-gradient(to top, rgba(0,0,0,0.97) 0%, rgba(0,0,0,0.6) 55%, transparent 100%)",
          }}
        />

        {/* ELO badge */}
        <div
          className="absolute top-2 right-2 z-20 flex items-center gap-1 px-2 py-0.5 rounded-lg"
          style={{
            background: "rgba(0,0,0,0.85)",
            border: `1px solid ${hovered ? "rgba(240,192,64,0.5)" : "rgba(240,192,64,0.15)"}`,
            backdropFilter: "blur(4px)",
          }}
        >
          <span
            className="text-xs font-black leading-none"
            style={{ color: "var(--gold)" }}
          >
            {eloRating}
          </span>
        </div>

        {/* Left / right photo navigation arrows */}
        {hasMultiple && (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIdx((prev) => (prev - 1 + images.length) % images.length);
                resetTimer();
              }}
              className="absolute left-1.5 top-1/2 -translate-y-1/2 z-20 w-7 h-7 flex items-center justify-center rounded-full"
              style={{
                background: "rgba(0,0,0,0.72)",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "rgba(255,255,255,0.9)",
                fontSize: "17px",
                lineHeight: 1,
                backdropFilter: "blur(6px)",
              }}
            >
              ‹
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setCurrentIdx((prev) => (prev + 1) % images.length);
                resetTimer();
              }}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 z-20 w-7 h-7 flex items-center justify-center rounded-full"
              style={{
                background: "rgba(0,0,0,0.72)",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "rgba(255,255,255,0.9)",
                fontSize: "17px",
                lineHeight: 1,
                backdropFilter: "blur(6px)",
              }}
            >
              ›
            </button>
          </>
        )}

        {/* Photo indicators */}
        {hasMultiple && (
          <div className="absolute bottom-[46px] left-0 right-0 flex justify-center gap-1.5 z-20">
            {images.map((_, i) => (
              <button
                key={i}
                onClick={(e) => jumpTo(i, e)}
                className="pointer-events-none sm:pointer-events-auto"
                style={{
                  height: "4px",
                  width: i === currentIdx ? "20px" : "6px",
                  borderRadius: "2px",
                  background:
                    i === currentIdx
                      ? "#fff"
                      : "rgba(255,255,255,0.3)",
                  boxShadow:
                    i === currentIdx
                      ? "0 0 6px rgba(255,255,255,0.5)"
                      : "none",
                  transition: "width 0.25s ease, background 0.25s ease",
                }}
              />
            ))}
          </div>
        )}

        {/* MOGS badge — appears on hover */}
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
          style={{
            opacity: hovered ? 1 : 0,
            transform: `translateX(-50%) scale(${hovered ? 1 : 0.7})`,
            transition: "all 0.2s ease",
          }}
        >
          <span
            className="text-[11px] font-black px-3 py-1.5 rounded-full uppercase tracking-widest whitespace-nowrap"
            style={{
              background: "linear-gradient(160deg, #FFD700, #F0C040)",
              color: "#1A1000",
              boxShadow: "0 0 16px rgba(240,192,64,0.7), 0 2px 6px rgba(0,0,0,0.4)",
            }}
          >
            MOGS
          </span>
        </div>
      </div>

      {/* Info footer */}
      <div
        className="px-3 pb-3 pt-1.5 text-left"
        style={{
          background: "var(--bg-card)",
        }}
      >
        {/* Name + flag */}
        <div className="flex items-center gap-1.5 min-w-0">
          <h3
            className="font-black truncate leading-tight flex-1"
            style={{ fontSize: "13px", color: "var(--text-primary)" }}
          >
            {name}
          </h3>
          {flag && (
            <span className="text-sm shrink-0 leading-none">{flag}</span>
          )}
        </div>

        {/* Height / weight */}
        {(heightIn || weightLbs) && (
          <div className="flex items-center gap-1.5 mt-0.5">
            {heightIn && (
              <span style={{ color: "var(--text-muted)", fontSize: "10px", fontWeight: 700 }}>
                {fmtHeight(heightIn)}
              </span>
            )}
            {heightIn && weightLbs && (
              <span style={{ color: "var(--text-faint)", fontSize: "10px" }}>·</span>
            )}
            {weightLbs && (
              <span style={{ color: "var(--text-muted)", fontSize: "10px", fontWeight: 700 }}>
                {weightLbs} lbs
              </span>
            )}
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center justify-between mt-0.5">
          <p style={{ color: "var(--text-muted)", fontSize: "11px", fontWeight: 700 }}>
            {wins}W–{losses}L
            {winRate !== null && (
              <span style={{ color: "var(--text-faint)" }}> · {winRate}%</span>
            )}
          </p>
          <span
            style={{
              color: "var(--text-faint)",
              fontSize: "10px",
              fontWeight: 900,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            tap ⚔
          </span>
        </div>
      </div>
    </div>
  );
}
