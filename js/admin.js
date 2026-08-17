import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";
import { getAccessToken, getCurrentUser } from "./auth.js";

async function authHeaders() {
  const accessToken = await getAccessToken();
  return {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  };
}

export async function isTeacher() {
  const user = getCurrentUser();
  if (!user) return false;
  const query = new URLSearchParams({ id: `eq.${user.id}`, select: "id", limit: "1" });
  const response = await fetch(`${SUPABASE_URL}/rest/v1/teacher_users?${query}`, { headers: await authHeaders() });
  if (!response.ok) return false;
  return (await response.json()).length === 1;
}

async function managePlayers(body) {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/manage-players`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Lærerhandlingen kunne ikke gjennomføres.");
  return payload;
}

export async function listStudents() {
  return (await managePlayers({ action: "list" })).students;
}

export async function createStudents(usernames) {
  return (await managePlayers({ action: "create", usernames })).accounts;
}

export async function resetStudentPin(id) {
  return managePlayers({ action: "reset_pin", id });
}
