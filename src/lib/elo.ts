// ─── Dynamic K-Factor ─────────────────────────────────────────────────────────
// New profiles adjust rapidly to find their true rating.
// Established profiles stabilize to prevent wild swings.
//
//   0–30 matches  → K=40  (rapid discovery)
//   31–100 matches → K=32  (standard)
//   101+ matches   → K=24  (stable)

export function getKFactor(matches: number): number {
  if (matches < 30) return 40;
  if (matches < 100) return 32;
  return 24;
}

export function calculateElo(
  winnerRating: number,
  loserRating: number,
  winnerMatches = 50,
  loserMatches = 50
) {
  const kW = getKFactor(winnerMatches);
  const kL = getKFactor(loserMatches);

  const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const expectedLoser = 1 / (1 + Math.pow(10, (winnerRating - loserRating) / 400));

  const newWinnerRating = Math.max(100, Math.round(winnerRating + kW * (1 - expectedWinner)));
  const newLoserRating = Math.max(100, Math.round(loserRating + kL * (0 - expectedLoser)));

  return { newWinnerRating, newLoserRating };
}
