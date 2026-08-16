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
  const questions = shuffle(quiz.questions, random).slice(0, count);
  const correctPositions = [];
  while (correctPositions.length < count) {
    correctPositions.push(...shuffle([0, 1, 2, 3], random));
  }
  correctPositions.length = count;
  const balancedPositions = shuffle(correctPositions, random);

  return questions.map((item, index) => {
    const answers = shuffle(item.wrong, random);
    answers.splice(balancedPositions[index], 0, item.correct);
    return { ...item, answers };
  });
}
