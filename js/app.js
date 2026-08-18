import { subjects, quizzes } from "../data/subjects.js";
import { createRound } from "./quiz-engine.js";
import { answerPoints, perfectRoundBonus } from "./scoring.js";
import { createBonusState, resolveCorrectBonus, registerMiss, consumeMultiplier } from "./bonuses.js";
import { saveResult, getLeaderboard, getPlayerStats, getProfile, isConfigured } from "./database.js";
import { restoreSession, login, loginTeacher, logout, changePassword, getCurrentUser } from "./auth.js";
import { isTeacher, listStudents, createStudents, resetStudentPin, deleteStudent, getStudentResults, summarizeStudentResults, listGroups, createGroup, setGroupMembers, deleteGroup } from "./admin.js?v=4";

const app = document.querySelector("#app");
const scoresButton = document.querySelector("#scores-button");
const accountButton = document.querySelector("#account-button");
const state = { profile: null, teacher: false, subject: null, quizMeta: quizzes[0], quiz: null, player: "", round: [], index: 0, score: 0, correct: 0, streak: 0, bestStreak: 0, answered: false, bonuses: createBonusState(), students: [], groups: [] };
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));

function setView(html) { app.innerHTML = html; window.scrollTo({ top: 0, behavior: "smooth" }); }
function quizForSubject(id) { return quizzes.filter((quiz) => quiz.subjectId === id); }

function syncHeader() {
  const loggedIn = Boolean(state.profile || state.teacher);
  scoresButton.hidden = !state.profile;
  accountButton.hidden = !loggedIn;
  accountButton.textContent = state.teacher ? "Lærer · Logg ut" : state.profile ? `${state.profile.username} · Logg ut` : "";
}

function renderAuth(message = "") {
  state.profile = null;
  state.teacher = false;
  syncHeader();
  setView(`<section class="auth-layout"><section class="auth-intro"><p class="eyebrow">Din egen quizprofil</p><h1>Spill trygt.<br><span class="accent">Behold rekorden.</span></h1><p class="lead">Læreren oppretter kontoen din. Resultatene knyttes til din bruker, så ingen andre kan registrere poeng under navnet ditt.</p><div class="trust-note"><strong>🔒 Ingen e-post nødvendig</strong><span>Du får brukernavn og en sekssifret PIN av læreren.</span></div></section><section class="panel auth-panel"><p class="eyebrow">Velkommen tilbake</p><h2>Elevinnlogging</h2><form id="auth-form" class="auth-form"><label for="username">Brukernavn</label><input id="username" maxlength="24" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="Brukernavnet fra læreren"><label for="pin">PIN-kode</label><input id="pin" class="pin-input" inputmode="numeric" pattern="[0-9]{6}" minlength="6" maxlength="6" autocomplete="current-password" required placeholder="6 tall"><p class="hint">Har du glemt PIN-koden? Be læreren lage en ny.</p><div class="form-message ${message ? "error" : ""}" id="form-message" role="status">${escapeHtml(message)}</div><button class="primary full-width" id="auth-submit" type="submit">Logg inn</button></form><button class="teacher-link" id="teacher-login" type="button">Lærerinnlogging</button></section></section>`);
  app.querySelector("#pin").addEventListener("input", (event) => { event.target.value = event.target.value.replace(/\D/g, "").slice(0, 6); });
  app.querySelector("#auth-form").addEventListener("submit", handleAuth);
  app.querySelector("#teacher-login").addEventListener("click", () => renderTeacherLogin());
}

async function handleAuth(event) {
  event.preventDefault();
  const username = app.querySelector("#username").value.trim();
  const pin = app.querySelector("#pin").value;
  const message = app.querySelector("#form-message");
  const submit = app.querySelector("#auth-submit");
  submit.disabled = true;
  submit.textContent = "Logger inn …";
  message.textContent = "";
  try {
    await login(username, pin);
    state.profile = await getProfile();
    if (!state.profile) throw new Error("Denne kontoen er ikke opprettet av læreren.");
    state.player = state.profile.username;
    syncHeader();
    renderHome();
  } catch (error) {
    message.textContent = error.message || "Noe gikk galt. Prøv igjen.";
    message.className = "form-message error";
    submit.disabled = false;
    submit.textContent = "Logg inn";
  }
}

