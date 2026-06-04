import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';

// ── CONFIG ────────────────────────────────────────────────────────────────
const CONFIG = {
  CONTRACT_ADDRESS: '0xC6c644F4B4df6c8105b461F07DC180fBB1128Dc1',
  FUNDED_PRIVATE_KEY: '0x2afff82ee65dadde965fe25a996799b042ebfd7fae003bcf6cf2205b8dfc4eaa',
};

const account = createAccount(CONFIG.FUNDED_PRIVATE_KEY);
const client = createClient({ chain: studionet, account });

// ── UTILS ─────────────────────────────────────────────────────────────────
function safeParse(str, fallback = null) {
  try { if (!str || str.trim() === '') return fallback; return JSON.parse(str); }
  catch(e) { return fallback; }
}
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── STATE ─────────────────────────────────────────────────────────────────
const S = {
  sessionId: null, username: null,
  riddle: null, day: null, totalAnswers: 0,
  selectedAnswer: null, isSubmitting: false,
  homeView: 0, // 0 = community dashboard, 1 = today's riddle
};

// ── STATS — single source of truth ────────────────────────────────────────
function getPlayerStats() {
  return {
    streak:       parseInt(localStorage.getItem('genazo_streak')        || '0'),
    bestStreak:   parseInt(localStorage.getItem('genazo_best_streak')   || '0'),
    totalPoints:  parseInt(localStorage.getItem('genazo_points')        || '0'),
    daysAnswered: parseInt(localStorage.getItem('genazo_days_answered') || '0'),
    daysCorrect:  parseInt(localStorage.getItem('genazo_days_correct')  || '0'),
  };
}

function savePlayerStats(stats) {
  localStorage.setItem('genazo_streak',        stats.streak        ?? 0);
  localStorage.setItem('genazo_best_streak',   stats.bestStreak    ?? 0);
  localStorage.setItem('genazo_points',        stats.totalPoints   ?? 0);
  localStorage.setItem('genazo_days_answered', stats.daysAnswered  ?? 0);
  localStorage.setItem('genazo_days_correct',  stats.daysCorrect   ?? 0);
}

function updateAllStatDisplays() {
  const st = getPlayerStats();
  const set  = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const setW = (id, p) => { const el = document.getElementById(id); if (el) el.style.width = p + '%'; };

  set('stat-streak', st.streak);
  set('stat-score',  st.totalPoints);
  set('stat-day',    S.day || '—');

  set('st-streak',   st.streak);
  set('st-total',    st.totalPoints);
  set('st-answered', st.daysAnswered);
  set('st-longest',  st.bestStreak);

  const pct = st.daysAnswered > 0 ? Math.round((st.daysCorrect / st.daysAnswered) * 100) : 0;
  set('st-accuracy', `${st.daysCorrect} / ${st.daysAnswered} (${pct}%)`);
  setW('accuracy-bar', pct);

  const level    = Math.max(1, Math.floor(st.totalPoints / 200) + 1);
  const xpInLvl  = st.totalPoints % 200;
  set('xp-level', `Level ${level}`);
  set('xp-text',  `${xpInLvl} / 200 XP`);
  setW('xp-bar',  Math.round((xpInLvl / 200) * 100));

  const tog = (id, on) => { const el = document.getElementById(id); if (el) el.classList.toggle('unlocked', on); };
  tog('ach-first',   st.daysCorrect  >= 1);
  tog('ach-streak7', st.bestStreak   >= 7);
  tog('ach-scholar', st.daysAnswered >= 30);
  tog('ach-legend',  st.totalPoints  >= 1000);
}

// ── HELPERS ───────────────────────────────────────────────────────────────
async function viewCall(fn, args = []) {
  try { return await client.readContract({ address: CONFIG.CONTRACT_ADDRESS, functionName: fn, args }); }
  catch(err) { console.error('[viewCall]', fn, err.message); throw err; }
}

async function callWrite(fn, args = []) {
  const hash = await client.writeContract({ address: CONFIG.CONTRACT_ADDRESS, functionName: fn, args, value: 0 });
  await client.waitForTransactionReceipt({ hash, status: TransactionStatus.FINALIZED, retries: 150, interval: 3000 });
  return hash;
}

