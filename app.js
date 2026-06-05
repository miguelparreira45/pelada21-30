const TEAM_META = {
  blue: { name: "Azul", color: "#2f7dff" },
  red: { name: "Vermelho", color: "#ff4848" },
  green: { name: "Verde", color: "#1dc679" }
};

const TEAM_COLOR_OPTIONS = [
  { id: "blue", name: "Azul", color: "#2f7dff" },
  { id: "red", name: "Vermelho", color: "#ff4848" },
  { id: "green", name: "Verde", color: "#1dc679" },
  { id: "black", name: "Preto", color: "#111111" },
  { id: "white", name: "Branco", color: "#f7f7f2" },
  { id: "yellow", name: "Amarelo", color: "#ffd43b" },
  { id: "orange", name: "Laranja", color: "#ff8a1f" },
  { id: "purple", name: "Roxo", color: "#9b5cff" },
  { id: "pink", name: "Rosa", color: "#ff5ca8" },
  { id: "gray", name: "Cinza", color: "#9aa393" }
];

const STORE_KEY = "peladafast-store-v2";
const DEFAULT_SETTINGS = { durationMinutes: 7, goalLimit: 2, playersPerTeam: 5 };

let store = loadStore();
let profile = null;
let draft = null;
let timerId = null;
let pendingRecovery = null;
let activeDataTab = "today";
let editingSessionId = null;
let supabaseClient = null;
let currentUser = null;
let isCloudMode = false;

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
  syncBadge: document.querySelector("#syncBadge"),
  gameTab: document.querySelector("#gameTab"),
  playersTab: document.querySelector("#playersTab"),
  dataTab: document.querySelector("#dataTab"),
  shareTab: document.querySelector("#shareTab"),
  shareGrid: document.querySelector("#shareGrid"),
  publishShare: document.querySelector("#publishShare"),
  publicShell: document.querySelector("#publicShell"),
  publicProfile: document.querySelector("#publicProfile"),
  publicTitle: document.querySelector("#publicTitle"),
  publicGrid: document.querySelector("#publicGrid"),
  playerProfileForm: document.querySelector("#playerProfileForm"),
  playerFormTitle: document.querySelector("#playerFormTitle"),
  registeredPlayers: document.querySelector("#registeredPlayers"),
  cancelPlayerEdit: document.querySelector("#cancelPlayerEdit"),
  setupView: document.querySelector("#setupView"),
  matchView: document.querySelector("#matchView"),
  endedView: document.querySelector("#endedView"),
  finalView: document.querySelector("#finalView"),
  teamsGrid: document.querySelector("#teamsGrid"),
  drawMatch: document.querySelector("#drawMatch"),
  balanceTeams: document.querySelector("#balanceTeams"),
  seasonSelect: document.querySelector("#seasonSelect"),
  seasonForm: document.querySelector("#seasonForm"),
  matchSettingsForm: document.querySelector("#matchSettingsForm"),
  durationInput: document.querySelector("#durationInput"),
  goalLimitInput: document.querySelector("#goalLimitInput"),
  playersPerTeamInput: document.querySelector("#playersPerTeamInput"),
  leftPanel: document.querySelector("#leftPanel"),
  rightPanel: document.querySelector("#rightPanel"),
  lineupCheck: document.querySelector("#lineupCheck"),
  matchHistoryLive: document.querySelector("#matchHistoryLive"),
  timer: document.querySelector("#timer"),
  startCountdown: document.querySelector("#startCountdown"),
  fullScoreMode: document.querySelector("#fullScoreMode"),
  endTimedMatch: document.querySelector("#endTimedMatch"),
  matchRule: document.querySelector("#matchRule"),
  matchLabel: document.querySelector("#matchLabel"),
  benchStrip: document.querySelector("#benchStrip"),
  goalForm: document.querySelector("#goalForm"),
  goalFormHome: document.querySelector("#goalFormHome"),
  goalPopup: document.querySelector("#goalPopup"),
  goalPopupSlot: document.querySelector("#goalPopupSlot"),
  goalPopupTitle: document.querySelector("#goalPopupTitle"),
  closeGoalPopup: document.querySelector("#closeGoalPopup"),
  goalTeam: document.querySelector("#goalTeam"),
  ownGoal: document.querySelector("#ownGoal"),
  goalPlayer: document.querySelector("#goalPlayer"),
  assistPlayer: document.querySelector("#assistPlayer"),
  undoLastGoal: document.querySelector("#undoLastGoal"),
  runningSummary: document.querySelector("#runningSummary"),
  statsList: document.querySelector("#statsList"),
  matchTimeline: document.querySelector("#matchTimeline"),
  resultBand: document.querySelector("#resultBand"),
  winnerChoice: document.querySelector("#winnerChoice"),
  nextMatch: document.querySelector("#nextMatch"),
  finishSession: document.querySelector("#finishSession"),
  dataGrid: document.querySelector("#dataGrid"),
  newSession: document.querySelector("#newSession"),
  exportCsv: document.querySelector("#exportCsv"),
  exportBackup: document.querySelector("#exportBackup"),
  importBackup: document.querySelector("#importBackup"),
  logoutButton: document.querySelector("#logoutButton"),
  confettiCanvas: document.querySelector("#confettiCanvas")
};

function loadStore() {
  try {
    const nextStore = JSON.parse(localStorage.getItem(STORE_KEY)) || { profiles: [], activeProfileId: null };
    nextStore.profiles ||= [];
    nextStore.profiles.forEach(ensureProfileDefaults);
    return nextStore;
  } catch {
    return { profiles: [], activeProfileId: null };
  }
}

function saveStore() {
  if (profile && draft) {
    profile.draft = draft;
  }
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
  if (isCloudMode && profile && currentUser) {
    queueCloudSave();
  }
}

let cloudSaveTimer = null;

function queueCloudSave() {
  clearTimeout(cloudSaveTimer);
  cloudSaveTimer = setTimeout(() => {
    saveCloudState().catch((error) => console.warn("Falha ao salvar na nuvem", error));
  }, 450);
}

function setupSupabaseClient() {
  const config = window.PELADAFAST_SUPABASE;
  if (!window.supabase || !config?.url || !config?.anonKey || config.url.includes("COLE_AQUI")) return null;
  return window.supabase.createClient(config.url.replace(/\/rest\/v1\/?$/, ""), config.anonKey);
}

async function getLoginEmail(identity) {
  const clean = identity.trim().toLowerCase();
  if (clean.includes("@")) return clean;
  const { data, error } = await supabaseClient.rpc("login_email_for_identity", { identity: clean });
  if (error || !data) throw new Error("Usuario nao encontrado.");
  return data;
}

async function loadCloudProfile(user) {
  const { data: profileRow, error: profileError } = await supabaseClient
    .from("pelada_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  if (profileError) throw profileError;
  if (!profileRow) return null;

  const [{ data: seasons }, { data: players }, { data: sessions }] = await Promise.all([
    supabaseClient.from("seasons").select("*").eq("profile_id", user.id).order("created_at"),
    supabaseClient.from("players").select("*").eq("profile_id", user.id).order("created_at"),
    supabaseClient.from("sessions").select("*").eq("profile_id", user.id).order("played_at")
  ]);

  const mappedSeasons = (seasons || []).map(fromSeasonRow);
  const mappedSessions = (sessions || []).map((row) => fromSessionRow(row, mappedSeasons));

  return ensureProfileDefaults({
    id: user.id,
    peladaName: profileRow.pelada_name,
    username: profileRow.username,
    email: profileRow.email,
    phone: profileRow.phone,
    currentSeasonId: profileRow.current_season_id,
    createdAt: profileRow.created_at,
    seasons: mappedSeasons,
    players: (players || []).map(fromPlayerRow),
    sessions: mappedSessions,
    draft: newDraft()
  });
}

function fromSeasonRow(row) {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    finishedAt: row.finished_at || null,
    awards: row.awards || null
  };
}

function fromPlayerRow(row) {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    memberType: row.member_type,
    photo: row.photo_path || "",
    createdAt: row.created_at
  };
}

function fromSessionRow(row, seasons = []) {
  return {
    id: row.id,
    date: row.played_at,
    seasonId: row.season_id,
    seasonName: seasons.find((season) => season.id === row.season_id)?.name || "Temporada",
    settings: row.settings,
    teams: row.teams,
    matches: row.matches,
    stats: row.stats,
    ...row.summary
  };
}

function toSessionRow(session) {
  return {
    id: session.id,
    profile_id: currentUser.id,
    season_id: session.seasonId,
    played_at: session.date,
    settings: session.settings || DEFAULT_SETTINGS,
    teams: session.teams,
    matches: session.matches,
    stats: session.stats,
    summary: {
      winnerTeam: session.winnerTeam,
      teamColors: session.teamColors,
      topScorer: session.topScorer,
      topAssistant: session.topAssistant,
      topHot: session.topHot,
      topMvp: session.topMvp,
      playerRatings: session.playerRatings,
      winsByTeam: session.winsByTeam,
      report: session.report
    }
  };
}

function toSeasonRow(season) {
  return {
    id: season.id,
    profile_id: currentUser.id,
    name: season.name,
    finished_at: season.finishedAt || null,
    awards: season.awards || null
  };
}

async function createCloudProfile(user, payload) {
  const profileRow = {
    id: user.id,
    pelada_name: payload.peladaName,
    username: payload.username,
    email: payload.email,
    phone: payload.phone
  };
  const { error: profileError } = await supabaseClient.from("pelada_profiles").insert(profileRow);
  if (profileError) throw profileError;
  return loadCloudProfile(user);
}

async function saveCloudState() {
  if (!isCloudMode || !profile || !currentUser) return;
  await supabaseClient.from("pelada_profiles").update({
    pelada_name: profile.peladaName,
    username: profile.username,
    email: profile.email,
    phone: profile.phone,
    current_season_id: profile.currentSeasonId
  }).eq("id", currentUser.id);

  await Promise.all(profile.sessions.map((session) =>
    supabaseClient.from("sessions").upsert(toSessionRow(session))
  ));

  await Promise.all(profile.seasons.map((season) =>
    supabaseClient.from("seasons").upsert(toSeasonRow(season))
  ));
}

function findLocalProfileForCloud(cloudProfile) {
  return (store.profiles || []).find((item) =>
    item.id !== cloudProfile.id
    && !item.migratedToCloudUserId
    && (
      item.username === cloudProfile.username
      || item.email === cloudProfile.email
      || onlyDigits(item.phone || "") === onlyDigits(cloudProfile.phone || "")
    )
  );
}

async function migrateLocalProfileToCloudIfNeeded(cloudProfile) {
  if (!isCloudMode || !currentUser) return cloudProfile;
  const previousProfile = profile;
  profile = cloudProfile;
  const localProfile = findLocalProfileForCloud(cloudProfile);
  if (!localProfile) {
    profile = previousProfile;
    return cloudProfile;
  }

  const shouldImport = confirm("Encontrei um perfil antigo salvo neste navegador com o mesmo usuario, email ou WhatsApp. Importar esse historico para a nuvem?");
  if (!shouldImport) {
    profile = previousProfile;
    return cloudProfile;
  }

  const imported = ensureProfileDefaults(localProfile);
  const seasonIdMap = {};
  const existingSeasonNames = new Set(cloudProfile.seasons.map((season) => season.name.toLowerCase()));

  for (const season of imported.seasons) {
    let target = cloudProfile.seasons.find((item) => item.name.toLowerCase() === season.name.toLowerCase());
    if (!target) {
      target = { ...season, id: crypto.randomUUID() };
      cloudProfile.seasons.push(target);
      await supabaseClient.from("seasons").insert({
        id: target.id,
        profile_id: currentUser.id,
        name: target.name
      });
      existingSeasonNames.add(target.name.toLowerCase());
    }
    seasonIdMap[season.id] = target.id;
  }

  const playerIdMap = {};
  const existingPlayerNames = new Set(cloudProfile.players.map((player) => `${player.firstName} ${player.lastName}`.toLowerCase()));
  for (const player of imported.players || []) {
    const fullName = `${player.firstName} ${player.lastName}`.toLowerCase();
    let target = cloudProfile.players.find((item) => `${item.firstName} ${item.lastName}`.toLowerCase() === fullName);
    if (!target) {
      target = { ...player, id: crypto.randomUUID() };
      cloudProfile.players.push(target);
      await supabaseClient.from("players").insert({
        id: target.id,
        profile_id: currentUser.id,
        first_name: target.firstName,
        last_name: target.lastName,
        member_type: target.memberType,
        photo_path: target.photo || null
      });
      existingPlayerNames.add(fullName);
    }
    playerIdMap[player.id] = target.id;
  }

  const remapRef = (ref) => playerIdMap[ref] || ref;
  const importedSessions = (imported.sessions || []).map((session) => {
    const mapped = structuredClone(session);
    mapped.id = crypto.randomUUID();
    mapped.seasonId = seasonIdMap[session.seasonId] || cloudProfile.currentSeasonId;
    mapped.seasonName = cloudProfile.seasons.find((season) => season.id === mapped.seasonId)?.name || session.seasonName;
    teamKeys().forEach((teamKey) => {
      mapped.teams[teamKey].players = (mapped.teams[teamKey].players || []).map(remapRef);
      if (mapped.guests?.[teamKey]) {
        mapped.guests[teamKey] = mapped.guests[teamKey].map(remapRef);
      }
    });
    mapped.stats = (mapped.stats || []).map((stat) => {
      const nextId = playerIdMap[stat.id] || playerIdMap[stat.playerId] || stat.id;
      return { ...stat, id: nextId, playerId: nextId };
    });
    recalculateImportedSession(mapped, cloudProfile);
    return mapped;
  });

  cloudProfile.sessions.push(...importedSessions);
  await Promise.all(importedSessions.map((session) =>
    supabaseClient.from("sessions").insert(toSessionRow(session))
  ));

  if (imported.draft && imported.draft.mode !== "setup" && !cloudProfile.draft?.currentMatch && !cloudProfile.draft?.finishedMatch) {
    cloudProfile.draft = structuredClone(imported.draft);
    cloudProfile.draft.seasonId = seasonIdMap[imported.draft.seasonId] || cloudProfile.currentSeasonId;
    teamKeys().forEach((teamKey) => {
      cloudProfile.draft.teams[teamKey].players = (cloudProfile.draft.teams[teamKey].players || []).map(remapRef);
    });
  }

  localProfile.migratedToCloudUserId = currentUser.id;
  localProfile.migratedAt = new Date().toISOString();
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
  alert("Historico antigo importado para a nuvem.");
  profile = previousProfile;
  return cloudProfile;
}

