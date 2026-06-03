// ── Configuration ────────────────────────────────────────────────────────────
const CONFIG = {
  CONTRACT_ADDRESS: "YOUR_CONTRACT_ADDRESS_HERE",
  GENLAYER_NETWORK: {
    chainId: "0x1AEE",           // Update with actual GenLayer testnet chain ID
    chainName: "GenLayer Testnet",
    nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
    rpcUrls: ["https://studio.genlayer.com/api"],
    blockExplorerUrls: ["https://studio.genlayer.com"],
  },
  POLL_INTERVAL_MS: 3000,
  CONTRACT_OWNER: "YOUR_DEPLOYER_ADDRESS_HERE",
};

// GenLayer contracts use string-typed parameters and return JSON strings
const CONTRACT_ABI = [
  "function register_player(string owner, string username) returns (string)",
  "function is_registered(string wallet) view returns (string)",
  "function get_player(string wallet) view returns (string)",
  "function create_room(string owner, string mode, uint256 riddle_count) returns (string)",
  "function join_room(string owner, string code) returns (string)",
  "function start_game(string owner, string code) returns (string)",
  "function generate_riddle(string owner, string game_id, string topic, string mode) returns (string)",
  "function submit_answer(string owner, string game_id, uint256 riddle_index, string answer, uint256 time_taken) returns (string)",
  "function advance_riddle(string owner, string game_id) returns (string)",
  "function complete_game(string owner, string game_id) returns (string)",
  "function start_solo(string owner, string topic, string mode) returns (string)",
  "function complete_solo(string owner, string game_id) returns (string)",
  "function get_game(string game_id) view returns (string)",
  "function get_leaderboard() view returns (string)",
  "function get_season_leaderboard() view returns (string)",
  "function get_all_topics() view returns (string)",
];

const TOPICS = {
  community: [
    "GenLayer founding and mission",
    "Optimistic Democracy",
    "Builder Program",
    "Testnet history Asimov and Bradbury",
    "GEN token",
    "GenLayer vs other blockchains",
    "LayerZero integration",
    "Community milestones",
  ],
  technical: [
    "Intelligent Contracts basics",
    "web.render and web fetching",
    "Equivalence Principle",
    "Validators and consensus",
    "State variables",
    "UNDETERMINED errors",
    "GenVM and Python",
    "prompt_comparative usage",
  ],
};

const MODE_TIMERS = { simple: 60, medium: 45, hard: 30 };
const MODE_LABELS = { simple: "Simple", medium: "Medium", hard: "Hard" };

const ALL_BADGES = [
  { id: "First Blood", icon: "🩸", desc: "Win your first multiplayer game" },
  { id: "Big Brain", icon: "🧠", desc: "Score 100% on Hard mode" },
  { id: "Speed Demon", icon: "⚡", desc: "First correct in ≤5s three times in one game" },
  { id: "On Fire", icon: "🔥", desc: "Win 5 games in a row" },
  { id: "Scholar", icon: "📚", desc: "Complete every solo topic" },
  { id: "Season Champion", icon: "👑", desc: "Finish 1st in monthly season" },
  { id: "Sharp Mind", icon: "🎯", desc: "Answer correctly with less than 3s left" },
  { id: "Host", icon: "🏠", desc: "Host 10 multiplayer games" },
  { id: "Veteran", icon: "🎖️", desc: "Play 100 total games" },
];

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  wallet: null,
  username: null,
  provider: null,
  signer: null,
  contract: null,

  // Game
  gameId: null,
  game: null,
  isHost: false,
  isSolo: false,
  riddleIndex: 0,
  score: 0,
  correctCount: 0,
  answered: false,
  timerInterval: null,
  timeLeft: 0,
  pollInterval: null,

  // UI
  selectedMode: "simple",
  selectedTopic: null,
  selectedRiddleCount: 5,
  lastRoomCode: null,
};

// ── Boot ──────────────────────────────────────────────────────────────────────
window.addEventListener("DOMContentLoaded", () => {
  buildTopicGrids();
  buildBadgeGrid();
  if (window.ethereum) {
    window.ethereum.on("accountsChanged", () => location.reload());
    window.ethereum.on("chainChanged", () => location.reload());
  }
});