// ── TOAST ─────────────────────────────────────────────────────────────────
let toastTimer;
function toast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg; el.className = `show ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = ''; }, 3000);
}

// ── SCREEN ────────────────────────────────────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  const nav = document.getElementById('bottom-nav');
  const hasNav = ['screen-home','screen-result','screen-leaderboard','screen-profile'];
  nav.classList.toggle('hidden', !hasNav.includes(id));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (id === 'screen-home' || id === 'screen-result') document.getElementById('nav-home')?.classList.add('active');
  else if (id === 'screen-leaderboard') document.getElementById('nav-lb')?.classList.add('active');
  else if (id === 'screen-profile')     document.getElementById('nav-profile')?.classList.add('active');
  if (id === 'screen-home') loadDailyRiddle();
}

// ── LANDING ───────────────────────────────────────────────────────────────
function onNicknameInput(input) {
  const val   = input.value.trim();
  const valid = /^[a-zA-Z0-9_]{3,20}$/.test(val);
  document.getElementById('nick-error').classList.toggle('hidden', val.length < 3 || valid);
  document.getElementById('btn-play').disabled = !valid;
}

function enterGame() {
  const input    = document.getElementById('inp-nickname');
  const username = input.value.trim();
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) return;
  S.username = username;
  const stored = localStorage.getItem('genazo_session');
  let restoredId = null;
  if (stored) {
    const d = safeParse(stored);
    if (d?.username === username && d?.sessionId) restoredId = d.sessionId;
  }
  S.sessionId = restoredId || (username + '_' + Math.random().toString(36).slice(2, 8));
  localStorage.setItem('genazo_session', JSON.stringify({ sessionId: S.sessionId, username }));
  localStorage.setItem('genazo_nick', username);
  document.getElementById('home-nick').textContent = username;
  registerPlayerBackground();
  showScreen('screen-home');
}

async function registerPlayerBackground() {
  try { await callWrite('register_player', [S.sessionId, S.username]); } catch {}
}

// ── COUNTDOWN ─────────────────────────────────────────────────────────────
function getCountdown() {
  const now      = new Date();
  const tomorrow = new Date();
  tomorrow.setUTCHours(24, 0, 0, 0);
  const diff = tomorrow - now;
  if (diff <= 0) return '0h 00m 00s';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  return `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
}

let _cdInterval = null;
function startCountdown() {
  clearInterval(_cdInterval);
  _cdInterval = setInterval(() => {
    const el = document.getElementById('countdown');
    if (el) el.textContent = getCountdown();
    else clearInterval(_cdInterval);
  }, 1000);
}

// ── VIEW NAV ──────────────────────────────────────────────────────────────
function viewNavHtml(active) {
  const leftBtn  = `<button onclick="showDashboard()" style="width:32px;height:32px;border-radius:8px;border:1px solid #1A1828;background:#0F0E1A;display:flex;align-items:center;justify-content:center;cursor:pointer"><i class="ti ti-arrow-left" style="font-size:16px;color:#6B6888" aria-label="Go to community"></i></button>`;
  const rightBtn = `<button onclick="showTodayRiddle()" style="width:32px;height:32px;border-radius:8px;border:1px solid #1A1828;background:#0F0E1A;display:flex;align-items:center;justify-content:center;cursor:pointer"><i class="ti ti-arrow-right" style="font-size:16px;color:#6B6888" aria-label="Go to today's riddle"></i></button>`;
  const spacer   = `<div style="width:32px;height:32px;flex-shrink:0"></div>`;
  return `
    <div class="view-nav">
      ${active === 1 ? leftBtn : spacer}
      <div class="view-nav-tabs">
        <span class="view-nav-tab ${active === 0 ? 'active' : ''}" onclick="showDashboard()">Community</span>
        <span class="view-nav-tab ${active === 1 ? 'active' : ''}" onclick="showTodayRiddle()">Today's Riddle</span>
      </div>
      ${active === 0 ? rightBtn : spacer}
    </div>`;
}

// ── HOME DASHBOARD ────────────────────────────────────────────────────────
function updateDashboardStats() {
  const st  = getPlayerStats();
  const pct = st.daysAnswered > 0 ? Math.round((st.daysCorrect / st.daysAnswered) * 100) : 0;

  const actEl = document.getElementById('dashboard-activity');
  if (actEl) actEl.textContent = `${st.daysAnswered} answers · ${pct}% accuracy`;

  const strEl = document.getElementById('dashboard-streak');
  if (strEl) {
    if (st.streak >= 3)      strEl.textContent = `You're on a ${st.streak} day streak! Keep answering daily to earn bonus points.`;
    else if (st.streak >= 1) strEl.textContent = `${st.streak} day streak started. Reach day 3 for bonus points!`;
    else                     strEl.textContent = 'Answer today to start your streak and earn bonus points from day 3.';
  }

  const titleEl = document.getElementById('streak-card-title');
  if (titleEl) titleEl.textContent = st.streak >= 3 ? `${st.streak} day streak!` : 'Start your streak';
}

