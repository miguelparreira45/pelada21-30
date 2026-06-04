const TEAM_META = {
  blue: { name: "Azul", color: "#2f7dff" },
  red: { name: "Vermelho", color: "#ff4848" },
  green: { name: "Verde", color: "#1dc679" }
};

const MATCH_SECONDS = 7 * 60;
const STORE_KEY = "peladafast-store-v2";
const PHONE_REPORT = "5521974381772";

let store = loadStore();
let profile = null;
let draft = null;
let timerId = null;
let pendingRecovery = null;

const els = {
  authShell: document.querySelector("#authShell"),
  appShell: document.querySelector("#appShell"),
  authMessage: document.querySelector("#authMessage"),
  loginForm: document.querySelector("#loginForm"),
  registerForm: document.querySelector("#registerForm"),
  recoverForm: document.querySelector("#recoverForm"),
  resetForm: document.querySelector("#resetForm"),
  profileUser: document.querySelector("#profileUser"),
  profileName: document.querySelector("#profileName"),
  gameTab: document.querySelector("#gameTab"),
  dataTab: document.querySelector("#dataTab"),
  setupView: document.querySelector("#setupView"),
  matchView: document.querySelector("#matchView"),
  endedView: document.querySelector("#endedView"),
  finalView: document.querySelector("#finalView"),
  teamsGrid: document.querySelector("#teamsGrid"),
  drawMatch: document.querySelector("#drawMatch"),
  leftPanel: document.querySelector("#leftPanel"),
  rightPanel: document.querySelector("#rightPanel"),
  timer: document.querySelector("#timer"),
  startCountdown: document.querySelector("#startCountdown"),
  endTimedMatch: document.querySelector("#endTimedMatch"),
  matchLabel: document.querySelector("#matchLabel"),
  benchStrip: document.querySelector("#benchStrip"),
  goalForm: document.querySelector("#goalForm"),
  goalTeam: document.querySelector("#goalTeam"),
  goalPlayer: document.querySelector("#goalPlayer"),
  assistPlayer: document.querySelector("#assistPlayer"),
  runningSummary: document.querySelector("#runningSummary"),
  statsList: document.querySelector("#statsList"),
  resultBand: document.querySelector("#resultBand"),
  winnerChoice: document.querySelector("#winnerChoice"),
  nextMatch: document.querySelector("#nextMatch"),
  finishSession: document.querySelector("#finishSession"),
  dataGrid: document.querySelector("#dataGrid"),
  newSession: document.querySelector("#newSession"),
  logoutButton: document.querySelector("#logoutButton"),
  confettiCanvas: document.querySelector("#confettiCanvas")
};

function loadStore() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || { profiles: [], activeProfileId: null };
  } catch {
    return { profiles: [], activeProfileId: null };
  }
}

function saveStore() {
  if (profile && draft) {
    profile.draft = draft;
  }
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
}

function newDraft() {
  return {
    teams: {
      blue: { players: [] },
      red: { players: [] },
      green: { players: [] }
    },
    playerStats: {},
    completedMatches: [],
    matchNumber: 0,
    currentMatch: null,
    finishedMatch: null,
    finalSummary: null,
    mode: "setup",
    startedAt: new Date().toISOString()
  };
}

function normalizeUsername(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._]/g, "");
}

function onlyDigits(value) {
  return value.replace(/\D/g, "");
}

async function hashPassword(password) {
  const data = new TextEncoder().encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((item) => item.toString(16).padStart(2, "0")).join("");
}

function setAuthMessage(message, isError = false) {
  els.authMessage.textContent = message;
  els.authMessage.style.color = isError ? "#ff7777" : "var(--green)";
}

function showAuthTab(tab) {
  document.querySelectorAll("[data-auth-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.authTab === tab);
  });
  [els.loginForm, els.registerForm, els.recoverForm, els.resetForm].forEach((form) => form.classList.add("hidden"));
  if (tab === "login") els.loginForm.classList.remove("hidden");
  if (tab === "register") els.registerForm.classList.remove("hidden");
  if (tab === "recover") els.recoverForm.classList.remove("hidden");
  setAuthMessage("");
}