// ── Wallet ────────────────────────────────────────────────────────────────────
async function connectWallet() {
  if (!window.ethereum) {
    showToast("Install MetaMask to play", "error");
    return;
  }

  setBtnLoading("btn-connect", true);
  try {
    state.provider = new ethers.providers.Web3Provider(window.ethereum);
    await state.provider.send("eth_requestAccounts", []);

    await ensureGenLayerNetwork();

    state.signer = state.provider.getSigner();
    state.wallet = await state.signer.getAddress();

    state.contract = new ethers.Contract(CONFIG.CONTRACT_ADDRESS, CONTRACT_ABI, state.signer);

    setWalletBadges(state.wallet);
    await checkRegistration();
  } catch (err) {
    showToast(err.message || "Connection failed", "error");
  } finally {
    setBtnLoading("btn-connect", false);
  }
}

async function ensureGenLayerNetwork() {
  const net = CONFIG.GENLAYER_NETWORK;
  try {
    await state.provider.send("wallet_switchEthereumChain", [{ chainId: net.chainId }]);
  } catch (switchErr) {
    if (switchErr.code === 4902) {
      await state.provider.send("wallet_addEthereumChain", [net]);
    } else {
      throw switchErr;
    }
  }
}

async function checkRegistration() {
  try {
    const raw = await state.contract.is_registered(state.wallet);
    const data = parseResult(raw);
    if (data.registered) {
      const pRaw = await state.contract.get_player(state.wallet);
      const pData = parseResult(pRaw);
      if (pData.found) {
        state.username = pData.player.username;
      }
      enterMenu();
    } else {
      showScreen("screen-register");
    }
  } catch {
    showScreen("screen-register");
  }
}

function setWalletBadges(addr) {
  const short = truncAddr(addr);
  document.getElementById("register-wallet-badge").textContent = short;
  document.getElementById("menu-wallet-badge").textContent = short;
}

// ── Registration ──────────────────────────────────────────────────────────────
async function registerPlayer() {
  const input = document.getElementById("input-username");
  const username = input.value.trim();
  const errEl = document.getElementById("register-error");

  if (!username || username.length < 3 || username.length > 20) {
    showError(errEl, "Username must be 3–20 characters");
    return;
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    showError(errEl, "Only letters, numbers and underscores");
    return;
  }

  errEl.classList.add("hidden");
  setLoading(input, true);

  try {
    const tx = await state.contract.register_player(state.wallet, username);
    await tx.wait();
    state.username = username;
    enterMenu();
    showToast("Welcome, " + username + "!", "success");
  } catch (err) {
    const msg = parseContractError(err);
    showError(errEl, msg || "Registration failed — try a different username");
  } finally {
    setLoading(input, false);
  }
}

// ── Menu ──────────────────────────────────────────────────────────────────────
function enterMenu() {
  stopPolling();
  stopTimer();
  document.getElementById("menu-greeting").textContent =
    "Hey, " + (state.username || "Player") + "!";
  showScreen("screen-menu");
}

// ── Solo Flow ─────────────────────────────────────────────────────────────────
function buildTopicGrids() {
  const makeChip = (topic, container) => {
    const el = document.createElement("div");
    el.className = "topic-chip";
    el.textContent = topic;
    el.dataset.topic = topic;
    el.onclick = () => {
      document.querySelectorAll(".topic-chip").forEach(c => c.classList.remove("selected"));
      el.classList.add("selected");
      state.selectedTopic = topic;
    };
    document.getElementById(container).appendChild(el);
  };
  TOPICS.community.forEach(t => makeChip(t, "community-topics"));
  TOPICS.technical.forEach(t => makeChip(t, "technical-topics"));
}

async function startSoloGame() {
  const errEl = document.getElementById("solo-start-error");
  if (!state.selectedTopic) {
    showError(errEl, "Pick a topic first");
    return;
  }
  errEl.classList.add("hidden");

  showScreen("screen-generating");
  updateGenProgress(0, 1);

  try {
    const raw = await state.contract.start_solo(state.wallet, state.selectedTopic, state.selectedMode);
    const data = parseResult(raw);
    if (data.error) throw new Error(data.error);

    state.gameId = data.game_id;
    state.isSolo = true;
    state.isHost = true;
    state.score = 0;
    state.correctCount = 0;
    state.riddleIndex = 0;

    await generateSoloRiddles();
  } catch (err) {
    showToast(err.message || "Failed to start", "error");
    showScreen("screen-solo-select");
  }
}

