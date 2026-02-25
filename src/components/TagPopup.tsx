"use client";

import { useState, useRef, useEffect } from "react";
import type { TagEntry } from "@/lib/tags";
import { sanitizeTag } from "@/lib/tags";

const TAG_MAX = 30;

interface TagPopupProps {
  /** Which side the card is on (determines which direction popup opens) */
  side: "left" | "right";
  profileName: string;
  existingTags: TagEntry[];
  myVotedTags: Set<string>;
  /** null if user not logged in */
  userId: string | null;
  onVote: (tag: string) => void;
  /** Optional image voting */
  images?: string[];
  imageVotes?: Map<string, number>;
  myVotedImages?: Set<string>;
  onImageVote?: (imageUrl: string, currentlyVoted: boolean) => void;
}

export default function TagPopup({
  side,
  profileName,
  existingTags,
  myVotedTags,
  userId,
  onVote,
  images,
  imageVotes,
  myVotedImages,
  onImageVote,
}: TagPopupProps) {
  const [tagInput, setTagInput] = useState("");
  const [tagErr, setTagErr] = useState(false);
  const [imgInput, setImgInput] = useState("");
  const [imgErr, setImgErr] = useState(false);
  const [view, setView] = useState<"tags" | "photos">("tags");
  const tagInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);

  const hasImages = !!(onImageVote);

  // Focus tag input when tags view mounts/becomes active
  useEffect(() => {
    if (view === "tags") {
      const t = setTimeout(() => tagInputRef.current?.focus(), 120);
      return () => clearTimeout(t);
    }
  }, [view]);

  // All unique image URLs: profile's images + any that have been voted on (user-submitted)
  const allImages = [
    ...new Set([
      ...(images ?? []).filter(Boolean),
      ...Array.from(imageVotes?.keys() ?? []),
    ]),
  ];

  function handleTagSubmit() {
    const clean = sanitizeTag(tagInput);
    if (clean.length < 2) {
      setTagErr(true);
      setTimeout(() => setTagErr(false), 700);
      return;
    }
    onVote(clean);
    setTagInput("");
  }

  function handleImgSubmit() {
    const url = imgInput.trim();
    if (!url || !url.startsWith("http")) {
      setImgErr(true);
      setTimeout(() => setImgErr(false), 700);
      return;
    }
    if (!userId || !onImageVote) return;
    // Vote for this URL (not currently voted since it's new, unless already voted)
    const currentlyVoted = myVotedImages?.has(url) ?? false;
    onImageVote(url, currentlyVoted);
    setImgInput("");
  }

  // Opens to the right for left-side card, to the left for right-side card
  const posStyle: React.CSSProperties =
    side === "left"
      ? { left: "calc(100% + 10px)", top: "16px" }
      : { right: "calc(100% + 10px)", top: "16px" };

  return (
    <div
      className="absolute z-50 w-44"
      style={{
        ...posStyle,
        background: "rgba(9,12,22,0.97)",
        border: "1px solid rgba(240,192,64,0.22)",
        borderRadius: "14px",
        backdropFilter: "blur(20px)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.8), 0 0 20px rgba(240,192,64,0.06)",
        animation: "fadeSlideUp 0.16s ease-out both",
      }}
    >
      {/* Header */}
      <div
        className="px-3 pt-2.5 pb-2 border-b flex items-start justify-between gap-1"
        style={{ borderColor: "rgba(27,35,56,0.9)" }}
      >
        <div className="min-w-0">
          <p className="text-[9px] font-black uppercase tracking-widest leading-tight" style={{ color: "#3D5070" }}>
            {view === "tags" ? "🏷️ Tag" : "📷 Photos"}
          </p>
          <p className="text-xs font-black truncate mt-0.5" style={{ color: "#F0C040" }}>
            {profileName}
          </p>
        </div>

        {/* Toggle between tags and photos */}
        {hasImages && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setView((v) => (v === "tags" ? "photos" : "tags"));
            }}
            className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg transition-all mt-0.5"
            style={{
              background: view === "photos" ? "rgba(240,192,64,0.15)" : "rgba(27,35,56,0.7)",
              border: `1px solid ${view === "photos" ? "rgba(240,192,64,0.4)" : "rgba(27,35,56,0.9)"}`,
              color: view === "photos" ? "#F0C040" : "#3D5070",
              fontSize: "11px",
            }}
            title={view === "tags" ? "Vote on photos" : "Back to tags"}
          >
            {view === "tags" ? "📷" : "🏷️"}
          </button>
        )}
      </div>

      {/* ── Tags view ── */}
      {view === "tags" && (
        <>
          {/* Existing tags */}
          {existingTags.length > 0 && (
            <div className="px-2.5 py-2 flex flex-col gap-1">
              {existingTags.map(({ tag, votes }) => {
                const voted = myVotedTags.has(tag);
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (userId) onVote(tag);
                    }}
                    disabled={!userId}
                    className="flex items-center justify-between w-full text-left px-2 py-1 rounded-lg text-xs font-bold transition-all"
                    style={{
                      background: voted ? "rgba(240,192,64,0.1)" : "rgba(27,35,56,0.5)",
                      border: `1px solid ${voted ? "rgba(240,192,64,0.35)" : "rgba(27,35,56,0.9)"}`,
                      color: voted ? "#F0C040" : "#4D6080",
                      cursor: userId ? "pointer" : "not-allowed",
                    }}
                  >
                    {/* Tag text truncated with hard max-width */}
                    <span
                      className="truncate"
                      style={{ maxWidth: "90px" }}
                    >
                      {tag}
                    </span>
                    <span
                      className="ml-1.5 shrink-0 text-[10px] font-black"
                      style={{ color: voted ? "#C8A030" : "#253147" }}
                    >
                      {voted ? "✓" : votes}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Divider */}
          {existingTags.length > 0 && (
            <div style={{ height: "1px", background: "rgba(27,35,56,0.9)", margin: "0 10px" }} />
          )}

          {/* Input */}
          <div className="px-2.5 py-2.5">
            {userId ? (
              <div className="space-y-1">
                <div className="flex gap-1.5 items-center">
                  <input
                    ref={tagInputRef}
                    type="text"
                    value={tagInput}
                    maxLength={TAG_MAX}
                    placeholder="new tag…"
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); handleTagSubmit(); }
                      e.stopPropagation();
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 text-xs px-2 py-1.5 rounded-lg focus:outline-none transition-colors"
                    style={{
                      background: "#141A2C",
                      border: `1px solid ${tagErr ? "#EF4444" : tagInput ? "#F0C040" : "#1B2338"}`,
                      color: "#fff",
                    }}
                  />
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleTagSubmit(); }}
                    className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg font-black text-sm transition-all"
                    style={{
                      background: tagErr ? "rgba(239,68,68,0.15)" : "rgba(240,192,64,0.12)",
                      border: `1px solid ${tagErr ? "rgba(239,68,68,0.4)" : "rgba(240,192,64,0.25)"}`,
                      color: tagErr ? "#EF4444" : "#F0C040",
                    }}
                  >
                    +
                  </button>
                </div>
                {/* Character counter */}
                {tagInput.length > 0 && (
                  <p
                    className="text-right text-[9px] font-bold pr-9"
                    style={{
                      color: tagInput.length >= TAG_MAX ? "#EF4444" : "#253147",
                    }}
                  >
                    {tagInput.length}/{TAG_MAX}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-[10px] text-center py-0.5" style={{ color: "#253147" }}>
                Sign in to add tags
              </p>
            )}
          </div>
        </>
      )}

      {/* ── Photos view ── */}
      {view === "photos" && hasImages && (
        <div className="p-2.5 space-y-2">
          {/* Image grid — all known URLs */}
          {allImages.length > 0 && (
            <div className="grid grid-cols-2 gap-1.5">
              {allImages.map((url) => {
                const votes = imageVotes?.get(url) ?? 0;
                const voted = myVotedImages?.has(url) ?? false;
                return (
                  <button
                    key={url}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (userId) onImageVote!(url, voted);
                    }}
                    disabled={!userId}
                    className="relative rounded-lg overflow-hidden transition-all"
                    style={{
                      aspectRatio: "3/4",
                      border: `2px solid ${voted ? "rgba(240,192,64,0.7)" : "rgba(27,35,56,0.9)"}`,
                      boxShadow: voted ? "0 0 8px rgba(240,192,64,0.3)" : "none",
                      cursor: userId ? "pointer" : "not-allowed",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <div
                      className="absolute bottom-0.5 right-0.5 text-[9px] font-black px-1 rounded"
                      style={{
                        background: voted ? "rgba(240,192,64,0.92)" : "rgba(7,9,15,0.82)",
                        color: voted ? "#1A1000" : "#9B9B9B",
                      }}
                    >
                      {voted ? "✓" : votes > 0 ? votes : ""}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Divider */}
          {allImages.length > 0 && (
            <div style={{ height: "1px", background: "rgba(27,35,56,0.9)" }} />
          )}

          {/* URL input to vote for a new image */}
          {userId ? (
            <div className="space-y-1">
              <div className="flex gap-1.5 items-center">
                <input
                  ref={imgInputRef}
                  type="url"
                  value={imgInput}
                  placeholder="paste image URL…"
                  onChange={(e) => setImgInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); handleImgSubmit(); }
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="flex-1 min-w-0 text-[10px] px-2 py-1.5 rounded-lg focus:outline-none transition-colors"
                  style={{
                    background: "#141A2C",
                    border: `1px solid ${imgErr ? "#EF4444" : imgInput ? "#F0C040" : "#1B2338"}`,
                    color: "#fff",
                  }}
                />
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleImgSubmit(); }}
                  className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg font-black text-sm transition-all"
                  style={{
                    background: imgErr ? "rgba(239,68,68,0.15)" : "rgba(240,192,64,0.12)",
                    border: `1px solid ${imgErr ? "rgba(239,68,68,0.4)" : "rgba(240,192,64,0.25)"}`,
                    color: imgErr ? "#EF4444" : "#F0C040",
                  }}
                >
                  +
                </button>
              </div>
              <p className="text-[9px]" style={{ color: "#253147" }}>
                Paste a URL to vote for that photo
              </p>
            </div>
          ) : (
            <p className="text-[10px] text-center" style={{ color: "#253147" }}>
              Sign in to vote on photos
            </p>
          )}
        </div>
      )}
    </div>
  );
}