function renderTeacherLogin(message = "") {
  state.profile = null;
  state.teacher = false;
  syncHeader();
  setView(`<button class="back" id="back-to-student" type="button">← Elevinnlogging</button><section class="panel auth-panel teacher-login-panel"><p class="eyebrow">For læreren</p><h2>Lærerinnlogging</h2><p class="topic-summary">Her oppretter du elevkontoer og lager nye PIN-koder.</p><form id="teacher-auth-form" class="auth-form"><label for="teacher-username">Lærerbrukernavn</label><input id="teacher-username" maxlength="24" autocomplete="username" autocapitalize="none" required><label for="teacher-password">Passord</label><input id="teacher-password" type="password" autocomplete="current-password" minlength="10" required><div class="form-message ${message ? "error" : ""}" id="form-message" role="status">${escapeHtml(message)}</div><button class="primary full-width" id="teacher-submit" type="submit">Logg inn som lærer</button></form></section>`);
  app.querySelector("#back-to-student").addEventListener("click", () => renderAuth());
  app.querySelector("#teacher-auth-form").addEventListener("submit", handleTeacherAuth);
}

async function handleTeacherAuth(event) {
  event.preventDefault();
  const username = app.querySelector("#teacher-username").value.trim();
  const password = app.querySelector("#teacher-password").value;
  const submit = app.querySelector("#teacher-submit");
  const message = app.querySelector("#form-message");
  submit.disabled = true;
  submit.textContent = "Logger inn …";
  try {
    await loginTeacher(username, password);
    if (!await isTeacher()) throw new Error("Denne kontoen har ikke lærertilgang.");
    state.teacher = true;
    syncHeader();
    await renderTeacherAdmin();
  } catch (error) {
    await logout();
    message.textContent = error.message || "Kunne ikke logge inn som lærer.";
    message.className = "form-message error";
    submit.disabled = false;
    submit.textContent = "Logg inn som lærer";
  }
}

function credentialRows(accounts) {
  return accounts.map((account) => `<tr><td>${escapeHtml(account.username)}</td><td class="pin-cell">${escapeHtml(account.pin)}</td></tr>`).join("");
}

async function renderTeacherAdmin(created = []) {
  if (!state.teacher) return renderTeacherLogin();
  setView(`<section class="teacher-admin">
    <div class="section-head"><div><p class="eyebrow">Lærerside</p><h2>Elever og grupper</h2><p>Opprett elevkontoer og organiser dem i faggrupper.</p></div></div>
    <section class="admin-grid">
      <div class="panel admin-panel"><h3>Opprett elever</h3><form id="create-students-form"><label for="student-names">Elevnavn eller elevkoder</label><textarea id="student-names" rows="8" maxlength="1500" placeholder="Per 10D\nSara 10D\nElev 14" required></textarea><p class="hint">Bruk gjerne elevkoder dersom navn ikke skal lagres.</p><div class="form-message" id="create-message" role="status"></div><button class="primary full-width" id="create-students" type="submit">Opprett kontoer</button></form></div>
      <div class="panel admin-panel"><h3>Bytt lærerpassord</h3><form id="password-form"><label for="new-teacher-password">Nytt passord</label><input id="new-teacher-password" type="password" minlength="12" autocomplete="new-password" required><p class="hint">Minst 12 tegn. Bruk et passord bare du kjenner.</p><div class="form-message" id="password-message" role="status"></div><button class="secondary full-width" type="submit">Lagre nytt passord</button></form></div>
    </section>
    ${created.length ? `<section class="credentials print-area"><div class="section-head"><div><p class="eyebrow">Nye kontoer</p><h3>Skriv ut eller del ut</h3></div><button class="secondary no-print" id="print-accounts" type="button">Skriv ut</button></div><table><thead><tr><th>Brukernavn</th><th>PIN</th></tr></thead><tbody>${credentialRows(created)}</tbody></table><p class="credential-warning">PIN-kodene vises bare nå. Skriv ut listen før du går videre.</p></section>` : ""}
    <section class="group-section">
      <div class="section-head"><div><p class="eyebrow">Faggrupper</p><h3>Grupper</h3><p>Lag en tom gruppe, eller kopier elevene fra en gruppe du allerede har.</p></div></div>
      <div class="group-layout">
        <form id="create-group-form" class="group-create-card">
          <label for="group-name">Navn på ny gruppe</label>
          <input id="group-name" maxlength="60" required placeholder="Naturfag 10D">
          <label for="group-students">Elever i gruppen</label>
          <textarea id="group-students" rows="5" maxlength="1500" placeholder="Per 10D\nSara 10D\nElev 14"></textarea>
          <p class="hint">Én elev per linje. Nye elevkontoer og PIN-koder opprettes automatisk. Elever som finnes fra før, legges bare til.</p>
          <label for="source-group">Kopier elever fra</label>
          <select id="source-group"><option value="">Ingen – start med tom gruppe</option></select>
          <p class="hint">Du kan både kopiere en gruppe og legge til flere navn. Originalgruppen beholdes uendret.</p>
          <div class="form-message" id="group-message" role="status"></div>
          <button class="primary full-width" id="create-group" type="submit">Opprett gruppe</button>
        </form>
        <div id="group-list" class="student-list group-list"><div class="empty">Henter grupper …</div></div>
      </div>
      <section id="group-members-panel" class="group-members-panel" hidden></section>
    </section>
    <section class="student-list-section"><div class="section-head"><div><p class="eyebrow">Administrer</p><h3>Opprettede elever</h3></div></div><div id="student-list" class="student-list"><div class="empty">Henter elever …</div></div></section>
    <section id="student-results-panel" class="student-results-panel" hidden></section>
  </section>`);
  app.querySelector("#create-students-form").addEventListener("submit", handleCreateStudents);
  app.querySelector("#password-form").addEventListener("submit", handlePasswordChange);
  app.querySelector("#create-group-form").addEventListener("submit", handleCreateGroup);
  app.querySelector("#print-accounts")?.addEventListener("click", () => window.print());
  await Promise.all([refreshStudentList(), refreshGroupList()]);
}

