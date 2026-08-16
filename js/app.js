import { subjects, quizzes } from "../data/subjects.js";
import { createRound } from "./quiz-engine.js";
import { answerPoints, perfectRoundBonus } from "./scoring.js";
import { createBonusState, resolveCorrectBonus, registerMiss, consumeMultiplier } from "./bonuses.js";
import { saveResult, getLeaderboard, getPlayerStats, isConfigured } from "./database.js";

const app = document.querySelector("#app");
const state = { subject: null, quizMeta: quizzes[0], quiz: null, player: "", round: [], index: 0, score: 0, correct: 0, streak: 0, bestStreak: 0, answered: false, bonuses: createBonusState() };
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

function setView(html) { app.innerHTML = html; window.scrollTo({ top: 0, behavior: "smooth" }); }
function quizForSubject(id) { return quizzes.filter((quiz) => quiz.subjectId === id); }

function renderHome() {
  state.subject = null;
  setView(`
    <section class="hero">
      <p class="eyebrow">Klar for en runde?</p>
      <h1>Lær litt.<br><span class="accent">Slå rekorden.</span></h1>
      <p class="lead">Velg et fag, test deg selv og se om du klarer å slå din egen beste poengsum.</p>
    </section>
    <section>
      <div class="section-head"><div><h2>Velg fag</h2><p>Ett fag er klart nå. Flere kommer.</p></div></div>
      <div class="grid">
        ${subjects.map((subject) => `<button class="card ${subject.active ? "" : "disabled"}" type="button" data-subject="${subject.id}" ${subject.active ? "" : "disabled"}><span class="card-icon">${subject.icon}</span><h3>${subject.name}</h3><p>${subject.description}</p>${subject.active ? '<span class="tag">1 quiz klar</span>' : '<span class="tag">Kommer snart</span>'}</button>`).join("")}
      </div>
    </section>`);
  app.querySelectorAll("[data-subject]").forEach((button) => button.addEventListener("click", () => renderTopics(button.dataset.subject)));
}

function renderTopics(subjectId) {
  state.subject = subjects.find((item) => item.id === subjectId);
  const list = quizForSubject(subjectId);
  setView(`<button class="back" type="button" id="back">← Alle fag</button><div class="section-head"><div><p class="eyebrow">${state.subject.icon} Fag</p><h2>${state.subject.name}</h2><p>Velg tema og start en ny runde.</p></div></div><div class="grid">${list.map((quiz) => `<button class="card" type="button" data-quiz="${quiz.id}"><span class="card-icon">🧠</span><h3>${quiz.title}</h3><p>${quiz.description}</p><span class="tag">${quiz.questionCount} spørsmål</span></button>`).join("")}</div>`);
  app.querySelector("#back").addEventListener("click", renderHome);
  app.querySelectorAll("[data-quiz]").forEach((button) => button.addEventListener("click", () => renderStart(quizzes.find((quiz) => quiz.id === button.dataset.quiz))));
}

function renderStart(meta) {
  state.quizMeta = meta;
  const remembered = localStorage.getItem("utne-quiz-player") || "";
  setView(`<button class="back" type="button" id="back">← Til temaene</button><section class="panel"><p class="eyebrow">${state.subject?.name || "Samfunnsfag"}</p><h2>${meta.title}</h2><p class="topic-summary">${meta.questionCount} tilfeldige spørsmål. Svarene stokkes hver gang.</p><form id="player-form"><label for="player-name">Navn eller kallenavn</label><input id="player-name" maxlength="24" autocomplete="nickname" value="${escapeHtml(remembered)}" required><p class="hint">Bruk gjerne bare fornavn eller kallenavn.</p><button class="primary" type="submit">Start quizen →</button></form></section>`);
  app.querySelector("#back").addEventListener("click", () => renderTopics(meta.subjectId));
  app.querySelector("#player-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = app.querySelector("#player-name").value.trim();
    if (!name) return;
    state.player = name.slice(0, 24);
    localStorage.setItem("utne-quiz-player", state.player);
    const module = await import(meta.dataPath);
    state.quiz = module.default;
    startRound();
  });
}

function startRound() {
  Object.assign(state, { round: createRound(state.quiz), index: 0, score: 0, correct: 0, streak: 0, bestStreak: 0, answered: false, bonuses: createBonusState() });
  renderQuestion();
}

function renderQuestion() {
  state.answered = false;
  const item = state.round[state.index];
  const progress = Math.round((state.index / state.round.length) * 100);
  const letters = ["A", "B", "C", "D"];
  setView(`<section class="quiz-wrap"><div class="quiz-top"><div class="progress-track" aria-label="${progress} prosent fullført" style="--progress:${progress}%"><div class="progress-fill" style="width:${progress}%"></div></div><span class="stat-pill">🔥 ${state.streak} på rad</span><span class="stat-pill">${state.score.toLocaleString("nb-NO")} poeng</span></div><div class="question-card"><p class="question-count">Spørsmål ${state.index + 1} av ${state.round.length}</p><h2>${escapeHtml(item.question)}</h2></div><div class="answers">${item.answers.map((answer, index) => `<button class="answer" type="button" data-answer="${escapeHtml(answer)}"><span class="answer-letter">${letters[index]}</span>${escapeHtml(answer)}</button>`).join("")}</div><div class="feedback" id="feedback" hidden></div><div class="next-row" id="next-row"></div></section>`);
  app.querySelectorAll("[data-answer]").forEach((button) => button.addEventListener("click", () => handleAnswer(button, item)));
}

