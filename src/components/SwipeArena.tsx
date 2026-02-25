"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { calculateElo } from "@/lib/elo";
import ProfileCard from "./ProfileCard";

interface Profile {
  id: string;
  name: string;
  image_url: string;
  elo_rating: number;
  total_wins: number;
  total_losses: number;
  total_matches: number;
}

export default function SwipeArena() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [pair, setPair] = useState<[Profile, Profile] | null>(null);
  const [loading, setLoading] = useState(true);
  const [swipeCount, setSwipeCount] = useState(0);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [animating, setAnimating] = useState(false);

  useEffect(() => {
    async function fetchProfiles() {
      const { data, error } = await supabase
        .from("profiles")
        .select("*");

      if (error) {
        console.error("Error fetching profiles:", error);
        return;
      }

      if (data && data.length >= 2) {
        setProfiles(data);
        pickRandomPair(data);
      }
      setLoading(false);
    }

    fetchProfiles();
  }, []);

  const pickRandomPair = useCallback(
    (profileList: Profile[]) => {
      const shuffled = [...profileList].sort(() => Math.random() - 0.5);
      setPair([shuffled[0], shuffled[1]]);
    },
    []
  );

  const handleVote = async (winner: Profile, loser: Profile) => {
    if (animating) return;
    setAnimating(true);

    const { newWinnerRating, newLoserRating } = calculateElo(
      winner.elo_rating,
      loser.elo_rating
    );

    const eloGain = newWinnerRating - winner.elo_rating;
    setLastResult(`${winner.name} mogs! +${eloGain} ELO`);

    await supabase.rpc("record_vote", {
      p_winner_id: winner.id,
      p_loser_id: loser.id,
      p_winner_elo_before: winner.elo_rating,
      p_loser_elo_before: loser.elo_rating,
      p_winner_elo_after: newWinnerRating,
      p_loser_elo_after: newLoserRating,
    });

    const updatedProfiles = profiles.map((p) => {
      if (p.id === winner.id)
        return {
          ...p,
          elo_rating: newWinnerRating,
          total_wins: p.total_wins + 1,
          total_matches: p.total_matches + 1,
        };
      if (p.id === loser.id)
        return {
          ...p,
          elo_rating: newLoserRating,
          total_losses: p.total_losses + 1,
          total_matches: p.total_matches + 1,
        };
      return p;
    });

    setProfiles(updatedProfiles);
    setSwipeCount((c) => c + 1);

    // Brief pause for result feedback, then load next pair
    setTimeout(() => {
      pickRandomPair(updatedProfiles);
      setLastResult(null);
      setAnimating(false);
    }, 1200);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-2xl font-bold text-zinc-400 animate-pulse">
          Loading battles...
        </div>
      </div>
    );
  }

  if (!pair) {
    return (
      <div className="text-center text-zinc-400 mt-20">
        Not enough profiles to battle. Add more!
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-black text-white mb-1">WHO MOGS?</h1>
        <p className="text-zinc-400">Tap the one who mogs the other</p>
        <p className="text-zinc-500 text-sm mt-1">Battles: {swipeCount}</p>
      </div>

      {lastResult && (
        <div className="text-center mb-4 animate-bounce">
          <span className="bg-orange-500/20 text-orange-400 font-bold px-4 py-2 rounded-full text-sm">
            {lastResult}
          </span>
        </div>
      )}

      <div className="flex gap-4 items-stretch justify-center">
        <ProfileCard
          name={pair[0].name}
          imageUrl={pair[0].image_url}
          eloRating={pair[0].elo_rating}
          onClick={() => handleVote(pair[0], pair[1])}
          side="left"
        />

        <div className="flex items-center">
          <span className="text-4xl font-black text-orange-500 drop-shadow-lg">
            VS
          </span>
        </div>

        <ProfileCard
          name={pair[1].name}
          imageUrl={pair[1].image_url}
          eloRating={pair[1].elo_rating}
          onClick={() => handleVote(pair[1], pair[0])}
          side="right"
        />
      </div>

      <div className="text-center mt-6">
        <button
          onClick={() => pickRandomPair(profiles)}
          className="text-zinc-500 hover:text-zinc-300 text-sm underline transition-colors"
        >
          Skip this battle →
        </button>
      </div>
    </div>
  );
}