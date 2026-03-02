import { notFound } from "next/navigation";
import { getArenaBySlug } from "@/lib/arenas";
import LeaderboardTable from "@/components/LeaderboardTable";
import Link from "next/link";

export default async function LeaderboardArenaPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const arena = await getArenaBySlug(slug);

  if (!arena) notFound();

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Back */}
      <div className="mb-5">
        <Link
          href="/leaderboard"
          className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest transition-colors hover:underline"
          style={{ color: "var(--text-muted)" }}
        >
          ← All Leaderboards
        </Link>
      </div>

      {/* Header */}
      <div className="text-center mb-6">
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-3"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
        >
          <span className="text-xs font-black uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
            Rankings
          </span>
          {arena.is_verified && (
            <span className="text-xs font-black" style={{ color: "var(--gold)" }}>✓ Official</span>
          )}
        </div>
        <h1
          className="text-3xl sm:text-4xl font-black tracking-tight"
          style={{
            background: "var(--text-primary)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}
        >
          {arena.name.toUpperCase()}
        </h1>
        {arena.description && (
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            {arena.description}
          </p>
        )}
      </div>

      <LeaderboardTable
        arenaId={arena.id}
        arenaSlug={slug}
        isSubCategory={
          !!arena.category_id &&
          !["all", "members", "men", "women", "humans"].includes(slug)
        }
      />
    </div>
  );
}