function recalculateImportedSession(session, targetProfile) {
  const statsById = Object.fromEntries((session.stats || []).map((item) => [item.id, item]));
  session.stats.forEach((item) => {
    const player = targetProfile.players.find((entry) => entry.id === item.id || entry.id === item.playerId);
    if (player) item.name = `${player.firstName} ${player.lastName}`.trim();
  });
  session.winsByTeam = Object.fromEntries(teamKeys().map((key) => [key, 0]));
  session.matches.forEach((match) => {
    if (!match.winner) return;
    session.winsByTeam[match.winner] += 1;
    (session.teams[match.winner].players || []).forEach((ref) => {
      const id = ref;
      if (!statsById[id]) {
        const player = targetProfile.players.find((entry) => entry.id === id);
        statsById[id] = {
          id,
          playerId: id,
          name: player ? `${player.firstName} ${player.lastName}`.trim() : String(ref),
          teamKey: match.winner,
          goals: 0,
          assists: 0,
          wins: 0
        };
        session.stats.push(statsById[id]);
      }
      statsById[id].wins += 1;
    });
  });
  const winnerTeamKey = teamKeys().sort((a, b) => session.winsByTeam[b] - session.winsByTeam[a])[0];
  const hasTeamWinner = session.winsByTeam[winnerTeamKey] > 0;
  session.winnerTeam = {
    key: hasTeamWinner ? winnerTeamKey : "",
    label: hasTeamWinner ? `${teamName(winnerTeamKey, session)} (${session.winsByTeam[winnerTeamKey]} vitoria${session.winsByTeam[winnerTeamKey] === 1 ? "" : "s"})` : "Sem vencedor por vitorias"
  };
  session.topScorer = topBy(session.stats, "goals", "Sem gols");
  session.topAssistant = topBy(session.stats, "assists", "Sem assistencias");
  session.topHot = topBy(session.stats, "wins", "Sem vitorias");
  session.stats.forEach((item) => {
    item.performanceScore = calculatePerformanceScore(item, item.rating || 3);
  });
  session.topMvp = topBy(session.stats, "performanceScore", "Sem destaque");
  session.report = buildReport(session);
}

function newDraft() {
  return {
    teams: {
      blue: { players: [] },
      red: { players: [] },
      green: { players: [] }
    },
    teamColors: { blue: "blue", red: "red", green: "green" },
    playerStats: {},
    completedMatches: [],
    matchNumber: 0,
    currentMatch: null,
    finishedMatch: null,
    finalSummary: null,
    settings: { ...DEFAULT_SETTINGS },
    seasonId: null,
    mode: "setup",
    startedAt: new Date().toISOString()
  };
}

function ensureProfileDefaults(item) {
  item.sessions ||= [];
  item.players ||= [];
  item.seasons ||= [];
  item.publicShares ||= {};
  removeEmptySuggestedSeason(item);
  if (!item.currentSeasonId || !item.seasons.some((season) => season.id === item.currentSeasonId && !season.finishedAt)) {
    item.currentSeasonId = activeSeason(item)?.id || null;
  }
  item.draft ||= newDraft();
  item.draft.teamColors ||= { blue: "blue", red: "red", green: "green" };
  item.draft.settings ||= { ...DEFAULT_SETTINGS };
  item.draft.settings = { ...DEFAULT_SETTINGS, ...item.draft.settings };
  item.draft.seasonId = item.currentSeasonId;
  item.draft.completedMatches ||= [];
  item.draft.playerStats ||= {};
  return item;
}

function removeEmptySuggestedSeason(item) {
  const sessions = item.sessions || [];
  item.seasons = (item.seasons || []).filter((season) => {
    const isSuggested = normalizeText(season.name) === "temporada principal";
    const hasSessions = sessions.some((session) => session.seasonId === season.id);
    return !isSuggested || hasSessions;
  });
}

function activeSeason(item = profile) {
  return item?.seasons?.find((season) => !season.finishedAt) || null;
}

function currentSeason() {
  return profile?.seasons?.find((season) => season.id === profile.currentSeasonId && !season.finishedAt) || activeSeason();
}

function matchDurationSeconds(match = draft.currentMatch) {
  return (match?.durationMinutes || draft.settings.durationMinutes || DEFAULT_SETTINGS.durationMinutes) * 60;
}

function normalizeUsername(value) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._]/g, "");
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
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

function setSyncStatus(message, mode = "cloud") {
  if (!els.syncBadge) return;
  els.syncBadge.textContent = message;
  els.syncBadge.className = `sync-badge ${mode}`;
}

function setAuthModeMessage() {
  if (isCloudMode) {
    setAuthMessage("Conectado na nuvem. Seus dados aparecem no celular e no computador.");
  } else {
    setAuthMessage("Modo local: este aparelho nao esta conectado ao Supabase. Suba tambem index.html e supabase-config.js.", true);
  }
}

function showAuthTab(tab) {
  document.querySelectorAll("[data-auth-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.authTab === tab);
  });
  [els.loginForm, els.registerForm, els.recoverForm, els.resetForm].forEach((form) => form.classList.add("hidden"));
  if (tab === "login") els.loginForm.classList.remove("hidden");
  if (tab === "register") els.registerForm.classList.remove("hidden");
  if (tab === "recover") els.recoverForm.classList.remove("hidden");
  setAuthModeMessage();
}

function showAppTab(tab) {
  document.querySelectorAll("[data-app-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.appTab === tab);
  });
  els.gameTab.classList.toggle("hidden", tab !== "game");
  els.playersTab.classList.toggle("hidden", tab !== "players");
  els.dataTab.classList.toggle("hidden", tab !== "data");
  els.shareTab.classList.toggle("hidden", tab !== "share");
  if (tab === "players") renderPlayers();
  if (tab === "data") renderData();
  if (tab === "share") renderShare();
}

function teamKeys() {
  return Object.keys(TEAM_META);
}

function teamColorId(teamKey, source = draft) {
  return source?.teamColors?.[teamKey] || teamKey;
}

function teamMeta(teamKey, source = draft) {
  return TEAM_COLOR_OPTIONS.find((item) => item.id === teamColorId(teamKey, source)) || TEAM_META[teamKey];
}

function teamName(teamKey, source = draft) {
  return teamMeta(teamKey, source)?.name || TEAM_META[teamKey]?.name || "Time";
}

function teamColor(teamKey, source = draft) {
  return teamMeta(teamKey, source)?.color || TEAM_META[teamKey]?.color || "#9be31d";
}

function renderTeamColorOptions(selectedId) {
  return TEAM_COLOR_OPTIONS.map((option) =>
    `<option value="${option.id}" ${option.id === selectedId ? "selected" : ""}>${option.name}</option>`
  ).join("");
}

function activeTeamKeys() {
  return draft.currentMatch?.playing || draft.finishedMatch?.playing || [];
}

function benchTeamKey() {
  return draft.currentMatch?.bench || draft.finishedMatch?.bench;
}

function matchRoster(teamKey, match = draft.currentMatch || draft.finishedMatch) {
  const base = draft.teams?.[teamKey]?.players || match?.teams?.[teamKey]?.players || [];
  const guests = match?.guests?.[teamKey] || [];
  const out = new Set(match?.out?.[teamKey] || []);
  return [...new Set([...base, ...guests])].filter((ref) => !out.has(ref));
}

function baseTeamOfPlayer(ref) {
  return teamKeys().find((key) => draft.teams[key].players.includes(ref)) || null;
}

function availableGuestPlayers(targetTeamKey) {
  const match = draft.currentMatch;
  if (!match) return [];
  const alreadyInTarget = new Set(matchRoster(targetTeamKey, match));
  return profile.players.filter((player) => {
    if (alreadyInTarget.has(player.id)) return false;
    return teamKeys().some((key) => draft.teams[key].players.includes(player.id));
  });
}

function findPlayer(ref) {
  return profile?.players?.find((item) => item.id === ref) || null;
}

function playerDisplayName(ref) {
  const player = findPlayer(ref);
  if (player) return `${player.firstName} ${player.lastName}`.trim();
  return String(ref);
}

function playerStatId(ref) {
  const player = findPlayer(ref);
  return player ? player.id : String(ref).trim().toLowerCase();
}

function playerType(ref) {
  return findPlayer(ref)?.memberType || "suplente";
}

function playerPhoto(ref) {
  return findPlayer(ref)?.photo || "";
}

function legacyPlayerId(teamKey, name) {
  return `${teamKey}:${String(name).trim().toLowerCase()}`;
}

function ensurePlayerStats(teamKey, ref) {
  const id = playerStatId(ref);
  const name = playerDisplayName(ref);
  if (!draft.playerStats[id]) {
    draft.playerStats[id] = { id, playerId: id, name, teamKey, goals: 0, assists: 0, wins: 0 };
  }
  draft.playerStats[id].name = name;
  draft.playerStats[id].teamKey = teamKey;
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
  const negative = seconds < 0;
  const safe = Math.abs(seconds);
  const min = String(Math.floor(safe / 60)).padStart(2, "0");
  const sec = String(safe % 60).padStart(2, "0");
  return `${negative ? "-" : ""}${min}:${sec}`;
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

  const duplicate = !isCloudMode && store.profiles.some((item) =>
    item.username === username || item.email === email || item.phone === phone
  );
  if (duplicate) {
    setAuthMessage("Ja existe perfil com esse usuario, email ou WhatsApp.", true);
    return;
  }

  if (isCloudMode) {
    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: { peladaName, username, phone }
        }
      });
      if (error) throw error;
      if (!data.session) {
        localStorage.setItem("peladafast-pending-signup", JSON.stringify({ peladaName, username, email, phone }));
        setAuthMessage("Cadastro criado. Confirme o email se o Supabase pedir. No primeiro acesso, entre usando o email; depois o usuario passa a funcionar.");
        return;
      }
      currentUser = data.user;
      profile = await createCloudProfile(data.user, { peladaName, username, email, phone });
      profile = await migrateLocalProfileToCloudIfNeeded(profile);
      isCloudMode = true;
      enterProfile(profile);
      return;
    } catch (error) {
      setAuthMessage(error.message || "Nao foi possivel criar o perfil.", true);
      return;
    }
  }

  const newProfile = {
    id: crypto.randomUUID(),
    peladaName,
    username,
    email,
    phone,
    passwordHash: await hashPassword(password),
    createdAt: new Date().toISOString(),
    seasons: [],
    currentSeasonId: null,
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
  const identity = form.get("username").trim();
  const username = normalizeUsername(identity);

  if (isCloudMode) {
    try {
      const email = await getLoginEmail(identity);
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email,
        password: form.get("password")
      });
      if (error) throw error;
      currentUser = data.user;
      let cloudProfile = await loadCloudProfile(data.user);
      if (!cloudProfile) {
        const meta = data.user.user_metadata || {};
        cloudProfile = await createCloudProfile(data.user, {
          peladaName: meta.peladaName || "Minha pelada",
          username: meta.username || username,
          email: data.user.email,
          phone: meta.phone || ""
        });
      }
      cloudProfile = await migrateLocalProfileToCloudIfNeeded(cloudProfile);
      enterProfile(cloudProfile);
      return;
    } catch (error) {
      const pending = JSON.parse(localStorage.getItem("peladafast-pending-signup") || "null");
      if (pending && normalizeUsername(identity) === pending.username) {
        setAuthMessage("Esse cadastro ainda precisa ser ativado. Entre primeiro usando o email cadastrado ou desative a confirmacao de email no Supabase.", true);
      } else {
        setAuthMessage(error.message || "Usuario ou senha incorretos.", true);
      }
      return;
    }
  }

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

  if (isCloudMode) {
    getLoginEmail(identity)
      .then((email) => supabaseClient.auth.resetPasswordForEmail(email))
      .then(({ error }) => {
        if (error) throw error;
        setAuthMessage("Enviamos a recuperacao para o email cadastrado.");
      })
      .catch((error) => setAuthMessage(error.message || "Nao foi possivel recuperar.", true));
    return;
  }

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
  profile = ensureProfileDefaults(nextProfile);
  draft = profile.draft || newDraft();
  draft.completedMatches ||= [];
  draft.playerStats ||= {};
  draft.settings ||= { ...DEFAULT_SETTINGS };
  draft.seasonId ||= profile.currentSeasonId;
  els.authShell.classList.add("hidden");
  els.appShell.classList.remove("hidden");
  els.profileUser.textContent = `@${profile.username}`;
  els.profileName.textContent = profile.peladaName;
  setSyncStatus(isCloudMode ? "Nuvem ativa" : "Modo local", isCloudMode ? "cloud" : "local");
  showAppTab("game");
  render();
}

async function logout() {
  clearInterval(timerId);
  if (isCloudMode && supabaseClient) {
    await supabaseClient.auth.signOut();
  }
  profile = null;
  draft = null;
  currentUser = null;
  if (!isCloudMode) store.activeProfileId = null;
  saveStore();
  els.appShell.classList.add("hidden");
  els.authShell.classList.remove("hidden");
  showAuthTab("login");
}

function render() {
  clearInterval(timerId);
  timerId = null;
  if (!profile || !draft) return;
  if (draft.mode !== "match") els.appShell.classList.remove("full-score-active");

  els.setupView.classList.toggle("hidden", draft.mode !== "setup");
  els.matchView.classList.toggle("hidden", draft.mode !== "match");
  els.endedView.classList.toggle("hidden", draft.mode !== "ended");
  els.finalView.classList.toggle("hidden", !["rating", "final"].includes(draft.mode));

  renderSetup();
  if (draft.currentMatch) renderMatch();
  if (draft.finishedMatch) renderEnded();
  if (draft.mode === "rating") renderRatingView();
  if (draft.finalSummary) renderFinalSummary();
  saveStore();
}

