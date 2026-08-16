const MILESTONES = new Set([5, 10, 15, 20]);

export function createBonusState() {
  return { pendingMultiplier: 1, correctSinceMiss: 0, hadMiss: false };
}

export function resolveCorrectBonus(state, totalCorrect, random = Math.random) {
  const messages = [];
  let extraPoints = 0;
  state.correctSinceMiss += 1;

  if (MILESTONES.has(totalCorrect)) {
    extraPoints += totalCorrect * 20;
    messages.push(`🏁 Milepæl: ${totalCorrect} riktige! +${totalCorrect * 20}`);
  }
  if (state.hadMiss && state.correctSinceMiss === 3) {
    extraPoints += 150;
    messages.push("💪 Comebackbonus! +150");
  }
  if (random() < 0.07 && state.pendingMultiplier === 1) {
    state.pendingMultiplier = 2;
    messages.push("⭐ Doble poeng på neste riktige svar!");
  }
  return { extraPoints, messages };
}

export function registerMiss(state) {
  state.hadMiss = true;
  state.correctSinceMiss = 0;
  state.pendingMultiplier = 1;
}

export function consumeMultiplier(state) {
  const multiplier = state.pendingMultiplier;
  state.pendingMultiplier = 1;
  return multiplier;
}
