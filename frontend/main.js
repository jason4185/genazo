import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { TransactionStatus } from 'genlayer-js/types';

// ── CONFIG ────────────────────────────────────────────────────────────────
const CONFIG = {
  CONTRACT_ADDRESS: '0x4158171529aE8e17aA0e8B1F0AF990952D256812',
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

async function generateSessionId(username, password) {
  const input = username.toLowerCase().trim() + ':' + password;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── STATE ─────────────────────────────────────────────────────────────────
const S = {
  sessionId: null, username: null,
  riddle: null, day: null, totalAnswers: 0,
  selectedAnswer: null, isSubmitting: false,
  homeView: 0, // 0 = community dashboard, 1 = today's riddle
};

let currentRiddleIndex = 0;
let allRiddles = [];
let sessionAnswers = {};
let isWaitingForRiddles = false;

// ── SESSION-SCOPED STORAGE ────────────────────────────────────────────────
function storageKey(key) {
  return key + '_' + (S.sessionId || 'guest');
}
function getStorage(key, fallback = null) {
  const val = localStorage.getItem(storageKey(key));
  return val !== null ? val : fallback;
}
function setStorage(key, value) {
  localStorage.setItem(storageKey(key), value);
}
function removeStorage(key) {
  localStorage.removeItem(storageKey(key));
}

// ── STATS — single source of truth ────────────────────────────────────────
function getPlayerStats() {
  return {
    streak:       parseInt(getStorage('genazo_streak',        '0')),
    bestStreak:   parseInt(getStorage('genazo_best_streak',   '0')),
    totalPoints:  parseInt(getStorage('genazo_points',        '0')),
    daysAnswered: parseInt(getStorage('genazo_days_answered', '0')),
    daysCorrect:  parseInt(getStorage('genazo_days_correct',  '0')),
  };
}

function savePlayerStats(stats) {
  setStorage('genazo_streak',        stats.streak        ?? 0);
  setStorage('genazo_best_streak',   stats.bestStreak    ?? 0);
  setStorage('genazo_points',        stats.totalPoints   ?? 0);
  setStorage('genazo_days_answered', stats.daysAnswered  ?? 0);
  setStorage('genazo_days_correct',  stats.daysCorrect   ?? 0);
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

// ── RANK ──────────────────────────────────────────────────────────────────
async function calculatePlayerRank() {
  try {
    const result = await viewCall('get_all_time_leaderboard', []);
    let data = typeof result === 'string' ? JSON.parse(result) : result;
    if (!Array.isArray(data)) return '—';
    const index = data.findIndex(p =>
      p.session_id === S.sessionId || p.username === S.username
    );
    if (index === -1) return '—';
    return '#' + (index + 1);
  } catch(err) {
    console.error('[rank]', err);
    return '—';
  }
}

async function updateRankDisplay() {
  const rank = await calculatePlayerRank();
  const el = document.getElementById('stat-rank');
  if (el) el.textContent = rank;
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
  const hasNav = ['screen-home','screen-result','screen-leaderboard','screen-profile','screen-final'];
  nav.classList.toggle('hidden', !hasNav.includes(id));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  if (id === 'screen-home' || id === 'screen-result' || id === 'screen-final') document.getElementById('nav-home')?.classList.add('active');
  else if (id === 'screen-leaderboard') document.getElementById('nav-lb')?.classList.add('active');
  else if (id === 'screen-profile')     document.getElementById('nav-profile')?.classList.add('active');
  if (id === 'screen-home') loadDailyRiddle();
}

// ── ANSWER ENCODING ──────────────────────────────────────────────────────
function encodeAnswer(answer) {
  return btoa(answer + '_genazo');
}

function decodeAnswer(encoded) {
  try {
    return atob(encoded).replace('_genazo', '');
  } catch(e) {
    return encoded;
  }
}

// ── AUTH ──────────────────────────────────────────────────────────────────
function isOldSession(sid) {
  return sid && !sid.startsWith('0x');
}

function saveSession(sid, username) {
  localStorage.setItem('genazo_session', sid);
  localStorage.setItem('genazo_nickname', username);
  S.sessionId = sid;
  S.username  = username;
}

function showAuthError(el, message) {
  if (!el) return;
  el.textContent   = message;
  el.style.display = 'block';
  el.style.color   = '#F87171';
  el.style.fontSize = '13px';
  el.style.marginTop = '8px';
  setTimeout(() => { el.style.display = 'none'; }, 5000);
}

function showLoading(message) {
  const btn = document.querySelector('.screen.active .cta');
  if (btn) { btn.disabled = true; btn.dataset.originalText = btn.textContent; btn.textContent = message || 'Loading...'; }
}

function hideLoading() {
  const btn = document.querySelector('.screen.active .cta[disabled]');
  if (btn && btn.dataset.originalText) { btn.disabled = false; btn.textContent = btn.dataset.originalText; }
}

async function syncPlayerState() {
  try {
    const day = await viewCall('get_day_number', []);
    const parsedDay = typeof day === 'string' ? JSON.parse(day) : day;

    S.day = parsedDay;

    const playerResult = await viewCall('get_player', [S.sessionId]);
    const playerParsed = typeof playerResult === 'string' ? JSON.parse(playerResult) : playerResult;

    if (!playerParsed?.found) return;

    const player = playerParsed.player;
    const lastDayAnswered = player?.last_day_answered || 0;

    if (lastDayAnswered >= parsedDay) {
      // Already fully completed today on another device
      setStorage('genazo_last_answered_day', parsedDay.toString());
      return;
    }

    const answersResult = await viewCall('get_daily_answers', []);
    let answers = typeof answersResult === 'string' ? JSON.parse(answersResult) : answersResult;
    if (!Array.isArray(answers)) answers = [];

    const myAnswer = answers.find(a => a.session_id === S.sessionId);

    if (myAnswer && myAnswer.answered > 0) {
      const answeredCount = myAnswer.answered;

      setStorage('genazo_answered_count_' + parsedDay, answeredCount.toString());

      const pointsPerRiddle = 100;
      const totalPoints = myAnswer.points || 0;
      const correctCount = Math.round(totalPoints / pointsPerRiddle);

      const mockAnswers = {};
      for (let i = 1; i <= answeredCount; i++) {
        mockAnswers[i] = {
          answer: 'synced',
          correct: i <= correctCount,
          points: i <= correctCount ? 100 : 0,
          synced: true,
        };
      }

      sessionAnswers = mockAnswers;
      setStorage('genazo_session_answers_' + parsedDay, JSON.stringify(mockAnswers));
      currentRiddleIndex = answeredCount;
    }
  } catch(err) {
    console.error('[sync]', err);
  }
}

async function enterApp() {
  clearStaleData();
  await syncPlayerState();
  const hasOnboarded = getStorage('genazo_onboarded', null);
  if (!hasOnboarded) {
    showScreen('screen-onboarding');
  } else {
    showScreen('screen-home');
  }
}

function checkExistingSession() {
  const sid  = localStorage.getItem('genazo_session');
  const name = localStorage.getItem('genazo_nickname') || localStorage.getItem('genazo_nick');

  if (sid && isOldSession(sid)) {
    localStorage.removeItem('genazo_session');
    localStorage.removeItem('genazo_nickname');
    const banner = document.getElementById('migration-banner');
    if (banner) banner.style.display = 'block';
    showScreen('screen-landing');
    return false;
  }

  if (sid && name) {
    S.sessionId = sid;
    S.username  = name;
    enterApp();
    return true;
  }

  showScreen('screen-landing');
  return false;
}

function onSignupUsernameInput(input) {
  const val = input.value;
  const countEl = document.getElementById('signup-char-count');
  if (countEl) countEl.textContent = val.length + '/20';
  const btn = document.getElementById('signup-submit-btn');
  if (btn) btn.disabled = val.trim().length < 3;
}

async function handleSignUp() {
  const username = document.getElementById('signup-username')?.value.trim().toLowerCase() || '';
  const password = document.getElementById('signup-password')?.value || '';
  const confirm  = document.getElementById('signup-confirm')?.value || '';
  const errorEl  = document.getElementById('signup-error');

  if (username.length < 3 || username.length > 20) {
    showAuthError(errorEl, 'Username must be 3 to 20 characters.');
    return;
  }
  if (/\s/.test(username)) {
    showAuthError(errorEl, 'Username cannot contain spaces.');
    return;
  }
  if (password.length < 6) {
    showAuthError(errorEl, 'Password must be at least 6 characters.');
    return;
  }
  if (password !== confirm) {
    showAuthError(errorEl, 'Passwords do not match.');
    return;
  }
  if (password.toLowerCase() === username.toLowerCase()) {
    showAuthError(errorEl, 'Password cannot be the same as your username.');
    return;
  }

  const sid = await generateSessionId(username, password);

  saveSession(sid, username);
  enterApp();

  callWrite('register_player', [sid, username])
    .then(result => {
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      if (parsed?.error === 'username_taken') {
        localStorage.removeItem('genazo_session');
        localStorage.removeItem('genazo_nickname');
        showScreen('screen-signup');
        showAuthError(errorEl, 'This username is already taken. Choose a different one.');
      }
    })
    .catch(err => {
      console.error('[signup]', err);
    });
}

async function handleSignIn() {
  const username = document.getElementById('signin-username')?.value.trim().toLowerCase() || '';
  const password = document.getElementById('signin-password')?.value || '';
  const errorEl  = document.getElementById('signin-error');

  if (!username || !password) {
    showAuthError(errorEl, 'Please enter your username and password.');
    return;
  }

  const sid = await generateSessionId(username, password);

  const btn = document.getElementById('signin-submit-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Signing in...'; }

  try {
    const result = await viewCall('get_player', [sid]);
    const parsed = typeof result === 'string' ? JSON.parse(result) : result;

    if (parsed?.found) {
      saveSession(sid, username);
      enterApp();
      return;
    }

    // Not found — wait 3 seconds and retry once
    await new Promise(r => setTimeout(r, 3000));

    const retryResult = await viewCall('get_player', [sid]);
    const retryParsed = typeof retryResult === 'string' ? JSON.parse(retryResult) : retryResult;

    if (retryParsed?.found) {
      saveSession(sid, username);
      enterApp();
      return;
    }

    // Still not found — check if username exists via register attempt
    callWrite('register_player', [sid, username])
      .then(r => {
        const p = typeof r === 'string' ? JSON.parse(r) : r;
        if (p?.error === 'username_taken') {
          if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
          showAuthError(errorEl, 'Wrong password. Please try again.');
        } else {
          if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
          showAuthError(errorEl, 'Account not found. Create an account first.');
        }
      })
      .catch(() => {
        saveSession(sid, username);
        enterApp();
      });

  } catch(err) {
    console.error('[signin]', err);
    saveSession(sid, username);
    enterApp();
  } finally {
    if (btn && btn.disabled) {
      btn.disabled = false;
      btn.textContent = 'Sign In';
    }
  }
}

function toggleForgotPassword() {
  const panel = document.getElementById('forgot-panel');
  if (panel) panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
}

function signOut() {
  if (confirm('Sign out? You will need your username and password to sign back in.')) {
    localStorage.removeItem('genazo_session');
    localStorage.removeItem('genazo_nickname');
    S.sessionId = null;
    S.username  = null;
    showScreen('screen-landing');
  }
}

function completeOnboarding() {
  setStorage('genazo_onboarded', '1');
  showScreen('screen-home');
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
  const leftBtn  = `<button id="nav-left" onclick="showDashboard()" aria-label="Community view" style="width:32px;height:32px;border-radius:8px;border:1px solid #1A1828;background:#0F0E1A;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.15s"><i class="ti ti-arrow-left" style="font-size:17px;color:#6B6888" aria-hidden="true"></i></button>`;
  const rightBtn = `<button id="nav-right" onclick="showTodayRiddle()" aria-label="Today's riddle" style="width:32px;height:32px;border-radius:8px;border:1px solid #1A1828;background:#0F0E1A;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.15s"><i class="ti ti-arrow-right" style="font-size:17px;color:#6B6888" aria-hidden="true"></i></button>`;
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
    const riddleResult = await viewCall('get_daily_riddle', []);
    const riddleParsed = typeof riddleResult === 'string' ? JSON.parse(riddleResult) : riddleResult;
    const totalRiddles = riddleParsed?.riddles?.length || 0;

    const result = await viewCall('get_daily_answers', []);
    let data = typeof result === 'string' ? JSON.parse(result) : result;
    if (!Array.isArray(data)) data = [];

    const total = data.length;
    const allCorrect = data.filter(p =>
      p.answered >= totalRiddles &&
      p.correct === true &&
      totalRiddles > 0
    ).length;
    const pct = total > 0 ? Math.round((allCorrect / total) * 100) : 0;

    const el = document.getElementById('activity-text');
    if (el) {
      el.textContent = total > 0
        ? `${total} player${total !== 1 ? 's' : ''} answered today. ${pct}% completed all ${totalRiddles} riddles correctly.`
        : 'No answers yet today. Be the first!';
    }
  } catch(err) { console.error('[activity]', err); }
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
      <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:6px;background:#021A0E;border:1px solid #0A3320">
        <span style="position:relative;width:7px;height:7px;flex-shrink:0">
          <span style="position:absolute;inset:0;border-radius:50%;background:#34D399;animation:live-ring 1.8s ease-out infinite"></span>
          <span style="position:absolute;inset:1px;border-radius:50%;background:#34D399"></span>
        </span>
        <span style="font-size:10px;font-weight:700;color:#34D399;letter-spacing:2px;font-family:'Space Mono',monospace">LIVE</span>
      </div>
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
  isWaitingForRiddles = false;
  S.homeView = 1;
  const body = document.getElementById('home-body');
  if (!body) return;

  const wrap = document.createElement('div');
  body.innerHTML = viewNavHtml(1);
  body.appendChild(wrap);

  const lastAnsweredDay = parseInt(getStorage('genazo_last_answered_day') || '0');
  if (S.day && lastAnsweredDay >= S.day) {
    renderAnswered(wrap, safeParse(getStorage('genazo_last_result')));
    return;
  }

  const answeredCount  = Object.keys(sessionAnswers).length;
  const availableCount = allRiddles.length;

  // All 5 answered — show completion
  if (answeredCount >= 5) {
    wrap.innerHTML = `
      <div style="text-align:center;padding:40px 20px;position:relative;z-index:2">
        <div style="font-size:40px;margin-bottom:16px">✅</div>
        <div style="font-size:16px;font-weight:700;color:#E8E6F4;margin-bottom:8px">All done for today!</div>
        <div style="font-size:13px;color:#5A5878;line-height:1.7">Come back tomorrow for new riddles.</div>
      </div>`;
    return;
  }

  // Answered all available but more coming
  if (answeredCount >= availableCount && availableCount > 0) {
    wrap.innerHTML = `
      <div style="text-align:center;padding:40px 20px;position:relative;z-index:2">
        <div style="font-size:40px;margin-bottom:16px">⏳</div>
        <div style="font-size:16px;font-weight:700;color:#E8E6F4;margin-bottom:8px">${answeredCount} of 5 answered</div>
        <div style="font-size:13px;color:#5A5878;line-height:1.7">More riddles still being generated.<br/>Check back in a few minutes.</div>
        <div style="font-family:'Space Mono',monospace;font-size:10px;color:#3A3858;letter-spacing:2px;margin-top:16px">POWERED BY OPTIMISTIC DEMOCRACY</div>
      </div>`;
    return;
  }

  // Show next unanswered riddle
  currentRiddleIndex = answeredCount;
  if (allRiddles[currentRiddleIndex]) {
    S.riddle = allRiddles[currentRiddleIndex];
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
  if (isWaitingForRiddles) { showDashboard(); return; }

  document.getElementById('home-nick').textContent = S.username || localStorage.getItem('genazo_nickname') || localStorage.getItem('genazo_nick') || '';
  updateAllStatDisplays();
  updateRankDisplay();

  // Skip re-fetch if riddles already loaded for today
  if (allRiddles.length && S.day) {
    const lastAnsweredDay = parseInt(getStorage('genazo_last_answered_day') || '0');
    if (lastAnsweredDay >= S.day) { await showDashboard(); return; }
    showTodayRiddle(); return;
  }

  const body = document.getElementById('home-body');
  body.innerHTML = `<div class="loading-wrap"><div class="spinner-lg"></div><p>Loading today's riddles…</p></div>`;

  try {
    const raw    = await viewCall('get_daily_riddle', []);
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;

    if (!parsed?.found) { renderNoRiddle(body); return; }

    if (parsed.riddles && Array.isArray(parsed.riddles) && parsed.riddles.length > 0) {
      allRiddles = parsed.riddles.map(r => ({ ...r, correct: encodeAnswer(r.correct), _encoded: true }));
    } else if (parsed.riddle) {
      allRiddles = [{ ...parsed.riddle, correct: encodeAnswer(parsed.riddle.correct), _encoded: true }];
    } else {
      renderNoRiddle(body); return;
    }
    const parsedDay = parsed.day;
    if (S.day !== null && S.day !== parsedDay) {
      sessionAnswers     = {};
      currentRiddleIndex = 0;
      isWaitingForRiddles = false;
    }
    S.day          = parsedDay;
    S.totalAnswers = parsed.total_answers || 0;
    S.riddle       = allRiddles[0] || null;

    updateAllStatDisplays();
    updateRankDisplay();

    const lastAnsweredDay = parseInt(getStorage('genazo_last_answered_day') || '0');
    if (lastAnsweredDay >= S.day) { await showDashboard(); return; }

    // Restore progress if mid-day
    const savedAnswers = getStorage('genazo_session_answers_' + S.day, null);
    if (savedAnswers) {
      try {
        sessionAnswers = JSON.parse(savedAnswers);
      } catch(e) {
        sessionAnswers = {};
      }
    } else {
      sessionAnswers = {};
    }

    currentRiddleIndex = Object.keys(sessionAnswers).length;

    if (currentRiddleIndex >= allRiddles.length) {
      showWaitingForRiddles();
      return;
    }

    showTodayRiddle();

  } catch (err) {
    console.error('[loadDailyRiddle] error:', err);
    body.innerHTML = `
      <div class="no-riddle-wrap">
        <div class="no-riddle-icon"><i class="ti ti-alert-triangle" style="font-size:52px;color:#3A3858"></i></div>
        <h2>Connection Error</h2>
        <p>Could not load today's riddles.<br>Try again in a moment.</p>
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
  const r = allRiddles[currentRiddleIndex] || S.riddle;

  // Skip malformed or missing riddles
  if (!r || !r.options || typeof r.options !== 'object' ||
      !r.options['A'] || !r.options['B'] || !r.options['C'] || !r.options['D']) {
    console.error('[renderRiddle] malformed riddle at index', currentRiddleIndex, r?.riddle_number);
    currentRiddleIndex++;
    if (currentRiddleIndex < allRiddles.length) {
      renderRiddle(container);
    } else {
      showDashboard();
    }
    return;
  }
  const riddleNum   = currentRiddleIndex + 1;
  const totalCount  = allRiddles.length || 1;

  const progressDots = Array.from({ length: totalCount }, (_, i) => {
    const ans     = sessionAnswers[i + 1];
    const bg      = !ans ? '#1A1828' : ans.correct ? '#34D399' : '#F87171';
    const size    = i === currentRiddleIndex ? '10px' : '8px';
    return `<div style="width:${size};height:${size};border-radius:50%;background:${bg};flex-shrink:0;transition:background 0.3s"></div>`;
  }).join('');

  container.innerHTML = `
    <div class="day-header">
      <div class="day-badge">Day ${S.day}</div>
      <div style="display:flex;align-items:center;gap:5px">${progressDots}</div>
      <div class="answer-count">Riddle ${riddleNum} of ${totalCount}</div>
    </div>
    <div class="riddle-card">
      <div class="riddle-card-top">
        <span class="riddle-category">${(r.category || 'technical').toUpperCase()}</span>
        <span class="riddle-topic-dot ${r.category === 'community' ? 'dot-amber' : 'dot-blue'}"></span>
      </div>
      <div class="riddle-text">${escHtml(r.riddle)}</div>
      <div class="riddle-hint">
        <i class="ti ti-bulb hint-icon"></i>
        <span>${escHtml(r.hint)}</span>
      </div>
    </div>
    <div class="options-list">
      ${['A','B','C','D'].map(l => `
        <button class="opt-btn" id="opt-${l}" onclick="selectAnswer('${l}')">
          <span class="opt-letter">${l}</span>
          <span class="opt-text">${escHtml(r.options[l] || '')}</span>
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
  const pts     = result?.points || 0;
  const correct = result?.total_correct !== undefined ? result.total_correct : (result?.correct ? 1 : 0);
  const total   = result?.total_riddles || allRiddles.length || 5;

  container.innerHTML = `
    <div class="day-header"><div class="day-badge">Day ${S.day}</div></div>
    <div class="answered-card ${correct > 0 ? 'correct' : 'wrong'}">
      <i class="ti ${correct > 0 ? 'ti-circle-check' : 'ti-circle-x'} answered-icon-ti"></i>
      <div class="answered-label">${correct} / ${total} correct</div>
      <div class="answered-pts">+${pts} pts</div>
    </div>
    <div class="come-back">Come back tomorrow for 5 new riddles</div>
    <div style="display:flex;gap:10px;margin-top:16px;padding-bottom:8px">
      <button class="btn btn-primary" style="flex:1" onclick="shareResult()">
        <i class="ti ti-share"></i> Share
      </button>
      <button class="btn btn-outline" style="flex:1" onclick="showLeaderboard()">
        <i class="ti ti-trophy"></i> Leaderboard
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

  const riddle       = allRiddles[currentRiddleIndex];
  const riddleNumber = currentRiddleIndex + 1;

  // Guard: prevent re-answering the same riddle
  if (sessionAnswers[riddleNumber]) return;

  S.isSubmitting = true;

  const correct   = (riddle._encoded ? decodeAnswer(riddle.correct) : riddle.correct).toUpperCase();
  const isCorrect = S.selectedAnswer.toUpperCase() === correct;
  const points    = isCorrect ? 100 : 0;

  // Save immediately to localStorage before blockchain confirmation
  sessionAnswers[riddleNumber] = { answer: S.selectedAnswer, correct: isCorrect, points };
  setStorage('genazo_answered_count_' + S.day, riddleNumber.toString());
  setStorage('genazo_session_answers_' + S.day, JSON.stringify(sessionAnswers));

  showRiddleResult(isCorrect, points, S.selectedAnswer, riddle, riddleNumber);
  S.isSubmitting = false;

  // Submit to blockchain in background
  callWrite('submit_daily_answer', [S.sessionId, S.username, S.selectedAnswer, riddleNumber])
    .then(hash => {
      if (hash) {
        localStorage.setItem('genazo_last_tx_hash', hash);
        showTxHash(hash);
      }
      updateRankDisplay();
      setTimeout(() => loadLeaderboard('alltime'), 5000);
    })
    .catch(err => console.error('[submit] error:', err.message));
}

// ── RESULT SCREEN ─────────────────────────────────────────────────────────
function animateScore(finalScore) {
  const el = document.getElementById('score-display');
  if (!el) return;
  if (finalScore === 0) { el.textContent = '0'; return; }
  const prefix = finalScore > 0 ? '+' : '';
  const steps = 60; const interval = 1200 / steps;
  let step = 0;
  const timer = setInterval(() => {
    step++;
    const eased = 1 - Math.pow(1 - step / steps, 3);
    el.textContent = prefix + Math.round(finalScore * eased);
    if (step >= steps) clearInterval(timer);
  }, interval);
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

  animateScore(pts);

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

  const flameEl = document.getElementById('streak-icon');
  if (flameEl) flameEl.classList.toggle('streak-fire-icon', isCorrect && streak >= 3);

  if (isCorrect) { launchConfetti(); launchParticles(); }
  showOptimisticCommunity(S.username, isCorrect);
}

function showRiddleResult(isCorrect, points, answer, riddle, riddleNumber) {
  showScreen('screen-result');

  const answeredCount  = Object.keys(sessionAnswers).length;
  const availableCount = allRiddles.length;
  const totalExpected  = 5;
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  const get = (id)    => document.getElementById(id);

  const iconEl = get('result-icon');
  if (iconEl) iconEl.className = `ti ${isCorrect ? 'ti-circle-check' : 'ti-circle-x'} result-icon-symbol`;
  const iconWrap = get('result-icon-wrap');
  if (iconWrap) iconWrap.className = 'result-icon-wrap ' + (isCorrect ? 'correct-mode' : 'wrong-mode');

  const lbl = get('result-label');
  if (lbl) { lbl.textContent = isCorrect ? 'CORRECT!' : 'WRONG'; lbl.className = 'result-outcome-label ' + (isCorrect ? 'correct' : 'wrong'); }

  animateScore(points);

  const bkdn = get('score-breakdown');
  if (bkdn) bkdn.textContent = points > 0 ? `+${points} pts` : 'Better luck on the next one';

  set('riddle-progress-text', `Riddle ${riddleNumber} of ${allRiddles.length}`);
  set('correct-answer-text', riddle.correct + '. ' + (riddle.options?.[riddle.correct] || ''));
  set('explanation-text', riddle.explanation || '');

  const sb = get('streak-block');
  if (sb) sb.style.display = 'none';
  const flameEl = get('streak-icon');
  if (flameEl) flameEl.classList.remove('streak-fire-icon');

  const nextBtn = get('next-btn');
  if (nextBtn) {
    if (answeredCount >= totalExpected) {
      nextBtn.textContent = 'See Final Score';
      nextBtn.onclick     = showFinalScore;
    } else if (answeredCount >= availableCount) {
      nextBtn.textContent = 'Wait for More Riddles';
      nextBtn.onclick     = showWaitingForRiddles;
    } else {
      nextBtn.textContent = 'Next Riddle →';
      nextBtn.onclick     = goToNextRiddle;
    }
  }

  if (isCorrect) { launchConfetti(); launchParticles(); }
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

function launchParticles() {
  const container = document.getElementById('particle-container');
  if (!container) return;
  container.innerHTML = '';
  const colors = ['#7C3AED','#34D399','#3B82F6','#F59E0B','#a78bfa'];
  for (let i = 0; i < 28; i++) {
    const p = document.createElement('div');
    const size  = Math.random() * 6 + 4;
    const angle = Math.random() * 360;
    const dist  = 50 + Math.random() * 80;
    const delay = Math.random() * 0.2;
    p.style.cssText = `position:absolute;width:${size}px;height:${size}px;background:${colors[Math.floor(Math.random()*colors.length)]};left:50%;top:38%;border-radius:${Math.random()>.5?'50%':'3px'};animation:particle-fly ${0.5+Math.random()*0.5}s ease-out ${delay}s forwards;--angle:${angle}deg;--dist:${dist}px;opacity:0.9;`;
    container.appendChild(p);
  }
  setTimeout(() => { if (container) container.innerHTML = ''; }, 1500);
}

function goToNextRiddle() {
  currentRiddleIndex++;
  S.riddle = allRiddles[currentRiddleIndex] || null;
  S.isSubmitting = false;
  showScreen('screen-home');
}

function concludeDay() {
  const answered  = Object.keys(sessionAnswers).length;
  const available = allRiddles.length;

  if (answered >= available && available > 0) {
    showFinalScore();
  } else if (available > answered) {
    currentRiddleIndex = answered;
    S.riddle = allRiddles[currentRiddleIndex];
    S.isSubmitting = false;
    showTodayRiddle();
    showScreen('screen-home');
  } else {
    showScreen('screen-home');
  }
}

function showWaitingForRiddles() {
  isWaitingForRiddles = true;
  const answered  = Object.keys(sessionAnswers).length;
  const remaining = 5 - answered;

  const el = document.getElementById('waiting-message');
  if (el) {
    el.innerHTML = `
      <div style="text-align:center;padding:40px 20px;position:relative;z-index:2">
        <div style="font-size:48px;margin-bottom:16px">⏳</div>
        <div style="font-size:18px;font-weight:700;color:#E8E6F4;margin-bottom:8px">${answered} of 5 answered</div>
        <div style="font-size:14px;color:#5A5878;line-height:1.7;margin-bottom:8px">
          ${remaining} more riddle${remaining !== 1 ? 's' : ''} still being generated.<br/>Check back in a few minutes.
        </div>
        <div style="font-family:'Space Mono',monospace;font-size:10px;color:#3A3858;letter-spacing:2px;margin-top:16px">POWERED BY OPTIMISTIC DEMOCRACY</div>
      </div>
    `;
  }

  showScreen('screen-waiting');
  setStorage('genazo_waiting_since', Date.now().toString());

  const interval = setInterval(async () => {
    try {
      const statusResult = await viewCall('get_generation_status', []);
      const isDone = typeof statusResult === 'string' ? JSON.parse(statusResult) : statusResult;

      const riddleResult = await viewCall('get_daily_riddle', []);
      const parsed       = typeof riddleResult === 'string' ? JSON.parse(riddleResult) : riddleResult;
      const newRiddles   = parsed?.riddles || [];
      const answeredNow  = Object.keys(sessionAnswers).length;
      if (newRiddles.length > allRiddles.length) {
        allRiddles = newRiddles;
        if (newRiddles.length > answeredNow) {
          clearInterval(interval);
          clearTimeout(giveUpTimer);
          isWaitingForRiddles = false;
          currentRiddleIndex = answeredNow;
          S.riddle = allRiddles[currentRiddleIndex];
          S.isSubmitting = false;
          showTodayRiddle();
          showScreen('screen-home');
          return;
        }
      }

      if (isDone === true) {
        clearInterval(interval);
        clearTimeout(giveUpTimer);
        isWaitingForRiddles = false;
        concludeDay();
      }
    } catch(e) {
      console.error('[poll]', e);
    }
  }, 60000);

  const giveUpTimer = setTimeout(async () => {
    clearInterval(interval);
    isWaitingForRiddles = false;
    try {
      await callWrite('mark_generation_complete', [S.sessionId]);
    } catch(e) {
      console.error('[giveup]', e);
    }
    concludeDay();
  }, 3 * 60 * 60 * 1000);
}

function showFinalScore() {
  const answered = Object.keys(sessionAnswers).length;
  const correct  = Object.values(sessionAnswers).filter(a => a.correct).length;
  const total    = allRiddles.length;
  const points   = Object.values(sessionAnswers).reduce((sum, a) => sum + (a.points || 0), 0);

  const cur = getPlayerStats();
  const newStreak = correct > 0 ? cur.streak + 1 : 0;
  const newBest   = Math.max(cur.bestStreak, newStreak);
  let streakBonus = 0;
  if (correct > 0) {
    if      (newStreak >= 30) streakBonus = 100;
    else if (newStreak >= 7)  streakBonus = 50;
    else if (newStreak >= 3)  streakBonus = 25;
  }
  const totalWithBonus = points + streakBonus;

  savePlayerStats({
    streak:       newStreak,
    bestStreak:   newBest,
    totalPoints:  cur.totalPoints + totalWithBonus,
    daysAnswered: cur.daysAnswered + 1,
    daysCorrect:  cur.daysCorrect + (correct > 0 ? 1 : 0),
  });

  const finalResult = {
    correct: correct > 0, points: totalWithBonus,
    new_streak: newStreak, streak_bonus: streakBonus,
    total_correct: correct, total_riddles: total,
  };
  setStorage('genazo_last_answered_day', String(S.day));
  setStorage('genazo_last_result', JSON.stringify(finalResult));

  const history = getStreakHistory();
  history.push({ day: S.day, correct: correct > 0 });
  setStorage('genazo_streak_history', JSON.stringify(history.slice(-30)));

  updateLeaderboardOptimistic(S.username, totalWithBonus);
  updateAllStatDisplays();
  updateRankDisplay();

  showScreen('screen-final');

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('final-score',   totalWithBonus + ' pts');
  set('final-correct', correct + ' / ' + total + ' correct');

  const riddleCountEl = document.getElementById('final-riddle-count');
  if (riddleCountEl) {
    if (total < 5) {
      riddleCountEl.textContent = `Only ${total} riddle${total !== 1 ? 's' : ''} were generated today by AI validators. Full 5 tomorrow.`;
      riddleCountEl.style.display = 'block';
    } else {
      riddleCountEl.style.display = 'none';
    }
  }
  set('final-av',      (S.username || '?')[0].toUpperCase());
  set('final-username', S.username || '');
  set('streak-final-text', newStreak >= 1
    ? `${newStreak} day streak${streakBonus > 0 ? ` · +${streakBonus} bonus` : ''}`
    : 'No streak today');

  updateProgressDots();
  updateAllAvatars();
  showOptimisticCommunity(S.username, correct > 0);
  loadCommunityResults();

  if (allRiddles.length < 5) checkForNewRiddles(); // poll until 5 are generated
}

function checkForNewRiddles() {
  const interval = setInterval(async () => {
    try {
      const result = await viewCall('get_daily_riddle', []);
      const parsed = typeof result === 'string' ? JSON.parse(result) : result;
      const newCount     = parsed?.riddles?.length || 0;
      const currentCount = allRiddles.length;

      if (newCount > currentCount) {
        clearInterval(interval);
        allRiddles = parsed.riddles.map(r => ({ ...r, correct: encodeAnswer(r.correct), _encoded: true }));
        const banner = document.getElementById('new-riddle-banner');
        if (banner) {
          banner.style.display = 'flex';
          banner.textContent   = 'Riddle ' + newCount + ' is now available!';
        }
      }
    } catch(e) {
      console.error('[checkForNewRiddles]', e);
    }
  }, 60000);

  setTimeout(() => clearInterval(interval), 30 * 60 * 1000);
}

function showTxHash(hash) {
  if (!hash) return;
  const display = document.getElementById('tx-hash-display');
  const text    = document.getElementById('tx-hash-text');
  if (display && text) {
    text.textContent = hash.slice(0, 8) + '…' + hash.slice(-6);
    display.style.display = 'flex';
  }
}

function updateProgressDots() {
  const total = allRiddles.length || 5;
  for (let i = 1; i <= total; i++) {
    const dot = document.getElementById('dot-' + i);
    if (!dot) continue;
    const ans = sessionAnswers[i];
    dot.style.background = !ans ? '#1A1828' : ans.correct ? '#34D399' : '#F87171';
  }
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
  const cached   = JSON.parse(getStorage('genazo_lb_alltime', '[]'));
  const existing = cached.find(p => p.username === username);
  if (existing) {
    existing.total_points = (existing.total_points || 0) + points;
  } else {
    cached.unshift({ username, total_points: points, streak: 1, days_answered: 1 });
  }
  cached.sort((a, b) => (b.total_points || 0) - (a.total_points || 0));
  setStorage('genazo_lb_alltime', JSON.stringify(cached));
  setStorage('genazo_lb_time_alltime', Date.now().toString());
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
function getStreakHistory() { return safeParse(getStorage('genazo_streak_history'), []); }

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
async function shareResult() {
  const day     = S.day || 1;
  const correct = Object.values(sessionAnswers).filter(a => a.correct).length;
  const total   = allRiddles.length || 5;
  const points  = Object.values(sessionAnswers).reduce((sum, a) => sum + (a.points || 0), 0);
  const streak  = parseInt(getStorage('genazo_streak', '0'));

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 1080; canvas.height = 1080;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#07070B';
    ctx.fillRect(0, 0, 1080, 1080);

    const glow = ctx.createRadialGradient(540, 200, 0, 540, 200, 400);
    glow.addColorStop(0, 'rgba(124,58,237,0.3)');
    glow.addColorStop(1, 'rgba(124,58,237,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 1080, 1080);

    ctx.strokeStyle = 'rgba(124,58,237,0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < 1080; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 1080); ctx.stroke(); }
    for (let y = 0; y < 1080; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1080, y); ctx.stroke(); }

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = '/logo.jpg'; });
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(440, 160, 200, 200, 40);
      ctx.clip();
      ctx.drawImage(img, 440, 160, 200, 200);
      ctx.restore();
    } catch(e) {
      ctx.font = 'bold 120px serif'; ctx.fillStyle = '#9D7FEA'; ctx.textAlign = 'center'; ctx.fillText('Ψ', 540, 320);
    }

    ctx.font = 'bold 72px Arial'; ctx.textAlign = 'center';
    ctx.fillStyle = '#F0EEF8'; ctx.fillText('GEN', 460, 430);
    ctx.fillStyle = '#9D7FEA'; ctx.fillText('AZO', 620, 430);

    ctx.font = '600 32px Arial'; ctx.fillStyle = '#5A5878'; ctx.textAlign = 'center';
    ctx.fillText('DAY ' + day, 540, 510);

    ctx.strokeStyle = 'rgba(124,58,237,0.3)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(340, 540); ctx.lineTo(740, 540); ctx.stroke();

    ctx.font = 'bold 140px Arial'; ctx.fillStyle = '#F0EEF8'; ctx.textAlign = 'center';
    ctx.fillText(points + ' pts', 540, 680);

    ctx.font = '500 40px Arial'; ctx.fillStyle = '#5A5878'; ctx.textAlign = 'center';
    ctx.fillText(correct + ' / ' + total + ' correct', 540, 740);

    const dotSize = 28, dotGap = 20;
    const totalWidth = total * dotSize + (total - 1) * dotGap;
    const startX = (1080 - totalWidth) / 2;
    for (let i = 1; i <= total; i++) {
      const ans = sessionAnswers[i];
      ctx.fillStyle = !ans ? '#1A1828' : ans.correct ? '#34D399' : '#F87171';
      ctx.beginPath();
      ctx.arc(startX + (i - 1) * (dotSize + dotGap) + dotSize / 2, 820, dotSize / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    if (streak > 0) {
      ctx.font = '600 36px Arial'; ctx.fillStyle = '#F59E0B'; ctx.textAlign = 'center';
      ctx.fillText('🔥 ' + streak + ' day streak', 540, 900);
    }

    ctx.font = '500 32px Arial'; ctx.fillStyle = '#3A3858'; ctx.textAlign = 'center';
    ctx.fillText('genazo.xyz', 540, 980);

    canvas.toBlob(async (blob) => {
      const file = new File([blob], 'genazo-day-' + day + '.png', { type: 'image/png' });
      const shareText = 'GENAZO Day ' + day + ' — ' + points + ' pts · ' + correct + '/' + total + ' correct' +
        (streak >= 3 ? ' · 🔥 ' + streak + ' day streak' : '') + '\n\nPlay at genazo.xyz';

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: shareText });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'genazo-day-' + day + '.png'; a.click();
        URL.revokeObjectURL(url);
        setTimeout(() => window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText), '_blank'), 500);
      }
    }, 'image/png');

  } catch(err) {
    console.error('[share]', err);
    const text = 'GENAZO Day ' + day + ' — ' + points + ' pts\nPlay at genazo.xyz';
    window.open('https://twitter.com/intent/tweet?text=' + encodeURIComponent(text), '_blank');
  }
}

// ── INIT ──────────────────────────────────────────────────────────────────
// ── AVATAR ────────────────────────────────────────────────────────────────
function setAvatarColor(color) {
  localStorage.setItem('genazo_avatar_color', color);
  updateAllAvatars();
}

function updateAllAvatars() {
  const color = localStorage.getItem('genazo_avatar_color') || '#7C3AED';
  document.querySelectorAll('.user-avatar, .profile-av').forEach(el => {
    el.style.background = color;
  });
  document.querySelectorAll('.av-color-dot').forEach(dot => {
    dot.classList.toggle('active', dot.dataset.color === color);
  });
}

function clearStaleData() {
  const storedContract = localStorage.getItem('genazo_contract_address');
  const currentContract = CONFIG.CONTRACT_ADDRESS;

  if (storedContract !== currentContract) {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (
        key.startsWith('genazo_answered') ||
        key.startsWith('genazo_last_answered') ||
        key.startsWith('genazo_tx_hashes') ||
        key.startsWith('genazo_streak') ||
        key.startsWith('genazo_points') ||
        key.startsWith('genazo_days') ||
        key.startsWith('genazo_lb') ||
        key.startsWith('genazo_onboarded') ||
        key.startsWith('genazo_session_answers') ||
        key.startsWith('genazo_waiting_since')
      )) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));

    localStorage.setItem('genazo_contract_address', currentContract);

    sessionAnswers     = {};
    allRiddles         = [];
    currentRiddleIndex = 0;
    S.day              = null;
    isWaitingForRiddles = false;

  }
}

