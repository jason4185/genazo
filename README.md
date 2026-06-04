# Genazo — The Daily GenLayer Riddle Game

> One riddle a day. Real AI consensus. 
> How well do you know GenLayer?

Genazo is a daily knowledge game powered 
by GenLayer Intelligent Contracts. Every 
day a fresh riddle about the GenLayer 
ecosystem is generated live by 5 AI 
validators reaching consensus — the same 
mechanism that powers the protocol itself.

No human writes the questions.
No human decides the answers.
Everything happens on-chain.

---

## Play

Coming soon on Netlify.

One riddle drops every day at 1:00 AM 
Nigeria time. You have 24 hours to answer.
Build your streak. Earn points. Climb the 
global leaderboard.

---

## How It Works

1. Every day a GitHub Actions cron calls 
   the Genazo Intelligent Contract

2. The contract fetches live GenLayer 
   knowledge from a dedicated content page

3. 5 AI validators independently generate 
   a riddle and reach consensus through 
   Optimistic Democracy

4. The verified riddle is stored 
   permanently on-chain

5. Players answer once per day. Scores 
   and streaks live on the blockchain forever

---

## Point System

| Result | Points |
|---|---|
| Correct answer | 100 pts |
| 3 day streak | +25 bonus |
| 7 day streak | +50 bonus |
| 30 day streak | +100 bonus |

---

## What Makes This Unique

Most blockchain quiz games have a 
developer who writes the questions and 
hardcodes them into the contract.

Genazo does the opposite:

- Zero hardcoded questions
- Zero hardcoded answers
- 5 AI validators verify every riddle
- All scores stored permanently on-chain
- No database. No backend. No admin control.

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
plain text knowledge page covering every 
major GenLayer topic:

[genazo-knowledge.netlify.app](https://genazo-knowledge.netlify.app)

Topics include Optimistic Democracy, 
Validators, Equivalence Principle, GenVM, 
Appeal Process, Staking, Testnet History, 
Builder Program, LayerZero, Partnerships, 
and Community Culture.

The page is updated regularly as GenLayer 
releases new features. No contract 
redeployment needed.

---

## Run Locally

```bash
cd frontend && npm install && npm run dev
cd scripts && npm install && node daily-riddle.js
```

---

## Automate Daily Generation

Add your funded wallet private key as a 
GitHub Secret named FUNDED_PRIVATE_KEY.

The workflow at 
.github/workflows/daily-riddle.yml 
runs automatically at midnight UTC.

---

Built for the GenLayer Builder Program.

*Powered by Optimistic Democracy*
