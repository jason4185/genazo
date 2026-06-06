# Genazo — The Daily GenLayer Riddle Game

> Up to 5 AI-generated riddles every day. Real competition. How well do you know GenLayer?

Genazo is a daily knowledge game built entirely on GenLayer Intelligent Contracts. Every day at midnight UTC, up to 5 fresh riddles about the GenLayer ecosystem are generated live by 5 AI validators reaching consensus through Optimistic Democracy — the same mechanism that powers the protocol itself.

No human writes the questions.
No human decides the answers.
Everything happens on-chain.

---

## Play

Live at: **https://www.genazo.xyz**

Up to 5 riddles drop every day at midnight UTC. You have 24 hours to answer all of them. Build your streak. Earn points. Climb the global leaderboard.

---

## How It Works

1. Every day GitHub Actions triggers
   the Genazo Intelligent Contract

2. The contract fetches live GenLayer
   knowledge from a dedicated content page

3. 5 AI validators independently generate
   each riddle and reach consensus through
   Optimistic Democracy

4. Each verified riddle is stored
   permanently on-chain one by one

5. When all generation attempts complete
   the contract marks generation as done

6. Players answer riddles one at a time
   Scores and streaks live on the
   blockchain forever

---

## Account System

No wallet required. Genazo uses
password-based identity.

- Pick a username and password on signup
- Same credentials work on any device
- Your session ID is derived locally
  from username and password using SHA-256
- Passwords never leave your device
- Save your password — it cannot be recovered

---

## Point System

| Result | Points |
|---|---|
| Correct answer | 100 pts |
| 3 day streak | +25 bonus |
| 7 day streak | +50 bonus |
| 30 day streak | +100 bonus |
| Wrong answer | 0 pts |

Scoring is flexible — if 4 riddles
generate today the max is 400 pts.
Streak continues if you answer all
available riddles each day.

---

## What Makes This Unique

- Zero hardcoded questions
- Zero hardcoded answers
- 5 AI validators verify every riddle
- Answers shuffled deterministically
  across A B C D — no bias
- All scores stored permanently on-chain
- No database. No backend. No admin control.
- Flexible riddle count — 1 to 5 per day
- Cross-device sync via on-chain data
- Final score only shown after generation
  is truly complete

The game cannot function without the
Intelligent Contract. That is the point.

---

## Stack

- Intelligent Contract: Python on GenLayer
- Frontend: Vite and Vanilla JavaScript
- Automation: GitHub Actions
- Knowledge Base: Netlify

---

## Knowledge Base

Riddles are generated from a dedicated
plain text knowledge page:

[genazo-knowledge.netlify.app](https://genazo-knowledge.netlify.app)

Covers all major GenLayer topics:
Optimistic Democracy, Validators,
Equivalence Principle, GenVM,
Appeal Process, Staking, Testnet History,
Builder Program, LayerZero, Partnerships,
and Community Culture.

---

Built for the GenLayer Builder Program.

*Powered by Optimistic Democracy*
