"use client";

import type { TagEntry } from "@/lib/tags";

interface ProfileTagsProps {
  tags: TagEntry[];
  myVotedTags: Set<string>;
  /** null = not logged in (read-only) */
  onVote: ((tag: string) => void) | null;
}

export default function ProfileTags({ tags, myVotedTags, onVote }: ProfileTagsProps) {
  if (tags.length === 0) {
    return (
      <div className="flex justify-center mb-1.5 min-h-[22px]">
        <span
          className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full opacity-30"
          style={{ color: "#4A4A66", background: "#0F0F1A", border: "1px solid #222233" }}
        >
          hover to tag
        </span>
      </div>
    );
  }

  return (
    <div className="flex gap-1 justify-center flex-wrap mb-1.5 min-h-[22px] px-1">
      {tags.map(({ tag, votes }) => {
        const voted = myVotedTags.has(tag);
        return (
          <button
            key={tag}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (onVote) onVote(tag);
            }}
            disabled={!onVote}
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all"
            style={{
              background: voted ? "rgba(139,92,246,0.12)" : "rgba(15,15,26,0.9)",
              border: `1px solid ${voted ? "rgba(139,92,246,0.4)" : "#222233"}`,
              color: voted ? "#A78BFA" : "#4A4A66",
              cursor: onVote ? "pointer" : "default",
            }}
          >
            {tag}
            <span
              className="text-[8px] font-black"
              style={{ color: voted ? "#8B5CF6" : "#2A2A3D" }}
            >
              {votes}
            </span>
          </button>
        );
      })}
    </div>
  );
}
