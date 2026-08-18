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

export async function deleteStudent(id) {
  return managePlayers({ action: "delete_student", id });
}

export async function getStudentResults(id) {
  return managePlayers({ action: "student_results", id });
}

export async function listGroups() {
  return (await managePlayers({ action: "list_groups" })).groups;
}

export async function getGroupResults(groupId) {
  return managePlayers({ action: "group_results", group_id: groupId });
}

export async function createGroup(name, sourceGroupId = "", usernames = []) {
  return managePlayers({ action: "create_group", name, source_group_id: sourceGroupId || null, usernames });
}

export async function setGroupMembers(groupId, memberIds) {
  return managePlayers({ action: "set_group_members", group_id: groupId, member_ids: memberIds });
}

export async function deleteGroup(groupId) {
  return managePlayers({ action: "delete_group", group_id: groupId });
}

export function summarizeStudentResults(results) {
  const plays = results.length;
  const correct = results.reduce((sum, row) => sum + Number(row.correct_answers), 0);
  const total = results.reduce((sum, row) => sum + Number(row.total_questions), 0);
  return {
    plays,
    accuracy: total ? Math.round((correct / total) * 100) : 0,
    bestScore: plays ? Math.max(...results.map((row) => Number(row.score))) : 0,
    lastPlayed: plays ? results[0].played_at : null
  };
}

export function summarizeGroupResults(members, results, selectedIds, quizId) {
  const memberIds = new Set(members.map((member) => member.id));
  const selected = new Set(selectedIds.filter((id) => memberIds.has(id)));
  const relevant = results.filter((row) => selected.has(row.user_id) && row.quiz_id === quizId);
  const completed = new Set(relevant.map((row) => row.user_id)).size;
  const correct = relevant.reduce((sum, row) => sum + Number(row.correct_answers), 0);
  const total = relevant.reduce((sum, row) => sum + Number(row.total_questions), 0);
  return {
    selected: selected.size,
    completed,
    plays: relevant.length,
    accuracy: total ? Math.round((correct / total) * 100) : 0
  };
}
