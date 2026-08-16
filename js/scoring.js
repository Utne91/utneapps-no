export const BASE_POINTS = 500;

export function streakBonus(streak) {
  if (streak >= 10) return 400;
  if (streak >= 5) return 200;
  if (streak >= 3) return 100;
  if (streak >= 2) return 50;
  return 0;
}

export function answerPoints(streak, multiplier = 1) {
  return Math.round((BASE_POINTS + streakBonus(streak)) * multiplier);
}

export function perfectRoundBonus(correct, total) {
  return total > 0 && correct === total ? 1000 : 0;
}
