"use client";

interface ProfileCardProps {
  name: string;
  imageUrl: string;
  eloRating: number;
  onClick: () => void;
  side: "left" | "right";
}

export default function ProfileCard({
  name,
  imageUrl,
  eloRating,
  onClick,
  side,
}: ProfileCardProps) {
  return (
    <button
      onClick={onClick}
      className={`
        group relative flex-1 rounded-2xl overflow-hidden border-2
        border-zinc-700 hover:border-orange-500
        transition-all duration-200 hover:scale-[1.02]
        active:scale-[0.98] cursor-pointer
        max-w-sm
      `}
    >
      <div className="aspect-[3/4] bg-zinc-800 relative">
        <img
          src={imageUrl}
          alt={name}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              `https://placehold.co/400x500/1a1a1a/fff?text=${encodeURIComponent(name)}`;
          }}
        />
        <div className="absolute inset-0 bg-orange-500/0 group-hover:bg-orange-500/10 transition-colors" />
      </div>
      <div className="p-3 bg-zinc-900 text-left">
        <h3 className="text-white font-bold text-lg truncate">{name}</h3>
        <p className="text-zinc-400 text-sm">ELO: {eloRating}</p>
      </div>
      <div className="absolute top-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
        <span className="bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg">
          👑 MOGS
        </span>
      </div>
    </button>
  );
}