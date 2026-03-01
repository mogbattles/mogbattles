"use client";

import { useState, useRef } from "react";
import type { TagEntry } from "@/lib/tags";
import { sanitizeTag } from "@/lib/tags";

const TAG_MAX = 30;

interface ProfileTagsProps {
  tags: TagEntry[];
  myVotedTags: Set<string>;
  /** null = not logged in (read-only) */
  onVote: ((tag: string) => void) | null;
}

export default function ProfileTags({ tags, myVotedTags, onVote }: ProfileTagsProps) {
  const [inputOpen, setInputOpen] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tagErr, setTagErr] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleSubmit() {
    const clean = sanitizeTag(tagInput);
    if (clean.length < 2) {
      setTagErr(true);
      setTimeout(() => setTagErr(false), 700);
      return;
    }
    if (onVote) onVote(clean);
    setTagInput("");
  }

  return (
    <div className="flex flex-col items-center mb-1.5 min-h-[22px] px-1 gap-1">
      {/* Existing tags */}
      {tags.length > 0 && (
        <div className="flex gap-1 justify-center flex-wrap">
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
      )}

      {/* Inline tag input */}
      {onVote && (
        <>
          {!inputOpen ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setInputOpen(true);
                setTimeout(() => inputRef.current?.focus(), 60);
              }}
              className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full transition-all hover:opacity-80"
              style={{ color: "#4A4A66", background: "#0F0F1A", border: "1px solid #222233" }}
            >
              + tag
            </button>
          ) : (
            <div className="flex gap-1 items-center" onClick={(e) => e.stopPropagation()}>
              <input
                ref={inputRef}
                type="text"
                value={tagInput}
                maxLength={TAG_MAX}
                placeholder="add tag..."
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); handleSubmit(); }
                  if (e.key === "Escape") { setInputOpen(false); setTagInput(""); }
                  e.stopPropagation();
                }}
                className="w-20 text-[10px] px-2 py-0.5 rounded-full focus:outline-none transition-colors"
                style={{
                  background: "#0A0A12",
                  border: `1px solid ${tagErr ? "#EF4444" : tagInput ? "#8B5CF6" : "#222233"}`,
                  color: "#fff",
                }}
              />
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); handleSubmit(); }}
                className="w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-black transition-all"
                style={{
                  background: tagErr ? "rgba(239,68,68,0.15)" : "rgba(139,92,246,0.12)",
                  border: `1px solid ${tagErr ? "rgba(239,68,68,0.4)" : "rgba(139,92,246,0.25)"}`,
                  color: tagErr ? "#EF4444" : "#A78BFA",
                }}
              >
                +
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setInputOpen(false); setTagInput(""); }}
                className="w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-black transition-all"
                style={{
                  background: "rgba(34,34,51,0.5)",
                  border: "1px solid rgba(34,34,51,0.9)",
                  color: "#4A4A66",
                }}
              >
                x
              </button>
            </div>
          )}
        </>
      )}

      {/* Read-only placeholder when no tags and not logged in */}
      {tags.length === 0 && !onVote && (
        <span
          className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full opacity-30"
          style={{ color: "#4A4A66", background: "#0F0F1A", border: "1px solid #222233" }}
        >
          no tags yet
        </span>
      )}
    </div>
  );
}