async function loadDashboardActivity() {
  try {
    const raw  = await viewCall('get_daily_answers', []);
    let data   = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(data)) data = [];
    const total   = data.length;
    const correct = data.filter(p => p.correct).length;
    const pct     = total > 0 ? Math.round((correct / total) * 100) : 0;
    const el      = document.getElementById('activity-text');
    if (el) el.textContent = total > 0
      ? `${total} player${total !== 1 ? 's' : ''} answered today. ${pct}% got it right.`
      : "Be the first to answer today's riddle!";
  } catch(e) { console.error('[dashboard activity]', e); }
}

async function showDashboard() {
  S.homeView = 0;
  const body = document.getElementById('home-body');
  if (!body) return;

  body.innerHTML = viewNavHtml(0) + `<div id="dash-content"></div>`;

  const content = document.getElementById('dash-content');
  if (!content) return;

  content.innerHTML = `
    <div class="dash-header">
      <div class="dash-title">GenLayer Community</div>
      <div class="dash-sub">Powered by Intelligent Contracts</div>
    </div>

    <div class="info-card">
      <span class="info-card-tag tag-purple">Protocol</span>
      <div class="info-card-title">What is GenLayer?</div>
      <div class="info-card-body">The first blockchain where smart contracts can think, access the internet, and reach AI consensus. Built for the machine economy.</div>
    </div>

    <div class="info-card">
      <span class="info-card-tag tag-teal">Community</span>
      <div class="info-card-title">How Genazo builds the community</div>
      <div class="info-card-body">Every riddle is generated live from GenLayer docs by 5 AI validators reaching consensus. Playing daily deepens your protocol knowledge and strengthens the ecosystem.</div>
    </div>

    <div class="info-card">
      <span class="info-card-tag tag-blue">Live</span>
      <div class="info-card-title">Today's activity</div>
      <div id="activity-text" class="info-card-body">Loading…</div>
    </div>

    <div class="info-card">
      <span class="info-card-tag tag-amber">Streak</span>
      <div id="streak-card-title" class="info-card-title">Start your streak</div>
      <div id="dashboard-streak" class="info-card-body">Answer today to start your streak and earn bonus points from day 3.</div>
      <div id="dashboard-activity" class="info-card-sub" style="font-size:11px;color:var(--text-2);margin-top:6px"></div>
    </div>

    <div class="next-riddle-block">
      <div class="next-riddle-label">Next riddle drops at midnight UTC (1:00 AM WAT · 8:00 PM ET · 1:00 AM CET)</div>
      <div id="countdown" class="next-riddle-countdown">${getCountdown()}</div>
    </div>
  `;

  startCountdown();
  updateDashboardStats();
  loadDashboardActivity();
}

function showTodayRiddle() {
  S.homeView = 1;
  const body = document.getElementById('home-body');
  if (!body) return;

  const wrap = document.createElement('div');
  body.innerHTML = viewNavHtml(1);
  body.appendChild(wrap);

  const lastAnsweredDay = parseInt(localStorage.getItem('genazo_last_answered_day') || '0');
  if (S.riddle && lastAnsweredDay >= S.day) {
    renderAnswered(wrap, safeParse(localStorage.getItem('genazo_last_result')));
  } else if (S.riddle) {
    renderRiddle(wrap);
  } else {
    wrap.innerHTML = '<div class="loading-wrap"><div class="spinner-lg"></div><p>Loading…</p></div>';
  }
}

function setHomeView(view) {
  if (view === 0) showDashboard();
  else showTodayRiddle();
}

