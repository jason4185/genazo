# Genazo SKILL.md — Building Daily Games on GenLayer

This guide teaches you how to build a
daily knowledge game on GenLayer using
Intelligent Contracts. Written by the
builder of Genazo (genazo.xyz) to help
the GenLayer community build faster.

Use this with Claude Code for the best
results.

---

## What You Are Building

A daily game where:
- Questions generate automatically on-chain
- AI validators reach consensus on content
- Players answer and earn points
- Scores live permanently on blockchain
- No database. No backend. No admin.

---

## Project Structure
your-game/
├── contract/
│   └── YourGame.py          ← Intelligent Contract
├── frontend/
│   ├── index.html           ← Single page app
│   ├── main.js              ← All game logic
│   ├── styles.css           ← Styling
│   └── package.json         ← Vite build
├── scripts/
│   └── daily-generate.js   ← Cron script
├── .github/
│   └── workflows/
│       └── daily.yml        ← GitHub Actions
├── vercel.json              ← Deployment config
├── README.md
├── TECHNICAL.md
└── SKILL.md                 ← This file

---

## Step 1 — The Knowledge Page Problem

**The most important lesson from Genazo.**

If your contract fetches from a docs site
with JavaScript rendering validators will
each get different content and you will
get UNDETERMINED consensus forever.

**Solution: Build a plain HTML knowledge page**

```html
<!DOCTYPE html>
<html>
<head><title>Knowledge</title></head>
<body>
<h1>Topic 1</h1>
<p>Plain text content here...</p>

<h1>Topic 2</h1>
<p>More plain text...</p>
</body>
</html>
```

Host it on Netlify for free. Pass the URL
as a parameter to your contract — never
hardcode it. This lets you update content
without redeploying.

---

## Step 2 — Contract Structure

```python
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import json


class YourGame(gl.Contract):

    players: str
    daily_questions: str
    daily_day_number: str
    daily_answers: str
    all_time_leaderboard: str
    generation_complete: str

    def __init__(self):
        self.players = json.dumps({})
        self.daily_questions = json.dumps([])
        self.daily_day_number = json.dumps(0)
        self.daily_answers = json.dumps({})
        self.all_time_leaderboard = json.dumps([])
        self.generation_complete = json.dumps(False)
```

**Critical rules:**
- All state variables must be `str` type
- Always use `json.dumps` and `json.loads`
- Never use `dict` or `list` as state types

---

## Step 3 — The Consensus Problem

**The second most important lesson.**

When 5 validators independently generate
content they produce different results.
You need a strategy to make them agree.

### Force A Topic

```python
TOPICS = [
    "Topic A",
    "Topic B",
    "Topic C",
]

topic_index = (day - 1 + question_number - 1) % len(TOPICS)
topic = TOPICS[topic_index]
```

All validators see the same topic instruction.
Consensus success rate goes from 20% to 85%.

### Use Lenient Comparator

```python
result = gl.eq_principle.prompt_comparative(
    generate,
    "Both outputs are equivalent if they are
    both valid JSON questions specifically about
    {topic}, even if the wording differs completely"
)
```

Do not use strict equality for AI-generated
content. Semantic equivalence is enough.

### Fetch Docs With Comparator Too

```python
def fetch() -> str:
    raw = gl.nondet.web.render(docs_url, mode="text")
    if not raw:
        raise Exception("empty")
    return raw[:1500]

docs = gl.eq_principle.prompt_comparative(
    fetch,
    "Both outputs equivalent if they contain
    the same knowledge content"
)
```

---

## Step 4 — Generation Complete Flag

Players need to know when generation is done.

**In contract:**

```python
generation_complete: str

# Reset when new day starts (riddle_number == 1)
self.generation_complete = json.dumps(False)

# New write method
@gl.public.write
def mark_generation_complete(self, session_id: str):
    self.generation_complete = json.dumps(True)
    return json.dumps({"success": True})

# New view method
@gl.public.view
def get_generation_status(self) -> str:
    return self.generation_complete
```

**In script:**

```javascript
// Always call this at the end of main()
// even if some questions failed
await markComplete(client);
```

**In frontend:**

