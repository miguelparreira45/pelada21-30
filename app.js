const TEAM_META = {
  blue: { name: "Azul", color: "#2364d8" },
  red: { name: "Vermelho", color: "#d43d3d" },
  green: { name: "Verde", color: "#178f5c" }
};

const PHONE_NUMBER = "5521974381772";
const MATCH_SECONDS = 7 * 60;
const STORAGE_KEY = "placar-pelada-state-v1";

let state = loadState() || initialState();
let timerId = null;

const els = {
  setupView: document.querySelector("#setupView"),
  matchView: document.querySelector("#matchView"),
  endedView: document.querySelector("#endedView"),
  teamsGrid: document.querySelector("#teamsGrid"),
  drawMatch: document.querySelector("#drawMatch"),
  resetApp: document.querySelector("#resetApp"),
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
  finishSession: document.querySelector("#finishSession")
};

function initialState() {
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
    mode: "setup",
    sessionStartedAt: new Date().toISOString()
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && !saved.completedMatches) saved.completedMatches = [];
    return saved;
  } catch {
    return null;
  }
}

function playerId(teamKey, name) {
  return `${teamKey}:${name.trim().toLowerCase()}`;
}

function ensurePlayerStats(teamKey, name) {
  const id = playerId(teamKey, name);
  if (!state.playerStats[id]) {
    state.playerStats[id] = { id, name, teamKey, goals: 0, assists: 0 };
  }
  return state.playerStats[id];
}

function teamKeys() {
  return Object.keys(TEAM_META);
}

function shuffle(items) {
  return [...items].sort(() => Math.random() - 0.5);
}

function activeTeamKeys() {
  return state.currentMatch?.playing || state.finishedMatch?.playing || [];
}

function benchTeamKey() {
  return state.currentMatch?.bench || state.finishedMatch?.bench;
}

function formatClock(seconds) {
  const safe = Math.max(0, seconds);
  const min = String(Math.floor(safe / 60)).padStart(2, "0");
  const sec = String(safe % 60).padStart(2, "0");
  return `${min}:${sec}`;
}

function render() {
  clearInterval(timerId);
  timerId = null;

  els.setupView.classList.toggle("hidden", state.mode !== "setup");
  els.matchView.classList.toggle("hidden", state.mode !== "match");
  els.endedView.classList.toggle("hidden", state.mode !== "ended");

  renderSetup();
  if (state.currentMatch) renderMatch();
  if (state.finishedMatch) renderEnded();
  saveState();
}

function renderSetup() {
  els.teamsGrid.innerHTML = teamKeys().map((key) => {
    const meta = TEAM_META[key];
    const players = state.teams[key].players;
    const list = players.length
      ? players.map((name) => `
          <div class="player-pill">
            <span>${escapeHtml(name)}</span>
            <button class="remove-player" data-team="${key}" data-player="${escapeHtml(name)}" title="Remover ${escapeHtml(name)}" aria-label="Remover ${escapeHtml(name)}">x</button>
          </div>
        `).join("")
      : `<p>Nenhum jogador</p>`;

    return `
      <article class="team-card" style="--team-color: ${meta.color}">
        <div class="team-title">
          <span class="swatch"></span>
          <h3>${meta.name}</h3>
        </div>
        <form class="player-form" data-team-form="${key}">
          <input name="player" placeholder="Nome do jogador" autocomplete="off">
          <button class="icon-button" title="Adicionar jogador" aria-label="Adicionar jogador">+</button>
        </form>
        <div class="player-list">${list}</div>
      </article>
    `;
  }).join("");

  els.drawMatch.disabled = !teamKeys().every((key) => state.teams[key].players.length > 0);
}

