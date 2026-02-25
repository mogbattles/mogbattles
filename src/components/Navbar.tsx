import Link from "next/link";

export default function Navbar() {
  return (
    <nav className="bg-zinc-900 border-b border-zinc-800 px-4 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <Link href="/" className="text-2xl font-black text-white tracking-tight">
          MOG<span className="text-orange-500">BATTLES</span>
        </Link>
        <div className="flex gap-4">
          <Link
            href="/swipe"
            className="text-zinc-300 hover:text-white font-semibold transition-colors"
          >
            ⚔️ Swipe
          </Link>
          <Link
            href="/leaderboard"
            className="text-zinc-300 hover:text-white font-semibold transition-colors"
          >
            🏆 Leaderboard
          </Link>
        </div>
      </div>
    </nav>
  );
}