async function generateSoloRiddles() {
  const total = 5;
  for (let i = 0; i < total; i++) {
    updateGenProgress(i, total);
    const topic = pickTopic(state.selectedMode);
    try {
      const raw = await state.contract.generate_riddle(
        state.wallet, state.gameId, topic, state.selectedMode
      );
      const data = parseResult(raw);
      if (data.error) throw new Error(data.error);
    } catch (err) {
      showToast("Riddle generation error: " + err.message, "error");
    }
  }
  updateGenProgress(total, total);

  const gameRaw = await state.contract.get_game(state.gameId);
  const gameData = parseResult(gameRaw);
  if (!gameData.found) throw new Error("Game not found after generation");

  state.game = gameData.game;
  state.riddleIndex = 0;
  renderRiddle(state.game.riddles[0], 0, state.game.riddles.length);
  showScreen("screen-game");
}

function soloNextRiddle() {
  document.getElementById("btn-next-riddle").classList.add("hidden");
  state.riddleIndex++;

  if (state.riddleIndex >= state.game.riddles.length) {
    finishGame();
    return;
  }

  renderRiddle(state.game.riddles[state.riddleIndex], state.riddleIndex, state.game.riddles.length);
  resetAnswerState();
}

// ── Multiplayer Flow ──────────────────────────────────────────────────────────
async function createRoom() {
  const errEl = document.getElementById("create-error");
  errEl.classList.add("hidden");

  try {
    const raw = await state.contract.create_room(
      state.wallet, state.selectedMode, state.selectedRiddleCount
    );
    const data = parseResult(raw);
    if (data.error) throw new Error(data.error);

    state.lastRoomCode = data.code;
    state.gameId = data.code;
    state.isHost = true;
    state.isSolo = false;

    showLobby(data.code, true);
    startLobbyPoll(data.code);
  } catch (err) {
    showError(errEl, parseContractError(err) || "Failed to create room");
  }
}

async function joinRoom() {
  const codeInput = document.getElementById("input-room-code");
  const code = codeInput.value.trim().toUpperCase();
  const errEl = document.getElementById("join-error");

  if (!code || !code.startsWith("GN-")) {
    showError(errEl, "Enter a valid code like GN-0042");
    return;
  }

  errEl.classList.add("hidden");

  try {
    const raw = await state.contract.join_room(state.wallet, code);
    const data = parseResult(raw);
    if (data.error) throw new Error(data.error);

    state.lastRoomCode = code;
    state.gameId = code;
    state.isHost = false;
    state.isSolo = false;

    showLobby(code, false);
    startLobbyPoll(code);
  } catch (err) {
    showError(errEl, parseContractError(err) || "Failed to join room");
  }
}

async function hostStartGame() {
  try {
    const tx = await state.contract.start_game(state.wallet, state.gameId);
    await tx.wait();
    stopPolling();
    await generateMultiplayerRiddles();
  } catch (err) {
    showToast(parseContractError(err) || "Failed to start game", "error");
  }
}

async function generateMultiplayerRiddles() {
  showScreen("screen-generating");

  const gameRaw = await state.contract.get_game(state.gameId);
  const gData = parseResult(gameRaw);
  if (!gData.found) { showToast("Game not found", "error"); return; }

  const total = gData.game.riddle_count;
  const mode = gData.game.mode;

  for (let i = 0; i < total; i++) {
    updateGenProgress(i, total);
    const topic = pickTopic(mode);
    try {
      const raw = await state.contract.generate_riddle(state.wallet, state.gameId, topic, mode);
      const data = parseResult(raw);
      if (data.error) console.warn("Riddle error:", data.error);
    } catch (e) {
      console.warn("Riddle gen failed:", e);
    }
  }
  updateGenProgress(total, total);

  await launchMultiplayerGame();
}

async function launchMultiplayerGame() {
  const raw = await state.contract.get_game(state.gameId);
  const data = parseResult(raw);
  if (!data.found) { showToast("Game not found", "error"); return; }

  state.game = data.game;
  state.score = 0;
  state.correctCount = 0;
  state.riddleIndex = 0;

  renderRiddle(state.game.riddles[0], 0, state.game.riddles.length);
  showScreen("screen-game");
  startTimer(state.game.mode);
  startGamePoll();
}

// Guests poll until game becomes active
function startLobbyPoll(code) {
  stopPolling();
  state.pollInterval = setInterval(async () => {
    try {
      const raw = await state.contract.get_game(code);
      const data = parseResult(raw);
      if (!data.found) return;

      const game = data.game;
      updateLobbyPlayers(game);

      if (game.status === "generating" && !state.isHost) {
        stopPolling();
        showScreen("screen-generating");
        pollUntilActive(code);
      }

      if (game.status === "active" && !state.isHost) {
        stopPolling();
        state.game = game;
        state.score = 0;
        state.correctCount = 0;
        state.riddleIndex = game.current_riddle;
        renderRiddle(game.riddles[state.riddleIndex], state.riddleIndex, game.riddles.length);
        showScreen("screen-game");
        startTimer(game.mode);
        startGamePoll();
      }
    } catch (e) {
      console.warn("Lobby poll error:", e);
    }
  }, CONFIG.POLL_INTERVAL_MS);
}