// ── HOME ──────────────────────────────────────────────────────────────────
async function loadDailyRiddle() {
  document.getElementById('home-nick').textContent = S.username || localStorage.getItem('genazo_nick') || '';
  updateAllStatDisplays();

  // Skip re-fetch if riddle already loaded
  if (S.riddle && S.day) {
    const lastAnsweredDay = parseInt(localStorage.getItem('genazo_last_answered_day') || '0');
    if (lastAnsweredDay >= S.day) { await showDashboard(); return; }
    showTodayRiddle(); return;
  }

  const body = document.getElementById('home-body');
  body.innerHTML = `<div class="loading-wrap"><div class="spinner-lg"></div><p>Loading today's riddle…</p></div>`;

  try {
    const raw    = await viewCall('get_daily_riddle', []);
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;

    if (!parsed?.found) { renderNoRiddle(body); return; }

    S.riddle       = parsed.riddle;
    S.day          = parsed.day;
    S.totalAnswers = parsed.total_answers || 0;
    updateAllStatDisplays();

    const lastAnsweredDay = parseInt(localStorage.getItem('genazo_last_answered_day') || '0');
    if (lastAnsweredDay >= S.day) await showDashboard();
    else showTodayRiddle();

  } catch (err) {
    console.error('[loadDailyRiddle]', err);
    body.innerHTML = `
      <div class="no-riddle-wrap">
        <div class="no-riddle-icon"><i class="ti ti-alert-triangle" style="font-size:52px;color:#3A3858"></i></div>
        <h2>Connection Error</h2>
        <p>Could not load today's riddle.<br>Try again in a moment.</p>
        <button class="btn btn-primary" onclick="loadHomeScreen()">Retry</button>
      </div>`;
  }
}

function renderNoRiddle(body) {
  body.innerHTML = `
    <div class="no-riddle-wrap">
      <div class="no-riddle-icon"><i class="ti ti-moon" style="font-size:52px;color:#3A3858"></i></div>
      <h2>No Riddle Today (Yet)</h2>
      <p>Today's riddle is being prepared.<br>Check back soon — a new one drops every day!</p>
    </div>`;
}

function renderRiddle(container) {
  const r       = S.riddle;
  const history = getStreakHistory();
  const dots    = buildStreakDots(history);

  container.innerHTML = `
    <div class="day-header">
      <div class="day-badge">Day ${S.day}</div>
      <div class="streak-dots">${dots}</div>
      <div class="answer-count">${S.totalAnswers} answered</div>
    </div>
    <div class="riddle-card">
      <div class="riddle-card-top">
        <span class="riddle-category">${(r.category || 'technical').toUpperCase()}</span>
        <span class="riddle-topic-dot ${r.category === 'community' ? 'dot-amber' : 'dot-blue'}"></span>
      </div>
      <div class="riddle-text">${r.riddle}</div>
      <div class="riddle-hint">
        <i class="ti ti-bulb hint-icon"></i>
        <span>${r.hint}</span>
      </div>
    </div>
    <div class="options-list">
      ${['A','B','C','D'].map(l => `
        <button class="opt-btn" id="opt-${l}" onclick="selectAnswer('${l}')">
          <span class="opt-letter">${l}</span>
          <span class="opt-text">${r.options[l] || ''}</span>
          <i class="ti ti-chevron-right opt-chevron"></i>
        </button>`).join('')}
    </div>
    <p class="point-info">Correct = 100 pts · 7-day streak = +50 bonus</p>
    <button class="btn btn-primary btn-full" id="submit-btn" onclick="submitAnswer()" disabled>
      Submit Answer
    </button>`;

  S.selectedAnswer = null;
}

function renderAnswered(container, result) {
  const r         = S.riddle;
  const isCorrect = result?.correct;
  const pts       = result?.points || 0;
  const streak    = result?.new_streak || 0;

  container.innerHTML = `
    <div class="day-header"><div class="day-badge">Day ${S.day}</div></div>
    <div class="answered-card ${isCorrect ? 'correct' : 'wrong'}">
      <i class="ti ${isCorrect ? 'ti-circle-check' : 'ti-circle-x'} answered-icon-ti"></i>
      <div class="answered-label">${isCorrect ? 'Correct!' : 'Not quite'}</div>
      <div class="answered-pts">+${pts} pts${streak > 1 ? ` · ${streak} day streak` : ''}</div>
    </div>
    ${r ? `<div class="explanation-card">
      <div class="exp-label">Correct Answer</div>
      <div class="exp-answer">${r.correct}. ${r.options?.[r.correct] || ''}</div>
      <div class="exp-text">${r.explanation || ''}</div>
    </div>` : ''}
    <div class="come-back">Come back tomorrow for a new riddle</div>
    <div style="display:flex;gap:10px;margin-top:16px;padding-bottom:8px">
      <button class="btn btn-primary" style="flex:1" onclick="shareResult()">
        <i class="ti ti-share"></i> Share
      </button>
      <button class="btn btn-secondary" style="flex:1" onclick="showResultScreen(${JSON.stringify(result).replace(/"/g,'&quot;')})">
        View Score
      </button>
    </div>`;
}

