# Genazo — Technical Documentation

Architecture decisions, workarounds and
implementation details.

---

## Contract Architecture

**Network:** GenLayer Studionet
**Language:** Python
**Runner:** py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6

### State Variables

| Variable | Purpose |
|---|---|
| players | All player profiles and stats |
| fingerprints | Used riddle angles — prevents repeats |
| daily_riddles | Today's riddles JSON array |
| daily_day_number | Current day counter |
| daily_answers | Today's submissions per player |
| all_time_leaderboard | Global rankings top 100 |
| weekly_leaderboard | Weekly rankings |
| generation_complete | Flag set when script finishes |

### Write Methods

| Method | Parameters | Purpose |
|---|---|---|
| generate_daily_riddle | session_id, docs_url, riddle_number | AI consensus riddle generation |
| submit_daily_answer | session_id, username, answer, riddle_number | Records answer and updates scores |
| register_player | session_id, username | Creates player profile |
| mark_generation_complete | session_id | Signals generation done for the day |

### View Methods

| Method | Parameters | Purpose |
|---|---|---|
| get_daily_riddle | none | Returns today's riddles array |
| get_daily_answers | none | Returns today's submissions with session_id |
| get_all_time_leaderboard | none | Global rankings |
| get_weekly_leaderboard | none | Weekly rankings |
| get_player | session_id | Player profile and stats |
| get_player_answers | session_id | Exact riddle-by-riddle answers |
| get_day_number | none | Current day count |
| get_generation_status | none | Returns generation_complete flag |

---

## Key Technical Decisions

### 1. Custom Knowledge Page

**Problem:** docs.genlayer.com uses JavaScript
rendering. Validators fetching it get different
navigation sidebar content causing UNDETERMINED
consensus.

**Solution:** Built plain HTML page at
genazo-knowledge.netlify.app with all GenLayer
knowledge as clean plain text. No JavaScript.
No dynamic content. Every validator fetches
identical content. URL passed as parameter to
contract — never hardcoded.

### 2. Forced Topic Per Day

**Problem:** 5 different AI models choose
completely different topics independently
causing UNDETERMINED consensus errors.
Consensus success rate was 20%.

**Solution:** Contract forces all validators
toward the same topic using 15-topic rotation:

```python
topic_index = (day - 1 + riddle_number - 1) % 15
```

Consensus success rate improved to 85-90%.

### 3. Lenient prompt_comparative

**Problem:** Strict equivalence required
nearly identical riddle text — impossible
with different AI models.

**Solution:**
```python
gl.eq_principle.prompt_comparative(
    generate,
    "Both outputs are equivalent if they
    are both valid JSON riddles specifically
    about {topic} in the GenLayer ecosystem,
    even if the riddle text, hint wording,
    options, and explanation differ completely"
)
```

### 4. Deterministic Answer Shuffle

**Problem:** AI models always placed correct
answer as option A.

**Solution:** Pure math shuffle using day
and riddle number as seed:

```python
seed = (day * 7 + riddle_number * 13) % 24
permutations = [24 possible orderings]
order = permutations[seed % len(permutations)]
```

Different shuffle every day and riddle.
No randomness needed. Works perfectly in GenVM.

### 5. Generation Complete Flag

**Problem:** Frontend had no way to know when
script finished all generation attempts.

**Solution:** Script calls
mark_generation_complete() after all riddles
attempted. Contract stores flag. Frontend polls
every 60-90 seconds. 3-hour safety fallback
handles script crashes — frontend calls
mark_generation_complete() itself.

### 6. Flexible Riddle Count

**Problem:** If some riddles fail all 3 attempts
players would miss scoring entirely.

**Solution:**
```python
generation_done = json.loads(self.generation_complete)
all_answered = (
    len(player_answers) >= len(riddles)
    and generation_done
)
```

If 4 riddles generate max score is 400 pts.
Players always get a complete day.

### 7. Independent Retry Logic

Each riddle retries independently with
10 minute gaps. Failed riddles never block
others. 3 attempts per riddle maximum.
Riddle 1 fails → retry in 10 min
Move to Riddle 2 immediately
Riddle 2 succeeds
10 min later → Riddle 1 retries

### 8. UTC Date-Based New Day Detection

**Problem:** generation_complete flag from
previous day caused script to skip generation
on new day.

**Solution:** Script compares UTC date not
the flag:

```javascript
function getTodayUTC() {
  return new Date().toISOString().split('T')[0];
}
```

Different date → new day → generate regardless
of flag. Same date → check riddle count → skip
if complete.