async function init() {
  clearStaleData();
  document.getElementById('nav-home')?.addEventListener('click', () => showScreen('screen-home'));
  checkExistingSession();
  updateAllAvatars();
}

init();

// ── EXPORTS ───────────────────────────────────────────────────────────────
Object.assign(window, {
  handleSignUp, handleSignIn, onSignupUsernameInput,
  toggleForgotPassword, signOut, completeOnboarding,
  selectAnswer, submitAnswer,
  loadDailyRiddle, loadHomeScreen: loadDailyRiddle,
  showLeaderboard, loadLeaderboard, showProfile, shareResult,
  showResultScreen, showRiddleResult, showLeaderboardData, showLeaderboardEmpty,
  launchConfetti, launchParticles, loadCommunityResults,
  showOptimisticCommunity, updateLeaderboardOptimistic,
  updateDashboardStats, loadDashboardActivity,
  setHomeView, showDashboard, showTodayRiddle,
  setAvatarColor, updateAllAvatars,
  goToNextRiddle, showFinalScore, showWaitingForRiddles, concludeDay, showTxHash, updateProgressDots,
  checkForNewRiddles, showScreen,
});

document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('landing-create-btn')?.addEventListener('click', () => showScreen('screen-signup'));
  document.getElementById('landing-signin-btn')?.addEventListener('click', () => showScreen('screen-signin'));
  document.getElementById('signup-submit-btn')?.addEventListener('click', handleSignUp);
  document.getElementById('signin-submit-btn')?.addEventListener('click', handleSignIn);
});
