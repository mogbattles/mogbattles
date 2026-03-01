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
        background: "var(--nav-bg)",
        border: "1px solid var(--border)",
        borderRadius: "14px",
        backdropFilter: "blur(20px)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.8)",
        animation: "fadeSlideUp 0.16s ease-out both",
      }}
    >
      {/* Header */}
      <div
        className="px-3 pt-2.5 pb-2 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <p className="text-[9px] font-black uppercase tracking-widest leading-tight" style={{ color: "var(--text-muted)" }}>
          Photos
        </p>
        <p className="text-xs font-black truncate mt-0.5" style={{ color: "var(--accent)" }}>
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
                border: `2px solid ${voted ? "var(--border-hover)" : "var(--border)"}`,
                boxShadow: voted ? "0 0 8px var(--accent-glow)" : "none",
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
                  background: voted ? "var(--text-primary)" : "rgba(0,0,0,0.82)",
                  color: voted ? "#fff" : "var(--text-secondary)",
                }}
              >
                {voted ? "✓" : votes > 0 ? votes : ""}
              </div>
            </button>
          );
        })}
      </div>

      {!userId && (
        <p className="text-[10px] text-center pb-2" style={{ color: "var(--text-faint)" }}>
          Sign in to vote
        </p>
      )}
    </div>
  );
}