// ── ANSWER SELECTION ──────────────────────────────────────────────────────
function selectAnswer(letter) {
  if (S.isSubmitting) return;
  S.selectedAnswer = letter;
  ['A','B','C','D'].forEach(l => {
    const btn = document.getElementById(`opt-${l}`);
    if (btn) btn.classList.toggle('selected', l === letter);
  });
  const sub = document.getElementById('submit-btn');
  if (sub) sub.disabled = false;
}

// ── SUBMIT ────────────────────────────────────────────────────────────────
function submitAnswer() {
  if (!S.selectedAnswer || S.isSubmitting) return;
  S.isSubmitting = true;

  const riddle    = S.riddle;
  const correct   = riddle.correct.toUpperCase();
  const isCorrect = S.selectedAnswer.toUpperCase() === correct;

  const cur       = getPlayerStats();
  const newStreak = isCorrect ? cur.streak + 1 : 0;
  const newBest   = Math.max(cur.bestStreak, newStreak);

  let streakBonus = 0;
  if (isCorrect) {
    if      (newStreak >= 30) streakBonus = 100;
    else if (newStreak >= 7)  streakBonus = 50;
    else if (newStreak >= 3)  streakBonus = 25;
  }
  const points = isCorrect ? 100 + streakBonus : 0;

  savePlayerStats({
    streak:       newStreak,
    bestStreak:   newBest,
    totalPoints:  cur.totalPoints  + points,
    daysAnswered: cur.daysAnswered + 1,
    daysCorrect:  cur.daysCorrect  + (isCorrect ? 1 : 0),
  });

  const result = {
    correct: isCorrect, points,
    new_streak: newStreak, streak_bonus: streakBonus,
    correct_answer: correct, explanation: riddle.explanation || '',
    answer: S.selectedAnswer,
  };

  localStorage.setItem('genazo_last_answered_day', String(S.day));
  localStorage.setItem('genazo_last_result', JSON.stringify(result));

  const history = getStreakHistory();
  history.push({ day: S.day, correct: isCorrect });
  localStorage.setItem('genazo_streak_history', JSON.stringify(history.slice(-30)));

  updateAllStatDisplays();
  updateLeaderboardOptimistic(S.username, points);

  // Show result screen; player can navigate home → dashboard via nav
  showResultScreen(result);
  S.isSubmitting = false;

  callWrite('submit_daily_answer', [S.sessionId, S.username, S.selectedAnswer])
    .then(hash => console.log('[submit] confirmed:', hash))
    .catch(err  => console.error('[submit] error:', err.message));
}

// ── RESULT SCREEN ─────────────────────────────────────────────────────────
function animateScore(target, prefix) {
  const el = document.getElementById('score-display');
  if (!el) return;
  if (target === 0) { el.textContent = '0'; return; }
  let step = 0; const steps = 20;
  const timer = setInterval(() => {
    step++;
    el.textContent = prefix + Math.round(target * (step / steps));
    if (step >= steps) clearInterval(timer);
  }, 40);
}