function renderSetup() {
  renderSeasonControls();
  els.durationInput.value = draft.settings.durationMinutes;
  els.goalLimitInput.value = draft.settings.goalLimit;
  els.playersPerTeamInput.value = draft.settings.playersPerTeam || DEFAULT_SETTINGS.playersPerTeam;
  els.teamsGrid.innerHTML = teamKeys().map((key) => {
    const meta = teamMeta(key);
    const players = draft.teams[key].players;
    const list = players.length
      ? players.map((ref) => `
          <div class="player-pill ${playerType(ref)}">
            ${renderPlayerAvatar(ref)}
            <span>${escapeHtml(playerDisplayName(ref))}</span>
            <button class="remove-player" data-team="${key}" data-player="${escapeHtml(ref)}" title="Remover ${escapeHtml(playerDisplayName(ref))}">x</button>
          </div>
        `).join("")
      : "<p>Nenhum jogador</p>";

    return `
      <article class="team-card" style="--team-color: ${meta.color}">
        <div class="team-title"><span class="swatch"></span><h3>${meta.name}</h3></div>
        <label class="team-color-picker">Cor do time
          <select data-team-color="${key}" style="--selected-color: ${meta.color}">
            ${renderTeamColorOptions(teamColorId(key))}
          </select>
        </label>
        <form class="player-form" data-team-form="${key}">
          <select name="player" ${availablePlayersForTeam(key).length ? "" : "disabled"}>
            ${renderPlayerOptions(key)}
          </select>
          <button class="icon-button" title="Adicionar jogador">+</button>
        </form>
        ${profile.players.length ? "" : `<p>Cadastre jogadores na aba Jogadores.</p>`}
        <div class="player-list">${list}</div>
      </article>
    `;
  }).join("");

  els.drawMatch.disabled = !profile.currentSeasonId || !teamKeys().every((key) => draft.teams[key].players.length > 0);
  els.balanceTeams.disabled = profile.players.length < 3;
}

function selectedPlayerRefs() {
  return teamKeys().flatMap((key) => draft.teams[key].players);
}

function availablePlayersForTeam(teamKey) {
  const selected = selectedPlayerRefs();
  return profile.players.filter((player) => !selected.includes(player.id));
}

function renderPlayerOptions(teamKey) {
  const available = availablePlayersForTeam(teamKey);
  if (!available.length) return `<option value="">Sem jogadores disponiveis</option>`;
  return `<option value="">Escolha um jogador</option>` + available.map((player) =>
    `<option value="${player.id}">${escapeHtml(player.firstName)} ${escapeHtml(player.lastName)}</option>`
  ).join("");
}

function renderPlayerAvatar(ref) {
  const photo = playerPhoto(ref);
  const name = playerDisplayName(ref);
  if (photo) return `<img class="player-avatar" src="${photo}" alt="${escapeHtml(name)}">`;
  return `<span class="player-avatar placeholder">${escapeHtml(name.slice(0, 1).toUpperCase())}</span>`;
}

function renderPlayers() {
  els.playerFormTitle.textContent = els.playerProfileForm.elements.playerId.value ? "Editar jogador" : "Novo jogador";
  els.cancelPlayerEdit.classList.toggle("hidden", !els.playerProfileForm.elements.playerId.value);

  if (!profile.players.length) {
    els.registeredPlayers.innerHTML = "<p>Nenhum jogador cadastrado ainda.</p>";
    return;
  }

  els.registeredPlayers.innerHTML = profile.players
    .slice()
    .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
    .map(renderRegisteredPlayerCard).join("");
}

function renderRegisteredPlayerCard(player) {
  const stats = playerSummary(player.id);
  return `
    <article class="registered-player ${player.memberType}">
      ${renderPlayerAvatar(player.id)}
      <div>
        <strong>${escapeHtml(player.firstName)} ${escapeHtml(player.lastName)}</strong>
        <span>${player.memberType === "mensalista" ? "Mensalista" : "Suplente"} | Nota ${stats.rating || "3.0"} | Forma ${Math.round(playerPower(player.id))}</span>
        <div class="player-metrics">
          <small>${stats.goals} G</small>
          <small>${stats.assists} A</small>
          <small>${stats.wins} V</small>
          <small>${stats.ownGoals} GC</small>
        </div>
        <div class="badge-list">${playerBadges(stats).map((badge) => `<span class="mini-pill trophy">${badge}</span>`).join("") || "<span class=\"mini-pill\">Sem selo ainda</span>"}</div>
      </div>
      <div class="card-actions">
        <button class="secondary-action" data-edit-player="${player.id}">Editar</button>
        <button class="danger-action" data-delete-player="${player.id}">Remover</button>
      </div>
    </article>
  `;
}

function readPhotoFile(file) {
  return new Promise((resolve) => {
    if (!file) return resolve("");
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => resolve("");
    reader.readAsDataURL(file);
  });
}

async function savePlayerProfile(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const id = data.get("playerId") || crypto.randomUUID();
  const existing = profile.players.find((player) => player.id === id);
  const file = form.elements.photo.files[0];
  const photo = file ? await readPhotoFile(file) : existing?.photo || "";
  const player = {
    id,
    firstName: data.get("firstName").trim(),
    lastName: data.get("lastName").trim(),
    memberType: data.get("memberType"),
    photo,
    createdAt: existing?.createdAt || new Date().toISOString()
  };

  if (!player.firstName || !player.lastName) return;
  if (existing) Object.assign(existing, player);
  else profile.players.push(player);

  if (isCloudMode) {
    const { error } = await supabaseClient.from("players").upsert({
      id: player.id,
      profile_id: currentUser.id,
      first_name: player.firstName,
      last_name: player.lastName,
      member_type: player.memberType,
      photo_path: player.photo || null
    });
    if (error) {
      alert("Nao foi possivel salvar o jogador na nuvem.");
      console.warn(error);
      return;
    }
  }

  profile.sessions.forEach((session) => {
    session.stats.forEach((stat) => {
      if (stat.id === player.id || stat.playerId === player.id) {
        stat.name = `${player.firstName} ${player.lastName}`.trim();
        stat.playerId = player.id;
      }
    });
    recalculateSession(session);
  });

  form.reset();
  form.elements.playerId.value = "";
  saveStore();
  renderPlayers();
  render();
}

function editPlayerProfile(playerId) {
  const player = profile.players.find((item) => item.id === playerId);
  if (!player) return;
  els.playerProfileForm.elements.playerId.value = player.id;
  els.playerProfileForm.elements.firstName.value = player.firstName;
  els.playerProfileForm.elements.lastName.value = player.lastName;
  els.playerProfileForm.elements.memberType.value = player.memberType;
  renderPlayers();
  els.playerProfileForm.scrollIntoView({ behavior: "smooth", block: "center" });
  els.playerProfileForm.elements.firstName.focus();
}

function deletePlayerProfile(playerId) {
  const inUse = selectedPlayerRefs().includes(playerId) || profile.sessions.some((session) =>
    session.stats.some((stat) => stat.id === playerId || stat.playerId === playerId)
  );
  if (inUse) {
    alert("Este jogador ja aparece em times ou historico. Edite os dados dele em vez de remover.");
    return;
  }
  if (!confirm("Remover este jogador cadastrado?")) return;
  profile.players = profile.players.filter((player) => player.id !== playerId);
  if (isCloudMode) {
    supabaseClient.from("players").delete().eq("id", playerId).then(({ error }) => {
      if (error) console.warn("Falha ao remover jogador na nuvem", error);
    });
  }
  saveStore();
  renderPlayers();
  render();
}

function renderSeasonControls() {
  const season = currentSeason();
  if (season && profile.currentSeasonId !== season.id) {
    profile.currentSeasonId = season.id;
    draft.seasonId = season.id;
  }
  els.seasonSelect.innerHTML = season
    ? `<option value="${season.id}">${escapeHtml(season.name)}</option>`
    : `<option value="">Crie uma temporada para iniciar</option>`;
  els.seasonSelect.value = season?.id || "";
  els.seasonSelect.disabled = !season;
  els.seasonForm.elements.seasonName.disabled = Boolean(season);
  els.seasonForm.elements.seasonName.placeholder = season ? "Finalize a temporada atual para criar outra" : "Ex: Temporada 2026.1";
  els.seasonForm.querySelector("button").disabled = Boolean(season);
}

function finishCurrentSeason() {
  const season = currentSeason();
  if (!season) return;
  const sessions = filteredSessions("season");
  const stats = buildOverallStats(sessions);
  season.finishedAt = new Date().toISOString();
  season.awards = {
    topScorers: tiedLeaders(stats, "goals"),
    topAssistants: tiedLeaders(stats, "assists"),
    topHot: tiedLeaders(stats, "wins"),
    topMvp: tiedLeaders(stats, "performanceScore"),
    sessions: sessions.length,
    matches: sessions.reduce((sum, session) => sum + (session.matches?.length || 0), 0)
  };
  profile.currentSeasonId = null;
  draft.seasonId = null;
  saveStore();
  renderData();
  alert("Temporada finalizada e premiaçoes calculadas.");
}

function tiedLeaders(stats, field) {
  const max = Math.max(0, ...stats.map((item) => Number(item[field]) || 0));
  if (!max) return [];
  return stats.filter((item) => Number(item[field]) === max).map((item) => ({ name: item.name, value: Number(item[field]) || 0 }));
}

function renderMatch() {
  const match = draft.currentMatch;
  const [left, right] = match.playing;
  els.matchLabel.textContent = `Partida ${draft.matchNumber}`;
  els.leftPanel.style.setProperty("--team-color", teamColor(left));
  els.rightPanel.style.setProperty("--team-color", teamColor(right));
  els.leftPanel.innerHTML = renderTeamPanel(left);
  els.rightPanel.innerHTML = renderTeamPanel(right);
  els.timer.textContent = formatClock(match.remaining);
  els.matchRule.textContent = `${match.goalLimit} gol${match.goalLimit === 1 ? "" : "s"} ou ${match.durationMinutes} minuto${match.durationMinutes === 1 ? "" : "s"}`;
  els.fullScoreMode.textContent = els.matchView.classList.contains("full-score") ? "Sair do placar cheio" : "Placar cheio";
  els.appShell.classList.toggle("full-score-active", els.matchView.classList.contains("full-score"));
  els.startCountdown.classList.toggle("hidden", match.isRunning || match.isTimeUp);
  els.endTimedMatch.classList.toggle("hidden", !match.isTimeUp);
  renderLineupCheck();
  els.matchHistoryLive.innerHTML = renderMatchHistoryPreview();
  els.matchHistoryLive.classList.toggle("hidden", !draft.completedMatches.length);
  renderBench();
  renderGoalForm();
  renderStats();
  startTimer();
}

function toggleFullScoreMode() {
  els.matchView.classList.toggle("full-score");
  render();
}

function renderTeamPanel(teamKey) {
  const meta = teamMeta(teamKey);
  const score = draft.currentMatch.score[teamKey];
  const players = matchRoster(teamKey).map((ref) => {
    const isGuest = !draft.teams[teamKey].players.includes(ref);
    return `<span class="mini-pill ${playerType(ref)} ${isGuest ? "guest" : ""}">${escapeHtml(playerDisplayName(ref))}${isGuest ? " emprestado" : ""}</span>`;
  }).join("");
  return `
    <p class="eyebrow">Time ${meta.name}</p>
    <button class="primary-action quick-goal" data-quick-goal="${teamKey}" type="button">+1 gol</button>
    <div class="score" data-score-team="${teamKey}">${score}</div>
    <div class="players-mini">${players}</div>
  `;
}

function openGoalPopup(teamKey) {
  if (!draft.currentMatch) return;
  els.goalTeam.value = teamKey;
  els.ownGoal.checked = false;
  fillPlayerOptions();
  els.goalPopupTitle.textContent = `Gol para ${teamName(teamKey)}`;
  els.goalPopupSlot.appendChild(els.goalForm);
  els.goalPopup.classList.remove("hidden");
}

function closeGoalPopup() {
  els.goalFormHome.before(els.goalForm);
  els.goalPopup.classList.add("hidden");
}

function renderLineupCheck() {
  const match = draft.currentMatch;
  if (!match) {
    els.lineupCheck.innerHTML = "";
    return;
  }
  els.lineupCheck.innerHTML = `
    <div class="section-head">
      <div>
        <p class="eyebrow">Conferencia do elenco</p>
        <h2>Complete o time antes de iniciar</h2>
      </div>
    </div>
    <div class="lineup-grid">
      ${match.playing.map((teamKey) => renderLineupTeam(teamKey)).join("")}
    </div>
  `;
}