```javascript
// Poll every 60-90 seconds
const interval = setInterval(async () => {
  const status = await viewCall('get_generation_status', []);
  const isDone = JSON.parse(status);
  if (isDone) {
    clearInterval(interval);
    showFinalScore();
  }
}, 60000);

// 3 hour safety fallback
const giveUp = setTimeout(async () => {
  clearInterval(interval);
  await callWrite('mark_generation_complete', [sessionId]);
  showFinalScore();
}, 3 * 60 * 60 * 1000);
```

---

## Step 5 — Deterministic Shuffle

GenVM does not support `import random` reliably.
Use pure math instead:

```python
def shuffle_options(riddle, day, question_number):
    options = riddle.get('options', {})
    correct_letter = riddle.get('correct', 'A').upper()
    correct_answer = options[correct_letter]

    all_options = [
        options.get('A', ''),
        options.get('B', ''),
        options.get('C', ''),
        options.get('D', ''),
    ]

    seed = (day * 7 + question_number * 13) % 24

    permutations = [
        [0,1,2,3],[0,1,3,2],[0,2,1,3],[0,2,3,1],
        [0,3,1,2],[0,3,2,1],[1,0,2,3],[1,0,3,2],
        [1,2,0,3],[1,2,3,0],[1,3,0,2],[1,3,2,0],
        [2,0,1,3],[2,0,3,1],[2,1,0,3],[2,1,3,0],
        [2,3,0,1],[2,3,1,0],[3,0,1,2],[3,0,2,1],
        [3,1,0,2],[3,1,2,0],[3,2,0,1],[3,2,1,0],
    ]

    order = permutations[seed % len(permutations)]
    shuffled = [all_options[i] for i in order]

    letters = ['A', 'B', 'C', 'D']
    new_options = {}
    new_correct = 'A'

    for i, letter in enumerate(letters):
        new_options[letter] = shuffled[i]
        if shuffled[i] == correct_answer:
            new_correct = letter

    riddle['options'] = new_options
    riddle['correct'] = new_correct
    return riddle
```

---

## Step 6 — The Cron Script Pattern

```javascript
import { readFileSync, writeFileSync } from 'fs';

function getTodayUTC() {
  return new Date().toISOString().split('T')[0];
}

function getLastRunDate() {
  try {
    return readFileSync('./last-run-date.txt', 'utf8').trim();
  } catch(e) {
    return '';
  }
}

async function alreadyGeneratedToday(client) {
  const todayUTC = getTodayUTC();
  const lastRunDate = getLastRunDate();

  // Different date = new day = always generate
  if (lastRunDate !== todayUTC) return false;

  // Same day = check if already complete
  const status = await client.readContract({
    address: CONFIG.CONTRACT_ADDRESS,
    functionName: 'get_generation_status',
    args: [],
  });
  const isDone = JSON.parse(status);
  const riddles = await getRiddleCount(client);

  return isDone && riddles >= MAX_QUESTIONS;
}

async function main() {
  const alreadyDone = await alreadyGeneratedToday(client);
  if (alreadyDone) {
    console.log('Already done today. Exiting.');
    process.exit(0);
  }

  await generateAllQuestions(client);
  await markComplete(client);

  writeFileSync('./last-run-date.txt', getTodayUTC());
}
```

**Key insight:** On GitHub Actions the file
never exists between runs so it always generates.
On local Mac the file prevents double generation.

---

## Step 7 — GitHub Actions Setup

```yaml
name: Daily Generation

on:
  schedule:
    - cron: '0 0 * * *'
  workflow_dispatch:

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: cd scripts && npm install
      - run: cd scripts && node daily-generate.js
        env:
          FUNDED_PRIVATE_KEY: ${{ secrets.FUNDED_PRIVATE_KEY }}
```

Add `FUNDED_PRIVATE_KEY` in GitHub repo
Settings → Secrets → Actions.

`workflow_dispatch` lets you manually trigger
from GitHub Actions tab anytime.

---

## Step 8 — Password-Based Identity

No wallet needed. Players use username + password.