function showAppTab(tab) {
  document.querySelectorAll("[data-app-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.appTab === tab);
  });
  els.gameTab.classList.toggle("hidden", tab !== "game");
  els.dataTab.classList.toggle("hidden", tab !== "data");
  if (tab === "data") renderData();
}

function teamKeys() {
  return Object.keys(TEAM_META);
}

function activeTeamKeys() {
  return draft.currentMatch?.playing || draft.finishedMatch?.playing || [];
}

function benchTeamKey() {
  return draft.currentMatch?.bench || draft.finishedMatch?.bench;
}

function playerId(teamKey, name) {
  return `${teamKey}:${name.trim().toLowerCase()}`;
}

function ensurePlayerStats(teamKey, name) {
  const id = playerId(teamKey, name);
  if (!draft.playerStats[id]) {
    draft.playerStats[id] = { id, name, teamKey, goals: 0, assists: 0, wins: 0 };
  }
  return draft.playerStats[id];
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatClock(seconds) {
  const safe = Math.max(0, seconds);
  const min = String(Math.floor(safe / 60)).padStart(2, "0");
  const sec = String(safe % 60).padStart(2, "0");
  return `${min}:${sec}`;
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

async function registerProfile(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const username = normalizeUsername(form.get("username"));
  const email = form.get("email").trim().toLowerCase();
  const phone = onlyDigits(form.get("phone"));
  const peladaName = form.get("peladaName").trim();
  const password = form.get("password");

  if (!username || username !== form.get("username").trim()) {
    setAuthMessage("Use um usuario em minusculo, sem espacos, como no Instagram.", true);
    return;
  }

  const duplicate = store.profiles.some((item) =>
    item.username === username || item.email === email || item.phone === phone
  );
  if (duplicate) {
    setAuthMessage("Ja existe perfil com esse usuario, email ou WhatsApp.", true);
    return;
  }

  const newProfile = {
    id: crypto.randomUUID(),
    peladaName,
    username,
    email,
    phone,
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
    sessions: [],
    draft: newDraft()
  };

  store.profiles.push(newProfile);
  store.activeProfileId = newProfile.id;
  saveStore();
  enterProfile(newProfile);
}

async function loginProfile(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const username = normalizeUsername(form.get("username"));
  const passwordHash = await hashPassword(form.get("password"));
  const found = store.profiles.find((item) => item.username === username && item.passwordHash === passwordHash);

  if (!found) {
    setAuthMessage("Usuario ou senha incorretos.", true);
    return;
  }

  store.activeProfileId = found.id;
  saveStore();
  enterProfile(found);
}

function recoverProfile(event) {
  event.preventDefault();
  const identity = new FormData(event.currentTarget).get("identity").trim().toLowerCase();
  const digits = onlyDigits(identity);
  const found = store.profiles.find((item) =>
    item.username === normalizeUsername(identity) || item.email === identity || item.phone === digits
  );

  if (!found) {
    setAuthMessage("Nenhum perfil encontrado com esses dados.", true);
    return;
  }

  const code = String(Math.floor(1000 + Math.random() * 9000));
  pendingRecovery = { profileId: found.id, code, expiresAt: Date.now() + 10 * 60 * 1000 };
  const text = `Codigo de recuperacao PeladaFast: ${code}`;
  window.open(`https://wa.me/55${found.phone}?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
  els.recoverForm.classList.add("hidden");
  els.resetForm.classList.remove("hidden");
  setAuthMessage("Codigo enviado para o WhatsApp cadastrado.");
}

async function resetPassword(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const code = form.get("code").trim();
  if (!pendingRecovery || pendingRecovery.expiresAt < Date.now() || pendingRecovery.code !== code) {
    setAuthMessage("Codigo invalido ou expirado.", true);
    return;
  }

  const found = store.profiles.find((item) => item.id === pendingRecovery.profileId);
  found.passwordHash = await hashPassword(form.get("password"));
  pendingRecovery = null;
  saveStore();
  showAuthTab("login");
  setAuthMessage("Senha alterada. Pode entrar.");
}

function enterProfile(nextProfile) {
  profile = nextProfile;
  draft = profile.draft || newDraft();
  draft.completedMatches ||= [];
  draft.playerStats ||= {};
  els.authShell.classList.add("hidden");
  els.appShell.classList.remove("hidden");
  els.profileUser.textContent = `@${profile.username}`;
  els.profileName.textContent = profile.peladaName;
  showAppTab("game");
  render();
}

function logout() {
  clearInterval(timerId);
  profile = null;
  draft = null;
  store.activeProfileId = null;
  saveStore();
  els.appShell.classList.add("hidden");
  els.authShell.classList.remove("hidden");
  showAuthTab("login");
}

function render() {
  clearInterval(timerId);
  timerId = null;
  if (!profile || !draft) return;

  els.setupView.classList.toggle("hidden", draft.mode !== "setup");
  els.matchView.classList.toggle("hidden", draft.mode !== "match");
  els.endedView.classList.toggle("hidden", draft.mode !== "ended");
  els.finalView.classList.toggle("hidden", draft.mode !== "final");

  renderSetup();
  if (draft.currentMatch) renderMatch();
  if (draft.finishedMatch) renderEnded();
  if (draft.finalSummary) renderFinalSummary();
  saveStore();
}

function renderSetup() {
  els.teamsGrid.innerHTML = teamKeys().map((key) => {
    const meta = TEAM_META[key];
    const players = draft.teams[key].players;
    const list = players.length
      ? players.map((name) => `
          <div class="player-pill">
            <span>${escapeHtml(name)}</span>
            <button class="remove-player" data-team="${key}" data-player="${escapeHtml(name)}" title="Remover ${escapeHtml(name)}">x</button>
          </div>
        `).join("")
      : "<p>Nenhum jogador</p>";

    return `
      <article class="team-card" style="--team-color: ${meta.color}">
        <div class="team-title"><span class="swatch"></span><h3>${meta.name}</h3></div>
        <form class="player-form" data-team-form="${key}">
          <input name="player" placeholder="Nome do jogador" autocomplete="off">
          <button class="icon-button" title="Adicionar jogador">+</button>
        </form>
        <div class="player-list">${list}</div>
      </article>
    `;
  }).join("");

  els.drawMatch.disabled = !teamKeys().every((key) => draft.teams[key].players.length > 0);
}

function renderMatch() {
  const match = draft.currentMatch;
  const [left, right] = match.playing;
  els.matchLabel.textContent = `Partida ${draft.matchNumber}`;
  els.leftPanel.style.setProperty("--team-color", TEAM_META[left].color);
  els.rightPanel.style.setProperty("--team-color", TEAM_META[right].color);
  els.leftPanel.innerHTML = renderTeamPanel(left);
  els.rightPanel.innerHTML = renderTeamPanel(right);
  els.timer.textContent = formatClock(match.remaining);
  els.startCountdown.classList.toggle("hidden", match.isRunning || match.isTimeUp);
  els.endTimedMatch.classList.toggle("hidden", !match.isTimeUp);
  renderBench();
  renderGoalForm();
  renderStats();
  startTimer();
}

function renderTeamPanel(teamKey) {
  const meta = TEAM_META[teamKey];
  const score = draft.currentMatch.score[teamKey];
  const players = draft.teams[teamKey].players.map((player) => `<span class="mini-pill">${escapeHtml(player)}</span>`).join("");
  return `
    <p class="eyebrow">Time ${meta.name}</p>
    <div class="score" data-score-team="${teamKey}">${score}</div>
    <div class="players-mini">${players}</div>
  `;
}

function renderBench() {
  const bench = TEAM_META[benchTeamKey()];
  els.benchStrip.innerHTML = `
    <span class="bench-name">Time de fora</span>
    <span class="bench-team"><span class="swatch" style="background: ${bench.color}"></span>${bench.name}</span>
  `;
}

function renderGoalForm() {
  const active = activeTeamKeys();
  const canRegisterGoal = Boolean(draft.currentMatch?.isRunning || draft.currentMatch?.isTimeUp);
  els.goalTeam.innerHTML = active.map((key) => `<option value="${key}">${TEAM_META[key].name}</option>`).join("");
  if (!active.includes(els.goalTeam.value)) els.goalTeam.value = active[0];
  fillPlayerOptions();
  els.goalForm.querySelectorAll("select, button").forEach((field) => {
    field.disabled = !canRegisterGoal;
  });
}

function fillPlayerOptions() {
  const teamKey = els.goalTeam.value;
  const players = draft.teams[teamKey]?.players || [];
  els.goalPlayer.innerHTML = players.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
  els.assistPlayer.innerHTML = `<option value="">Sem assistencia</option>` + players.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
}

function renderStats() {
  const stats = Object.values(draft.playerStats)
    .filter((item) => item.goals || item.assists || item.wins)
    .sort((a, b) => (b.goals + b.assists + b.wins) - (a.goals + a.assists + a.wins));

  if (!stats.length) {
    els.runningSummary.textContent = "Nenhum gol marcado ainda.";
    els.statsList.innerHTML = "";
    return;
  }

  const totalGoals = stats.reduce((sum, item) => sum + item.goals, 0);
  els.runningSummary.textContent = `${totalGoals} gol${totalGoals === 1 ? "" : "s"} nesta pelada.`;
  els.statsList.innerHTML = stats.map((item) => `
    <div class="stat-row">
      <strong>${escapeHtml(item.name)} <small>(${TEAM_META[item.teamKey].name})</small></strong>
      <span>${item.goals} G / ${item.assists} A / ${item.wins} V</span>
    </div>
  `).join("");
}

function renderEnded() {
  const match = draft.finishedMatch;
  const scoreLine = match.playing.map((key) => `${TEAM_META[key].name} ${match.score[key]}`).join(" x ");
  const winner = match.winner ? TEAM_META[match.winner].name : null;
  els.resultBand.innerHTML = `
    <p class="eyebrow">Partida ${draft.matchNumber} encerrada</p>
    <h2>${scoreLine}</h2>
    <p>${winner ? `Vencedor: ${winner}` : "Empate no tempo. Escolha quem fica para iniciar a proxima partida."}</p>
  `;

  const needsWinner = !match.winner;
  els.winnerChoice.classList.toggle("hidden", !needsWinner);
  els.nextMatch.disabled = needsWinner;
  if (needsWinner) {
    els.winnerChoice.innerHTML = `
      <h3>Quem fica?</h3>
      <div class="choice-buttons">
        ${match.playing.map((key) => `<button class="secondary-action" data-winner="${key}">${TEAM_META[key].name}</button>`).join("")}
      </div>
    `;
  } else {
    els.winnerChoice.innerHTML = "";
  }
}

function renderFinalSummary() {
  const summary = draft.finalSummary;
  els.finalView.innerHTML = `
    <p class="eyebrow">Pelada finalizada</p>
    <h2>${escapeHtml(summary.winnerTeam.label)}</h2>
    <div class="leader-grid">
      <div class="leader-box"><span>Time vitorioso</span><strong>${escapeHtml(summary.winnerTeam.label)}</strong></div>
      <div class="leader-box"><span>Artilheiro do dia</span><strong>${escapeHtml(summary.topScorer.label)}</strong></div>
      <div class="leader-box"><span>Garcom do dia</span><strong>${escapeHtml(summary.topAssistant.label)}</strong></div>
    </div>
    <div class="next-actions">
      <button class="primary-action big" id="freshSession">Nova pelada</button>
      <button class="secondary-action" id="openDataFromFinal">Ver dados</button>
    </div>
  `;
  document.querySelector("#freshSession").addEventListener("click", resetDraft);
  document.querySelector("#openDataFromFinal").addEventListener("click", () => showAppTab("data"));
}

function startTimer() {
  if (draft.mode !== "match" || !draft.currentMatch?.isRunning) return;
  timerId = setInterval(() => {
    if (!draft.currentMatch) return clearInterval(timerId);
    draft.currentMatch.remaining -= 1;
    if (draft.currentMatch.remaining <= 0) {
      draft.currentMatch.remaining = 0;
      draft.currentMatch.isRunning = false;
      draft.currentMatch.isTimeUp = true;
      clearInterval(timerId);
      render();
      return;
    }
    els.timer.textContent = formatClock(draft.currentMatch.remaining);
    saveStore();
  }, 1000);
}

function startFirstMatch() {
  const order = shuffle(teamKeys());
  startMatch([order[0], order[1]], order[2]);
}

function startMatch(playing, bench) {
  draft.matchNumber += 1;
  draft.currentMatch = {
    playing,
    bench,
    score: { [playing[0]]: 0, [playing[1]]: 0 },
    goals: [],
    remaining: MATCH_SECONDS,
    isRunning: false,
    isTimeUp: false,
    startedAt: new Date().toISOString()
  };
  draft.finishedMatch = null;
  draft.finalSummary = null;
  draft.mode = "match";
  render();
}

function startCountdown() {
  if (!draft.currentMatch || draft.currentMatch.isRunning) return;
  draft.currentMatch.isRunning = true;
  render();
}

function registerGoal(event) {
  event.preventDefault();
  if (!draft.currentMatch?.isRunning && !draft.currentMatch?.isTimeUp) return;
  const teamKey = els.goalTeam.value;
  const scorer = els.goalPlayer.value;
  const assistant = els.assistPlayer.value;
  if (!teamKey || !scorer) return;

  ensurePlayerStats(teamKey, scorer).goals += 1;
  if (assistant && assistant !== scorer) {
    ensurePlayerStats(teamKey, assistant).assists += 1;
  }

  draft.currentMatch.score[teamKey] += 1;
  draft.currentMatch.goals.push({
    teamKey,
    scorer,
    assistant: assistant && assistant !== scorer ? assistant : "",
    at: MATCH_SECONDS - draft.currentMatch.remaining
  });
  celebrateGoal(teamKey);

  if (draft.currentMatch.score[teamKey] >= 2) {
    finishCurrentMatch("goals", teamKey);
  } else {
    render();
  }
}

function finishCurrentMatch(reason, forcedWinner = null) {
  clearInterval(timerId);
  const match = draft.currentMatch;
  const [a, b] = match.playing;
  const winner = forcedWinner || (match.score[a] > match.score[b] ? a : match.score[b] > match.score[a] ? b : null);

  draft.finishedMatch = {
    ...match,
    reason,
    winner,
    endedAt: new Date().toISOString()
  };
  draft.currentMatch = null;
  draft.mode = "ended";
  render();
}

function chooseWinner(teamKey) {
  draft.finishedMatch.winner = teamKey;
  render();
}

function storeFinishedMatch() {
  if (!draft.finishedMatch?.winner || draft.finishedMatch.stored) return;
  const match = { ...draft.finishedMatch, stored: true };
  draft.completedMatches.push(match);
  draft.teams[match.winner].players.forEach((name) => {
    ensurePlayerStats(match.winner, name).wins += 1;
  });
  draft.finishedMatch.stored = true;
  saveStore();
}

function startNextMatch() {
  storeFinishedMatch();
  const winner = draft.finishedMatch.winner;
  const bench = draft.finishedMatch.bench;
  const loser = draft.finishedMatch.playing.find((teamKey) => teamKey !== winner);
  startMatch([winner, bench], loser);
}

function finishSession() {
  storeFinishedMatch();
  const summary = buildSessionSummary();
  profile.sessions.push(summary);
  draft.finalSummary = summary;
  draft.mode = "final";
  saveStore();
  window.open(`https://wa.me/${PHONE_REPORT}?text=${encodeURIComponent(summary.report)}`, "_blank", "noopener,noreferrer");
  render();
}

function buildSessionSummary() {
  const stats = Object.values(draft.playerStats);
  const winsByTeam = Object.fromEntries(teamKeys().map((key) => [key, 0]));
  draft.completedMatches.forEach((match) => {
    if (match.winner) winsByTeam[match.winner] += 1;
  });

  const winnerTeamKey = teamKeys().sort((a, b) => winsByTeam[b] - winsByTeam[a])[0];
  const topScorer = topBy(stats, "goals", "Sem gols");
  const topAssistant = topBy(stats, "assists", "Sem assistencias");
  const topHot = topBy(stats, "wins", "Sem vitorias");
  const summary = {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    teams: structuredClone(draft.teams),
    matches: structuredClone(draft.completedMatches),
    stats: structuredClone(stats),
    winsByTeam,
    winnerTeam: {
      key: winnerTeamKey,
      label: `${TEAM_META[winnerTeamKey].name} (${winsByTeam[winnerTeamKey]} vitoria${winsByTeam[winnerTeamKey] === 1 ? "" : "s"})`
    },
    topScorer,
    topAssistant,
    topHot
  };
  summary.report = buildReport(summary);
  return summary;
}

function topBy(stats, field, fallback) {
  const best = [...stats].sort((a, b) => b[field] - a[field])[0];
  if (!best || !best[field]) return { label: fallback, value: 0 };
  return { label: `${best.name} (${best[field]})`, value: best[field], player: best.name, teamKey: best.teamKey };
}

function buildReport(summary) {
  const lines = [
    `Relatorio ${profile.peladaName}`,
    "",
    `Time vitorioso: ${summary.winnerTeam.label}`,
    `Artilheiro: ${summary.topScorer.label}`,
    `Maior assistente: ${summary.topAssistant.label}`,
    `Pe quente: ${summary.topHot.label}`,
    "",
    "Jogadores:"
  ];
  summary.stats
    .sort((a, b) => TEAM_META[a.teamKey].name.localeCompare(TEAM_META[b.teamKey].name) || a.name.localeCompare(b.name))
    .forEach((item) => lines.push(`- ${item.name} (${TEAM_META[item.teamKey].name}): ${item.goals} gol(s), ${item.assists} assistencia(s), ${item.wins} vitoria(s)`));

  lines.push("", "Partidas:");
  summary.matches.forEach((match, index) => {
    const score = match.playing.map((key) => `${TEAM_META[key].name} ${match.score[key]}`).join(" x ");
    lines.push(`- Jogo ${index + 1}: ${score}. Vencedor: ${TEAM_META[match.winner].name}`);
  });

  return lines.join("\n");
}

function renderData() {
  const sessions = profile.sessions || [];
  const overall = buildOverall(sessions);
  els.dataGrid.innerHTML = `
    <section class="data-card">
      <h3>Ranking geral</h3>
      <div class="leader-grid">
        <div class="leader-box"><span>Artilheiro geral</span><strong>${escapeHtml(overall.topScorer.label)}</strong></div>
        <div class="leader-box"><span>Assistente geral</span><strong>${escapeHtml(overall.topAssistant.label)}</strong></div>
        <div class="leader-box"><span>Pe quente</span><strong>${escapeHtml(overall.topHot.label)}</strong></div>
      </div>
    </section>
    <section class="data-card">
      <h3>Peladas registradas</h3>
      <div class="data-list">
        ${sessions.length ? sessions.slice().reverse().map(renderSessionCard).join("") : "<p>Nenhuma pelada finalizada ainda.</p>"}
      </div>
    </section>
  `;
}

function renderSessionCard(session) {
  const date = new Date(session.date).toLocaleString("pt-BR");
  const matches = session.matches.map((match, index) => {
    const score = match.playing.map((key) => `${TEAM_META[key].name} ${match.score[key]}`).join(" x ");
    return `<div class="summary-row"><strong>Jogo ${index + 1}</strong><span>${score}</span></div>`;
  }).join("");

  return `
    <article class="leader-box">
      <p class="eyebrow">${date}</p>
      <h3>${escapeHtml(session.winnerTeam.label)}</h3>
      <div class="summary-row"><strong>Artilheiro</strong><span>${escapeHtml(session.topScorer.label)}</span></div>
      <div class="summary-row"><strong>Assistente</strong><span>${escapeHtml(session.topAssistant.label)}</span></div>
      ${matches}
    </article>
  `;
}

function buildOverall(sessions) {
  const total = {};
  sessions.flatMap((session) => session.stats).forEach((item) => {
    const key = item.name.toLowerCase();
    if (!total[key]) total[key] = { name: item.name, goals: 0, assists: 0, wins: 0 };
    total[key].goals += item.goals;
    total[key].assists += item.assists;
    total[key].wins += item.wins;
  });
  const stats = Object.values(total);
  return {
    topScorer: topOverall(stats, "goals", "Sem gols"),
    topAssistant: topOverall(stats, "assists", "Sem assistencias"),
    topHot: topOverall(stats, "wins", "Sem vitorias")
  };
}

function topOverall(stats, field, fallback) {
  const best = [...stats].sort((a, b) => b[field] - a[field])[0];
  if (!best || !best[field]) return { label: fallback };
  return { label: `${best.name} (${best[field]})` };
}

function resetDraft() {
  clearInterval(timerId);
  draft = newDraft();
  profile.draft = draft;
  saveStore();
  showAppTab("game");
  render();
}

function celebrateGoal(teamKey) {
  const score = document.querySelector(`[data-score-team="${teamKey}"]`);
  if (score) {
    score.classList.add("bump");
    setTimeout(() => score.classList.remove("bump"), 350);
  }
  confetti(TEAM_META[teamKey].color);
}

function confetti(color) {
  const canvas = els.confettiCanvas;
  const ctx = canvas.getContext("2d");
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const pieces = Array.from({ length: 90 }, () => ({
    x: Math.random() * canvas.width,
    y: -20 - Math.random() * 160,
    s: 5 + Math.random() * 7,
    v: 2 + Math.random() * 5,
    r: Math.random() * 360,
    c: Math.random() > .35 ? color : "#ffffff"
  }));
  let frame = 0;
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach((p) => {
      p.y += p.v;
      p.x += Math.sin((frame + p.r) / 14) * 2;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate((p.r + frame * 4) * Math.PI / 180);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .55);
      ctx.restore();
    });
    frame += 1;
    if (frame < 95) requestAnimationFrame(draw);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  draw();
}

els.registerForm.addEventListener("submit", registerProfile);
els.loginForm.addEventListener("submit", loginProfile);
els.recoverForm.addEventListener("submit", recoverProfile);
els.resetForm.addEventListener("submit", resetPassword);
els.logoutButton.addEventListener("click", logout);

document.querySelectorAll("[data-auth-tab]").forEach((button) => {
  button.addEventListener("click", () => showAuthTab(button.dataset.authTab));
});

document.querySelectorAll("[data-app-tab]").forEach((button) => {
  button.addEventListener("click", () => showAppTab(button.dataset.appTab));
});

els.teamsGrid.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-team-form]");
  if (!form) return;
  event.preventDefault();
  const teamKey = form.dataset.teamForm;
  const input = form.elements.player;
  const name = input.value.trim();
  if (!name || draft.teams[teamKey].players.includes(name)) return;
  draft.teams[teamKey].players.push(name);
  ensurePlayerStats(teamKey, name);
  input.value = "";
  render();
});

els.teamsGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-player]");
  if (!button) return;
  const teamKey = button.dataset.team;
  const name = button.dataset.player;
  draft.teams[teamKey].players = draft.teams[teamKey].players.filter((player) => player !== name);
  delete draft.playerStats[playerId(teamKey, name)];
  render();
});

els.drawMatch.addEventListener("click", startFirstMatch);
els.startCountdown.addEventListener("click", startCountdown);
els.endTimedMatch.addEventListener("click", () => finishCurrentMatch("time"));
els.goalTeam.addEventListener("change", fillPlayerOptions);
els.goalForm.addEventListener("submit", registerGoal);
els.nextMatch.addEventListener("click", startNextMatch);
els.finishSession.addEventListener("click", finishSession);
els.winnerChoice.addEventListener("click", (event) => {
  const button = event.target.closest("[data-winner]");
  if (button) chooseWinner(button.dataset.winner);
});
els.newSession.addEventListener("click", resetDraft);

const active = store.profiles.find((item) => item.id === store.activeProfileId);
if (active) enterProfile(active);
else showAuthTab("login");