async function pollUntilActive(code) {
  const check = setInterval(async () => {
    try {
      const raw = await state.contract.get_game(code);
      const data = parseResult(raw);
      if (!data.found) return;

      const progress = data.game.riddles ? data.game.riddles.length : 0;
      const total = data.game.riddle_count || 10;
      updateGenProgress(progress, total);

      if (data.game.status === "active") {
        clearInterval(check);
        state.game = data.game;
        state.score = 0;
        state.correctCount = 0;
        state.riddleIndex = data.game.current_riddle;
        renderRiddle(data.game.riddles[state.riddleIndex], state.riddleIndex, data.game.riddles.length);
        showScreen("screen-game");
        startTimer(data.game.mode);
        startGamePoll();
      }
    } catch (e) {
      console.warn("Active poll error:", e);
    }
  }, 2000);
}

function startGamePoll() {
  stopPolling();
  if (state.isSolo) return;

  state.pollInterval = setInterval(async () => {
    try {
      const raw = await state.contract.get_game(state.gameId);
      const data = parseResult(raw);
      if (!data.found) return;

      const game = data.game;
      const serverRiddle = game.current_riddle;

      if (game.status === "completed") {
        stopPolling();
        stopTimer();
        state.game = game;
        showResults(game);
        return;
      }

      if (serverRiddle > state.riddleIndex && !state.isHost) {
        state.riddleIndex = serverRiddle;
        state.game = game;
        renderRiddle(game.riddles[serverRiddle], serverRiddle, game.riddles.length);
        resetAnswerState();
        startTimer(game.mode);
        showScreen("screen-game");
      }
    } catch (e) {
      console.warn("Game poll error:", e);
    }
  }, CONFIG.POLL_INTERVAL_MS);
}

// ── Answer Submission ─────────────────────────────────────────────────────────
async function submitAnswer(letter) {
  if (state.answered) return;
  state.answered = true;

  const timeLeft = state.timeLeft;
  const timeTaken = (state.isSolo ? 0 : (MODE_TIMERS[state.game.mode] - timeLeft));
  stopTimer();

  disableOptions();

  try {
    const raw = await state.contract.submit_answer(
      state.wallet,
      state.gameId,
      state.riddleIndex,
      letter,
      Math.round(timeTaken)
    );
    const data = parseResult(raw);

    if (data.error) {
      showToast(data.error, "error");
      return;
    }

    const isCorrect = data.correct;
    const correctLetter = data.correct_answer;
    const pts = data.points;

    if (isCorrect) state.correctCount++;
    state.score = data.total_score;

    // Visual feedback
    markOption(letter, isCorrect ? "correct" : "wrong");
    if (!isCorrect) markOption(correctLetter, "reveal-correct");

    document.getElementById("game-score-display").textContent = state.score + " pts";

    showResultBanner(isCorrect, pts, data.explanation, data.correct_answer, state.game.riddles[state.riddleIndex]);

    if (state.isSolo) {
      document.getElementById("btn-next-riddle").classList.remove("hidden");
    } else if (state.isHost) {
      // Host waits for timer then advances
      setTimeout(() => {
        if (state.riddleIndex + 1 >= state.game.riddles.length) {
          completeGame();
        } else {
          showBetweenRounds();
        }
      }, 4000);
    }
    // Non-host guests just wait for poll to update riddleIndex
  } catch (err) {
    showToast(parseContractError(err) || "Submit failed", "error");
    state.answered = false;
    enableOptions();
  }
}

// Timer ran out — auto submit blank / show correct
async function onTimerExpired() {
  if (state.answered) return;
  state.answered = true;
  disableOptions();

  const riddle = state.game.riddles[state.riddleIndex];
  markOption(riddle.correct, "reveal-correct");

  showTimeoutBanner(riddle.explanation, riddle.correct, riddle);

  if (state.isHost) {
    setTimeout(() => {
      if (state.riddleIndex + 1 >= state.game.riddles.length) {
        completeGame();
      } else {
        showBetweenRounds();
      }
    }, 4000);
  }
}

