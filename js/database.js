import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";
import { getAccessToken, getCurrentUser } from "./auth.js";

const LOCAL_KEY = "utne-quiz-results-v1";
const isConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

function localResults() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY)) || []; }
  catch { return []; }
}

async function headers() {
  const accessToken = await getAccessToken();
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
  };
}

function clean(result) {
  return {
    quiz_id: result.quiz_id,
    player_name: result.player_name.trim().slice(0, 24),
    user_id: result.user_id,
    score: Number(result.score),
    correct_answers: Number(result.correct_answers),
    total_questions: Number(result.total_questions),
    best_streak: Number(result.best_streak),
    played_at: result.played_at || new Date().toISOString()
  };
}

export async function saveResult(result) {
  const user = getCurrentUser();
  if (isConfigured && !user) throw new Error("Du må være logget inn for å lagre resultatet.");
  const safe = clean({ ...result, user_id: user?.id || result.user_id });
  if (!isConfigured) {
    localStorage.setItem(LOCAL_KEY, JSON.stringify([...localResults(), safe]));
    return;
  }
  const response = await fetch(`${SUPABASE_URL}/rest/v1/results`, { method: "POST", headers: { ...(await headers()), Prefer: "return=minimal" }, body: JSON.stringify(safe) });
  if (!response.ok) throw new Error("Kunne ikke lagre resultatet.");
}

async function getResults(quizId) {
  if (!isConfigured) return localResults().filter((row) => row.quiz_id === quizId);
  const query = new URLSearchParams({ quiz_id: `eq.${quizId}`, select: "quiz_id,player_name,user_id,score,correct_answers,total_questions,best_streak,played_at", order: "played_at.desc", limit: "500" });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/results?${query}`, { headers: await headers() });
  if (!response.ok) throw new Error("Kunne ikke hente resultater.");
  return response.json();
}

export async function getLeaderboard(quizId, limit = 10) {
  const rows = await getResults(quizId);
  return rows.sort((a, b) => b.score - a.score || b.correct_answers - a.correct_answers).slice(0, limit);
}

export async function getPlayerStats(quizId, userId) {
  const rows = (await getResults(quizId)).filter((row) => row.user_id === userId);
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

export async function getProfile() {
  const user = getCurrentUser();
  if (!user) return null;
  const query = new URLSearchParams({ id: `eq.${user.id}`, select: "id,username,created_at", limit: "1" });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles?${query}`, { headers: await headers() });
  if (!response.ok) throw new Error("Kunne ikke hente elevprofilen.");
  const rows = await response.json();
  return rows[0] || null;
}

export async function ensureProfile(username) {
  const existing = await getProfile();
  if (existing) return existing;
  const user = getCurrentUser();
  if (!user) throw new Error("Du må være logget inn.");
  const profile = { id: user.id, username: username.normalize("NFC").trim().replace(/\s+/g, " ").slice(0, 24) };
  const response = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
    method: "POST",
    headers: { ...(await headers()), Prefer: "return=representation" },
    body: JSON.stringify(profile)
  });
  if (!response.ok) throw new Error("Brukernavnet er allerede i bruk.");
  const rows = await response.json();
  return rows[0];
}

export { isConfigured };