function renderLineupTeam(teamKey) {
  const base = draft.teams[teamKey].players;
  const guests = draft.currentMatch.guests[teamKey] || [];
  const out = draft.currentMatch.out?.[teamKey] || [];
  const currentRoster = matchRoster(teamKey);
  const options = availableGuestPlayers(teamKey);
  return `
    <article class="lineup-card" style="--team-color: ${teamColor(teamKey)}">
      <h3>${teamName(teamKey)}</h3>
      <div class="lineup-list">
        ${base.map((ref) => `<span class="mini-pill ${playerType(ref)}">${escapeHtml(playerDisplayName(ref))}</span>`).join("")}
        ${guests.map((ref) => `
          <span class="mini-pill ${playerType(ref)} guest">
            ${escapeHtml(playerDisplayName(ref))} emprestado
            <button type="button" data-remove-guest="${ref}" data-team="${teamKey}">x</button>
          </span>
        `).join("")}
        ${out.map((ref) => `
          <span class="mini-pill out">
            ${escapeHtml(playerDisplayName(ref))} saiu
            <button type="button" data-return-out="${ref}" data-team="${teamKey}">x</button>
          </span>
        `).join("")}
      </div>
      <form class="complete-form" data-complete-team="${teamKey}">
        <label>Quem sai
          <select name="outgoing" ${currentRoster.length ? "" : "disabled"}>
            ${currentRoster.map((ref) => `<option value="${escapeHtml(ref)}">${escapeHtml(playerDisplayName(ref))}</option>`).join("")}
          </select>
        </label>
        <label>Completar elenco
          <select name="guest" ${options.length ? "" : "disabled"}>
            ${options.length ? `<option value="">Escolha jogador</option>` + options.map((player) => {
              const baseTeam = baseTeamOfPlayer(player.id);
              return `<option value="${player.id}">${escapeHtml(player.firstName)} ${escapeHtml(player.lastName)} (${baseTeam ? teamName(baseTeam) : "fora"})</option>`;
            }).join("") : `<option value="">Sem jogadores disponiveis</option>`}
          </select>
        </label>
        <button class="secondary-action" type="submit" ${options.length ? "" : "disabled"}>Adicionar</button>
      </form>
    </article>
  `;
}

function renderBench() {
  const bench = teamMeta(benchTeamKey());
  els.benchStrip.innerHTML = `
    <span class="bench-name">Time de fora</span>
    <span class="bench-team"><span class="swatch" style="background: ${bench.color}"></span>${bench.name}</span>
  `;
}

function renderGoalForm() {
  const active = activeTeamKeys();
  const canRegisterGoal = Boolean(draft.currentMatch?.isRunning || draft.currentMatch?.isTimeUp);
  els.goalTeam.innerHTML = active.map((key) => `<option value="${key}">${teamName(key)}</option>`).join("");
  if (!active.includes(els.goalTeam.value)) els.goalTeam.value = active[0];
  els.goalForm.querySelectorAll("select, button[type='submit']").forEach((field) => {
    field.disabled = !canRegisterGoal;
  });
  fillPlayerOptions();
  updateGoalFormState();
  els.undoLastGoal.disabled = !draft.currentMatch?.goals?.length;
}

function fillPlayerOptions() {
  const teamKey = els.goalTeam.value;
  const ownGoal = els.ownGoal.checked;
  const opponentKey = activeTeamKeys().find((key) => key !== teamKey);
  const players = ownGoal ? matchRoster(opponentKey) : sortGoalPlayers(matchRoster(teamKey));
  const previousScorer = players.includes(els.goalPlayer.value) ? els.goalPlayer.value : players[0] || "";
  const previousAssistant = els.assistPlayer.value;
  els.goalPlayer.innerHTML = players.map((ref) => `<option value="${escapeHtml(ref)}">${escapeHtml(playerDisplayName(ref))}</option>`).join("");
  els.goalPlayer.value = previousScorer;
  const scorer = els.goalPlayer.value || players[0] || "";
  const assistOptions = players.filter((ref) => ref !== scorer);
  els.assistPlayer.innerHTML = ownGoal
    ? `<option value="">Gol contra nao tem assistencia</option>`
    : assistOptions.length
    ? `<option value="">Escolha a assistencia</option>` + assistOptions.map((ref) => `<option value="${escapeHtml(ref)}">${escapeHtml(playerDisplayName(ref))}</option>`).join("")
    : `<option value="">Sem outro jogador no time</option>`;
  if (!ownGoal && assistOptions.includes(previousAssistant)) els.assistPlayer.value = previousAssistant;
  if (!ownGoal && !els.assistPlayer.value && assistOptions.length) els.assistPlayer.value = assistOptions[0];
  els.assistPlayer.disabled = ownGoal || !assistOptions.length;
  updateGoalFormState();
}

function updateGoalFormState() {
  const submit = els.goalForm.querySelector("button[type='submit']");
  if (!submit) return;
  const canRegisterGoal = Boolean(draft.currentMatch?.isRunning || draft.currentMatch?.isTimeUp);
  submit.disabled = !canRegisterGoal || !els.goalPlayer.value || (!els.ownGoal.checked && (!els.assistPlayer.value || els.goalPlayer.value === els.assistPlayer.value));
}

function sortGoalPlayers(players) {
  return players.slice().sort((a, b) => {
    const statA = draft.playerStats[playerStatId(a)] || {};
    const statB = draft.playerStats[playerStatId(b)] || {};
    const liveA = (statA.goals || 0) * 3 + (statA.assists || 0) * 2;
    const liveB = (statB.goals || 0) * 3 + (statB.assists || 0) * 2;
    return liveB - liveA || playerPower(b) - playerPower(a) || playerDisplayName(a).localeCompare(playerDisplayName(b));
  });
}

function renderStats() {
  const stats = Object.values(draft.playerStats)
    .filter((item) => item.goals || item.assists || item.wins)
    .sort((a, b) => (b.goals + b.assists + b.wins) - (a.goals + a.assists + a.wins));

  if (!stats.length) {
    els.runningSummary.textContent = "Nenhum gol marcado ainda.";
    els.statsList.innerHTML = "";
    renderTimeline();
    return;
  }

  const totalGoals = stats.reduce((sum, item) => sum + item.goals, 0);
  els.runningSummary.textContent = `${totalGoals} gol${totalGoals === 1 ? "" : "s"} nesta pelada.`;
  els.statsList.innerHTML = stats.map((item) => `
    <div class="stat-row">
      <strong>${escapeHtml(item.name)} <small>(${teamName(item.teamKey)})</small></strong>
      <span>${item.goals || 0} G / ${item.assists || 0} A / ${item.wins || 0} V${item.ownGoals ? ` / ${item.ownGoals} GC` : ""}</span>
    </div>
  `).join("");
  renderTimeline();
}

function renderTimeline() {
  const goals = draft.currentMatch?.goals || [];
  if (!goals.length) {
    els.matchTimeline.innerHTML = `<p class="empty-note">Linha do tempo aparece aqui quando sair gol.</p>`;
    return;
  }
  els.matchTimeline.innerHTML = `
    <h3>Linha do tempo</h3>
    <div class="timeline-list">
      ${goals.slice().reverse().map((goal, reverseIndex) => {
        const number = goals.length - reverseIndex;
        const index = number - 1;
        return `
          <article class="timeline-item" style="--team-color: ${teamColor(goal.teamKey)}">
            <strong>${number}. ${teamName(goal.teamKey)} - ${goal.ownGoal ? "Gol contra" : escapeHtml(playerDisplayName(goal.scorer))}</strong>
            <span>${formatClock(goal.at)} | ${goal.ownGoal ? `Contra de ${escapeHtml(playerDisplayName(goal.scorer))}` : `Assistencia: ${escapeHtml(playerDisplayName(goal.assistant))}`}</span>
            <div class="timeline-actions">
              <button class="secondary-action" data-edit-goal="${index}" type="button">Corrigir</button>
              <button class="danger-action" data-delete-goal="${index}" type="button">Apagar</button>
            </div>
          </article>
        `;
      }).join("")}
    </div>
  `;
}

function renderEnded() {
  const match = draft.finishedMatch;
  const scoreLine = match.playing.map((key) => `${teamName(key, match)} ${match.score[key]}`).join(" x ");
  const winner = match.winner ? teamName(match.winner, match) : null;
  const king = match.kingTable ? teamName(match.stayTeam, match) : null;
  els.resultBand.innerHTML = `
    <p class="eyebrow">Partida ${draft.matchNumber} encerrada</p>
    <h2>${scoreLine}</h2>
    <p>${winner ? `Vencedor: ${winner}${match.overtimeGoal ? " com gol apos o tempo" : ""}` : king ? `Rei da mesa: ${king} permanece em campo sem contar vitoria.` : "Empate no tempo. Escolha rei da mesa ou defina um vencedor."}</p>
    ${renderMatchHistoryPreview(match)}
  `;

  const needsResolution = !match.winner && !match.kingTable;
  els.winnerChoice.classList.toggle("hidden", !needsResolution);
  els.nextMatch.disabled = needsResolution;
  els.finishSession.disabled = needsResolution;
  if (needsResolution) {
    els.winnerChoice.innerHTML = `
      <h3>Como resolver o empate?</h3>
      <div class="choice-buttons">
        <button class="primary-action" data-king-table="${match.enteredTeam || match.playing[1]}">Rei da mesa: ${teamName(match.enteredTeam || match.playing[1], match)}</button>
      </div>
      <p>Rei da mesa mantem em campo quem veio da de fora, mas nao soma vitoria.</p>
      <label class="overtime-choice">
        <input type="checkbox" id="overtimeGoalChoice">
        Teve gol apos o tempo regulamentar
      </label>
      <div class="choice-buttons">
        ${match.playing.map((key) => `<button class="secondary-action" data-winner="${key}">Escolher vencedor: ${teamName(key, match)}</button>`).join("")}
      </div>
    `;
  } else {
    els.winnerChoice.innerHTML = "";
  }
}

function renderMatchHistoryPreview(extraMatch = null) {
  const matches = [...(draft.completedMatches || [])];
  if (extraMatch && !extraMatch.stored) matches.push(extraMatch);
  if (!matches.length) return "";
  return `
    <div class="match-history-preview">
      <h3>Historico da pelada</h3>
      ${matches.map((item, index) => {
        const score = item.playing.map((key) => `${teamName(key, item)} ${item.score[key]}`).join(" x ");
        const result = item.winner ? `Vencedor: ${teamName(item.winner, item)}` : `Rei da mesa: ${teamName(item.stayTeam, item)}`;
        return `<div class="summary-row"><strong>Jogo ${index + 1}</strong><span>${score} | ${result}</span></div>`;
      }).join("")}
    </div>
  `;
}

function renderFinalSummary() {
  const summary = draft.finalSummary;
  els.finalView.innerHTML = `
    <section class="podium-card" id="podiumCard">
      <a class="logo-link" href="comercial.html" aria-label="Ir para o site comercial PeladaFast">
        <img src="peladafast-logo.png" alt="PeladaFast">
      </a>
      <p class="eyebrow">Pelada finalizada</p>
      <h2>${escapeHtml(summary.winnerTeam.label)}</h2>
      <div class="leader-grid">
        <div class="leader-box"><span>Equipe campea</span><strong>${escapeHtml(summary.winnerTeam.label)}</strong></div>
        <div class="leader-box"><span>Artilheiro</span><strong>${escapeHtml(summary.topScorer.label)}</strong></div>
        <div class="leader-box"><span>Maior assistente</span><strong>${escapeHtml(summary.topAssistant.label)}</strong></div>
        <div class="leader-box"><span>Pe quente</span><strong>${escapeHtml(summary.topHot.label)}</strong></div>
        <div class="leader-box"><span>Destaque</span><strong>${escapeHtml(summary.topMvp?.label || "Sem destaque")}</strong></div>
      </div>
    </section>
    <div class="next-actions">
      <button class="primary-action big" id="freshSession">Nova pelada</button>
      <button class="primary-action" id="exportPodiumImage">Imagem WhatsApp</button>
      <button class="secondary-action" id="copyFinalReport">Copiar resumo</button>
      <button class="secondary-action" id="openDataFromFinal">Ver dados</button>
    </div>
  `;
  document.querySelector("#freshSession").addEventListener("click", resetDraft);
  document.querySelector("#exportPodiumImage").addEventListener("click", exportPodiumImage);
  document.querySelector("#copyFinalReport").addEventListener("click", () => {
    navigator.clipboard?.writeText(summary.report || "").then(() => alert("Resumo copiado."));
  });
  document.querySelector("#openDataFromFinal").addEventListener("click", () => showAppTab("data"));
}

function startTimer() {
  if (draft.mode !== "match" || !draft.currentMatch?.isRunning) return;
  timerId = setInterval(() => {
    if (!draft.currentMatch) return clearInterval(timerId);
    draft.currentMatch.remaining -= 1;
    if (draft.currentMatch.remaining <= 0 && !draft.currentMatch.isTimeUp) {
      draft.currentMatch.isTimeUp = true;
      render();
      return;
    }
    els.timer.textContent = formatClock(draft.currentMatch.remaining);
    saveStore();
  }, 1000);
}

function startFirstMatch() {
  draft.seasonId = profile.currentSeasonId;
  const order = shuffle(teamKeys());
  startMatch([order[0], order[1]], order[2]);
}