function handleAnswer(button, item) {
  if (state.answered) return;
  state.answered = true;
  const isCorrect = button.dataset.answer === item.correct;
  const feedback = app.querySelector("#feedback");
  const buttons = [...app.querySelectorAll("[data-answer]")];
  buttons.forEach((answerButton) => { answerButton.disabled = true; if (answerButton.dataset.answer === item.correct) answerButton.classList.add("correct"); });
  let bonusMessages = [];

  if (isCorrect) {
    state.correct += 1;
    state.streak += 1;
    state.bestStreak = Math.max(state.bestStreak, state.streak);
    const multiplier = consumeMultiplier(state.bonuses);
    const points = answerPoints(state.streak, multiplier);
    const bonus = resolveCorrectBonus(state.bonuses, state.correct);
    state.score += points + bonus.extraPoints;
    bonusMessages = [`+${points.toLocaleString("nb-NO")} poeng`, ...bonus.messages];
    feedback.innerHTML = `<div class="feedback-head"><strong>✓ Riktig!</strong><span class="bonus-note">${bonusMessages.join(" · ")}</span></div>${item.explanation ? `<p>${escapeHtml(item.explanation)}</p>` : ""}`;
  } else {
    button.classList.add("wrong");
    state.streak = 0;
    registerMiss(state.bonuses);
    feedback.innerHTML = `<strong>✕ Ikke helt</strong><p>Riktig svar: <b>${escapeHtml(item.correct)}</b></p>${item.explanation ? `<p>${escapeHtml(item.explanation)}</p>` : ""}`;
  }
  feedback.hidden = false;
  const last = state.index === state.round.length - 1;
  app.querySelector("#next-row").innerHTML = `<button class="primary" type="button" id="next">${last ? "Se resultatet" : "Neste spørsmål →"}</button>`;
  app.querySelector("#next").addEventListener("click", () => { state.index += 1; last ? finishRound() : renderQuestion(); });
}

async function finishRound() {
  state.score += perfectRoundBonus(state.correct, state.round.length);
  const result = { quiz_id: state.quiz.id, player_name: state.player, score: state.score, correct_answers: state.correct, total_questions: state.round.length, best_streak: state.bestStreak, played_at: new Date().toISOString() };
  let stats;
  let leaderboard;
  try {
    await saveResult(result);
    [stats, leaderboard] = await Promise.all([getPlayerStats(state.quiz.id, state.player), getLeaderboard(state.quiz.id, 100)]);
  } catch {
    stats = { plays: 1, bestScore: state.score, bestStreak: state.bestStreak };
    leaderboard = [result];
  }
  const rank = 1 + leaderboard.filter((row) => row.score > result.score || (row.score === result.score && row.correct_answers > result.correct_answers)).length;
  const accuracy = Math.round((state.correct / state.round.length) * 100);
  const newRecord = stats.plays === 1 || state.score >= stats.bestScore;
  setView(`<section class="panel center"><p class="eyebrow">Runden er ferdig</p><h2>Bra jobbet, ${escapeHtml(state.player)}!</h2><div class="score-big">${state.score.toLocaleString("nb-NO")}</div><p class="result-line">poeng</p>${newRecord ? '<span class="record">🏆 Ny personlig rekord!</span>' : `<p class="result-line">Personlig rekord: ${stats.bestScore.toLocaleString("nb-NO")}</p>`}<div class="result-stats"><div class="result-stat"><strong>${state.correct}/${state.round.length}</strong><span>riktige</span></div><div class="result-stat"><strong>${accuracy} %</strong><span>treffsikkerhet</span></div><div class="result-stat"><strong>${state.bestStreak} 🔥</strong><span>beste streak</span></div><div class="result-stat"><strong>${stats.plays}</strong><span>ganger spilt</span></div><div class="result-stat"><strong>${rank || "–"}</strong><span>plassering</span></div><div class="result-stat"><strong>${stats.bestStreak}</strong><span>beste noensinne</span></div></div><div class="button-row"><button class="primary" id="again" type="button">Spill igjen</button><button class="secondary" id="leaderboard" type="button">Se highscore</button><button class="secondary" id="topics" type="button">Velg nytt tema</button></div></section>`);
  app.querySelector("#again").addEventListener("click", startRound);
  app.querySelector("#leaderboard").addEventListener("click", () => renderLeaderboard(state.quiz.id));
  app.querySelector("#topics").addEventListener("click", () => renderTopics(state.quizMeta.subjectId));
}

async function renderLeaderboard(quizId = state.quizMeta.id) {
  setView(`<section class="leaderboard"><button class="back" id="back" type="button">← Tilbake</button><p class="eyebrow">Highscore</p><h2>${state.quizMeta.title}</h2><div class="score-table"><div class="empty">Henter resultater …</div></div></section>`);
  app.querySelector("#back").addEventListener("click", state.subject ? () => renderTopics(state.subject.id) : renderHome);
  try {
    const rows = await getLeaderboard(quizId);
    app.querySelector(".score-table").innerHTML = rows.length ? rows.map((row, index) => `<div class="score-row"><span class="rank">${index + 1}</span><div><strong>${escapeHtml(row.player_name)}</strong><div class="score-meta">${row.correct_answers}/${row.total_questions} riktige · ${Math.round(row.correct_answers / row.total_questions * 100)} % · streak ${row.best_streak}</div></div><span class="score-points">${row.score.toLocaleString("nb-NO")}</span></div>`).join("") : `<div class="empty">Ingen resultater ennå. Bli den første!</div>`;
  } catch { app.querySelector(".score-table").innerHTML = `<div class="empty">Highscore kunne ikke lastes akkurat nå.</div>`; }
}

document.querySelector("#home-button").addEventListener("click", renderHome);
document.querySelector("#scores-button").addEventListener("click", () => renderLeaderboard());
renderHome();

if (!isConfigured) console.info("Utne Quiz bruker lokal resultatlagring til Supabase er konfigurert.");
