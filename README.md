# Genazo — The Daily GenLayer Riddle Game

One AI-generated riddle every day.
Powered by Intelligent Contracts and
Optimistic Democracy consensus.

## How it works

- Every day at midnight UTC a cron job
  calls the Genazo Intelligent Contract
- The contract fetches live GenLayer docs
- 5 AI validators independently generate
  a riddle and reach consensus
- Players answer once per day and build
  streaks on the leaderboard

## Stack

- Smart Contract: Python on GenLayer Studio
- Frontend: Vite + Vanilla JS
- Cron: Node.js + GitHub Actions
- Knowledge Base: Netlify

## Contract

Address: 0xC6c644F4B4df6c8105b461F07DC180fBB1128Dc1
Network: GenLayer Studionet

## Setup

```bash
cd scripts && npm install
node daily-riddle.js
```
