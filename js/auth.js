import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

const SESSION_KEY = "utne-quiz-session-v1";
// The generated address is only an internal Supabase identifier. It is never
// shown to the student and no email is sent.
const USER_DOMAIN = "utneapps.no";
let currentSession = null;

export function normalizeUsername(value) {
  return String(value || "").normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase("nb-NO");
}

export function isValidUsername(value) {
  const username = String(value || "").normalize("NFC").trim().replace(/\s+/g, " ");
  return username.length >= 2
    && username.length <= 24
    && /^[\p{L}\p{N}][\p{L}\p{N} ._-]*[\p{L}\p{N}]$/u.test(username);
}

export function isValidPin(value) {
  return /^\d{6}$/.test(String(value || ""));
}

async function usernameEmail(username) {
  const bytes = new TextEncoder().encode(normalizeUsername(username));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `u-${hash.slice(0, 40)}@${USER_DOMAIN}`;
}

function authHeaders(accessToken) {
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    "Content-Type": "application/json",
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
  };
}

function saveSession(payload) {
  currentSession = {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    expires_at: Date.now() + (Number(payload.expires_in) || 3600) * 1000,
    user: payload.user
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(currentSession));
  return currentSession;
}

function clearSession() {
  currentSession = null;
  localStorage.removeItem(SESSION_KEY);
}

async function authRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
    ...options,
    headers: { ...authHeaders(options.accessToken), ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.msg || payload.message || payload.error_description || "Innloggingen mislyktes.");
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function refreshSession() {
  if (!currentSession?.refresh_token) return null;
  try {
    const payload = await authRequest("token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: currentSession.refresh_token })
    });
    return saveSession(payload);
  } catch {
    clearSession();
    return null;
  }
}

export async function restoreSession() {
  try { currentSession = JSON.parse(localStorage.getItem(SESSION_KEY)); }
  catch { clearSession(); }
  if (!currentSession?.access_token) return null;
  if (currentSession.expires_at < Date.now() + 60_000) return refreshSession();
  try {
    const user = await authRequest("user", { method: "GET", accessToken: currentSession.access_token });
    currentSession.user = user;
    localStorage.setItem(SESSION_KEY, JSON.stringify(currentSession));
    return currentSession;
  } catch {
    return refreshSession();
  }
}

async function loginWithPassword(username, password) {
  const email = await usernameEmail(username);
  const payload = await authRequest("token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });
  return saveSession(payload);
}

export async function login(username, pin) {
  if (!isValidUsername(username) || !isValidPin(pin)) throw new Error("Kontroller brukernavn og sekssifret PIN.");
  try { return await loginWithPassword(username, pin); }
  catch { throw new Error("Feil brukernavn eller PIN."); }
}

export async function loginTeacher(username, password) {
  if (!isValidUsername(username) || String(password || "").length < 10) throw new Error("Kontroller lærerbrukernavn og passord.");
  try { return await loginWithPassword(username, password); }
  catch { throw new Error("Feil lærerbrukernavn eller passord."); }
}

export async function changePassword(password) {
  if (String(password || "").length < 12) throw new Error("Passordet må ha minst 12 tegn.");
  const payload = await authRequest("user", {
    method: "PUT",
    accessToken: await getAccessToken(),
    body: JSON.stringify({ password })
  });
  currentSession.user = payload;
  localStorage.setItem(SESSION_KEY, JSON.stringify(currentSession));
}

export async function logout() {
  if (currentSession?.access_token) {
    await authRequest("logout", { method: "POST", accessToken: currentSession.access_token }).catch(() => {});
  }
  clearSession();
}

export async function getAccessToken() {
  if (!currentSession) return null;
  if (currentSession.expires_at < Date.now() + 60_000) await refreshSession();
  return currentSession?.access_token || null;
}

export function getCurrentUser() {
  return currentSession?.user || null;
}