// ── Game Progression ──────────────────────────────────────────────────────────
async function advanceRiddle() {
  if (!state.isHost) return;
  try {
    const raw = await state.contract.advance_riddle(state.wallet, state.gameId);
    const data = parseResult(raw);
    if (data.error) { showToast(data.error, "error"); return; }

    if (data.status === "completed") {
      await completeGame();
    } else {
      state.riddleIndex = data.current_riddle;
      const raw2 = await state.contract.get_game(state.gameId);
      const gData = parseResult(raw2);
      if (gData.found) {
        state.game = gData.game;
        renderRiddle(state.game.riddles[state.riddleIndex], state.riddleIndex, state.game.riddles.length);
        resetAnswerState();
        startTimer(state.game.mode);
        showScreen("screen-game");
      }
    }
  } catch (err) {
    showToast(parseContractError(err) || "Advance failed", "error");
  }
}

async function completeGame() {
  stopPolling();
  stopTimer();
  try {
    if (!state.isSolo) {
      const raw = await state.contract.complete_game(state.wallet, state.gameId);
      const data = parseResult(raw);
      if (data.error) showToast(data.error, "error");
    } else {
      await state.contract.complete_solo(state.wallet, state.gameId);
    }
  } catch (e) {
    console.warn("Complete game error:", e);
  }
  const raw = await state.contract.get_game(state.gameId);
  const data = parseResult(raw);
  if (data.found) {
    state.game = data.game;
    showResults(data.game);
  } else {
    showResults({ winner: null, scores: {}, mode: state.selectedMode, riddles: [] });
  }
}

async function finishGame() {
  await completeGame();
}

// ── UI Rendering ──────────────────────────────────────────────────────────────
function renderRiddle(riddle, index, total) {
  document.getElementById("riddle-text").textContent = riddle.riddle;
  document.getElementById("riddle-hint").textContent = riddle.hint;

  const opts = ["A", "B", "C", "D"];
  opts.forEach(l => {
    const btn = document.getElementById("opt-" + l);
    btn.querySelector(".option-text").textContent = riddle.options[l] || "";
    btn.className = "option-btn";
    btn.disabled = false;
  });

  document.getElementById("result-banner").classList.add("hidden");
  document.getElementById("result-banner").innerHTML = "";
  document.getElementById("btn-next-riddle").classList.add("hidden");

  const pct = ((index + 1) / total) * 100;
  document.getElementById("game-progress-fill").style.width = pct + "%";
  document.getElementById("game-riddle-label").textContent = (index + 1) + " / " + total;
  document.getElementById("game-score-display").textContent = state.score + " pts";

  const timerWrap = document.getElementById("timer-wrap");
  if (state.isSolo) {
    timerWrap.classList.add("hidden");
  } else {
    timerWrap.classList.remove("hidden");
  }
}

function showResultBanner(isCorrect, pts, explanation, correctLetter, riddle) {
  const el = document.getElementById("result-banner");
  el.className = "result-banner " + (isCorrect ? "correct" : "wrong");
  const header = isCorrect
    ? `✅ Correct! +${pts} pts${pts > (state.game ? (MODE_TIMERS[state.game.mode] > 0 ? 100 : 100) : 0) ? " ⚡" : ""}`
    : `❌ Wrong — Correct answer: ${correctLetter}. ${riddle.options[correctLetter]}`;
  el.innerHTML = `<div>${header}</div><div class="explanation-text">${explanation}</div>`;
  el.classList.remove("hidden");
}

function showTimeoutBanner(explanation, correctLetter, riddle) {
  const el = document.getElementById("result-banner");
  el.className = "result-banner timeout";
  el.innerHTML = `<div>⏰ Time's up! Answer was: ${correctLetter}. ${riddle.options[correctLetter]}</div><div class="explanation-text">${explanation}</div>`;
  el.classList.remove("hidden");
}

