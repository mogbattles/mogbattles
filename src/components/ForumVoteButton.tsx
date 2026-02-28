"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

function db() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

interface ForumVoteButtonProps {
  targetType: "thread" | "reply";
  targetId: string;
  initialScore: number;
  /** Current user's existing vote: +1, -1, or 0 (none) */
  userVote: number;
  /** Whether the user is allowed to vote (logged-in member+) */
  canVote: boolean;
  /** Callback when vote changes — receives new score and new userVote */
  onVoteChange?: (newScore: number, newUserVote: number) => void;
}

export default function ForumVoteButton({
  targetType,
  targetId,
  initialScore,
  userVote: initialUserVote,
  canVote,
  onVoteChange,
}: ForumVoteButtonProps) {
  const [score, setScore] = useState(initialScore);
  const [myVote, setMyVote] = useState(initialUserVote); // +1, -1, or 0
  const [voting, setVoting] = useState(false);

  async function handleVote(direction: 1 | -1) {
    if (!canVote || voting) return;

    // Optimistic update
    const wasVote = myVote;
    const wasScore = score;

    let newVote: number;
    let newScore: number;

    if (wasVote === direction) {
      // Toggle off
      newVote = 0;
      newScore = wasScore - direction;
    } else if (wasVote === -direction) {
      // Flip
      newVote = direction;
      newScore = wasScore + direction * 2;
    } else {
      // New vote
      newVote = direction;
      newScore = wasScore + direction;
    }

    setMyVote(newVote);
    setScore(newScore);
    setVoting(true);

    const { data, error } = await db().rpc("forum_vote", {
      p_thread_id: targetType === "thread" ? targetId : null,
      p_reply_id: targetType === "reply" ? targetId : null,
      p_vote: direction,
    });

    if (error) {
      // Revert on error
      setMyVote(wasVote);
      setScore(wasScore);
    } else if (data !== null && data !== undefined) {
      // Use server-confirmed score
      setScore(data as number);
      // If we toggled off, newVote=0; if we set, newVote=direction
      // The server handles toggle: if same vote sent again → removes it
      onVoteChange?.(data as number, newVote);
    }

    setVoting(false);
  }

  return (
    <div className="flex flex-col items-center gap-0.5 select-none">
      {/* Upvote */}
      <button
        onClick={() => handleVote(1)}
        disabled={!canVote || voting}
        className={`flex items-center justify-center w-7 h-7 rounded-md transition-all duration-100 ${
          myVote === 1
            ? "text-orange-400 bg-orange-400/15 scale-110"
            : canVote
              ? "text-navy-400 hover:text-orange-400 hover:bg-orange-400/10"
              : "text-navy-600 cursor-default"
        }`}
        aria-label="Upvote"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 4l-8 8h5v8h6v-8h5z" />
        </svg>
      </button>

      {/* Score */}
      <span
        className={`text-[11px] font-black tabular-nums leading-none ${
          myVote === 1
            ? "text-orange-400"
            : myVote === -1
              ? "text-blue-400"
              : "text-navy-300"
        }`}
      >
        {score}
      </span>

      {/* Downvote */}
      <button
        onClick={() => handleVote(-1)}
        disabled={!canVote || voting}
        className={`flex items-center justify-center w-7 h-7 rounded-md transition-all duration-100 ${
          myVote === -1
            ? "text-blue-400 bg-blue-400/15 scale-110"
            : canVote
              ? "text-navy-400 hover:text-blue-400 hover:bg-blue-400/10"
              : "text-navy-600 cursor-default"
        }`}
        aria-label="Downvote"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 20l8-8h-5V4H9v8H4z" />
        </svg>
      </button>
    </div>
  );
}
