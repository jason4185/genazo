# Genazo

> A daily on-chain riddle game powered by GenLayer Intelligent Contracts.

**Live Demo:** https://www.genazo.xyz

---

## Overview

Genazo is a daily riddle game built entirely on GenLayer Intelligent Contracts. Every day up to 5 new riddles about GenLayer drop on-chain. The contract generates the questions itself from a knowledge base built from GenLayer documentation. Players answer them, earn points, and build streaks. When a player answers, the same AI verifies if the answer is correct. No human is involved at any stage.

---

## How It Works

| Step | Description |
|------|-------------|
| Play | Visit the site and enter a password to identify yourself — no wallet needed |
| Answer | Submit your answer to the daily GenLayer riddle |
| Verify | A GenLayer Intelligent Contract verifies your answer using AI |
| Score | Earn points and build streaks tracked entirely on-chain |
| Compete | Leaderboard updates after every answer across all devices |

---

## Tech Stack

### Smart Contract
| Contract | Description |
|----------|-------------|
| `Genazo.py` | Main contract — riddle generation, answer verification, leaderboard, streaks |

### Frontend
| Category | Technology |
|----------|-----------|
| Framework | Vite + Vanilla JavaScript |
| Blockchain | genlayer-js |
| Identity | Password-based — no wallet required |

---

## Contract Address

| Contract | Address | Network |
|----------|---------|---------|
| Genazo | `0xf6D5Eb24b26F11c174dd852A65C33A1F99A90D9b` | GenLayer Studionet |

---

## Repository Structure

```
genazo/
├── contract/
│   └── Genazo.py              # Main Intelligent Contract
├── frontend/
│   ├── app/                   # Next.js app pages
│   ├── components/            # UI components
│   └── lib/                   # Contract interaction
└── README.md
```

---

## GenLayer Features Used

- `gl.nondet.exec_prompt()` — AI riddle generation from GenLayer documentation
- `gl.nondet.web.render()` — Fetching GenLayer documentation content
- `gl.eq_principle.prompt_comparative()` — Validator equivalence checking for riddle consensus
- `@gl.public.view` — Leaderboard, player state, and riddle reads
- `@gl.public.write` — Answer submission, player registration, riddle generation
- JSON-serialised `str` storage — All on-chain state stored as JSON strings

---

## Getting Started

### Prerequisites
- Node.js 18+
- No wallet needed — password based identity

### Run Locally

```bash
git clone https://github.com/jason4185/genazo
cd genazo/frontend
npm install
npm run dev
```

Visit `http://localhost:3000`

---

## Network

Genazo runs on **GenLayer Studionet**.

---

Built by [Jason](https://x.com/ja__so) · Submitted to the [GenLayer Builder Program](https://genlayer.com/builders)