function showBetweenRounds() {
  const game = state.game;
  const players = game.players || [];
  const scores = game.scores || {};

  const sorted = [...players]
    .map(w => ({ wallet: w, score: scores[w] || 0 }))
    .sort((a, b) => b.score - a.score);

  const list = document.getElementById("leaderboard-list");
  list.innerHTML = "";

  sorted.forEach((entry, i) => {
    const isYou = entry.wallet.toLowerCase() === state.wallet.toLowerCase();
    const rankClass = i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "";
    const rankEmoji = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
    const name = state.username && isYou ? state.username : truncAddr(entry.wallet);

    const row = document.createElement("div");
    row.className = "lb-row" + (isYou ? " lb-row--you" : "");
    row.style.animationDelay = (i * 0.06) + "s";
    row.innerHTML = `
      <div class="lb-rank ${rankClass}">${rankEmoji}</div>
      <div class="lb-avatar">${name.charAt(0).toUpperCase()}</div>
      <div class="lb-name">${name}${isYou ? " (you)" : ""}</div>
      <div class="lb-score">${entry.score}</div>
    `;
    list.appendChild(row);
  });

  document.getElementById("lb-riddle-num").textContent = "#" + (state.riddleIndex + 1);

  const hostCtrl = document.getElementById("lb-host-controls");
  const waitEl = document.getElementById("lb-waiting");
  if (state.isHost) {
    hostCtrl.classList.remove("hidden");
    waitEl.classList.add("hidden");
  } else {
    hostCtrl.classList.add("hidden");
    waitEl.classList.remove("hidden");
  }

  showScreen("screen-leaderboard");
}

function showResults(game) {
  const scores = game.scores || {};
  const myScore = scores[state.wallet] || state.score;
  const winner = game.winner;

  const isWinner = winner && winner.toLowerCase() === state.wallet.toLowerCase();
  document.getElementById("results-trophy").textContent = isWinner ? "🏆" : "🎮";
  document.getElementById("results-winner-label").textContent = winner ? "Winner" : "Game Over";
  document.getElementById("results-winner-name").textContent =
    isWinner ? (state.username || "You!") : (winner ? truncAddr(winner) : "—");

  document.getElementById("results-your-score").textContent = myScore;
  document.getElementById("share-score").textContent = myScore;
  document.getElementById("share-correct").textContent = state.correctCount;
  document.getElementById("share-mode").textContent =
    MODE_LABELS[game.mode || state.selectedMode] || "—";

  // Badges earned this game
  fetchAndShowBadges();

  showScreen("screen-results");
}

async function fetchAndShowBadges() {
  try {
    const raw = await state.contract.get_player(state.wallet);
    const data = parseResult(raw);
    if (data.found) {
      const earned = data.badges || [];
      const row = document.getElementById("results-badges-row");
      row.innerHTML = "";
      earned.forEach((b, i) => {
        const info = ALL_BADGES.find(x => x.id === b);
        const chip = document.createElement("div");
        chip.className = "badge-chip";
        chip.style.animationDelay = (i * 0.1) + "s";
        chip.textContent = (info ? info.icon + " " : "") + b;
        row.appendChild(chip);
      });
    }
  } catch (e) {
    console.warn("Fetch badges error:", e);
  }
}

