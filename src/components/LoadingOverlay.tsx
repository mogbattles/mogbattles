"use client";

import { useLoading } from "@/context/LoadingContext";

// ─── Circular progress ring (SVG) ───────────────────────────────────────────

function CircularProgress({ value }: { value: number }) {
  const size = 80;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* Track */}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="absolute inset-0"
        style={{ transform: "rotate(-90deg)" }}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={strokeWidth}
          opacity={0.4}
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
          style={{
            transition: "stroke-dashoffset 0.3s ease-out",
          }}
        />
      </svg>

      {/* Percentage in center */}
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="font-black text-sm tabular-nums"
          style={{ color: "var(--text-primary)" }}
        >
          {Math.round(value)}%
        </span>
      </div>
    </div>
  );
}

// ─── Full-screen overlay ─────────────────────────────────────────────────────

export default function LoadingOverlay() {
  const { progress, isLoading } = useLoading();

  if (!isLoading) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      style={{
        background: "var(--bg-primary)",
        opacity: 0.97,
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        animation: "fadeIn 0.2s ease-out",
      }}
    >
      {/* Logo stack: cat GIF + "Mogbattles" text — matches navbar exactly */}
      <div className="flex flex-col items-center gap-3 mb-8">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://media.tenor.com/ONQPr0qrCXMAAAAM/wow.gif"
          alt=""
          style={{
            width: "56px",
            height: "56px",
            borderRadius: "12px",
          }}
        />
        <span
          style={{
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            fontSize: "28px",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
            lineHeight: "1",
          }}
        >
          Mogbattles
        </span>
      </div>

      {/* Circular progress */}
      <CircularProgress value={progress} />
    </div>
  );
}
