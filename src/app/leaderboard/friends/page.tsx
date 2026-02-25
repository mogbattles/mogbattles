import Link from "next/link";

export default function FriendsLeaderboardPage() {
  return (
    <div className="max-w-md mx-auto px-4 py-12">
      {/* Back */}
      <Link
        href="/leaderboard"
        className="inline-flex items-center gap-1.5 text-xs font-bold mb-8 transition-opacity hover:opacity-70"
        style={{ color: "#3D5070" }}
      >
        ← Leaderboards
      </Link>

      {/* Header */}
      <div className="text-center mb-10">
        <div className="text-6xl mb-4">🤝</div>
        <h1 className="text-3xl font-black text-white mb-2">Friends</h1>
        <span
          className="inline-block text-xs font-black uppercase tracking-widest px-3 py-1 rounded-full mb-4"
          style={{
            color: "#8B7030",
            background: "rgba(240,192,64,0.08)",
            border: "1px solid rgba(240,192,64,0.2)",
          }}
        >
          Coming Soon
        </span>
        <p className="text-sm" style={{ color: "#3D5070" }}>
          Your friends&apos; ELO rankings will appear here once the friends system launches.
        </p>
      </div>

      {/* Placeholder rows */}
      <div
        className="rounded-2xl overflow-hidden mb-6"
        style={{ border: "1px solid #1B2338" }}
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="flex items-center gap-3 px-4 py-3"
            style={{
              borderBottom: i < 5 ? "1px solid #1B2338" : "none",
              background: "#111827",
            }}
          >
            {/* Rank */}
            <span className="text-xs font-black w-5 text-center shrink-0" style={{ color: "#253147" }}>
              {i}
            </span>
            {/* Avatar placeholder */}
            <div
              className="w-9 h-9 rounded-full shrink-0 animate-pulse"
              style={{ background: "#1B2338" }}
            />
            {/* Name placeholder */}
            <div className="flex-1">
              <div
                className="h-3 rounded-full mb-1.5 animate-pulse"
                style={{ background: "#1B2338", width: `${55 + i * 8}%` }}
              />
              <div
                className="h-2 rounded-full animate-pulse"
                style={{ background: "#141A2C", width: "40%" }}
              />
            </div>
            {/* ELO placeholder */}
            <div
              className="h-4 w-12 rounded-lg animate-pulse"
              style={{ background: "#1B2338" }}
            />
          </div>
        ))}
      </div>

      <div
        className="rounded-xl p-4 text-center"
        style={{ background: "#111827", border: "1px solid #1B2338" }}
      >
        <p className="text-sm font-bold text-white mb-1">Friend requests coming soon</p>
        <p className="text-xs" style={{ color: "#3D5070" }}>
          You&apos;ll be able to add friends and see how you rank against them
        </p>
      </div>
    </div>
  );
}