On GitHub Actions the date file never exists
between runs so it always generates. On local
Mac the file persists to prevent double
generation same day.

### 9. Optimistic UI

**Problem:** Blockchain confirmation takes
45-60 seconds. Players cannot wait.

**Solution:** Correct answer already in riddle
data fetched from contract. Frontend checks
locally and shows result instantly. Blockchain
submits in background. TX hash shown when
confirmed.

### 10. Password-Based Identity

**Problem:** MetaMask creates friction.
Random session IDs only work on one device.

**Solution:**
```javascript
sessionId = sha256(username.toLowerCase() + ':' + password)
```

Same credentials on any device produce same
session ID. Cross-device play without wallets.
Passwords never leave the device.

### 11. Cross-Device Sync

On login syncPlayerState:
1. Fetches get_player → checks if day complete
2. Fetches get_player_answers → restores exact
   riddle-by-riddle answers
3. Restores sessionAnswers in memory
4. Sets currentRiddleIndex to resume correctly
5. Syncs streak and points from on-chain

Cross-device polling runs every 60 seconds
while on riddle screen. Detects if another
device answered and moves to next riddle
automatically within 90 seconds.

### 12. Session-Specific localStorage

**Problem:** Multiple accounts on same device
shared keys causing data bleed.

**Solution:**
```javascript
function storageKey(key) {
  return key + '_' + sessionId;
}
```

Each account has completely isolated storage.

### 13. Version-Based Cache Clearing

**Problem:** New contract deployments left
stale cached data on user devices.

**Solution:**
```javascript
const CONFIG = {
  CONTRACT_ADDRESS: '0x...',
  APP_VERSION: '2.3.0',
};
```

Bump APP_VERSION on every new deployment.
All users automatically get fresh data.

### 14. TX Hash Persistence

TX confirmation count and last hash saved
to localStorage after each confirmation.
Survives page refresh. Day Complete screen
always shows accurate recording status.

### 15. Fingerprint System

Every riddle stores a fingerprint in
concept:angle format permanently on-chain.
Generation prompt receives full list and
picks different angle each time. Estimated
150+ unique riddles before any real overlap.

### 16. Vercel Deployment Fix

**Problem:** Vercel was using cached dist
from previous local build. New code changes
were never being compiled on Vercel servers.

**Solution:** Added vercel.json with explicit
build command and output directory:

```json
{
  "buildCommand": "cd frontend && npm install && npm run build",
  "outputDirectory": "frontend/dist"
}
```

Now every deploy runs full Vite compile
on Vercel servers.

---

## Frontend Architecture

- Vite build tool
- Vanilla JavaScript — no React or Vue
- genlayer-js SDK for all contract calls
- Space Grotesk and Space Mono fonts
- Fully mobile responsive

### Key Global State

```javascript
let sessionId = null;
let nickname = null;
let currentDay = 0;
let allRiddles = [];
let sessionAnswers = {};
let currentRiddleIndex = 0;
let isWaitingForRiddles = false;
let crossDevicePollInterval = null;
let txConfirmedCount = 0;
let txFailedCount = 0;
let txTotalCount = 0;
```

### localStorage Key Architecture

Global keys (shared across accounts):
- genazo_session
- genazo_nickname
- genazo_contract_address
- genazo_app_version
- genazo_avatar_color

Session-specific keys (per account):
- genazo_streak_{sid}
- genazo_points_{sid}
- genazo_days_answered_{sid}
- genazo_days_correct_{sid}
- genazo_onboarded_{sid}
- genazo_last_answered_day_{sid}
- genazo_session_answers_{day}_{sid}
- genazo_waiting_since_{sid}
- genazo_tx_confirmed_{day}_{sid}
- genazo_tx_failed_{day}_{sid}
- genazo_tx_last_hash_{sid}
- genazo_final_score_{day}_{sid}

---

## Automation

GitHub Actions runs at midnight UTC.

1. Checks UTC date vs last run date
2. New date → proceeds to generate
3. Same date → checks riddle count and flag
4. Generates missing riddles sequentially
5. Each riddle: 3 attempts, 10 min gaps
6. Calls mark_generation_complete() when done
7. Saves today's UTC date to last-run-date.txt

---

## Why GenLayer

Genazo requires:

- gl.nondet.web.render — live web data fetching
- gl.nondet.exec_prompt — AI model calls inside contract
- gl.eq_principle.prompt_comparative — semantic consensus
- Non-deterministic execution with blockchain consensus

Impossible to build on any other blockchain.
