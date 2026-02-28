"use client";

interface ImageVotePopupProps {
  /** Which side the parent card is on */
  side: "left" | "right";
  profileName: string;
  /** Non-empty image URLs (up to 4) */
  images: string[];
  /** imageUrl → vote count */
  imageVotes: Map<string, number>;
  myVotedImages: Set<string>;
  /** null if user not logged in */
  userId: string | null;
  onVote: (imageUrl: string, currentlyVoted: boolean) => void;
}

export default function ImageVotePopup({
  side,
  profileName,
  images,
  imageVotes,
  myVotedImages,
  userId,
  onVote,
}: ImageVotePopupProps) {
  const filtered = images.filter(Boolean);
  if (filtered.length === 0) return null;

  const posStyle: React.CSSProperties =
    side === "left"
      ? { left: "calc(100% + 10px)", top: "210px" }
      : { right: "calc(100% + 10px)", top: "210px" };

  return (
    <div
      className="absolute z-50 w-44"
      style={{
        ...posStyle,
        background: "rgba(10,10,18,0.97)",
        border: "1px solid rgba(139,92,246,0.2)",
        borderRadius: "14px",
        backdropFilter: "blur(20px)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.8), 0 0 20px rgba(139,92,246,0.06)",
        animation: "fadeSlideUp 0.16s ease-out both",
      }}
    >
      {/* Header */}
      <div
        className="px-3 pt-2.5 pb-2 border-b"
        style={{ borderColor: "rgba(34,34,51,0.9)" }}
      >
        <p className="text-[9px] font-black uppercase tracking-widest leading-tight" style={{ color: "#4A4A66" }}>
          Photos
        </p>
        <p className="text-xs font-black truncate mt-0.5" style={{ color: "#A78BFA" }}>
          {profileName}
        </p>
      </div>

      {/* Image grid */}
      <div className="p-2.5 grid grid-cols-2 gap-1.5">
        {filtered.map((url) => {
          const votes = imageVotes.get(url) ?? 0;
          const voted = myVotedImages.has(url);
          return (
            <button
              key={url}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (userId) onVote(url, voted);
              }}
              disabled={!userId}
              className="relative rounded-lg overflow-hidden transition-all"
              style={{
                aspectRatio: "3/4",
                border: `2px solid ${voted ? "rgba(139,92,246,0.7)" : "rgba(34,34,51,0.9)"}`,
                boxShadow: voted ? "0 0 8px rgba(139,92,246,0.3)" : "none",
                cursor: userId ? "pointer" : "not-allowed",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                className="w-full h-full object-cover"
              />
              {/* Vote count badge */}
              <div
                className="absolute bottom-0.5 right-0.5 text-[9px] font-black px-1 rounded"
                style={{
                  background: voted ? "rgba(139,92,246,0.92)" : "rgba(5,5,8,0.82)",
                  color: voted ? "#fff" : "#9B9B9B",
                }}
              >
                {voted ? "✓" : votes > 0 ? votes : ""}
              </div>
            </button>
          );
        })}
      </div>

      {!userId && (
        <p className="text-[10px] text-center pb-2" style={{ color: "#2A2A3D" }}>
          Sign in to vote
        </p>
      )}
    </div>
  );
}
