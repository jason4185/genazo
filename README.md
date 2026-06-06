# Genazo — The Daily GenLayer Riddle Game

> Up to 5 AI-generated riddles every day. Real competition. How well do you know GenLayer?

Live at: **https://www.genazo.xyz**

Genazo is a daily knowledge game built entirely on GenLayer Intelligent Contracts. Every day at midnight UTC up to 5 fresh riddles about the GenLayer ecosystem are generated live by AI validators reaching consensus through Optimistic Democracy — the same mechanism that powers the protocol itself.

No human writes the questions.
No human decides the answers.
Everything happens on-chain.

---

## How To Play

1. Create an account with username and password
2. Answer up to 5 riddles per day
3. Build your streak by playing every day
4. Earn points and climb the leaderboard
5. Share your result as an image card

---

## Account System

No wallet required.

- Pick a username and password on signup
- Same credentials work on any device
- Session ID derived locally using SHA-256
- Passwords never leave your device
- First come first served on usernames
- Save your password — it cannot be recovered

---

## Point System

| Result | Points |
|---|---|
| Correct answer | 100 pts |
| 3 day streak | +25 bonus |
| 7 day streak | +50 bonus |
| 30 day streak | +100 bonus |

Scoring is flexible — if 4 riddles generate
today the max is 400 pts. Streak continues
if you answer all available riddles each day.

---

## Cross-Device Sync

Play on any device with the same account.
Progress syncs automatically via on-chain data.
Answer on Mac — phone resumes exactly where
you left off within 90 seconds.

---

## What Makes This Unique

- Zero hardcoded questions or answers
- 5 AI validators verify every riddle
- Answers shuffled deterministically
  across A B C D — no bias
- All scores stored permanently on-chain
- Transaction hash shown for every submission
- No database. No backend. No admin control.
- Flexible riddle count — 1 to 5 per day
- Final score only shown after generation
  is truly complete
- Cross-device sync via on-chain data

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

[genazo-knowledge.netlify.app](https://genazo-knowledge.netlify.app)

Plain text page covering all major GenLayer
topics used by AI validators to generate
riddles. No JavaScript. No dynamic content.
Every validator fetches identical content.

---

---

## Building Something Similar?

If you want to build a daily game on GenLayer
and use Claude Code to help you I wrote a
detailed skill guide based on everything
learned building Genazo:

👉 **[Read SKILL.md](./SKILL.md)**

It covers:
- How to avoid UNDETERMINED consensus
- Forcing topic agreement across validators
- Deterministic shuffle without random
- Generation complete flag pattern
- UTC date-based cron detection
- Password-based cross-device identity
- Version-based cache clearing
- Common pitfalls and exact fixes

Written to help the GenLayer community
build faster with fewer headaches.

---

Built for the GenLayer Builder Program.
*Powered by Optimistic Democracy*