async function handleCreateStudents(event) {
  event.preventDefault();
  const names = app.querySelector("#student-names").value.split("\n").map((name) => name.trim()).filter(Boolean);
  const button = app.querySelector("#create-students");
  const message = app.querySelector("#create-message");
  if (!names.length) return;
  button.disabled = true;
  button.textContent = "Oppretter …";
  try {
    const accounts = await createStudents(names);
    await renderTeacherAdmin(accounts);
  } catch (error) {
    message.textContent = error.message;
    message.className = "form-message error";
    button.disabled = false;
    button.textContent = "Opprett kontoer";
  }
}

async function handlePasswordChange(event) {
  event.preventDefault();
  const password = app.querySelector("#new-teacher-password").value;
  const message = app.querySelector("#password-message");
  try {
    await changePassword(password);
    event.target.reset();
    message.textContent = "Passordet er endret.";
    message.className = "form-message success";
  } catch (error) {
    message.textContent = error.message;
    message.className = "form-message error";
  }
}

async function refreshStudentList() {
  const container = app.querySelector("#student-list");
  try {
    const students = await listStudents();
    state.students = students;
    container.innerHTML = students.length ? students.map((student) => `<div class="student-row"><div><strong>${escapeHtml(student.username)}</strong><span>Opprettet ${new Date(student.created_at).toLocaleDateString("nb-NO")}</span></div><div class="student-actions"><button class="primary view-results" data-id="${student.id}" type="button">Se resultater</button><button class="secondary reset-pin" data-id="${student.id}" type="button">Ny PIN</button><button class="danger delete-student" data-id="${student.id}" data-name="${escapeHtml(student.username)}" type="button">Slett</button></div></div>`).join("") : '<div class="empty">Ingen elevkontoer ennå.</div>';
    container.querySelectorAll(".view-results").forEach((button) => button.addEventListener("click", () => handleViewResults(button)));
    container.querySelectorAll(".reset-pin").forEach((button) => button.addEventListener("click", () => handleResetPin(button)));
    container.querySelectorAll(".delete-student").forEach((button) => button.addEventListener("click", () => handleDeleteStudent(button)));
  } catch { container.innerHTML = '<div class="empty">Kunne ikke hente elevlisten.</div>'; }
}

async function refreshGroupList() {
  const container = app.querySelector("#group-list");
  const source = app.querySelector("#source-group");
  if (!container || !source) return;
  try {
    state.groups = await listGroups();
    source.innerHTML = `<option value="">Ingen – start med tom gruppe</option>${state.groups.map((group) => `<option value="${group.id}">${escapeHtml(group.name)} (${group.members.length})</option>`).join("")}`;
    container.innerHTML = state.groups.length ? state.groups.map((group) => `<div class="student-row group-row"><div><strong>${escapeHtml(group.name)}</strong><span>${group.members.length} ${group.members.length === 1 ? "elev" : "elever"}</span></div><div class="student-actions"><button class="secondary edit-group" data-id="${group.id}" type="button">Administrer</button><button class="danger delete-group" data-id="${group.id}" data-name="${escapeHtml(group.name)}" type="button">Slett</button></div></div>`).join("") : '<div class="empty">Ingen grupper ennå.</div>';
    container.querySelectorAll(".edit-group").forEach((button) => button.addEventListener("click", () => renderGroupMembers(button.dataset.id)));
    container.querySelectorAll(".delete-group").forEach((button) => button.addEventListener("click", () => handleDeleteGroup(button)));
  } catch {
    container.innerHTML = '<div class="empty">Kunne ikke hente gruppene.</div>';
  }
}