function balanceTeamsByPerformance() {
  if (profile.players.length < 3) return;
  const limit = Math.max(1, Number(draft.settings.playersPerTeam) || DEFAULT_SETTINGS.playersPerTeam);
  const totals = Object.fromEntries(teamKeys().map((key) => [key, 0]));
  const counts = Object.fromEntries(teamKeys().map((key) => [key, 0]));
  draft.teams = Object.fromEntries(teamKeys().map((key) => [key, { players: [] }]));
  draft.playerStats = {};

  profile.players
    .slice()
    .sort((a, b) => playerPower(b.id) - playerPower(a.id) || `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
    .forEach((player) => {
      const target = teamKeys()
        .slice()
        .filter((key) => counts[key] < limit)
        .sort((a, b) => totals[a] - totals[b] || counts[a] - counts[b])[0];
      if (!target) return;
      draft.teams[target].players.push(player.id);
      totals[target] += playerPower(player.id);
      counts[target] += 1;
      ensurePlayerStats(target, player.id);
    });
  render();
}

function playerPower(playerId) {
  const sessions = profile.sessions || [];
  let goals = 0;
  let assists = 0;
  let wins = 0;
  let ownGoals = 0;
  let ratingSum = 0;
  let weightSum = 0;
  sessions.slice(-6).forEach((session, index, recentSessions) => {
    const weight = 1 + (index / Math.max(1, recentSessions.length - 1)) * 2;
    (session.stats || []).forEach((item) => {
      if (item.id !== playerId && item.playerId !== playerId) return;
      goals += (Number(item.goals) || 0) * weight;
      assists += (Number(item.assists) || 0) * weight;
      wins += (Number(item.wins) || 0) * weight;
      ownGoals += (Number(item.ownGoals) || 0) * weight;
      if (item.rating) {
        ratingSum += (Number(item.rating) || 0) * weight;
        weightSum += weight;
      }
    });
  });
  const rating = weightSum ? ratingSum / weightSum : 3;
  return calculatePerformanceScore({ goals, assists, wins, ownGoals }, rating);
}

function playerSummary(playerId) {
  const total = { goals: 0, assists: 0, wins: 0, ownGoals: 0, ratingSum: 0, ratingCount: 0, sessions: 0 };
  (profile.sessions || []).forEach((session) => {
    (session.stats || []).forEach((item) => {
      if (item.id !== playerId && item.playerId !== playerId) return;
      total.goals += Number(item.goals) || 0;
      total.assists += Number(item.assists) || 0;
      total.wins += Number(item.wins) || 0;
      total.ownGoals += Number(item.ownGoals) || 0;
      total.sessions += 1;
      if (item.rating) {
        total.ratingSum += Number(item.rating) || 0;
        total.ratingCount += 1;
      }
    });
  });
  return {
    ...total,
    rating: total.ratingCount ? (total.ratingSum / total.ratingCount).toFixed(1) : "3.0"
  };
}

function playerBadges(stats) {
  const badges = [];
  if (stats.goals >= 10) badges.push("Artilheiro");
  if (stats.assists >= 10) badges.push("Garcom");
  if (stats.wins >= 10) badges.push("Pe quente");
  if (Number(stats.rating) >= 4.5 && stats.ratingCount >= 2) badges.push("5 estrelas");
  if (stats.goals >= 3) badges.push("Hat-trick");
  return badges;
}

function startMatch(playing, bench) {
  draft.matchNumber += 1;
  const durationMinutes = Number(draft.settings.durationMinutes) || DEFAULT_SETTINGS.durationMinutes;
  const goalLimit = Number(draft.settings.goalLimit) || DEFAULT_SETTINGS.goalLimit;
  draft.currentMatch = {
    playing,
    bench,
    enteredTeam: playing[1],
    score: { [playing[0]]: 0, [playing[1]]: 0 },
    guests: { [playing[0]]: [], [playing[1]]: [] },
    out: { [playing[0]]: [], [playing[1]]: [] },
    goals: [],
    remaining: durationMinutes * 60,
    durationMinutes,
    goalLimit,
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
  const ownGoal = els.ownGoal.checked;
  if (!teamKey || !scorer || (!ownGoal && (!assistant || assistant === scorer))) {
    alert("Escolha quem fez o gol e quem deu a assistencia. A assistencia e obrigatoria.");
    return;
  }
  const message = ownGoal
    ? `Confirmar gol contra de ${playerDisplayName(scorer)} para o time ${teamName(teamKey)}?`
    : `Confirmar gol de ${playerDisplayName(scorer)}, assistencia de ${playerDisplayName(assistant)}, para o time ${teamName(teamKey)}?`;
  if (!confirm(message)) return;

  if (ownGoal) {
    const scorerTeam = activeTeamKeys().find((key) => key !== teamKey);
    const stat = ensurePlayerStats(scorerTeam, scorer);
    stat.ownGoals = (stat.ownGoals || 0) + 1;
  } else {
    ensurePlayerStats(teamKey, scorer).goals += 1;
    ensurePlayerStats(teamKey, assistant).assists += 1;
  }

  draft.currentMatch.score[teamKey] += 1;
  draft.currentMatch.goals.push({
    teamKey,
    scorer,
    assistant: ownGoal ? "" : assistant,
    ownGoal,
    at: matchDurationSeconds(draft.currentMatch) - draft.currentMatch.remaining
  });
  celebrateGoal(teamKey);

  if (draft.currentMatch.overtimeResolution) {
    finishCurrentMatch("overtime-goal", teamKey);
    closeGoalPopup();
  } else if (draft.currentMatch.score[teamKey] >= draft.currentMatch.goalLimit) {
    finishCurrentMatch("goals", teamKey);
    closeGoalPopup();
  } else {
    closeGoalPopup();
    render();
  }
}

function undoLastGoal() {
  const match = draft.currentMatch;
  if (!match?.goals?.length) return;
  removeGoalAt(match.goals.length - 1);
}

function removeGoalAt(index) {
  const match = draft.currentMatch;
  if (!match?.goals?.[index]) return null;
  const [goal] = match.goals.splice(index, 1);
  match.score[goal.teamKey] = Math.max(0, (match.score[goal.teamKey] || 0) - 1);
  const scorerStat = draft.playerStats[playerStatId(goal.scorer)];
  if (goal.ownGoal) {
    if (scorerStat) scorerStat.ownGoals = Math.max(0, (scorerStat.ownGoals || 0) - 1);
  } else {
    if (scorerStat) scorerStat.goals = Math.max(0, (scorerStat.goals || 0) - 1);
    const assistantStat = draft.playerStats[playerStatId(goal.assistant)];
    if (assistantStat) assistantStat.assists = Math.max(0, (assistantStat.assists || 0) - 1);
  }
  render();
  return goal;
}

function editGoalAt(index) {
  const goal = removeGoalAt(index);
  if (!goal) return;
  els.goalTeam.value = goal.teamKey;
  els.ownGoal.checked = Boolean(goal.ownGoal);
  fillPlayerOptions();
  els.goalPlayer.value = goal.scorer;
  fillPlayerOptions();
  els.assistPlayer.value = goal.assistant;
  updateGoalFormState();
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
  const hasOvertimeGoal = Boolean(document.querySelector("#overtimeGoalChoice")?.checked);
  if (hasOvertimeGoal) {
    draft.currentMatch = {
      ...draft.finishedMatch,
      winner: null,
      kingTable: false,
      stayTeam: "",
      overtimeGoal: true,
      overtimeResolution: true,
      isRunning: false,
      isTimeUp: true
    };
    draft.finishedMatch = null;
    draft.mode = "match";
    render();
    openGoalPopup(teamKey);
    return;
  }
  draft.finishedMatch.winner = teamKey;
  draft.finishedMatch.kingTable = false;
  draft.finishedMatch.stayTeam = "";
  draft.finishedMatch.overtimeGoal = false;
  render();
}

function chooseKingTable(teamKey) {
  draft.finishedMatch.winner = null;
  draft.finishedMatch.kingTable = true;
  draft.finishedMatch.stayTeam = teamKey;
  draft.finishedMatch.overtimeGoal = false;
  render();
}

function storeFinishedMatch() {
  if ((!draft.finishedMatch?.winner && !draft.finishedMatch?.kingTable) || draft.finishedMatch.stored) return;
  const match = { ...draft.finishedMatch, stored: true };
  draft.completedMatches.push(match);
  if (match.winner) {
    matchRoster(match.winner, match).forEach((ref) => {
      ensurePlayerStats(match.winner, ref).wins += 1;
    });
  }
  draft.finishedMatch.stored = true;
  saveStore();
}

function startNextMatch() {
  storeFinishedMatch();
  const stay = draft.finishedMatch.winner || draft.finishedMatch.stayTeam;
  const entering = draft.finishedMatch.bench;
  const leaving = draft.finishedMatch.playing.find((teamKey) => teamKey !== stay);
  startMatch([stay, entering], leaving);
}

function finishSession() {
  storeFinishedMatch();
  draft.playerRatings ||= {};
  Object.values(draft.playerStats).forEach((item) => {
    draft.playerRatings[item.id] ||= 3;
  });
  draft.mode = "rating";
  saveStore();
  render();
}

function renderRatingView() {
  const players = Object.values(draft.playerStats)
    .sort((a, b) => a.name.localeCompare(b.name));
  els.finalView.innerHTML = `
    <p class="eyebrow">Notas da pelada</p>
    <h2>Revise e avalie cada jogador</h2>
    ${renderSessionReview()}
    <p>Use notas de 1 a 5 para ajustar a forca do jogador ao longo do tempo. Isso ajuda o sistema a criar uma nota mais justa.</p>
    <form id="ratingForm" class="rating-form">
      ${players.map((item) => `
        <label class="rating-row">
          <span>
            <strong>${escapeHtml(item.name)}</strong>
            <small>${item.goals} G / ${item.assists} A / ${item.wins} V</small>
          </span>
          <input name="rating_${item.id}" type="range" min="1" max="5" step="1" value="${draft.playerRatings?.[item.id] || 3}" data-rating-input="${item.id}">
          <output>${draft.playerRatings?.[item.id] || 3}</output>
        </label>
      `).join("")}
      <div class="next-actions">
        <button class="secondary-action" id="backToLastMatch" type="button">Voltar para corrigir</button>
        <button class="primary-action big" data-complete-ratings type="submit">Salvar notas e finalizar</button>
      </div>
    </form>
  `;
}

function renderSessionReview() {
  const matches = draft.completedMatches || [];
  return `
    <section class="review-panel">
      <h3>Revisao antes de salvar</h3>
      <div class="data-list">
        ${matches.map((match, index) => {
          const score = match.playing.map((key) => `${teamName(key)} ${match.score[key]}`).join(" x ");
          const result = match.winner ? `Vencedor: ${teamName(match.winner)}${match.overtimeGoal ? " com gol apos o tempo" : ""}` : `Rei da mesa: ${teamName(match.stayTeam)}`;
          return `<div class="summary-row"><strong>Jogo ${index + 1}</strong><span>${score} | ${result}</span></div>`;
        }).join("") || "<p>Nenhuma partida registrada.</p>"}
      </div>
    </section>
  `;
}

async function completeSessionRatings(event) {
  event.preventDefault();
  const form = event.currentTarget.closest("form") || document.querySelector("#ratingForm");
  if (!form || draft.mode !== "rating") return;
  draft.playerRatings = {};
  Object.values(draft.playerStats).forEach((item) => {
    draft.playerRatings[item.id] = Number(form.elements[`rating_${item.id}`]?.value) || 3;
  });
  const summary = buildSessionSummary();
  profile.sessions.push(summary);
  draft.finalSummary = summary;
  draft.mode = "final";
  saveStore();
  if (isCloudMode && currentUser) {
    const { error } = await supabaseClient.from("sessions").upsert(toSessionRow(summary));
    if (error) {
      alert("Pelada finalizada, mas nao consegui confirmar o salvamento na nuvem agora. Ela continua salva neste aparelho e tentara sincronizar novamente.");
      console.warn("Falha ao salvar pelada finalizada", error);
    }
  }
  render();
  if (profile.sessions.some((session) => session.id === summary.id)) {
    setSyncStatus(isCloudMode ? "Pelada salva na nuvem" : "Pelada salva", isCloudMode ? "cloud" : "local");
  }
}

function reopenLastFinishedMatch() {
  if (draft.mode !== "rating" || !draft.completedMatches.length) return;
  const match = draft.completedMatches.pop();
  draft.finishedMatch = { ...match, stored: false };
  draft.currentMatch = null;
  draft.mode = "ended";
  saveStore();
  render();
}

function buildSessionSummary() {
  const stats = Object.values(draft.playerStats).map((item) => {
    const rating = Number(draft.playerRatings?.[item.id]) || 3;
    return {
      ...item,
      rating,
      performanceScore: calculatePerformanceScore(item, rating)
    };
  });
  const winsByTeam = Object.fromEntries(teamKeys().map((key) => [key, 0]));
  draft.completedMatches.forEach((match) => {
    if (match.winner) winsByTeam[match.winner] += 1;
  });

  const winnerTeamKey = teamKeys().sort((a, b) => winsByTeam[b] - winsByTeam[a])[0];
  const hasTeamWinner = winsByTeam[winnerTeamKey] > 0;
  const teamColors = structuredClone(draft.teamColors || { blue: "blue", red: "red", green: "green" });
  const topScorer = topBy(stats, "goals", "Sem gols");
  const topAssistant = topBy(stats, "assists", "Sem assistencias");
  const topHot = topBy(stats, "wins", "Sem vitorias");
  const topMvp = topBy(stats, "performanceScore", "Sem destaque");
  const season = currentSeason();
  const summary = {
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
    seasonId: season?.id || null,
    seasonName: season?.name || "Sem temporada",
    settings: { ...draft.settings },
    teamColors,
    teams: structuredClone(draft.teams),
    matches: structuredClone(draft.completedMatches),
    stats: structuredClone(stats),
    playerRatings: { ...(draft.playerRatings || {}) },
    winsByTeam,
    winnerTeam: {
      key: hasTeamWinner ? winnerTeamKey : "",
      label: hasTeamWinner ? `${teamName(winnerTeamKey, { teamColors })} (${winsByTeam[winnerTeamKey]} vitoria${winsByTeam[winnerTeamKey] === 1 ? "" : "s"})` : "Sem vencedor por vitorias"
    },
    topScorer,
    topAssistant,
    topHot,
    topMvp
  };
  summary.report = buildReport(summary);
  return summary;
}

function topBy(stats, field, fallback) {
  const max = Math.max(0, ...stats.map((item) => Number(item[field]) || 0));
  if (!max) return { label: fallback, value: 0, players: [] };
  const tied = stats
    .filter((item) => item[field] === max)
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    label: tied.map((item) => `${item.name} (${max})`).join(", "),
    value: max,
    players: tied.map((item) => ({ name: item.name, teamKey: item.teamKey }))
  };
}

function calculatePerformanceScore(item, rating = 3) {
  return ((Number(item.goals) || 0) * 3)
    + ((Number(item.assists) || 0) * 2)
    + ((Number(item.wins) || 0) * 1.5)
    + ((Number(rating) || 3) * 2)
    - ((Number(item.ownGoals) || 0) * 1);
}

function buildReport(summary) {
  const lines = [
    `Relatorio ${profile.peladaName}`,
    "",
    `Time vitorioso: ${summary.winnerTeam.label}`,
    `Artilheiro: ${summary.topScorer.label}`,
    `Maior assistente: ${summary.topAssistant.label}`,
    `Pe quente: ${summary.topHot.label}`,
    `Destaque PeladaFast: ${summary.topMvp?.label || "Sem destaque"}`,
    "",
    "Jogadores:"
  ];
  summary.stats
    .sort((a, b) => teamName(a.teamKey, summary).localeCompare(teamName(b.teamKey, summary)) || a.name.localeCompare(b.name))
    .forEach((item) => lines.push(`- ${item.name} (${teamName(item.teamKey, summary)}): ${item.goals} gol(s), ${item.assists} assistencia(s), ${item.wins} vitoria(s)`));

  lines.push("", "Partidas:");
  summary.matches.forEach((match, index) => {
    const score = match.playing.map((key) => `${teamName(key, summary)} ${match.score[key]}`).join(" x ");
    const result = match.winner
      ? `Vencedor: ${teamName(match.winner, summary)}${match.overtimeGoal ? " (gol apos o tempo)" : ""}`
      : `Rei da mesa: ${teamName(match.stayTeam, summary)}`;
    lines.push(`- Jogo ${index + 1}: ${score}. ${result}`);
  });

  return lines.join("\n");
}

function renderData() {
  document.querySelectorAll("[data-data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.dataTab === activeDataTab);
  });

  const season = currentSeason();
  const sessions = filteredSessions(activeDataTab);
  const ranking = buildOverall(sessions);
  const title = activeDataTab === "today"
    ? "Peladas de hoje"
    : activeDataTab === "season"
      ? `Temporada ativa: ${season?.name || "Nenhuma temporada ativa"}`
      : "Pelada geral";

  els.dataGrid.innerHTML = `
    ${editingSessionId ? renderSessionEditor(editingSessionId) : ""}
    ${activeDataTab === "general" ? renderGeneralDataView() : `
    <section class="data-card">
      <h3>${escapeHtml(title)}</h3>
      ${activeDataTab === "season" && season ? `<div class="card-actions"><button class="secondary-action" data-finish-season type="button">Finalizar temporada ativa</button></div>` : ""}
      ${activeDataTab === "season" && !season ? "<p>Crie uma temporada na aba Jogo para comecar a registrar peladas.</p>" : ""}
      ${activeDataTab === "today" ? `<p>Historico de partidas finalizadas hoje.</p>` : renderCharts(sessions)}
      <div class="leader-grid">
        <div class="leader-box"><span>Artilharia</span><strong>${escapeHtml(ranking.topScorer.label)}</strong></div>
        <div class="leader-box"><span>Assistencias</span><strong>${escapeHtml(ranking.topAssistant.label)}</strong></div>
        <div class="leader-box"><span>Pe quente</span><strong>${escapeHtml(ranking.topHot.label)}</strong></div>
      <div class="leader-box"><span>Nota PeladaFast ${renderInfoHint()}</span><strong>${escapeHtml(ranking.topMvp.label)}</strong></div>
      </div>
    </section>
    <section class="data-card">
      <h3>${activeDataTab === "today" ? "Histórico de partidas do dia" : "Peladas registradas"}</h3>
      <div class="data-list">
        ${sessions.length ? sessions.slice().reverse().map(renderSessionCard).join("") : "<p>Nenhuma pelada finalizada ainda.</p>"}
      </div>
    </section>
    `}
  `;
}

function renderGeneralDataView() {
  const sessions = filteredSessions("general");
  const stats = buildOverallStats(sessions);
  return `
    <section class="data-card general-top">
      <h3>Resumo geral</h3>
      <div class="top5-grid">
        ${renderTopFive("Artilheiros gerais", stats, "goals", "gol")}
        ${renderTopFive("Assistentes gerais", stats, "assists", "assist.")}
        ${renderTopFive("Pes quentes gerais", stats, "wins", "vitoria")}
      </div>
    </section>
    <section class="data-card season-drawers">
      <h3>Temporadas</h3>
      ${profile.seasons.map(renderSeasonDrawer).join("")}
    </section>
  `;
}

function renderTopFive(title, stats, field, label) {
  const rows = stats
    .filter((item) => Number(item[field]) > 0)
    .sort((a, b) => Number(b[field]) - Number(a[field]) || a.name.localeCompare(b.name))
    .slice(0, 5);
  return `
    <div class="leader-box">
      <h3>${title}</h3>
      ${rows.length ? rows.map((item, index) => `<div class="summary-row"><strong>${index + 1}. ${escapeHtml(item.name)}</strong><span>${item[field]} ${label}${item[field] === 1 ? "" : "s"}</span></div>`).join("") : "<p>Sem dados.</p>"}
    </div>
  `;
}

function renderSeasonDrawer(season) {
  const sessions = (profile.sessions || []).filter((session) => session.seasonId === season.id);
  const ranking = buildOverall(sessions);
  return `
    <details class="season-drawer">
      <summary>${escapeHtml(season.name)} ${season.finishedAt ? "(finalizada)" : ""}</summary>
      ${season.awards ? renderSeasonAwards(season.awards) : ""}
      ${renderCharts(sessions)}
      <div class="leader-grid">
        <div class="leader-box"><span>Artilharia</span><strong>${escapeHtml(ranking.topScorer.label)}</strong></div>
        <div class="leader-box"><span>Assistencias</span><strong>${escapeHtml(ranking.topAssistant.label)}</strong></div>
        <div class="leader-box"><span>Pe quente</span><strong>${escapeHtml(ranking.topHot.label)}</strong></div>
        <div class="leader-box"><span>Nota PeladaFast ${renderInfoHint()}</span><strong>${escapeHtml(ranking.topMvp.label)}</strong></div>
      </div>
      <div class="data-list">
        ${sessions.length ? sessions.slice().reverse().map(renderSessionCard).join("") : "<p>Nenhuma pelada nesta temporada.</p>"}
      </div>
    </details>
  `;
}

function renderSeasonAwards(awards) {
  return `
    <div class="season-awards">
      <p class="eyebrow">Premiacao da temporada</p>
      <div class="leader-grid">
        <div class="leader-box"><span>Artilheiro</span><strong>${escapeHtml(awards.topScorers.map((item) => `${item.name} (${item.value})`).join(", ") || "Sem gols")}</strong></div>
        <div class="leader-box"><span>Assistente</span><strong>${escapeHtml(awards.topAssistants.map((item) => `${item.name} (${item.value})`).join(", ") || "Sem assistencias")}</strong></div>
        <div class="leader-box"><span>Pe quente</span><strong>${escapeHtml(awards.topHot.map((item) => `${item.name} (${item.value})`).join(", ") || "Sem vitorias")}</strong></div>
        <div class="leader-box"><span>Destaque ${renderInfoHint()}</span><strong>${escapeHtml(awards.topMvp.map((item) => `${item.name} (${item.value})`).join(", ") || "Sem notas")}</strong></div>
      </div>
    </div>
  `;
}

function renderShare() {
  const payload = buildSharePayload();
  const seasonName = payload.season.name || "Temporada atual";
  const publishedSlug = profile?.publicShares?.[payload.season.id];
  const shareLink = publishedSlug === payload.slug ? publicShareUrl(payload.slug) : "";

  els.shareGrid.innerHTML = `
    <section class="data-card share-panel">
      <div class="section-head">
        <div>
          <p class="eyebrow">${escapeHtml(seasonName)}</p>
          <h3>Link para compartilhar</h3>
        </div>
      </div>
      <p>Esse link mostra apenas os rankings e os resumos da temporada. Ninguem consegue editar jogos, jogadores ou acessar o painel por ele.</p>
      ${isCloudMode
        ? `
          <div class="share-link-box">
            <input id="shareUrl" readonly value="${escapeHtml(shareLink || "Clique em gerar link publico")}">
            <button class="secondary-action" data-copy-share type="button" ${shareLink ? "" : "disabled"}>Copiar</button>
          </div>
          <p class="share-status" id="shareStatus">${shareLink ? "Link publico pronto para envio." : "Clique em gerar link publico para publicar o resumo atual."}</p>
        `
        : `<p class="share-status error">Para criar link publico, entre pelo modo nuvem.</p>`}
    </section>
    ${renderPublicPayload(payload, true)}
  `;
}

function buildSharePayload() {
  const season = currentSeason();
  const seasonSessions = (profile?.sessions || []).filter((session) => session.seasonId === profile.currentSeasonId);
  const stats = buildOverallStats(seasonSessions);
  const rankings = {
    goals: rankingFor(stats, "goals"),
    assists: rankingFor(stats, "assists"),
    hot: rankingFor(stats, "wins"),
    mvp: rankingFor(stats, "performanceScore")
  };
  const teamWins = Object.fromEntries(teamKeys().map((key) => [key, 0]));
  seasonSessions.forEach((session) => {
    const key = session.winnerTeam?.key;
    if (key && teamWins[key] !== undefined) teamWins[key] += 1;
  });
  const championKey = teamKeys().sort((a, b) => teamWins[b] - teamWins[a])[0];
  const championValue = teamWins[championKey] || 0;

  return {
    profile: {
      peladaName: profile?.peladaName || "PeladaFast",
      username: profile?.username || "pelada"
    },
    season: {
      id: season?.id || "",
      name: season?.name || "Temporada atual"
    },
    slug: shareSlug(),
    generatedAt: new Date().toISOString(),
    totals: {
      sessions: seasonSessions.length,
      matches: seasonSessions.reduce((sum, session) => sum + (session.matches?.length || 0), 0)
    },
    championTeam: {
      key: championValue ? championKey : "",
      name: championValue ? teamName(championKey, { teamColors: draft?.teamColors }) : "Sem campeao",
      wins: championValue
    },
    rankings,
    championSessions: seasonSessions
      .filter((session) => session.winnerTeam?.key)
      .slice()
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map((session) => ({
        id: session.id,
        date: session.date,
        teamKey: session.winnerTeam.key,
        teamName: teamName(session.winnerTeam.key, session) || session.winnerTeam.label,
        label: session.winnerTeam.label,
        players: championPlayers(session)
      }))
  };
}

function rankingFor(stats, field) {
  return stats
    .filter((item) => Number(item[field]) > 0)
    .sort((a, b) => Number(b[field]) - Number(a[field]) || a.name.localeCompare(b.name))
    .map((item, index) => ({
      position: index + 1,
      name: item.name,
      value: Number(item[field]) || 0
    }));
}

function championPlayers(session) {
  const key = session.winnerTeam?.key;
  if (!key) return [];
  const base = (session.teams?.[key]?.players || []).map((ref) => sessionPlayerName(session, ref));
  const guests = (session.matches || [])
    .flatMap((match) => match.guests?.[key] || [])
    .map((ref) => `${sessionPlayerName(session, ref)} emprestado`);
  return [...new Set([...base, ...guests])];
}

function sessionPlayerName(session, ref) {
  const registered = findPlayer(ref);
  if (registered) return `${registered.firstName} ${registered.lastName}`.trim();
  const stat = (session.stats || []).find((item) => item.id === ref || item.playerId === ref);
  return stat?.name || String(ref);
}

function shareSlug() {
  if (!profile?.username || !profile?.currentSeasonId) return "";
  return `${profile.username}-${profile.currentSeasonId.slice(0, 8)}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function publicShareUrl(slug) {
  return `${window.location.origin}${window.location.pathname}?share=${encodeURIComponent(slug)}`;
}

function renderPublicPayload(payload, isPreview = false) {
  const title = isPreview ? "Previa publica" : payload.profile.peladaName;
  return `
    <section class="data-card public-summary-card">
      <p class="eyebrow">${escapeHtml(title)}</p>
      <h3>${escapeHtml(payload.season.name)}</h3>
      <div class="leader-grid">
        <div class="leader-box"><span>Peladas</span><strong>${payload.totals.sessions}</strong></div>
        <div class="leader-box"><span>Partidas</span><strong>${payload.totals.matches}</strong></div>
        <div class="leader-box"><span>Time campeao</span><strong>${escapeHtml(payload.championTeam.name)}${payload.championTeam.wins ? ` (${payload.championTeam.wins})` : ""}</strong></div>
      </div>
    </section>
    <section class="data-card ranking-card">
      <h3>Artilheiros</h3>
      ${renderPublicRanking(payload.rankings.goals, "gol")}
    </section>
    <section class="data-card ranking-card">
      <h3>Assistentes</h3>
      ${renderPublicRanking(payload.rankings.assists, "assist.")}
    </section>
    <section class="data-card ranking-card">
      <h3>Pe quente</h3>
      ${renderPublicRanking(payload.rankings.hot, "vitoria")}
    </section>
    <section class="data-card ranking-card">
      <h3>Nota PeladaFast ${renderInfoHint()}</h3>
      ${renderPublicRanking(payload.rankings.mvp || [], "ponto")}
    </section>
    <section class="data-card champion-history">
      <h3>Campeoes da temporada</h3>
      <div class="data-list">
        ${payload.championSessions.length
          ? payload.championSessions.map(renderChampionSession).join("")
          : "<p>Nenhuma pelada finalizada nesta temporada ainda.</p>"}
      </div>
    </section>
  `;
}

function renderPublicRanking(items, label) {
  if (!items.length) return "<p>Sem dados ainda.</p>";
  const max = Math.max(1, ...items.map((item) => item.value));
  return `
    <div class="ranking-list">
      ${items.map((item) => `
        <div class="ranking-row">
          <span class="rank-position">${item.position}</span>
          <strong>${escapeHtml(item.name)}</strong>
          <div class="bar-track"><i style="width: ${(item.value / max) * 100}%"></i></div>
          <span>${item.value} ${label}${item.value === 1 ? "" : "s"}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderChampionSession(session) {
  const date = new Date(session.date).toLocaleString("pt-BR");
  return `
    <article class="leader-box">
      <p class="eyebrow">${escapeHtml(date)}</p>
      <h3>${escapeHtml(session.label)}</h3>
      <div class="players-mini">
        ${session.players.length
          ? session.players.map((name) => `<span class="mini-pill">${escapeHtml(name)}</span>`).join("")
          : "<span class=\"mini-pill\">Sem jogadores registrados</span>"}
      </div>
    </article>
  `;
}

async function publishSharePage() {
  if (!isCloudMode || !supabaseClient || !currentUser) {
    renderShare();
    return;
  }
  const payload = buildSharePayload();
  const row = {
    profile_id: currentUser.id,
    season_id: payload.season.id || null,
    slug: payload.slug,
    payload,
    is_active: true
  };
  const { error } = await supabaseClient
    .from("public_share_pages")
    .upsert(row, { onConflict: "slug" });
  if (error) {
    alert("Nao consegui gerar o link publico. Confira se voce rodou o SQL atualizado no Supabase.");
    console.warn("Falha ao publicar pagina publica", error);
    return;
  }
  profile.publicShares ||= {};
  profile.publicShares[payload.season.id] = payload.slug;
  saveStore();
  renderShare();
  const input = document.querySelector("#shareUrl");
  if (navigator.clipboard && input?.value) {
    await navigator.clipboard.writeText(input.value).catch(() => {});
    const status = document.querySelector("#shareStatus");
    if (status) status.textContent = "Link publico gerado e copiado.";
  }
}

async function loadPublicShare(slug) {
  els.authShell.classList.add("hidden");
  els.appShell.classList.add("hidden");
  els.publicShell.classList.remove("hidden");
  if (!supabaseClient) {
    els.publicGrid.innerHTML = `<section class="data-card"><h3>Link indisponivel</h3><p>Este site ainda nao esta conectado na nuvem.</p></section>`;
    return;
  }
  const { data, error } = await supabaseClient
    .from("public_share_pages")
    .select("payload")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data?.payload) {
    els.publicGrid.innerHTML = `<section class="data-card"><h3>Resumo nao encontrado</h3><p>O link pode ter sido removido ou ainda nao foi publicado.</p></section>`;
    return;
  }
  const payload = data.payload;
  els.publicProfile.textContent = `@${payload.profile?.username || "pelada"}`;
  els.publicTitle.textContent = payload.profile?.peladaName || "Resumo da pelada";
  els.publicGrid.innerHTML = renderPublicPayload(payload);
}

function renderCharts(sessions) {
  const stats = buildOverallStats(sessions);
  return `
    <div class="charts-accordion">
      ${renderChartDrawer("Disputa pela artilharia", stats, "goals", true)}
      ${renderChartDrawer("Disputa por assistencias", stats, "assists")}
      ${renderChartDrawer("Disputa pe quente", stats, "wins")}
      ${renderChartDrawer(`Nota PeladaFast ${renderInfoHint()}`, stats, "performanceScore")}
    </div>
  `;
}

function renderInfoHint() {
  return `
    <button class="info-button" type="button" aria-label="Como funciona a Nota PeladaFast">i</button>
    <span class="info-popover">
      A Nota PeladaFast soma desempenho e avaliacao: gol vale 3 pontos, assistencia vale 2, vitoria vale 1,5, sua nota de 1 a 5 vale o dobro, e gol contra tira 1 ponto. As ultimas peladas pesam mais no sorteio equilibrado.
    </span>
  `;
}

function renderChartDrawer(title, stats, field, open = false) {
  return `
    <details class="chart-drawer" ${open ? "open" : ""}>
      <summary>${title}</summary>
      ${renderChart("", stats, field)}
    </details>
  `;
}

function renderChart(title, stats, field) {
  const ordered = stats
    .filter((item) => item[field] > 0)
    .sort((a, b) => b[field] - a[field] || a.name.localeCompare(b.name))
    .slice(0, 10);
  const max = Math.max(1, ...ordered.map((item) => item[field]));
  if (!ordered.length) {
    return `<div class="chart-card">${title ? `<h4>${title}</h4>` : ""}<p>Sem dados ainda.</p></div>`;
  }
  return `
    <div class="chart-card">
      ${title ? `<h4>${title}</h4>` : ""}
      ${ordered.map((item) => `
        <div class="bar-row">
          <span>${escapeHtml(item.name)}</span>
          <div class="bar-track"><i style="width: ${(item[field] / max) * 100}%"></i></div>
          <strong>${item[field]}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function filteredSessions(tab) {
  const sessions = profile.sessions || [];
  if (tab === "general") return sessions;
  if (tab === "season") {
    const season = currentSeason();
    return season ? sessions.filter((session) => session.seasonId === season.id) : [];
  }
  const today = new Date().toLocaleDateString("pt-BR");
  return sessions.filter((session) => new Date(session.date).toLocaleDateString("pt-BR") === today);
}

function renderSessionCard(session) {
  const date = new Date(session.date).toLocaleString("pt-BR");
  const matches = session.matches.map((match, index) => {
    const score = match.playing.map((key) => `${teamName(key, session)} ${match.score[key]}`).join(" x ");
    const result = match.winner ? teamName(match.winner, session) : `Rei da mesa: ${teamName(match.stayTeam, session)}`;
    return `<div class="summary-row"><strong>Jogo ${index + 1}</strong><span>${score} | ${escapeHtml(result)}</span></div>`;
  }).join("");

  return `
    <article class="leader-box">
      <p class="eyebrow">${date}</p>
      <h3>${escapeHtml(session.winnerTeam.label)}</h3>
      <div class="summary-row"><strong>Temporada</strong><span>${escapeHtml(session.seasonName || "Sem temporada")}</span></div>
      <div class="summary-row"><strong>Artilheiro</strong><span>${escapeHtml(session.topScorer.label)}</span></div>
      <div class="summary-row"><strong>Assistente</strong><span>${escapeHtml(session.topAssistant.label)}</span></div>
      ${matches}
      <div class="card-actions">
        <button class="secondary-action" data-edit-session="${session.id}">Editar</button>
        <button class="danger-action" data-delete-session="${session.id}">Apagar</button>
      </div>
    </article>
  `;
}

function renderSessionEditor(sessionId) {
  const session = profile.sessions.find((item) => item.id === sessionId);
  if (!session) return "";

  const matches = session.matches.map((match, index) => {
    const scores = match.playing.map((teamKey) => `
      <label>${teamName(teamKey, session)}
        <input name="match_${index}_score_${teamKey}" type="number" min="0" max="99" value="${match.score[teamKey] || 0}">
      </label>
    `).join("");
    return `
      <div class="editor-block">
        <h4>Partida ${index + 1}</h4>
        <div class="editor-grid">
          ${scores}
          <label>Vencedor
            <select name="match_${index}_winner">
              ${match.playing.map((teamKey) => `<option value="${teamKey}" ${match.winner === teamKey ? "selected" : ""}>${teamName(teamKey, session)}</option>`).join("")}
            </select>
          </label>
        </div>
      </div>
    `;
  }).join("");

  const stats = session.stats
    .slice()
    .sort((a, b) => teamName(a.teamKey, session).localeCompare(teamName(b.teamKey, session)) || a.name.localeCompare(b.name))
    .map((item) => `
      <div class="editor-player">
        <strong>${escapeHtml(item.name)} <small>${teamName(item.teamKey, session)}</small></strong>
        <label>Gols<input name="stat_${item.id}_goals" type="number" min="0" max="999" value="${item.goals || 0}"></label>
        <label>Assist.<input name="stat_${item.id}_assists" type="number" min="0" max="999" value="${item.assists || 0}"></label>
      </div>
    `).join("");

  return `
    <section class="data-card session-editor">
      <div class="section-head">
        <div>
          <p class="eyebrow">Correção de histórico</p>
          <h3>Editar pelada</h3>
        </div>
        <button class="secondary-action" data-cancel-edit type="button">Fechar</button>
      </div>
      <form id="sessionEditorForm" data-editing-session="${session.id}">
        <h4>Partidas</h4>
        ${matches}
        <h4>Jogadores</h4>
        <div class="editor-players">${stats}</div>
        <div class="card-actions">
          <button class="primary-action" type="submit">Salvar correções</button>
          <button class="secondary-action" data-cancel-edit type="button">Cancelar</button>
        </div>
      </form>
    </section>
  `;
}

function buildOverall(sessions) {
  const stats = buildOverallStats(sessions);
  return {
    topScorer: topBy(stats, "goals", "Sem gols"),
    topAssistant: topBy(stats, "assists", "Sem assistencias"),
    topHot: topBy(stats, "wins", "Sem vitorias"),
    topMvp: topBy(stats, "performanceScore", "Sem nota")
  };
}

function buildOverallStats(sessions) {
  const total = {};
  sessions.flatMap((session) => session.stats).forEach((item) => {
    const key = item.playerId || item.id || item.name.toLowerCase();
    if (!total[key]) total[key] = { name: item.name, goals: 0, assists: 0, wins: 0, ratingSum: 0, ratingCount: 0, performanceScore: 0 };
    total[key].goals += item.goals;
    total[key].assists += item.assists;
    total[key].wins += item.wins;
    if (item.rating) {
      total[key].ratingSum += Number(item.rating) || 0;
      total[key].ratingCount += 1;
    }
    total[key].performanceScore += Number(item.performanceScore) || calculatePerformanceScore(item, item.rating || 3);
  });
  return Object.values(total).map((item) => ({
    ...item,
    rating: item.ratingCount ? Number((item.ratingSum / item.ratingCount).toFixed(1)) : 0
  }));
}

function deleteSession(sessionId) {
  const session = profile.sessions.find((item) => item.id === sessionId);
  if (!session) return;
  if (!confirm("Apagar esta pelada do historico?")) return;
  profile.sessions = profile.sessions.filter((item) => item.id !== sessionId);
  if (editingSessionId === sessionId) editingSessionId = null;
  if (isCloudMode) {
    supabaseClient.from("sessions").delete().eq("id", sessionId).then(({ error }) => {
      if (error) console.warn("Falha ao apagar na nuvem", error);
    });
  }
  saveStore();
  renderData();
}

function saveSessionEdit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const session = profile.sessions.find((item) => item.id === form.dataset.editingSession);
  if (!session) return;

  session.matches.forEach((match, index) => {
    match.playing.forEach((teamKey) => {
      match.score[teamKey] = Math.max(0, Number(form.elements[`match_${index}_score_${teamKey}`].value) || 0);
    });
    match.winner = form.elements[`match_${index}_winner`].value;
  });

  session.stats.forEach((item) => {
    item.goals = Math.max(0, Number(form.elements[`stat_${item.id}_goals`].value) || 0);
    item.assists = Math.max(0, Number(form.elements[`stat_${item.id}_assists`].value) || 0);
  });

  recalculateSession(session);
  editingSessionId = null;
  if (isCloudMode) {
    supabaseClient.from("sessions").upsert(toSessionRow(session)).then(({ error }) => {
      if (error) console.warn("Falha ao salvar edicao na nuvem", error);
    });
  }
  saveStore();
  renderData();
}

function recalculateSession(session) {
  const statsById = Object.fromEntries(session.stats.map((item) => [item.id, item]));
  session.stats.forEach((item) => {
    item.wins = 0;
  });

  session.winsByTeam = Object.fromEntries(teamKeys().map((key) => [key, 0]));
  session.matches.forEach((match) => {
    if (!match.winner) return;
    session.winsByTeam[match.winner] += 1;
    const winnerRoster = [
      ...(session.teams[match.winner]?.players || []),
      ...((match.guests && match.guests[match.winner]) || [])
    ];
    winnerRoster.forEach((ref) => {
      const id = playerStatId(ref);
      if (!statsById[id]) {
        statsById[id] = { id, playerId: id, name: playerDisplayName(ref), teamKey: match.winner, goals: 0, assists: 0, wins: 0 };
        session.stats.push(statsById[id]);
      }
      statsById[id].wins += 1;
    });
  });

  const winnerTeamKey = teamKeys().sort((a, b) => session.winsByTeam[b] - session.winsByTeam[a])[0];
  const hasTeamWinner = session.winsByTeam[winnerTeamKey] > 0;
  session.winnerTeam = {
    key: hasTeamWinner ? winnerTeamKey : "",
    label: hasTeamWinner ? `${teamName(winnerTeamKey, session)} (${session.winsByTeam[winnerTeamKey]} vitoria${session.winsByTeam[winnerTeamKey] === 1 ? "" : "s"})` : "Sem vencedor por vitorias"
  };
  session.topScorer = topBy(session.stats, "goals", "Sem gols");
  session.topAssistant = topBy(session.stats, "assists", "Sem assistencias");
  session.topHot = topBy(session.stats, "wins", "Sem vitorias");
  session.stats.forEach((item) => {
    item.performanceScore = calculatePerformanceScore(item, item.rating || 3);
  });
  session.topMvp = topBy(session.stats, "performanceScore", "Sem destaque");
  session.report = buildReport(session);
}

function resetDraft() {
  clearInterval(timerId);
  const settings = draft?.settings || { ...DEFAULT_SETTINGS };
  const teamColors = draft?.teamColors || { blue: "blue", red: "red", green: "green" };
  const seasonId = profile.currentSeasonId;
  draft = newDraft();
  draft.settings = { ...settings };
  draft.teamColors = { ...teamColors };
  draft.seasonId = seasonId;
  profile.draft = draft;
  saveStore();
  showAppTab("game");
  render();
}

function saveMatchSettings(event) {
  event.preventDefault();
  const durationMinutes = Math.max(1, Math.min(60, Number(els.durationInput.value) || DEFAULT_SETTINGS.durationMinutes));
  const goalLimit = Math.max(1, Math.min(20, Number(els.goalLimitInput.value) || DEFAULT_SETTINGS.goalLimit));
  const playersPerTeam = Math.max(1, Math.min(20, Number(els.playersPerTeamInput.value) || DEFAULT_SETTINGS.playersPerTeam));
  draft.settings = { durationMinutes, goalLimit, playersPerTeam };
  render();
}

async function createSeason(event) {
  event.preventDefault();
  const input = event.currentTarget.elements.seasonName;
  const name = input.value.trim();
  if (!name) return;
  const active = currentSeason();
  if (active) {
    alert(`Finalize a temporada "${active.name}" antes de criar uma nova.`);
    input.value = "";
    return;
  }
  const exists = profile.seasons.some((season) => season.name.toLowerCase() === name.toLowerCase());
  if (exists) return;
  const season = { id: crypto.randomUUID(), name, createdAt: new Date().toISOString() };
  profile.seasons.push(season);
  profile.currentSeasonId = season.id;
  draft.seasonId = season.id;
  if (isCloudMode) {
    const { error: seasonError } = await supabaseClient.from("seasons").insert({
      id: season.id,
      profile_id: currentUser.id,
      name: season.name
    });
    if (seasonError) {
      alert("Nao foi possivel criar a temporada na nuvem.");
      console.warn(seasonError);
      return;
    }
    await supabaseClient.from("pelada_profiles").update({ current_season_id: season.id }).eq("id", currentUser.id);
  }
  input.value = "";
  saveStore();
  render();
}

function switchSeason() {
  profile.currentSeasonId = els.seasonSelect.value;
  draft.seasonId = profile.currentSeasonId;
  if (isCloudMode) {
    supabaseClient.from("pelada_profiles").update({ current_season_id: profile.currentSeasonId }).eq("id", currentUser.id);
  }
  saveStore();
  render();
}

function downloadTextFile(filename, content, type = "text/plain") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportPodiumImage() {
  if (!draft.finalSummary) return;
  const summary = draft.finalSummary;
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 1080, 1350);
  gradient.addColorStop(0, "#0b0f0b");
  gradient.addColorStop(.55, "#111411");
  gradient.addColorStop(1, "#20330d");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#9be31d";
  ctx.lineWidth = 8;
  ctx.strokeRect(38, 38, canvas.width - 76, canvas.height - 76);
  ctx.fillStyle = "#9be31d";
  ctx.font = "900 34px Arial";
  ctx.fillText("PELADAFAST", 78, 110);
  ctx.fillStyle = "#f5f7f2";
  ctx.font = "900 72px Arial";
  wrapCanvasText(ctx, "Podio da pelada", 78, 205, 920, 82);
  drawPodiumLine(ctx, "Equipe campea", summary.winnerTeam.label, 78, 390);
  drawPodiumLine(ctx, "Artilheiro", summary.topScorer.label, 78, 555);
  drawPodiumLine(ctx, "Maior assistente", summary.topAssistant.label, 78, 720);
  drawPodiumLine(ctx, "Destaque", summary.topMvp?.label || "Sem destaque", 78, 885);
  ctx.fillStyle = "#9aa393";
  ctx.font = "700 28px Arial";
  ctx.fillText(new Date(summary.date).toLocaleString("pt-BR"), 78, 1190);
  const link = document.createElement("a");
  link.download = `peladafast-podio-${Date.now()}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function drawPodiumLine(ctx, title, value, x, y) {
  ctx.fillStyle = "rgba(155, 227, 29, .14)";
  ctx.fillRect(x, y - 58, 924, 126);
  ctx.fillStyle = "#9be31d";
  ctx.font = "900 30px Arial";
  ctx.fillText(title.toUpperCase(), x + 28, y - 15);
  ctx.fillStyle = "#f5f7f2";
  ctx.font = "900 42px Arial";
  wrapCanvasText(ctx, value, x + 28, y + 38, 860, 48);
}

function wrapCanvasText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text).split(" ");
  let line = "";
  words.forEach((word, index) => {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else {
      line = test;
    }
    if (index === words.length - 1) ctx.fillText(line, x, y);
  });
}

function exportCsv() {
  const sessions = filteredSessions(activeDataTab);
  const rows = [["Data", "Temporada", "Jogador", "Gols", "Assistencias", "Vitorias", "Gol contra", "Nota", "Nota PeladaFast"]];
  sessions.forEach((session) => {
    (session.stats || []).forEach((item) => {
      rows.push([
        new Date(session.date).toLocaleString("pt-BR"),
        session.seasonName || "",
        item.name,
        item.goals || 0,
        item.assists || 0,
        item.wins || 0,
        item.ownGoals || 0,
        item.rating || "",
        item.performanceScore || ""
      ]);
    });
  });
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
  downloadTextFile(`peladafast-${activeDataTab}.csv`, csv, "text/csv;charset=utf-8");
}

function exportBackup() {
  downloadTextFile(`peladafast-backup-${profile.username}.json`, JSON.stringify(profile, null, 2), "application/json");
}

async function importBackup(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  if (!confirm("Restaurar este backup neste perfil? Isso substitui os dados atuais deste navegador.")) return;
  const text = await file.text();
  const imported = ensureProfileDefaults(JSON.parse(text));
  Object.assign(profile, imported, { id: profile.id, username: profile.username, email: profile.email, phone: profile.phone, peladaName: profile.peladaName });
  draft = profile.draft || newDraft();
  saveStore();
  render();
  renderData();
  event.target.value = "";
}

function togglePassword(event) {
  const wrapper = event.target.closest(".password-wrap");
  const input = wrapper?.querySelector("input");
  if (!input) return;
  const visible = input.type === "text";
  input.type = visible ? "password" : "text";
  event.target.textContent = visible ? "Olhar" : "Ocultar";
}

function celebrateGoal(teamKey) {
  const score = document.querySelector(`[data-score-team="${teamKey}"]`);
  if (score) {
    score.classList.add("bump");
    setTimeout(() => score.classList.remove("bump"), 350);
  }
  confetti(teamColor(teamKey));
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

document.querySelectorAll("[data-data-tab]").forEach((button) => {
  button.addEventListener("click", () => {
    activeDataTab = button.dataset.dataTab;
    renderData();
  });
});

document.querySelectorAll("[data-toggle-password]").forEach((button) => {
  button.addEventListener("click", togglePassword);
});

els.seasonSelect.addEventListener("change", switchSeason);
els.seasonForm.addEventListener("submit", createSeason);
els.matchSettingsForm.addEventListener("submit", saveMatchSettings);

els.teamsGrid.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-team-form]");
  if (!form) return;
  event.preventDefault();
  const teamKey = form.dataset.teamForm;
  const ref = form.elements.player.value;
  if (!ref || draft.teams[teamKey].players.includes(ref)) return;
  draft.teams[teamKey].players.push(ref);
  ensurePlayerStats(teamKey, ref);
  form.elements.player.value = "";
  render();
});

els.teamsGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-player]");
  if (!button) return;
  const teamKey = button.dataset.team;
  const ref = button.dataset.player;
  draft.teams[teamKey].players = draft.teams[teamKey].players.filter((player) => player !== ref);
  delete draft.playerStats[playerStatId(ref)];
  render();
});

els.teamsGrid.addEventListener("change", (event) => {
  const select = event.target.closest("[data-team-color]");
  if (!select) return;
  const teamKey = select.dataset.teamColor;
  draft.teamColors ||= { blue: "blue", red: "red", green: "green" };
  draft.teamColors[teamKey] = select.value;
  render();
});

els.lineupCheck.addEventListener("submit", (event) => {
  const form = event.target.closest("[data-complete-team]");
  if (!form || !draft.currentMatch) return;
  event.preventDefault();
  const teamKey = form.dataset.completeTeam;
  const ref = form.elements.guest.value;
  const outgoing = form.elements.outgoing.value;
  if (!ref || !outgoing || ref === outgoing) return;
  draft.currentMatch.guests[teamKey] ||= [];
  draft.currentMatch.out ||= {};
  draft.currentMatch.out[teamKey] ||= [];
  if (!draft.currentMatch.out[teamKey].includes(outgoing)) {
    draft.currentMatch.out[teamKey].push(outgoing);
  }
  draft.currentMatch.guests[teamKey] = draft.currentMatch.guests[teamKey].filter((item) => item !== outgoing);
  if (!draft.currentMatch.guests[teamKey].includes(ref)) {
    draft.currentMatch.guests[teamKey].push(ref);
  }
  render();
});

els.lineupCheck.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-guest]");
  if (!button || !draft.currentMatch) return;
  const teamKey = button.dataset.team;
  const ref = button.dataset.removeGuest;
  draft.currentMatch.guests[teamKey] = (draft.currentMatch.guests[teamKey] || []).filter((item) => item !== ref);
  render();
});

els.lineupCheck.addEventListener("click", (event) => {
  const button = event.target.closest("[data-return-out]");
  if (!button || !draft.currentMatch) return;
  const teamKey = button.dataset.team;
  const ref = button.dataset.returnOut;
  draft.currentMatch.out[teamKey] = (draft.currentMatch.out[teamKey] || []).filter((item) => item !== ref);
  render();
});

els.drawMatch.addEventListener("click", startFirstMatch);
els.balanceTeams.addEventListener("click", balanceTeamsByPerformance);
els.startCountdown.addEventListener("click", startCountdown);
els.fullScoreMode.addEventListener("click", toggleFullScoreMode);
els.endTimedMatch.addEventListener("click", () => finishCurrentMatch("time"));
els.goalTeam.addEventListener("change", fillPlayerOptions);
els.ownGoal.addEventListener("change", fillPlayerOptions);
els.goalPlayer.addEventListener("change", fillPlayerOptions);
els.goalForm.addEventListener("submit", registerGoal);
els.undoLastGoal.addEventListener("click", undoLastGoal);
els.leftPanel.addEventListener("click", (event) => {
  const button = event.target.closest("[data-quick-goal]");
  if (button) openGoalPopup(button.dataset.quickGoal);
});
els.rightPanel.addEventListener("click", (event) => {
  const button = event.target.closest("[data-quick-goal]");
  if (button) openGoalPopup(button.dataset.quickGoal);
});
els.closeGoalPopup.addEventListener("click", closeGoalPopup);
els.goalPopup.addEventListener("click", (event) => {
  if (event.target === els.goalPopup) closeGoalPopup();
});
els.matchTimeline.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-goal]");
  if (editButton) {
    editGoalAt(Number(editButton.dataset.editGoal));
    return;
  }
  const deleteButton = event.target.closest("[data-delete-goal]");
  if (deleteButton) removeGoalAt(Number(deleteButton.dataset.deleteGoal));
});
els.nextMatch.addEventListener("click", startNextMatch);
els.finishSession.addEventListener("click", finishSession);
els.winnerChoice.addEventListener("click", (event) => {
  const kingButton = event.target.closest("[data-king-table]");
  if (kingButton) {
    chooseKingTable(kingButton.dataset.kingTable);
    return;
  }
  const button = event.target.closest("[data-winner]");
  if (button) chooseWinner(button.dataset.winner);
});
els.finalView.addEventListener("input", (event) => {
  const input = event.target.closest("[data-rating-input]");
  if (!input) return;
  const output = input.closest(".rating-row")?.querySelector("output");
  if (output) output.textContent = input.value;
});
els.finalView.addEventListener("click", (event) => {
  if (event.target.closest("#backToLastMatch")) reopenLastFinishedMatch();
  if (event.target.closest("[data-complete-ratings]")) {
    event.preventDefault();
    const form = event.target.closest("form");
    if (form) completeSessionRatings({ preventDefault() {}, currentTarget: form, target: form });
  }
});
els.finalView.addEventListener("submit", (event) => {
  if (event.target.matches("#ratingForm")) completeSessionRatings(event);
});
els.newSession.addEventListener("click", resetDraft);
els.exportCsv.addEventListener("click", exportCsv);
els.exportBackup.addEventListener("click", exportBackup);
els.importBackup.addEventListener("change", importBackup);
els.publishShare.addEventListener("click", publishSharePage);
els.shareGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-copy-share]");
  if (!button) return;
  const input = document.querySelector("#shareUrl");
  if (!input?.value || button.disabled) return;
  navigator.clipboard?.writeText(input.value).catch(() => {});
  const status = document.querySelector("#shareStatus");
  if (status) status.textContent = "Link copiado.";
});
els.playerProfileForm.addEventListener("submit", savePlayerProfile);
els.cancelPlayerEdit.addEventListener("click", () => {
  els.playerProfileForm.reset();
  els.playerProfileForm.elements.playerId.value = "";
  renderPlayers();
});
els.registeredPlayers.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-player]");
  if (editButton) {
    editPlayerProfile(editButton.dataset.editPlayer);
    return;
  }
  const deleteButton = event.target.closest("[data-delete-player]");
  if (deleteButton) deletePlayerProfile(deleteButton.dataset.deletePlayer);
});
els.dataGrid.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-session]");
  if (editButton) {
    editingSessionId = editButton.dataset.editSession;
    renderData();
    return;
  }

  const deleteButton = event.target.closest("[data-delete-session]");
  if (deleteButton) {
    deleteSession(deleteButton.dataset.deleteSession);
    return;
  }

  if (event.target.closest("[data-cancel-edit]")) {
    editingSessionId = null;
    renderData();
  }

  if (event.target.closest("[data-finish-season]")) {
    finishCurrentSeason();
  }
});

els.dataGrid.addEventListener("submit", (event) => {
  if (event.target.matches("#sessionEditorForm")) {
    saveSessionEdit(event);
  }
});

async function initApp() {
  supabaseClient = setupSupabaseClient();
  isCloudMode = Boolean(supabaseClient);
  const publicSlug = new URLSearchParams(window.location.search).get("share");
  if (publicSlug) {
    await loadPublicShare(publicSlug);
    return;
  }

  if (isCloudMode) {
    let data;
    try {
      const response = await supabaseClient.auth.getSession();
      data = response.data;
    } catch (error) {
      isCloudMode = false;
      console.warn("Supabase nao carregou", error);
      showAuthTab("login");
      return;
    }
    if (data.session?.user) {
      try {
        currentUser = data.session.user;
        const cloudProfile = await loadCloudProfile(currentUser);
        if (cloudProfile) {
          const migratedProfile = await migrateLocalProfileToCloudIfNeeded(cloudProfile);
          enterProfile(migratedProfile);
          return;
        }
      } catch (error) {
        console.warn("Falha ao carregar perfil na nuvem", error);
      }
    }
    showAuthTab("login");
    return;
  }

  const active = store.profiles.find((item) => item.id === store.activeProfileId);
  if (active) enterProfile(active);
  else showAuthTab("login");
}

initApp();