// ── Timer ─────────────────────────────────────────────────────────────────────
function startTimer(mode) {
  stopTimer();
  if (state.isSolo) return;

  const total = MODE_TIMERS[mode] || 60;
  state.timeLeft = total;

  const display = document.getElementById("timer-display");
  const fill = document.getElementById("timer-fill");

  const tick = () => {
    state.timeLeft--;
    const pct = (state.timeLeft / total) * 100;

    display.textContent = state.timeLeft;
    fill.style.width = pct + "%";

    if (state.timeLeft <= 5) {
      display.className = "timer-display danger";
      fill.className = "timer-fill danger";
    } else if (state.timeLeft <= total * 0.35) {
      display.className = "timer-display warning";
      fill.className = "timer-fill warning";
    }

    if (state.timeLeft <= 0) {
      stopTimer();
      onTimerExpired();
    }
  };

  state.timerInterval = setInterval(tick, 1000);
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function stopPolling() {
  if (state.pollInterval) {
    clearInterval(state.pollInterval);
    state.pollInterval = null;
  }
}

// ── Lobby UI ──────────────────────────────────────────────────────────────────
function showLobby(code, isHost) {
  document.getElementById("lobby-code-value").textContent = code;
  document.getElementById("lobby-mode-display").textContent =
    MODE_LABELS[state.selectedMode] || state.selectedMode;
  document.getElementById("lobby-riddle-count").textContent = state.selectedRiddleCount;

  document.getElementById("lobby-host-controls").classList.toggle("hidden", !isHost);
  document.getElementById("lobby-waiting").classList.toggle("hidden", isHost);

  showScreen("screen-lobby");
}

function updateLobbyPlayers(game) {
  const players = game.players || [];
  document.getElementById("lobby-player-count").textContent = players.length + "/8";
  const list = document.getElementById("lobby-players-list");
  list.innerHTML = "";

  players.forEach(addr => {
    const isYou = addr.toLowerCase() === state.wallet.toLowerCase();
    const isGameHost = addr.toLowerCase() === game.host.toLowerCase();
    const name = isYou && state.username ? state.username : truncAddr(addr);

    const row = document.createElement("div");
    row.className = "player-row";
    row.innerHTML = `
      <div class="player-avatar">${name.charAt(0).toUpperCase()}</div>
      <div class="player-name">${name}${isYou ? " (you)" : ""}</div>
      ${isGameHost ? '<div class="player-tag">HOST</div>' : ""}
    `;
    list.appendChild(row);
  });
}

function copyRoomCode() {
  const code = document.getElementById("lobby-code-value").textContent;
  navigator.clipboard.writeText(code).then(() => showToast("Code copied!", "success"));
}

function leaveRoom() {
  stopPolling();
  stopTimer();
  state.gameId = null;
  state.game = null;
  showScreen("screen-mp-menu");
}

// ── Profile ───────────────────────────────────────────────────────────────────
async function showProfile() {
  try {
    const raw = await state.contract.get_player(state.wallet);
    const data = parseResult(raw);
    if (!data.found) { showToast("Profile not found", "error"); return; }

    const p = data.player;
    const badges = data.badges || [];
    const initials = (state.username || "?").slice(0, 2).toUpperCase();

    document.getElementById("profile-avatar").textContent = initials;
    document.getElementById("profile-username").textContent = state.username || "Unknown";
    document.getElementById("profile-wallet").textContent = state.wallet;
    document.getElementById("stat-games").textContent = p.games_played || 0;
    document.getElementById("stat-wins").textContent = p.wins || 0;
    document.getElementById("stat-score").textContent = p.total_score || 0;
    document.getElementById("stat-streak").textContent = p.win_streak || 0;

    buildBadgeGrid(badges);
    showScreen("screen-profile");
  } catch (e) {
    showToast("Failed to load profile", "error");
  }
}

function buildBadgeGrid(earnedBadges = []) {
  const grid = document.getElementById("profile-badge-grid");
  if (!grid) return;
  grid.innerHTML = "";

  ALL_BADGES.forEach(badge => {
    const earned = earnedBadges.includes(badge.id);
    const item = document.createElement("div");
    item.className = "badge-item" + (earned ? " earned" : "");
    item.innerHTML = `
      <div class="badge-item-icon">${badge.icon}</div>
      <div class="badge-item-name">${badge.id}</div>
      <div class="badge-item-desc">${badge.desc}</div>
    `;
    grid.appendChild(item);
  });
}

// ── Global Leaderboard ────────────────────────────────────────────────────────
let currentLbTab = "all-time";

async function loadGlobalLeaderboard(tab) {
  currentLbTab = tab;
  const listEl = document.getElementById("global-lb-list");
  listEl.innerHTML = '<div class="text-center text-muted" style="padding:24px">Loading…</div>';

  try {
    const raw = tab === "season"
      ? await state.contract.get_season_leaderboard()
      : await state.contract.get_leaderboard();

    const entries = parseResult(raw);
    listEl.innerHTML = "";

    if (!entries.length) {
      listEl.innerHTML = '<div class="text-center text-muted" style="padding:24px">No entries yet. Be first!</div>';
      return;
    }

    entries.slice(0, 50).forEach((entry, i) => {
      const isYou = entry.wallet && entry.wallet.toLowerCase() === state.wallet.toLowerCase();
      const rankEmoji = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`;
      const rankClass = i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "";

      const row = document.createElement("div");
      row.className = "lb-row" + (isYou ? " lb-row--you" : "");
      row.style.animationDelay = (i * 0.04) + "s";
      row.innerHTML = `
        <div class="lb-rank ${rankClass}">${rankEmoji}</div>
        <div class="lb-avatar">${(entry.username || "?").charAt(0).toUpperCase()}</div>
        <div class="lb-name">${entry.username || truncAddr(entry.wallet)}${isYou ? " (you)" : ""}</div>
        <div class="lb-score">${entry.score}</div>
      `;
      listEl.appendChild(row);
    });
  } catch (e) {
    listEl.innerHTML = '<div class="text-center text-muted" style="padding:24px">Failed to load</div>';
  }
}

function switchLbTab(el, tab) {
  document.querySelectorAll(".lb-tab").forEach(t => t.classList.remove("active"));
  el.classList.add("active");
  loadGlobalLeaderboard(tab);
}

// Override showScreen to auto-load leaderboard
const _showScreen = window.showScreen;

// ── Share & Rematch ───────────────────────────────────────────────────────────
function shareResult() {
  const text = `I scored ${state.score} pts on Genazo — the GenLayer Riddle Game! 🧠⚡\n#Genazo #GenLayer`;
  if (navigator.share) {
    navigator.share({ title: "Genazo Result", text });
  } else {
    navigator.clipboard.writeText(text).then(() => showToast("Copied to clipboard!", "success"));
  }
}

async function rematch() {
  if (state.isSolo) {
    state.score = 0;
    state.correctCount = 0;
    showScreen("screen-solo-select");
  } else if (state.isHost && state.lastRoomCode) {
    showScreen("screen-create-room");
  } else {
    showScreen("screen-mp-menu");
  }
}

// ── UI Helpers ────────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");

  if (id === "screen-global-lb") loadGlobalLeaderboard("all-time");
}

function selectMode(el, context) {
  const container = context === "solo" ? "solo-mode-selector" : "create-mode-selector";
  document.querySelectorAll(`#${container} .mode-option`).forEach(o => o.classList.remove("selected"));
  el.classList.add("selected");
  state.selectedMode = el.dataset.mode;
}

function selectCount(el) {
  document.querySelectorAll("#riddle-count-selector .count-btn").forEach(b => b.classList.remove("selected"));
  el.classList.add("selected");
  state.selectedRiddleCount = parseInt(el.dataset.count, 10);
}

function formatRoomCode(input) {
  let v = input.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  if (v.length >= 2 && !v.startsWith("GN")) v = "GN-" + v.replace("GN", "");
  if (v.length > 2 && v[2] !== "-") v = v.slice(0, 2) + "-" + v.slice(2);
  input.value = v.slice(0, 7);
}

function markOption(letter, type) {
  const btn = document.getElementById("opt-" + letter);
  if (btn) btn.className = "option-btn " + type;
}

function disableOptions() {
  ["A", "B", "C", "D"].forEach(l => {
    const btn = document.getElementById("opt-" + l);
    if (btn) btn.disabled = true;
  });
}

function enableOptions() {
  ["A", "B", "C", "D"].forEach(l => {
    const btn = document.getElementById("opt-" + l);
    if (btn) btn.disabled = false;
  });
}

function resetAnswerState() {
  state.answered = false;
  document.getElementById("result-banner").classList.add("hidden");
  document.getElementById("result-banner").innerHTML = "";
  document.getElementById("btn-next-riddle").classList.add("hidden");
  ["A", "B", "C", "D"].forEach(l => {
    const btn = document.getElementById("opt-" + l);
    if (btn) { btn.className = "option-btn"; btn.disabled = false; }
  });

  const display = document.getElementById("timer-display");
  const fill = document.getElementById("timer-fill");
  if (display) display.className = "timer-display";
  if (fill) fill.className = "timer-fill";
}

function updateGenProgress(done, total) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  document.getElementById("gen-progress-fill").style.width = pct + "%";
  document.getElementById("gen-progress-label").textContent = done + " / " + total;
}

// ── Topic Selection Logic ─────────────────────────────────────────────────────
function pickTopic(mode) {
  const r = Math.random();
  let pool;
  if (mode === "simple") {
    pool = r < 0.6 ? TOPICS.community : TOPICS.technical;
  } else if (mode === "medium") {
    pool = r < 0.5 ? TOPICS.community : TOPICS.technical;
  } else {
    pool = r < 0.3 ? TOPICS.community : TOPICS.technical;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimeout;
function showToast(msg, type = "info") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = "toast show " + type;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => el.classList.remove("show"), 3200);
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function truncAddr(addr) {
  if (!addr) return "—";
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

function parseResult(raw) {
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return { error: "parse_failed", raw };
  }
}

function parseContractError(err) {
  if (!err) return null;
  const msg = err.data?.message || err.message || "";
  const knownErrors = {
    already_registered: "Already registered — try connecting",
    username_taken: "Username taken — choose another",
    not_registered: "Please register first",
    room_not_found: "Room not found — check the code",
    game_already_started: "Game already started",
    room_full: "Room is full (max 8 players)",
    only_host_can_start: "Only the host can start the game",
    invalid_mode: "Invalid game mode",
  };
  for (const [key, label] of Object.entries(knownErrors)) {
    if (msg.includes(key)) return label;
  }
  return null;
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.remove("hidden");
}

function setBtnLoading(id, loading) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.disabled = loading;
  btn.innerHTML = loading
    ? '<span class="spinner"></span> Connecting…'
    : "Connect Wallet to Play";
}

function setLoading(input, loading) {
  input.disabled = loading;
}
