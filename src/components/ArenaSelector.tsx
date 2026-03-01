"use client";

import { useEffect, useState } from "react";
import { getPublicArenas, type ArenaWithCount } from "@/lib/arenas";
import ArenaCard from "./ArenaCard";

interface ArenaSelectorProps {
  mode: "swipe" | "leaderboard";
}

export default function ArenaSelector({ mode }: ArenaSelectorProps) {
  const [arenas, setArenas] = useState<ArenaWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPublicArenas()
      .then((data) => {
        setArenas(data);
        setLoading(false);
      })
      .catch(() => {
        setError(
          "Could not load arenas. Make sure the database migration has been run."
        );
        setLoading(false);
      });
  }, []);

  const heading =
    mode === "swipe" ? "⚔️ Choose your arena" : "🏆 Leaderboards";
  const subheading =
    mode === "swipe"
      ? "Pick a category and start voting"
      : "Rankings by arena";

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-black text-[color:var(--text-primary)]">{heading}</h1>
        <p className="text-navy-200 mt-1 text-sm">{subheading}</p>
      </div>

      {loading && (
        <div className="grid grid-cols-2 gap-3">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="rounded-2xl border border-navy-500 bg-navy-800 p-4 h-32 animate-pulse"
            />
          ))}
          {/* skeleton for More card */}
          <div className="col-span-2 rounded-2xl border border-navy-500 bg-navy-800 p-4 h-20 animate-pulse" />
        </div>
      )}

      {error && (
        <div className="text-center py-12">
          <p className="text-game-red font-bold">{error}</p>
          <p className="text-navy-400 text-sm mt-2">
            Run the SQL migration in your Supabase dashboard.
          </p>
        </div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-2 gap-3">
          {/* Official arenas */}
          {arenas
            .filter((a) => a.is_official)
            .map((arena) => (
              <ArenaCard
                key={arena.id}
                name={arena.name}
                slug={arena.slug}
                description={arena.description}
                is_official={arena.is_official}
                is_verified={arena.is_verified}
                player_count={arena.player_count}
                mode={mode}
              />
            ))}

          {/* Full-width More card */}
          <ArenaCard
            name="More"
            slug="more"
            description={null}
            is_official={false}
            is_verified={false}
            player_count={0}
            mode={mode}
            variant="more"
          />
        </div>
      )}
    </div>
  );
}
