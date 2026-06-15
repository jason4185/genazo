# Genazo

A daily on-chain riddle game powered by GenLayer Intelligent Contracts.

**Live Demo:** https://www.genazo.xyz

---

## Overview

Genazo is a daily riddle game built entirely on GenLayer Intelligent Contracts. Every day up to 5 new riddles about GenLayer drop on-chain. The contract generates questions from GenLayer documentation using AI. Players answer them, earn points, and build streaks. When a player answers, the same AI verifies if the answer is correct. No human is involved at any stage.

---

## How It Works

| Step | Description |
|------|-------------|
| Play | Visit the site and enter a username and password — no wallet needed |
| Answer | Submit your answer to the daily GenLayer riddle |
| Verify | A GenLayer Intelligent Contract verifies your answer using AI |
| Score | Earn points and build streaks tracked entirely on-chain |
| Compete | Leaderboard updates after every answer across all devices |

---

## Tech Stack

### Smart Contract

| Contract | Description |
|----------|-------------|
| Genazo.py | Main contract — riddle generation, answer verification, leaderboard, streaks, fingerprint system, deterministic shuffle |

### Frontend

| Category | Technology |
|----------|------------|
| Framework | Vite + Vanilla JavaScript |
| Blockchain | genlayer-js |
| Identity | Password-based session ID via SHA-256 — no wallet required |
| Deployment | Vercel |

### Automation

| Tool | Description |
|------|-------------|
| GitHub Actions | Daily riddle generation at midnight UTC |
| Node.js | v20 |

---

## Contract Address

| Contract | Address | Network |
|----------|---------|---------|
| Genazo | 0xf6D5Eb24b26F11c174dd852A65C33A1F99A90D9b | GenLayer Studionet |

---

## GenLayer Features Used

| Feature | Usage |
|---------|-------|
| gl.nondet.web.render() | Fetches GenLayer documentation as plain text |
| gl.nondet.exec_prompt() | AI riddle generation with topic forcing |
| gl.eq_principle.prompt_comparative | Consensus on docs fetching and riddle generation |
| @gl.public.write | Answer submission, player registration, riddle generation |
| @gl.public.view | Leaderboard reads, player state, day number, generation status |
| str storage | Player data, leaderboards, riddles, fingerprints stored as JSON strings |

---

## Key Technical Decisions

| Problem | Solution |
|---------|----------|
| JavaScript docs causing UNDETERMINED | Built plain static HTML knowledge page |
| Validators disagreeing on riddle wording | Lenient prompt_comparative equivalence check |
| Answer always being option A | Deterministic shuffle using day and riddle number as seed |
| Riddles repeating topics | Fingerprint system stored on-chain |
| No wallet friction | SHA-256 password-based session identity |
| Cross-device sync | On-chain answer retrieval on login |

---

## Repository Structure

```
genazo/
├── contract/
│   └── Genazo.py              # Main Intelligent Contract
├── frontend/
│   └── main.js                # App logic and contract interaction
├── scripts/
│   └── daily-riddle.js        # Riddle generation automation script
├── .github/
│   └── workflows/
│       └── daily-riddle.yml   # GitHub Actions daily trigger
├── SKILL.md                   # Community guide for building on GenLayer
└── README.md
```

---

## Getting Started

### Prerequisites

```
Node.js 20+
No wallet needed — password based identity
```

### Run Locally

```bash
git clone https://github.com/jason4185/genazo
cd genazo/frontend
npm install
npm run dev
```

Visit http://localhost:3000

---

## Network

Genazo runs on GenLayer Studionet.

---

## Community

A SKILL.md is included in this repo as a community guide for builders who want to build daily games or knowledge apps on GenLayer Intelligent Contracts.

[View SKILL.md](./SKILL.md)

---

Built by Jason · Port Harcourt, Nigeria · Submitted to the GenLayer Builder Program
