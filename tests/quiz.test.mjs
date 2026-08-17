import assert from "node:assert/strict";
import { shuffle, createRound } from "../js/quiz-engine.js";
import { answerPoints, perfectRoundBonus, streakBonus } from "../js/scoring.js";
import { createBonusState, resolveCorrectBonus, registerMiss } from "../js/bonuses.js";
import { normalizeUsername, isValidUsername, isValidPin } from "../js/auth.js";
import { summarizeStudentResults } from "../js/admin.js";

const sequence = [1, 2, 3, 4];
assert.deepEqual(shuffle(sequence, () => 0), [2, 3, 4, 1]);
assert.deepEqual(sequence, [1, 2, 3, 4], "shuffle must not mutate source");

const quiz = { questionCount: 1, questions: [{ question: "Q", correct: "A", wrong: ["B", "C", "D"] }, { question: "Q2", correct: "E", wrong: ["F", "G", "H"] }] };
const round = createRound(quiz, () => 0.3);
assert.equal(round.length, 1);
assert.equal(round[0].answers.length, 4);
assert.ok(round[0].answers.includes(round[0].correct));

const answerPositions = new Set();
for (let seed = 1; seed <= 30; seed += 1) {
  let value = seed;
  const random = () => ((value = (value * 16807) % 2147483647) - 1) / 2147483646;
  const sample = createRound({ ...quiz, questionCount: 2 }, random);
  sample.forEach((item) => answerPositions.add(item.answers.indexOf(item.correct)));
}
assert.equal(answerPositions.size, 4, "correct answers should appear in every position");

const balancedQuiz = {
  questionCount: 10,
  questions: Array.from({ length: 10 }, (_, index) => ({
    question: `Q${index}`,
    correct: `R${index}`,
    wrong: [`F${index}-1`, `F${index}-2`, `F${index}-3`]
  }))
};
const balancedRound = createRound(balancedQuiz);
const positionCounts = [0, 0, 0, 0];
balancedRound.forEach((item) => { positionCounts[item.answers.indexOf(item.correct)] += 1; });
assert.ok(Math.max(...positionCounts) - Math.min(...positionCounts) <= 1, "A–D should be balanced per round");

assert.equal(streakBonus(1), 0);
assert.equal(streakBonus(2), 50);
assert.equal(streakBonus(5), 200);
assert.equal(answerPoints(2), 550);
assert.equal(answerPoints(10, 2), 1800);
assert.equal(perfectRoundBonus(10, 10), 1000);

const bonus = createBonusState();
registerMiss(bonus);
resolveCorrectBonus(bonus, 1, () => 1);
resolveCorrectBonus(bonus, 2, () => 1);
assert.equal(resolveCorrectBonus(bonus, 3, () => 1).extraPoints, 150);
assert.equal(resolveCorrectBonus(bonus, 5, () => 1).extraPoints, 100);

assert.equal(normalizeUsername("  Quiz   Mester  "), "quiz mester");
assert.equal(isValidUsername("Øivind_91"), true);
assert.equal(isValidUsername("A"), false);
assert.equal(isValidUsername("Ulovlig@navn"), false);
assert.equal(isValidPin("123456"), true);
assert.equal(isValidPin("12345"), false);
assert.equal(isValidPin("abcdef"), false);

assert.deepEqual(summarizeStudentResults([
  { correct_answers: 7, total_questions: 10, score: 4200, played_at: "2026-08-17T12:00:00Z" },
  { correct_answers: 9, total_questions: 10, score: 6100, played_at: "2026-08-16T12:00:00Z" }
]), { plays: 2, accuracy: 80, bestScore: 6100, lastPlayed: "2026-08-17T12:00:00Z" });
assert.deepEqual(summarizeStudentResults([]), { plays: 0, accuracy: 0, bestScore: 0, lastPlayed: null });

console.log("Alle tester bestått.");
