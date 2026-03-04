"use client";

import { useEffect, useState } from "react";
import { getEloHistory, type EloSnapshot } from "@/lib/arenas";
import { getTier, type Gender } from "@/lib/tiers";

// ─── Pure SVG line chart — no external deps ──────────────────────────────────

const CHART_H = 180;
const CHART_W = 600; // viewBox width, scales responsively
const PAD_TOP = 20;
const PAD_BOTTOM = 28;
const PAD_LEFT = 44;
const PAD_RIGHT = 12;

function formatDate(d: string) {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Chart({ data }: { data: EloSnapshot[] }) {
  const [hover, setHover] = useState<number | null>(null);

  if (data.length < 2) {
    return (
      <div className="text-center py-6">
        <p className="text-sm" style={{ color: "var(--text-faint)" }}>
          Not enough data yet — chart appears after 2+ days of battles.
        </p>
      </div>
    );
  }

  const elos = data.map((d) => d.elo_rating);
  const minElo = Math.min(...elos);
  const maxElo = Math.max(...elos);
  const range = maxElo - minElo || 50; // fallback if flat
  const yPad = Math.max(range * 0.15, 10);
  const yMin = minElo - yPad;
  const yMax = maxElo + yPad;

  const plotW = CHART_W - PAD_LEFT - PAD_RIGHT;
  const plotH = CHART_H - PAD_TOP - PAD_BOTTOM;

  const toX = (i: number) => PAD_LEFT + (i / (data.length - 1)) * plotW;
  const toY = (elo: number) => PAD_TOP + plotH - ((elo - yMin) / (yMax - yMin)) * plotH;

  // Build SVG path
  const points = data.map((d, i) => `${toX(i)},${toY(d.elo_rating)}`);
  const linePath = `M ${points.join(" L ")}`;

  // Gradient area path
  const areaPath = `${linePath} L ${toX(data.length - 1)},${PAD_TOP + plotH} L ${toX(0)},${PAD_TOP + plotH} Z`;

  // Y-axis labels (5 evenly spaced)
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const val = Math.round(yMin + ((yMax - yMin) * i) / 4);
    return { val, y: toY(val) };
  });

  // X-axis labels (first, middle, last)
  const xLabels = [
    { i: 0, label: formatDate(data[0].date) },
    { i: Math.floor(data.length / 2), label: formatDate(data[Math.floor(data.length / 2)].date) },
    { i: data.length - 1, label: formatDate(data[data.length - 1].date) },
  ];

  // Net change color
  const netChange = data[data.length - 1].elo_rating - data[0].elo_rating;
  const lineColor = netChange >= 0 ? "#2ECC71" : "#E74C3C";

  const hoverPoint = hover != null ? data[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${CHART_W} ${CHART_H}`}
        className="w-full"
        style={{ height: "auto" }}
        onMouseLeave={() => setHover(null)}
      >
        {/* Grid lines */}
        {yTicks.map(({ val, y }) => (
          <g key={val}>
            <line
              x1={PAD_LEFT} y1={y} x2={CHART_W - PAD_RIGHT} y2={y}
              stroke="var(--border)" strokeWidth="0.5" strokeDasharray="4,4"
            />
            <text
              x={PAD_LEFT - 6} y={y + 3}
              textAnchor="end" fontSize="9" fill="var(--text-faint)" fontWeight="700"
            >
              {val}
            </text>
          </g>
        ))}

        {/* X labels */}
        {xLabels.map(({ i, label }) => (
          <text
            key={i}
            x={toX(i)} y={CHART_H - 4}
            textAnchor="middle" fontSize="8" fill="var(--text-faint)" fontWeight="600"
          >
            {label}
          </text>
        ))}

        {/* Gradient fill */}
        <defs>
          <linearGradient id="eloGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity="0.2" />
            <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#eloGrad)" />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke={lineColor}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Data point dots */}
        {data.map((d, i) => (
          <circle
            key={i}
            cx={toX(i)} cy={toY(d.elo_rating)}
            r={hover === i ? 4 : data.length <= 30 ? 2.5 : 0}
            fill={lineColor}
            stroke="var(--bg-card)"
            strokeWidth="1.5"
            style={{ cursor: "pointer", transition: "r 0.15s ease" }}
            onMouseEnter={() => setHover(i)}
          />
        ))}

        {/* Invisible hover zones for each data point */}
        {data.map((_, i) => {
          const w = plotW / data.length;
          return (
            <rect
              key={`h${i}`}
              x={toX(i) - w / 2}
              y={PAD_TOP}
              width={w}
              height={plotH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
          );
        })}

        {/* Hover indicator */}
        {hover != null && hoverPoint && (
          <>
            <line
              x1={toX(hover)} y1={PAD_TOP}
              x2={toX(hover)} y2={PAD_TOP + plotH}
              stroke="var(--text-faint)" strokeWidth="0.5" strokeDasharray="3,3"
            />
            <circle
              cx={toX(hover)} cy={toY(hoverPoint.elo_rating)}
              r="5" fill={lineColor} stroke="var(--bg-card)" strokeWidth="2"
            />
          </>
        )}
      </svg>

      {/* Hover tooltip */}
      {hover != null && hoverPoint && (
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg text-center pointer-events-none"
          style={{
            background: "var(--bg-elevated)",
            border: "1px solid var(--border)",
            zIndex: 10,
          }}
        >
          <p className="text-xs font-black" style={{ color: "var(--text-primary)" }}>
            {hoverPoint.elo_rating} ELO
          </p>
          <p className="text-[9px] font-bold" style={{ color: "var(--text-faint)" }}>
            {formatDate(hoverPoint.date)}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Main exported component ─────────────────────────────────────────────────

export default function EloHistoryChart({ profileId, currentElo, gender }: { profileId: string; currentElo: number; gender?: Gender }) {
  const [data, setData] = useState<EloSnapshot[] | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    getEloHistory(profileId, days).then(setData);
  }, [profileId, days]);

  if (data === null) {
    return (
      <div
        className="rounded-xl p-4"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        <div className="h-[180px] flex items-center justify-center">
          <div
            className="w-6 h-6 rounded-full border-2 animate-spin"
            style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }}
          />
        </div>
      </div>
    );
  }

  const tier = getTier(currentElo, gender);
  const firstElo = data.length > 0 ? data[0].elo_rating : currentElo;
  const totalChange = currentElo - firstElo;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <p className="text-xs font-black uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            ELO History
          </p>
          {data.length >= 2 && (
            <p className="text-[10px] font-bold mt-0.5" style={{ color: totalChange >= 0 ? "var(--success)" : "var(--danger)" }}>
              {totalChange >= 0 ? "▲" : "▼"} {Math.abs(totalChange)} over {data.length} days
            </p>
          )}
        </div>
        {/* Time range toggle */}
        <div className="flex gap-1">
          {[
            { label: "30D", value: 30 },
            { label: "90D", value: 90 },
            { label: "ALL", value: 365 },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDays(opt.value)}
              className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider transition-colors"
              style={{
                background: days === opt.value ? "var(--bg-elevated)" : "transparent",
                color: days === opt.value ? "var(--text-primary)" : "var(--text-faint)",
                border: days === opt.value ? "1px solid var(--border)" : "1px solid transparent",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart */}
      <div className="px-2 pb-3">
        <Chart data={data} />
      </div>
    </div>
  );
}
