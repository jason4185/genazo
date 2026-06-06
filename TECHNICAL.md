# Genazo — Technical Documentation

Architecture decisions, workarounds,
and implementation details for the
GenLayer Builder Program and developers.

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
| get_daily_answers | none | Returns today's submissions |
| get_all_time_leaderboard | none | Global rankings |
| get_weekly_leaderboard | none | Weekly rankings |
| get_player | session_id | Player profile and stats |
| get_player_answers | session_id | Exact riddle-by-riddle answers |
| get_day_number | none | Current day count |
| get_generation_status | none | Returns generation_complete flag |

---

## Key Technical Decisions

### 1. Custom Knowledge Page

**Problem:** docs.genlayer.com uses
JavaScript rendering. Validators fetching
it get different navigation sidebar
content causing UNDETERMINED consensus.

**Solution:** Built plain HTML page at
genazo-knowledge.netlify.app with all
GenLayer knowledge as clean plain text.
No JavaScript. No dynamic content.
Every validator fetches identical content.

URL passed as parameter to contract —
never hardcoded. Update knowledge page
anytime without redeployment.

### 2. Forced Topic Per Day

**Problem:** 5 different AI models choose
completely different topics independently
causing UNDETERMINED consensus errors.

**Solution:** Contract forces all validators
toward the same topic each day using
15-topic rotation:

```python
TOPICS = [
    "Optimistic Democracy",
    "Validators and how they work",
    "Equivalence Principle",
    "GenVM execution environment",
    "Intelligent Contracts",
    "Appeal Process",
    "Non-deterministic operations",
    "Finality and transaction lifecycle",
    "GenLayer founding and mission",
    "Testnet Asimov and Bradbury history",
    "Builder Program and incentives",
    "GEN token and staking economics",
    "Partnerships and ecosystem",
    "LayerZero integration",
    "Community and culture",
]
topic_index = (day - 1 + riddle_number - 1) % 15
```

Consensus success rate improved from
20% to 85-90%.

### 3. Lenient prompt_comparative

**Problem:** Strict equivalence checks
required nearly identical riddle text —
impossible with different AI models.

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

**Problem:** AI models always placed
correct answer as option A.

**Solution:** Shuffle using day and
riddle number as seed:

```python
seed = (day * 7 + riddle_number * 13) % 24
permutations = [24 possible orderings]
order = permutations[seed % len(permutations)]
```

Pure math. No randomness. Different
shuffle every day and riddle.

### 5. Generation Complete Flag

**Problem:** Frontend had no way to know
when script finished all generation attempts.

**Solution:** Script calls
mark_generation_complete() after all
riddles attempted. Contract stores flag.
Frontend polls every 60 seconds.
When flag is true — conclude the day.

3-hour safety fallback handles crashes —
frontend calls mark_generation_complete()
itself after 3 hours.

### 6. Flexible Riddle Count

**Problem:** If some riddles fail all
3 attempts players would miss scoring.

**Solution:**

```python
generation_done = json.loads(
    self.generation_complete
)
all_answered = (
    len(player_answers) >= len(riddles)
    and generation_done
)
```

If 4 riddles generate max score is 400 pts.
Players always get a complete day.

### 7. Independent Retry Logic

Each riddle retries independently:
Riddle 1 fails → scheduled retry in 10 min
Move to Riddle 2 immediately
Riddle 2 succeeds
...
10 min later → Riddle 1 retries

Failed riddles never block others.
3 attempts per riddle with 10 min gaps.

### 8. Optimistic UI

**Problem:** Blockchain confirmation takes
45-60 seconds. Players cannot wait.

**Solution:** Correct answer already in
riddle data fetched from contract.
Frontend checks locally and shows result
instantly. Blockchain submits in background.

### 9. Password-Based Identity

**Problem:** MetaMask creates friction.
Random session IDs only work on one device.

**Solution:**

```javascript
sessionId = sha256(username.toLowerCase() + ':' + password)
```

Same credentials on any device produce
same session ID. Cross-device play without
wallets. Passwords never leave the device.

### 10. Cross-Device Sync

**Problem:** Player progress on one device
not visible on another device.

**Solution:** On login syncPlayerState
fetches exact riddle-by-riddle answers
from new get_player_answers contract method.
Restores sessionAnswers perfectly.
Polls every 30 seconds for updates from
other devices.

### 11. Session-Specific localStorage

**Problem:** Multiple accounts on same
device shared keys causing data bleed.

**Solution:**

```javascript
function storageKey(key) {
  return key + '_' + sessionId;
}
```

Each account has completely isolated
storage. Switch accounts freely.

### 12. Version-Based Cache Clearing

**Problem:** New contract deployments
left stale cached data on user devices.

**Solution:**

```javascript
const CONFIG = {
  CONTRACT_ADDRESS: '0x...',
  APP_VERSION: '2.2.0',
};
```

Bump APP_VERSION on every new deployment.
All users automatically get fresh data
on next visit. No manual clearing needed.

### 13. Fingerprint System

Every riddle stores a fingerprint in
concept:angle format permanently on-chain.
Generation prompt receives full list and
picks a different angle each time.
Estimated 150+ unique riddles before
any real overlap.

### 14. Cache Removal

Contract originally cached fetched docs.
Cache caused silent rollback bugs where
day counter would not increment.
Cache removed entirely — plain text
knowledge page fetches in under 2 seconds.

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
```

### localStorage Architecture

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

---

## Automation

GitHub Actions runs at midnight UTC.

1. Checks generation_complete flag
2. Checks existing riddle count
3. Generates missing riddles sequentially
4. Each riddle: 3 attempts, 10 min gaps
5. Calls mark_generation_complete() when done

---

## Why GenLayer

Genazo requires:

- gl.nondet.web.render — live web data
- gl.nondet.exec_prompt — AI model calls
- gl.eq_principle.prompt_comparative — semantic consensus
- Non-deterministic execution with blockchain consensus

Impossible to build on any other blockchain.