function renderMatch() {
  const match = state.currentMatch;
  const [left, right] = match.playing;
  els.matchLabel.textContent = `Partida ${state.matchNumber}`;
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
  const score = state.currentMatch.score[teamKey];
  const players = state.teams[teamKey].players.map((player) => `<span class="mini-pill">${escapeHtml(player)}</span>`).join("");

  return `
    <div style="--team-color: ${meta.color}">
      <p class="eyebrow">Time ${meta.name}</p>
      <div class="score">${score}</div>
      <div class="players-mini">${players}</div>
    </div>
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
  const canRegisterGoal = Boolean(state.currentMatch?.isRunning || state.currentMatch?.isTimeUp);
  els.goalTeam.innerHTML = active.map((key) => `<option value="${key}">${TEAM_META[key].name}</option>`).join("");
  if (!active.includes(els.goalTeam.value)) els.goalTeam.value = active[0];
  fillPlayerOptions();
  els.goalForm.querySelectorAll("select, button").forEach((field) => {
    field.disabled = !canRegisterGoal;
  });
}

function fillPlayerOptions() {
  const teamKey = els.goalTeam.value;
  const players = state.teams[teamKey].players;
  els.goalPlayer.innerHTML = players.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
  els.assistPlayer.innerHTML = `<option value="">Sem assistencia</option>` + players.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("");
}

function renderStats() {
  const stats = Object.values(state.playerStats)
    .filter((item) => item.goals || item.assists)
    .sort((a, b) => (b.goals + b.assists) - (a.goals + a.assists) || a.name.localeCompare(b.name));

  if (!stats.length) {
    els.runningSummary.textContent = "Nenhum gol marcado ainda.";
    els.statsList.innerHTML = "";
    return;
  }

  const totalGoals = stats.reduce((sum, item) => sum + item.goals, 0);
  els.runningSummary.textContent = `${totalGoals} gol${totalGoals === 1 ? "" : "s"} na pelada ate agora.`;
  els.statsList.innerHTML = stats.map((item) => `
    <div class="stat-row">
      <strong>${escapeHtml(item.name)} <small>(${TEAM_META[item.teamKey].name})</small></strong>
      <span>${item.goals} G / ${item.assists} A</span>
    </div>
  `).join("");
}

function renderEnded() {
  const match = state.finishedMatch;
  const scoreLine = match.playing.map((key) => `${TEAM_META[key].name} ${match.score[key]}`).join(" x ");
  const winner = match.winner ? TEAM_META[match.winner].name : null;

  els.resultBand.innerHTML = `
    <p class="eyebrow">Partida ${state.matchNumber} encerrada</p>
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

function startTimer() {
  if (state.mode !== "match" || !state.currentMatch?.isRunning) return;
  timerId = setInterval(() => {
    if (!state.currentMatch) return clearInterval(timerId);
    state.currentMatch.remaining -= 1;
    els.timer.textContent = formatClock(state.currentMatch.remaining);
    if (state.currentMatch.remaining <= 0) {
      state.currentMatch.remaining = 0;
      state.currentMatch.isRunning = false;
      state.currentMatch.isTimeUp = true;
      clearInterval(timerId);
      render();
      return;
    }
    saveState();
  }, 1000);
}

function startFirstMatch() {
  const order = shuffle(teamKeys());
  startMatch([order[0], order[1]], order[2]);
}

function startMatch(playing, bench) {
  state.matchNumber += 1;
  state.currentMatch = {
    playing,
    bench,
    score: { [playing[0]]: 0, [playing[1]]: 0 },
    goals: [],
    remaining: MATCH_SECONDS,
    isRunning: false,
    isTimeUp: false,
    startedAt: new Date().toISOString()
  };
  state.finishedMatch = null;
  state.mode = "match";
  render();
}

function registerGoal(event) {
  event.preventDefault();
  if (!state.currentMatch?.isRunning && !state.currentMatch?.isTimeUp) return;
  const teamKey = els.goalTeam.value;
  const scorer = els.goalPlayer.value;
  const assistant = els.assistPlayer.value;
  if (!teamKey || !scorer) return;

  ensurePlayerStats(teamKey, scorer).goals += 1;
  if (assistant && assistant !== scorer) {
    ensurePlayerStats(teamKey, assistant).assists += 1;
  }

  state.currentMatch.score[teamKey] += 1;
  state.currentMatch.goals.push({
    teamKey,
    scorer,
    assistant: assistant && assistant !== scorer ? assistant : "",
    at: MATCH_SECONDS - state.currentMatch.remaining
  });

  if (state.currentMatch.score[teamKey] >= 2) {
    finishCurrentMatch("goals", teamKey);
  } else {
    render();
  }
}

function finishCurrentMatch(reason, forcedWinner = null) {
  clearInterval(timerId);
  const match = state.currentMatch;
  const [a, b] = match.playing;
  const winner = forcedWinner || (match.score[a] > match.score[b] ? a : match.score[b] > match.score[a] ? b : null);

  state.finishedMatch = {
    ...match,
    reason,
    winner,
    endedAt: new Date().toISOString()
  };
  state.currentMatch = null;
  state.mode = "ended";
  render();
}

function startCountdown() {
  if (!state.currentMatch || state.currentMatch.isRunning) return;
  state.currentMatch.isRunning = true;
  render();
}

function chooseWinner(teamKey) {
  state.finishedMatch.winner = teamKey;
  render();
}

function startNextMatch() {
  const winner = state.finishedMatch.winner;
  const bench = state.finishedMatch.bench;
  const loser = state.finishedMatch.playing.find((teamKey) => teamKey !== winner);

  startMatch([winner, bench], loser);
}

function finishSession() {
  const report = buildReport();
  const url = `https://wa.me/${PHONE_NUMBER}?text=${encodeURIComponent(report)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function buildReport() {
  const lines = [
    "Relatorio da pelada",
    "",
    "Gols e assistencias por jogador:"
  ];

  const allStats = teamKeys().flatMap((teamKey) =>
    state.teams[teamKey].players.map((name) => ensurePlayerStats(teamKey, name))
  );

  allStats
    .sort((a, b) => TEAM_META[a.teamKey].name.localeCompare(TEAM_META[b.teamKey].name) || a.name.localeCompare(b.name))
    .forEach((item) => {
      lines.push(`- ${item.name} (${TEAM_META[item.teamKey].name}): ${item.goals} gol(s), ${item.assists} assistencia(s)`);
    });

  lines.push("", "Partidas vencidas por time:");
  teamKeys().forEach((teamKey) => {
    const wins = countWins(teamKey);
    lines.push(`- ${TEAM_META[teamKey].name}: ${wins}`);
  });

  lines.push("", "Times:");
  teamKeys().forEach((teamKey) => {
    lines.push(`- ${TEAM_META[teamKey].name}: ${state.teams[teamKey].players.join(", ") || "sem jogadores"}`);
  });

  return lines.join("\n");
}

function countWins(teamKey) {
  const finished = [...(state.completedMatches || [])];
  if (state.finishedMatch && !state.finishedMatch.storedWin) finished.push(state.finishedMatch);
  return finished.filter((match) => match.winner === teamKey).length;
}

function storeFinishedWin() {
  if (!state.finishedMatch?.winner || state.finishedMatch.storedWin) return;
  state.completedMatches.push({ ...state.finishedMatch, storedWin: true });
  state.finishedMatch.storedWin = true;
  saveState();
}

function resetApp() {
  if (!confirm("Zerar toda a pelada atual?")) return;
  clearInterval(timerId);
  localStorage.removeItem(STORAGE_KEY);
  state = initialState();
  render();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

els.teamsGrid.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-team-form]");
  if (!form) return;
  event.preventDefault();
  const teamKey = form.dataset.teamForm;
  const input = form.elements.player;
  const name = input.value.trim();
  if (!name || state.teams[teamKey].players.includes(name)) return;
  state.teams[teamKey].players.push(name);
  ensurePlayerStats(teamKey, name);
  input.value = "";
  render();
});

els.teamsGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-player]");
  if (!button) return;
  const teamKey = button.dataset.team;
  const name = button.dataset.player;
  state.teams[teamKey].players = state.teams[teamKey].players.filter((player) => player !== name);
  delete state.playerStats[playerId(teamKey, name)];
  render();
});

els.drawMatch.addEventListener("click", startFirstMatch);
els.startCountdown.addEventListener("click", startCountdown);
els.endTimedMatch.addEventListener("click", () => finishCurrentMatch("time"));
els.goalTeam.addEventListener("change", fillPlayerOptions);
els.goalForm.addEventListener("submit", registerGoal);
els.nextMatch.addEventListener("click", () => {
  storeFinishedWin();
  startNextMatch();
});
els.finishSession.addEventListener("click", () => {
  storeFinishedWin();
  finishSession();
});
els.winnerChoice.addEventListener("click", (event) => {
  const button = event.target.closest("[data-winner]");
  if (button) chooseWinner(button.dataset.winner);
});
els.resetApp.addEventListener("click", resetApp);

render();
