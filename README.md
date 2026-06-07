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

Most Web3 games force you to connect
a wallet before you can play. That is
friction. You need MetaMask installed,
you need to approve transactions, you
need to switch networks. Most people
drop off before they even see the game.

Genazo is different.

We removed wallet connection entirely
and replaced it with something simpler —
a username and password. But instead of
storing your password on a server we
never touch it at all.

Here is what actually happens:

When you sign up your username and
password are combined locally in your
browser and run through SHA-256 — a
cryptographic hash function. The result
is your session ID. That session ID is
what gets stored on the GenLayer
blockchain as your identity.
username + password → SHA-256 → session ID
session ID → stored on-chain → your identity

Your password never leaves your device.
No server ever sees it. No database
stores it. It is pure cryptography.

And because the same username and
password always produce the same session
ID you can sign in on any device — phone,
laptop, tablet — and pick up exactly
where you left off. No wallet needed.
No browser extension. No network switching.

Just a username and a password.

The tradeoff is simple: if you forget
your password you cannot recover your
account. There is no "forgot password"
email because there is no email. Write
it down somewhere safe.

This is what Web3 onboarding should
feel like — the power of blockchain
identity without the friction of
wallet infrastructure.

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