function showResultScreen(result) {
  if (!result) return;
  showScreen('screen-result');

  const isCorrect   = result.correct;
  const pts         = isCorrect ? (result.points || 100) : 0;
  const streakBonus = result.streak_bonus || 0;
  const streak      = result.new_streak || 0;

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const get = (id)    => document.getElementById(id);

  const iconEl = get('result-icon');
  if (iconEl) {
    iconEl.className = `ti ${isCorrect ? 'ti-circle-check' : 'ti-circle-x'} result-icon-symbol`;
  }
  const iconWrap = get('result-icon-wrap');
  if (iconWrap) iconWrap.className = 'result-icon-wrap ' + (isCorrect ? 'correct-mode' : 'wrong-mode');

  const lbl = get('result-label');
  if (lbl) { lbl.textContent = isCorrect ? 'CORRECT!' : 'WRONG'; lbl.className = 'result-outcome-label ' + (isCorrect ? 'correct' : 'wrong'); }

  animateScore(pts, pts > 0 ? '+' : '');

  const bkdn = get('score-breakdown');
  if (bkdn) bkdn.textContent = streakBonus > 0
    ? `${pts - streakBonus} base + ${streakBonus} streak bonus`
    : pts > 0 ? `${pts} pts` : 'Better luck tomorrow';

  const sb = get('streak-block');
  if (sb) {
    if (isCorrect && streak > 0) {
      sb.style.display = 'flex';
      sb.className = 'streak-block';
      set('streak-text', `${streak} day streak — keep it alive`);
    } else if (!isCorrect) {
      sb.style.display = 'flex';
      sb.className = 'streak-block streak-block--reset';
      set('streak-text', "You'll get it tomorrow. Keep going.");
    } else {
      sb.style.display = 'none';
    }
  }

  const r = S.riddle;
  if (r) {
    set('correct-answer-text', r.correct + '. ' + (r.options?.[r.correct] || ''));
    set('explanation-text', r.explanation || '');
  }

  if (isCorrect) launchConfetti();
  showOptimisticCommunity(S.username, isCorrect);
}

function launchConfetti() {
  const container = document.getElementById('confetti-container');
  if (!container) return;
  container.innerHTML = '';
  const colors = ['#7C3AED','#34D399','#3B82F6','#F59E0B','#F87171'];
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    p.style.cssText = `position:absolute;width:${Math.random()*8+4}px;height:${Math.random()*8+4}px;background:${colors[Math.floor(Math.random()*colors.length)]};left:${Math.random()*100}%;top:-10px;border-radius:${Math.random()>.5?'50%':'2px'};animation:fall ${Math.random()*2+1.5}s linear ${Math.random()*0.5}s forwards;opacity:0.8;`;
    container.appendChild(p);
  }
  setTimeout(() => { if (container) container.innerHTML = ''; }, 4000);
}

async function loadCommunityResults() {
  try {
    const raw  = await viewCall('get_daily_answers', []);
    let data   = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(data)) data = [];

    const title = document.getElementById('community-title');
    if (title) title.textContent = `Community today · ${data.length} answered`;

    const list = document.getElementById('community-list');
    if (!list) return;

    if (data.length === 0) { list.innerHTML = '<div style="font-size:12px;color:#3A3858">No answers yet</div>'; return; }

    list.innerHTML = data.slice(0, 5).map(p => `
      <div style="display:flex;align-items:center;gap:8px;padding:4px 0">
        <div style="width:24px;height:24px;border-radius:6px;background:#1F1640;display:flex;align-items:center;justify-content:center;font-family:'Space Mono',monospace;font-size:10px;font-weight:700;color:#9D7FEA;flex-shrink:0">${(p.username||'?')[0].toUpperCase()}</div>
        <div style="flex:1;font-size:13px;color:#6B6888">${escHtml(p.username||'Anonymous')}</div>
        <div style="font-size:11px;font-weight:600;color:${p.correct?'#34D399':'#F87171'}">${p.correct?'Correct':'Wrong'}</div>
      </div>`).join('');
  } catch(err) { console.error('[community]', err); }
}

