export function shuffle(items, random = Math.random) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function createRound(quiz, random = Math.random) {
  const count = Math.min(quiz.questionCount || quiz.questions.length, quiz.questions.length);
  return shuffle(quiz.questions, random).slice(0, count).map((item) => ({
    ...item,
    answers: shuffle([item.correct, ...item.wrong], random)
  }));
}
