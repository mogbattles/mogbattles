"use client";

import { useLoading } from "@/context/LoadingContext";

// ─── Circular progress ring (SVG) — no text, just the ring ──────────────────

function CircularProgress({ value }: { value: number }) {
  const size = 20;
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ transform: "rotate(-90deg)" }}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--border)"
        strokeWidth={strokeWidth}
        opacity={0.3}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--text-primary)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 0.25s ease-out" }}
      />
    </svg>
  );
}

// ─── Full-screen overlay ─────────────────────────────────────────────────────

export default function LoadingOverlay() {
  const { progress, isLoading } = useLoading();

  if (!isLoading) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3"
      style={{
        background: "var(--bg-primary)",
        animation: "fadeIn 0.15s ease-out",
      }}
    >
      {/* Logo — exactly like navbar: cat GIF + "Mogbattles" + Beta tag */}
      <div className="flex items-center gap-2">
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
      </div>

      {/* Small circular progress — just the ring, no text */}
      <CircularProgress value={progress} />
    </div>
  );
}