function showOptimisticCommunity(username, isCorrect) {
  const list = document.getElementById('community-list');
  if (!list) return;
  const initial     = (username || 'A')[0].toUpperCase();
  const resultColor = isCorrect ? '#34D399' : '#F87171';
  const resultText  = isCorrect ? 'Correct' : 'Wrong';
  const title       = document.getElementById('community-title');
  if (title) title.textContent = 'Community today · just answered';
  list.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;padding:4px 0">
      <div style="width:22px;height:22px;border-radius:6px;background:#1F1640;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#9D7FEA">${initial}</div>
      <div style="flex:1;font-size:13px;color:#6B6888">${escHtml(username || 'You')}</div>
      <div style="font-size:11px;font-weight:700;color:${resultColor}">${resultText}</div>
    </div>`;
  setTimeout(() => loadCommunityResults(), 30000);
}

function updateLeaderboardOptimistic(username, points) {
  const cached   = JSON.parse(localStorage.getItem('genazo_lb_alltime') || '[]');
  const existing = cached.find(p => p.username === username);
  if (existing) {
    existing.total_points = (existing.total_points || 0) + points;
  } else {
    cached.unshift({ username, total_points: points, streak: 1, days_answered: 1 });
  }
  cached.sort((a, b) => (b.total_points || 0) - (a.total_points || 0));
  localStorage.setItem('genazo_lb_alltime', JSON.stringify(cached));
  localStorage.setItem('genazo_lb_time_alltime', Date.now().toString());
}

// ── LEADERBOARD ───────────────────────────────────────────────────────────
function showLeaderboard() {
  showScreen('screen-leaderboard');
  document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('lb-tab-today').classList.add('active');
  loadLeaderboard('today');
}

function renderLeaderboardEntries(list, entries) {
  if (!entries.length) {
    list.innerHTML = `<div class="lb-empty"><i class="ti ti-trophy" style="font-size:36px;color:#252338;margin-bottom:12px;display:block"></i><p>Be the first to the top.<br>Answer daily to claim #1.</p></div>`;
    return;
  }

  let html = '';
  if (entries.length >= 3) {
    const [f, s, t] = entries;
    const av = e => (e.username||'?')[0].toUpperCase();
    html += `<div class="lb-podium">
      <div class="lb-podium-slot lb-podium-2nd">
        <div class="lb-podium-av lb-av-silver">${av(s)}</div>
        <div class="lb-podium-name">${escHtml(s.username||'?')}</div>
        <div class="lb-podium-pts">${s.value}</div>
        <div class="lb-podium-base lb-base-silver">2</div>
      </div>
      <div class="lb-podium-slot lb-podium-1st">
        <i class="ti ti-crown lb-podium-crown"></i>
        <div class="lb-podium-av lb-av-gold">${av(f)}</div>
        <div class="lb-podium-name">${escHtml(f.username||'?')}</div>
        <div class="lb-podium-pts">${f.value}</div>
        <div class="lb-podium-base lb-base-gold">1</div>
      </div>
      <div class="lb-podium-slot lb-podium-3rd">
        <div class="lb-podium-av lb-av-bronze">${av(t)}</div>
        <div class="lb-podium-name">${escHtml(t.username||'?')}</div>
        <div class="lb-podium-pts">${t.value}</div>
        <div class="lb-podium-base lb-base-bronze">3</div>
      </div>
    </div>`;
  }

  html += entries.map((e, i) => {
    const av   = (e.username||'?')[0].toUpperCase();
    const rank = i < 3 ? `<span class="lb-medal lb-medal-${i+1}">${i+1}</span>` : String(i+1);
    return `<div class="lb-row${e.isYou?' you':''}" style="animation-delay:${i*.04}s">
      <div class="lb-rank">${rank}</div>
      <div class="lb-av">${av}</div>
      <div class="lb-name">${escHtml(e.username||'?')}${e.isYou?'<span class="lb-you-tag">you</span>':''}</div>
      ${e.extra?`<div style="font-size:12px;color:var(--text-2)">${e.extra}</div>`:''}
      <div class="lb-value">${e.value} pts</div>
    </div>`;
  }).join('');

  list.innerHTML = html;
}

async function loadLeaderboard(tab) {
  document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
  document.getElementById(`lb-tab-${tab}`)?.classList.add('active');
  const list = document.getElementById('lb-list');
  if (list) list.innerHTML = '<div class="loading-wrap" style="padding:40px 0"><div class="spinner-lg"></div></div>';

  try {
    const raw = await viewCall(
      tab === 'today' ? 'get_daily_answers' :
      tab === 'week'  ? 'get_weekly_leaderboard' :
                        'get_all_time_leaderboard', []);
    let data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(data)) data = [];
    if (!data.length) { showLeaderboardEmpty(tab); return; }
    showLeaderboardData(data, tab);
  } catch(err) {
    console.error('[leaderboard]', err);
    showLeaderboardEmpty(tab);
  }
}

function showLeaderboardEmpty(tab) {
  const el = document.getElementById('lb-list');
  if (el) el.innerHTML = `<div class="lb-empty"><i class="ti ti-trophy" style="font-size:36px;color:#252338;margin-bottom:12px;display:block"></i><p>No entries yet.<br>Be the first to answer!</p></div>`;
}

function showLeaderboardData(data, tab) {
  const list = document.getElementById('lb-list');
  if (!list) return;
  const entries = tab === 'alltime'
    ? data.map(a => ({ username: a.username, value: a.total_points||0, isYou: a.username===S.username, extra: `<i class="ti ti-flame" style="color:#F59E0B"></i> ${a.streak||0}` }))
    : data.map(a => ({ username: a.username, value: a.points||0, isYou: a.username===S.username, extra: tab==='today' ? (a.correct?`<i class="ti ti-check" style="color:#34D399"></i>`:`<i class="ti ti-x" style="color:#F87171"></i>`) : '' }));
  renderLeaderboardEntries(list, entries);
}