async function handleDeleteGroup(button) {
  const name = button.dataset.name;
  if (!window.confirm(`Slette gruppen «${name}»? Elevkontoene og resultatene deres beholdes.`)) return;
  button.disabled = true;
  button.textContent = "Sletter …";
  try {
    await deleteGroup(button.dataset.id);
    const panel = app.querySelector("#group-members-panel");
    panel.hidden = true;
    panel.innerHTML = "";
    await refreshGroupList();
  } catch (error) {
    window.alert(error.message || "Kunne ikke slette gruppen.");
    button.disabled = false;
    button.textContent = "Slett";
  }
}

async function handleDeleteStudent(button) {
  const name = button.dataset.name;
  if (!window.confirm(`Slette eleven «${name}» permanent? Konto, gruppemedlemskap og alle quizresultater slettes. Dette kan ikke angres.`)) return;
  button.disabled = true;
  button.textContent = "Sletter …";
  try {
    await deleteStudent(button.dataset.id);
    const resultsPanel = app.querySelector("#student-results-panel");
    resultsPanel.hidden = true;
    resultsPanel.innerHTML = "";
    await Promise.all([refreshStudentList(), refreshGroupList()]);
  } catch (error) {
    window.alert(error.message || "Kunne ikke slette eleven.");
    button.disabled = false;
    button.textContent = "Slett";
  }
}

async function handleCreateGroup(event) {
  event.preventDefault();
  const name = app.querySelector("#group-name").value.trim();
  const sourceGroupId = app.querySelector("#source-group").value;
  const usernames = app.querySelector("#group-students").value.split("\n").map((username) => username.trim()).filter(Boolean);
  const button = app.querySelector("#create-group");
  const message = app.querySelector("#group-message");
  button.disabled = true;
  button.textContent = "Oppretter …";
  message.textContent = "";
  try {
    const result = await createGroup(name, sourceGroupId, usernames);
    if (result.accounts?.length) {
      await renderTeacherAdmin(result.accounts);
      return;
    }
    event.target.reset();
    message.textContent = sourceGroupId || usernames.length ? "Gruppen er opprettet med elever." : "Gruppen er opprettet.";
    message.className = "form-message success";
    await refreshGroupList();
  } catch (error) {
    message.textContent = error.message || "Kunne ikke opprette gruppen.";
    message.className = "form-message error";
  } finally {
    button.disabled = false;
    button.textContent = "Opprett gruppe";
  }
}

