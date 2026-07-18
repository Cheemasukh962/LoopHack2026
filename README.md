# Compass — LoopHack 2026 
<img width="1536" height="1024" alt="image" src="https://github.com/user-attachments/assets/24b47aa1-3d35-4edf-bb34-86ddb9009b7f" />


An event-driven agent that turns **one** human-filed issue into a self-sustaining loop:
recall → plan → assign → branch → merge → **scan → file its own new issues** → repeat.
A human touches the system **exactly once**. Everything after runs on the bus with no hand on the wheel.

> This repo is the **backend + a fake-GitHub demo stage**. No AWS — it runs locally.
> The repo history is *staged like a movie set*; the loop (event bus, LLM planning, self re-entry) is **real**.

## The pitch in one line
> "We write specs, not code — so Keeper never needs merge rights, which is why the security story holds.
> A human files one bug; the system files its own next 10."

## Team workflow
1. Work happens on three branches: `teammate-a`, `teammate-b`, `teammate-c`.
2. Each teammate (and their AI agent) reads their brief in [`docs/roles/`](docs/roles/) and stays in their lane.
3. We merge all three back to `main` at each checkpoint, the lead verifies the loop still runs, then we re-split.
4. **Never break `src/contract/`** — those types are shared with the frontend. Changing a shape = tell the whole team first.

## Roster & lanes
| Branch | Person | Lane | Sponsor(s) owned |
|---|---|---|---|
| `teammate-a` | **Lead** — Spine & The Close | event bus, store, API server, **scanner (Loop 5)** | (infra) |
| `teammate-b` | Context & Recall | ingest, recall, locate, router | **Nexla** |
| `teammate-c` | Brain & Guardrails | planner, decomposer, LLM client | **Pomerium**, **Zero.xyz** |

## Stack
- **Node 20 + TypeScript**, run with `tsx` (no build step needed for the demo).
- In-memory **event bus** (same event names as EventBridge — maps 1:1).
- In-memory **store** seeded from `src/seed/seed.json`.
- **Express** API serving the `/api/v1` contract (`src/contract/api.ts`).
- **Claude API** for planning/decomposition/scanning — access unblocked by **Zero.xyz**.

## Run
```bash
npm install
npm run dev        # boots bus + all services + API on :8787
```

## Read next
- [`docs/PLAN.md`](docs/PLAN.md) — the full build plan & 3-minute demo script.
- [`AGENTS.md`](AGENTS.md) — rules every AI agent in this repo must follow.
- `docs/roles/teammate-<x>.md` — your job.