```javascript
async function generateSessionId(username, password) {
  const input = username.toLowerCase().trim()
    + ':' + password;
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest(
    'SHA-256', data
  );
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return '0x' + hashArray
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

Same username + password = same session ID
on any device. Cross-device play without wallets.

---

## Step 9 — Session-Specific localStorage

Multiple accounts on one device need isolated data.

```javascript
function storageKey(key) {
  return key + '_' + (sessionId || 'guest');
}

function getStorage(key, fallback = null) {
  const val = localStorage.getItem(storageKey(key));
  return val !== null ? val : fallback;
}

function setStorage(key, value) {
  localStorage.setItem(storageKey(key), value);
}
```

Use getStorage/setStorage everywhere instead
of raw localStorage calls.

---

## Step 10 — Version-Based Cache Clearing

When you deploy a new contract clear all
player caches automatically.

```javascript
const CONFIG = {
  CONTRACT_ADDRESS: '0x...',
  APP_VERSION: '1.0.0', // bump this on new contract
};

function clearStaleData() {
  const storedContract = localStorage.getItem(
    'game_contract_address'
  );
  const storedVersion = localStorage.getItem(
    'game_app_version'
  );

  if (storedContract !== CONFIG.CONTRACT_ADDRESS ||
      storedVersion !== CONFIG.APP_VERSION) {

    // Clear all game data
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('game_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    localStorage.setItem('game_contract_address',
      CONFIG.CONTRACT_ADDRESS);
    localStorage.setItem('game_app_version',
      CONFIG.APP_VERSION);

    // Reset in-memory state
    sessionAnswers = {};
    allQuestions = [];
  }
}
```

Call clearStaleData() before anything else
on app startup.

---

## Step 11 — Vercel Deployment

**Critical:** Always include vercel.json or
Vercel will use cached builds and your updates
will never go live.

Create vercel.json in repo root:

```json
{
  "buildCommand": "cd frontend && npm install && npm run build",
  "outputDirectory": "frontend/dist"
}
```

---

## Common Pitfalls

### UNDETERMINED Consensus
Cause: Validators fetching different content
Fix: Plain HTML knowledge page + topic forcing

### Script Skips On New Day
Cause: generation_complete flag from yesterday
Fix: UTC date comparison not flag check

### Answers Always On Option A
Cause: AI defaults to A in JSON template
Fix: Deterministic shuffle after generation

### Stale Data After Contract Deploy
Cause: localStorage has old contract data
Fix: Version bump in CONFIG clears all caches

### Vercel Not Deploying New Code
Cause: No vercel.json — uses cached build
Fix: Add vercel.json with explicit build command

### Rate Limit Exceeded
Cause: Too many contract calls at startup
Fix: Stagger calls with 300-500ms delays
Use cached responses for slow-changing data

### import random Unreliable In GenVM
Cause: GenVM sandbox restricts Python stdlib
Fix: Use deterministic math-based shuffle

---

## Flexible Question Count

Do not hardcode the number of questions.
Let players score based on what generated:

```python
# In contract
generation_done = json.loads(self.generation_complete)
all_answered = (
    len(player_answers) >= len(questions)
    and generation_done
)
```

```javascript
// In frontend
const totalExpected = allQuestions.length;
// not hardcoded 5
```

If 4 questions generate max score is 400 pts.
Players always get a complete day.

---

## Cross-Device Sync Pattern

Add a view method to get exact player answers:

```python
@gl.public.view
def get_player_answers(self, session_id: str) -> str:
    answers = json.loads(self.daily_answers)
    player_answers = answers.get(session_id, {})
    return json.dumps({
        "found": len(player_answers) > 0,
        "answers": player_answers,
        "total_answered": len(player_answers),
        "total_correct": sum(
            1 for v in player_answers.values()
            if v.get("correct", False)
        ),
        "total_points": sum(
            v.get("points", 0)
            for v in player_answers.values()
        )
    })
```

On login fetch this and restore exact progress.

---

## Built By

This SKILL.md was written by Jason
([@jason4185](https://github.com/jason4185))
builder of [Genazo](https://www.genazo.xyz) —
the first daily GenLayer knowledge game.

If this helped you build something on GenLayer
share it in the GenLayer Discord and tag me!

---

*Powered by Optimistic Democracy*
