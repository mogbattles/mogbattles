export function calculateElo(
  winnerRating: number,
  loserRating: number,
  kFactor: number = 32
): { newWinnerRating: number; newLoserRating: number } {
  const expectedWinner =
    1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
  const expectedLoser = 1 - expectedWinner;

  const newWinnerRating = Math.round(
    winnerRating + kFactor * (1 - expectedWinner)
  );
  const newLoserRating = Math.round(
    loserRating + kFactor * (0 - expectedLoser)
  );

  return {
    newWinnerRating: Math.max(newWinnerRating, 100),
    newLoserRating: Math.max(newLoserRating, 100),
  };
}