// ── PROFILE ───────────────────────────────────────────────────────────────
async function showProfile() {
  showScreen('screen-profile');
  updateAllStatDisplays();
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('profile-av',   (S.username||'?')[0].toUpperCase());
  set('profile-name', S.username||'—');
  await loadPlayerData();
}

async function loadPlayerData() {
  try {
    const raw  = await viewCall('get_player', [S.sessionId]);
    const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!data?.found) return;
    const p = data.player;
    savePlayerStats({
      streak:       p.streak         || 0,
      bestStreak:   p.longest_streak || 0,
      totalPoints:  p.total_points   || 0,
      daysAnswered: p.days_answered  || 0,
      daysCorrect:  p.days_correct   || 0,
    });
    updateAllStatDisplays();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('profile-av',   (p.username||S.username||'?')[0].toUpperCase());
    set('profile-name', p.username||S.username||'—');
  } catch {}
}

// ── STREAK HISTORY ────────────────────────────────────────────────────────
function getStreakHistory() { return safeParse(localStorage.getItem('genazo_streak_history'), []); }

function buildStreakDots(history) {
  const dots = [];
  for (let i = 6; i >= 0; i--) {
    const e = history[history.length - 1 - i];
    if (!e)          dots.push('<div class="streak-dot empty"></div>');
    else if (e.correct) dots.push('<div class="streak-dot correct"></div>');
    else             dots.push('<div class="streak-dot wrong"></div>');
  }
  return dots.join('');
}

// ── SHARE ─────────────────────────────────────────────────────────────────
function shareResult() {
  const day    = S.day || 1;
  const pts    = parseInt(localStorage.getItem('genazo_points') || '0');
  const streak = parseInt(localStorage.getItem('genazo_streak') || '0');
  const text   = 'GENAZO Day ' + day + ' — ' + pts + ' pts total' +
    (streak >= 3 ? ' · ' + streak + ' day streak' : '') +
    '\nThe daily GenLayer riddle game.\nPlay at: https://genazo.xyz';
  const twitterUrl = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(text);
  if (navigator.share) {
    navigator.share({ title: 'Genazo Day ' + day, text }).catch(() => window.open(twitterUrl, '_blank'));
  } else {
    window.open(twitterUrl, '_blank');
  }
}

// ── INIT ──────────────────────────────────────────────────────────────────
async function init() {
  const storedContract = localStorage.getItem('genazo_contract');
  if (storedContract !== CONFIG.CONTRACT_ADDRESS) {
    ['genazo_streak','genazo_best_streak','genazo_points',
     'genazo_days_answered','genazo_days_correct',
     'genazo_last_answered_day','genazo_last_result',
     'genazo_streak_history','genazo_player_stats',
    ].forEach(k => localStorage.removeItem(k));
    localStorage.setItem('genazo_contract', CONFIG.CONTRACT_ADDRESS);
    console.log('[init] Contract changed — cleared cache');
  }

  document.getElementById('nav-home')?.addEventListener('click', () => showScreen('screen-home'));

  const session = localStorage.getItem('genazo_session');
  if (session) {
    const d = safeParse(session);
    if (d?.sessionId && d?.username) {
      S.sessionId = d.sessionId; S.username = d.username;
      const inp = document.getElementById('inp-nickname');
      if (inp) inp.value = d.username;
      const btn = document.getElementById('btn-play');
      if (btn) btn.disabled = false;
      document.getElementById('home-nick').textContent = d.username;
      showScreen('screen-home');
    }
  }
}

init();

// ── EXPORTS ───────────────────────────────────────────────────────────────
Object.assign(window, {
  onNicknameInput, enterGame, selectAnswer, submitAnswer,
  loadDailyRiddle, loadHomeScreen: loadDailyRiddle,
  showLeaderboard, loadLeaderboard, showProfile, shareResult,
  showResultScreen, showLeaderboardData, showLeaderboardEmpty,
  launchConfetti, loadCommunityResults,
  showOptimisticCommunity, updateLeaderboardOptimistic,
  updateDashboardStats, loadDashboardActivity,
  setHomeView, showDashboard, showTodayRiddle,
});
