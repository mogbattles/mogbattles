"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

interface Profile {
  id: string;
  name: string;
  image_url: string;
  elo_rating: number;
  total_wins: number;
  total_losses: number;
  total_matches: number;
}

export default function LeaderboardPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLeaderboard() {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("is_test_profile", true)
        .order("elo_rating", { ascending: false });

      if (error) {
        console.error("Error:", error);
        return;
      }

      setProfiles(data || []);
      setLoading(false);
    }

    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 5000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-2xl font-bold text-zinc-400 animate-pulse">
          Loading leaderboard...
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-black text-white text-center mb-2">
        🏆 MOG LEADERBOARD
      </h1>
      <p className="text-zinc-400 text-center mb-8">
        Global rankings by ELO rating
      </p>

      <div className="space-y-2">
        {profiles.map((profile, index) => (
          <div
            key={profile.id}
            className={`
              flex items-center gap-4 p-4 rounded-xl
              ${index === 0 ? "bg-yellow-500/10 border border-yellow-500/30" : ""}
              ${index === 1 ? "bg-zinc-400/10 border border-zinc-400/30" : ""}
              ${index === 2 ? "bg-orange-700/10 border border-orange-700/30" : ""}
              ${index > 2 ? "bg-zinc-900 border border-zinc-800" : ""}
            `}
          >
            <div className="w-10 text-center">
              {index === 0 && <span className="text-2xl">👑</span>}
              {index === 1 && <span className="text-2xl">🥈</span>}
              {index === 2 && <span className="text-2xl">🥉</span>}
              {index > 2 && (
                <span className="text-zinc-500 font-bold text-lg">
                  #{index + 1}
                </span>
              )}
            </div>

            <img
              src={profile.image_url}
              alt={profile.name}
              className="w-12 h-12 rounded-full object-cover border-2 border-zinc-700"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  `https://placehold.co/48x48/1a1a1a/fff?text=${profile.name.charAt(0)}`;
              }}
            />

            <div className="flex-1">
              <h3 className="text-white font-bold">{profile.name}</h3>
              <p className="text-zinc-500 text-xs">
                {profile.total_wins}W – {profile.total_losses}L
                ({profile.total_matches} battles)
              </p>
            </div>

            <div className="text-right">
              <span className="text-orange-400 font-black text-xl">
                {profile.elo_rating}
              </span>
              <p className="text-zinc-500 text-xs">ELO</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}