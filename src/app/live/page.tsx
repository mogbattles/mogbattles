export default function LivePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
      <div className="text-6xl mb-4 animate-pulse">🔴</div>
      <h1 className="text-3xl font-black text-white mb-3">LIVE MOG BATTLES</h1>
      <p className="text-zinc-500 max-w-sm">
        Watch battles happen in real time. Cheer for your favourites.
        Coming soon.
      </p>
      <div className="mt-8 flex gap-2 items-center text-zinc-700 text-sm">
        <span className="w-2 h-2 rounded-full bg-zinc-700 animate-ping" />
        Not live yet
      </div>
    </div>
  );
}
