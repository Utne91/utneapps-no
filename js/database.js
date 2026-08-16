import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const LOCAL_KEY = "utne-quiz-results-v1";
const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

function localResults() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || []; }
  catch { return []; }
}

function headers() {
  return { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" };
}

function clean(result) {
  return {
    quiz_id: result.quiz_id,
    player_name: result.player_name.trim().slice(0, 24),
    score: Number(result.score),
    correct_answers: Number(result.correct_answers),
    total_questions: Number(result.total_questions),
    best_streak: Number(result.best_streak),
    played_at: result.played_at || new Date().toISOString()
  };
}

export async function saveResult(result) {
  const safe = clean(result);
  if (!isConfigured) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify([...localResults(), safe]));
    return;
  }
  const response = await fetch(`${SUPABASE_URL}/rest/v1/results`, { method: "POST", headers: { ...headers(), Prefer: "return=minimal" }, body: JSON.stringify(safe) });
  if (!response.ok) throw new Error("Kunne ikke lagre resultatet.");
}

async function getResults(quizId) {
  if (!isConfigured) return localResults().filter((row) => row.quiz_id === quizId);
  const query = new URLSearchParams({ quiz_id: `eq.${quizId}`, select: "quiz_id,player_name,score,correct_answers,total_questions,best_streak,played_at", order: "played_at.desc", limit: "500" });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/results?${query}`, { headers: headers() });
  if (!response.ok) throw new Error("Kunne ikke hente resultater.");
  return response.json();
}

export async function getLeaderboard(quizId, limit = 10) {
  const rows = await getResults(quizId);
  return rows.sort((a, b) => b.score - a.score || b.correct_answers - a.correct_answers).slice(0, limit);
}

export async function getPlayerStats(quizId, playerName) {
  const normalized = playerName.trim().toLocaleLowerCase("nb-NO");
  const rows = (await getResults(quizId)).filter((row) => row.player_name.toLocaleLowerCase("nb-NO") === normalized);
  const total = rows.reduce((sum, row) => sum + row.total_questions, 0);
  const correct = rows.reduce((sum, row) => sum + row.correct_answers, 0);
  return {
    plays: rows.length,
    total,
    correct,
    accuracy: total ? Math.round((correct / total) * 100) : 0,
    bestScore: rows.length ? Math.max(...rows.map((row) => row.score)) : 0,
    bestStreak: rows.length ? Math.max(...rows.map((row) => row.best_streak)) : 0,
    latest: rows[0] || null
  };
}

export { isConfigured };