function renderGroupMembers(groupId) {
  const group = state.groups.find((item) => item.id === groupId);
  const panel = app.querySelector("#group-members-panel");
  if (!group || !panel) return;
  const selected = new Set(group.members.map((member) => member.id));
  panel.hidden = false;
  panel.innerHTML = `<button class="back" id="close-group" type="button">← Lukk</button><p class="eyebrow">Administrer gruppe</p><h3>${escapeHtml(group.name)}</h3><p class="topic-summary">Kryss av elevene som skal være med i gruppen.</p><form id="group-members-form"><div class="member-grid">${state.students.length ? state.students.map((student) => `<label class="member-check"><input type="checkbox" name="group-member" value="${student.id}" ${selected.has(student.id) ? "checked" : ""}><span>${escapeHtml(student.username)}</span></label>`).join("") : '<div class="empty">Opprett elevkontoer først.</div>'}</div><div class="form-message" id="members-message" role="status"></div><button class="primary" id="save-members" type="submit">Lagre elever</button></form>`;
  panel.querySelector("#close-group").addEventListener("click", () => { panel.hidden = true; panel.innerHTML = ""; });
  panel.querySelector("#group-members-form").addEventListener("submit", (event) => handleSaveGroupMembers(event, groupId));
  panel.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function handleSaveGroupMembers(event, groupId) {
  event.preventDefault();
  const button = app.querySelector("#save-members");
  const message = app.querySelector("#members-message");
  const memberIds = [...event.target.querySelectorAll('input[name="group-member"]:checked')].map((input) => input.value);
  button.disabled = true;
  button.textContent = "Lagrer …";
  try {
    await setGroupMembers(groupId, memberIds);
    message.textContent = "Gruppen er oppdatert.";
    message.className = "form-message success";
    await refreshGroupList();
  } catch (error) {
    message.textContent = error.message || "Kunne ikke lagre gruppen.";
    message.className = "form-message error";
  } finally {
    button.disabled = false;
    button.textContent = "Lagre elever";
  }
}

function quizTitle(id) {
  return quizzes.find((quiz) => quiz.id === id)?.title || id;
}

async function handleViewResults(button) {
  const panel = app.querySelector("#student-results-panel");
  button.disabled = true;
  button.textContent = "Henter …";
  panel.hidden = false;
  panel.innerHTML = '<div class="empty">Henter resultater …</div>';
  try {
    const { student, results } = await getStudentResults(button.dataset.id);
    const summary = summarizeStudentResults(results);
    const rows = results.map((row) => `<tr><td>${new Date(row.played_at).toLocaleString("nb-NO", { dateStyle: "short", timeStyle: "short" })}</td><td>${escapeHtml(quizTitle(row.quiz_id))}</td><td>${row.correct_answers}/${row.total_questions} (${Math.round(row.correct_answers / row.total_questions * 100)} %)</td><td>${Number(row.score).toLocaleString("nb-NO")}</td><td>${row.best_streak}</td></tr>`).join("");
    panel.innerHTML = `<button class="back" id="close-results" type="button">← Lukk resultatene</button><p class="eyebrow">Elevresultater</p><h3>${escapeHtml(student.username)}</h3><div class="result-stats teacher-stats"><div class="result-stat"><strong>${summary.plays}</strong><span>runder spilt</span></div><div class="result-stat"><strong>${summary.accuracy} %</strong><span>riktig totalt</span></div><div class="result-stat"><strong>${summary.bestScore.toLocaleString("nb-NO")}</strong><span>beste poengsum</span></div><div class="result-stat"><strong>${summary.lastPlayed ? new Date(summary.lastPlayed).toLocaleDateString("nb-NO") : "–"}</strong><span>sist spilt</span></div></div>${rows ? `<div class="history-scroll"><table class="result-history"><thead><tr><th>Tidspunkt</th><th>Quiz</th><th>Riktig</th><th>Poeng</th><th>Streak</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">Eleven har ikke fullført noen quiz ennå.</div>'}`;
    panel.querySelector("#close-results").addEventListener("click", () => { panel.hidden = true; panel.innerHTML = ""; });
    panel.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    panel.innerHTML = `<div class="empty">${escapeHtml(error.message || "Kunne ikke hente resultatene.")}</div>`;
  } finally {
    button.disabled = false;
    button.textContent = "Se resultater";
  }
}

async function handleResetPin(button) {
  button.disabled = true;
  button.textContent = "Lager …";
  try {
    const result = await resetStudentPin(button.dataset.id);
    button.closest(".student-row").querySelector("div").insertAdjacentHTML("beforeend", `<span class="new-pin">Ny PIN: <b>${escapeHtml(result.pin)}</b> – skriv den ned nå</span>`);
    button.textContent = "Ny PIN laget";
  } catch {
    button.disabled = false;
    button.textContent = "Prøv igjen";
  }
}

function renderHome() {
  if (!state.profile) return renderAuth();
  state.subject = null;
  const activeSubjectCount = subjects.filter((subject) => subject.active).length;
  setView(`
    <section class="hero">
      <p class="eyebrow">Hei, ${escapeHtml(state.profile.username)}! Klar for en runde?</p>
      <h1>Lær litt.<br><span class="accent">Slå rekorden.</span></h1>
      <p class="lead">Velg et fag, test deg selv og se om du klarer å slå din egen beste poengsum.</p>
    </section>
    <section>
      <div class="section-head"><div><h2>Velg fag</h2><p>${activeSubjectCount} fag er klare nå. Flere kommer.</p></div></div>
      <div class="grid">
        ${subjects.map((subject) => { const quizCount = quizForSubject(subject.id).length; return `<button class="card ${subject.active ? "" : "disabled"}" type="button" data-subject="${subject.id}" ${subject.active ? "" : "disabled"}><span class="card-icon">${subject.icon}</span><h3>${subject.name}</h3><p>${subject.description}</p>${subject.active ? `<span class="tag">${quizCount} quiz klar</span>` : '<span class="tag">Kommer snart</span>'}</button>`; }).join("")}
      </div>
    </section>`);
  app.querySelectorAll("[data-subject]").forEach((button) => button.addEventListener("click", () => renderTopics(button.dataset.subject)));
}

function renderTopics(subjectId) {
  if (!state.profile) return renderAuth();
  state.subject = subjects.find((item) => item.id === subjectId);
  const list = quizForSubject(subjectId);
  setView(`<button class="back" type="button" id="back">← Alle fag</button><div class="section-head"><div><p class="eyebrow">${state.subject.icon} Fag</p><h2>${state.subject.name}</h2><p>Velg tema og start en ny runde.</p></div></div><div class="grid">${list.map((quiz) => `<button class="card" type="button" data-quiz="${quiz.id}"><span class="card-icon">🧠</span><h3>${quiz.title}</h3><p>${quiz.description}</p><span class="tag">${quiz.questionCount} spørsmål</span></button>`).join("")}</div>`);
  app.querySelector("#back").addEventListener("click", renderHome);
  app.querySelectorAll("[data-quiz]").forEach((button) => button.addEventListener("click", () => renderStart(quizzes.find((quiz) => quiz.id === button.dataset.quiz))));
}

function renderStart(meta) {
  if (!state.profile) return renderAuth();
  state.quizMeta = meta;
  setView(`<button class="back" type="button" id="back">← Til temaene</button><section class="panel"><p class="eyebrow">${state.subject?.name || "Samfunnsfag"}</p><h2>${meta.title}</h2><p class="topic-summary">${meta.questionCount} tilfeldige spørsmål. Svarene stokkes hver gang.</p><div class="signed-player"><span>Spiller som</span><strong>${escapeHtml(state.profile.username)}</strong><span class="verified-badge">✓ Beskyttet profil</span></div><button class="primary full-width" id="start-quiz" type="button">Start quizen →</button></section>`);
  app.querySelector("#back").addEventListener("click", () => renderTopics(meta.subjectId));
  app.querySelector("#start-quiz").addEventListener("click", async () => {
    state.player = state.profile.username;
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
    [stats, leaderboard] = await Promise.all([getPlayerStats(state.quiz.id, getCurrentUser()?.id), getLeaderboard(state.quiz.id, 100)]);
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
  if (!state.profile) return renderAuth();
  setView(`<section class="leaderboard"><button class="back" id="back" type="button">← Tilbake</button><p class="eyebrow">Highscore</p><h2>${state.quizMeta.title}</h2><div class="score-table"><div class="empty">Henter resultater …</div></div></section>`);
  app.querySelector("#back").addEventListener("click", state.subject ? () => renderTopics(state.subject.id) : renderHome);
  try {
    const rows = await getLeaderboard(quizId);
    app.querySelector(".score-table").innerHTML = rows.length ? rows.map((row, index) => `<div class="score-row"><span class="rank">${index + 1}</span><div><strong>${escapeHtml(row.player_name)}</strong><div class="score-meta">${row.correct_answers}/${row.total_questions} riktige · ${Math.round(row.correct_answers / row.total_questions * 100)} % · streak ${row.best_streak}</div></div><span class="score-points">${row.score.toLocaleString("nb-NO")}</span></div>`).join("") : `<div class="empty">Ingen resultater ennå. Bli den første!</div>`;
  } catch { app.querySelector(".score-table").innerHTML = `<div class="empty">Highscore kunne ikke lastes akkurat nå.</div>`; }
}

document.querySelector("#home-button").addEventListener("click", () => state.teacher ? renderTeacherAdmin() : state.profile ? renderHome() : renderAuth());
scoresButton.addEventListener("click", () => renderLeaderboard());
accountButton.addEventListener("click", async () => { await logout(); state.profile = null; state.teacher = false; state.player = ""; renderAuth("Du er logget ut."); });

async function initialize() {
  if (!isConfigured) return renderAuth("Innloggingen er ikke konfigurert ennå.");
  try {
    const session = await restoreSession();
    state.teacher = session ? await isTeacher() : false;
    state.profile = session && !state.teacher ? await getProfile() : null;
    if (state.teacher) {
      syncHeader();
      await renderTeacherAdmin();
    } else if (state.profile) {
      state.player = state.profile.username;
      syncHeader();
      renderHome();
    } else renderAuth();
  } catch { renderAuth(); }
}

initialize();

if (!isConfigured) console.info("Utne Quiz bruker lokal resultatlagring til Supabase er konfigurert.");
