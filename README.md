# Keeper — LoopHack 2026

An event-driven agent that turns **one** human-filed issue into a self-sustaining loop:
**recall → plan → assign → implement → review → merge → scan → file its own next issues → repeat.**
A human touches the system once; everything after runs on the event bus.

This branch (`main`) is the **Compass** web frontend — React 18 + React Router 6 + TypeScript + Vite + Tailwind.
The full event-driven backend (event bus, planner, scanner, services) lives on the
[`mainbackend`](https://github.com/Cheemasukh962/LoopHack2026/tree/mainbackend) branch.

## How it works

### What you do (the 60-second demo)

1. **File one issue** in the composer — a title and a sentence (e.g. *"intermittent 500s on checkout"*).
2. **Keeper triages it, live:** it recalls prior art, blames the code to find the file boundary,
   routes the work to the true owner, and drafts a root-cause plan — each step streams onto the timeline.
3. **Keeper implements it:** opens a working branch, writes the change, and runs the test suite.
4. **You review:** open the change and either **Approve** (→ merged) or **Request changes**
   (→ Keeper re-plans with a new plan version and re-runs).
5. **The loop closes itself:** on merge, Keeper scans the diff, discovers what tool the change needs,
   and **files its own next issues** — which re-enter at step 2 with no human. A `keeper_filed` counter climbs.

### The loop, stage by stage

| Stage | Bus event(s) | What happens | Sponsor at this step |
|---|---|---|---|
| **Intake** | `issue.created` | A human files one issue (`title`, `body`) | — |
| **Recall** | `recall.hit` | Surfaces prior art — *"we hit this in #412"* | **Nexla** `priorArt()` |
| **Locate** | `locate.done` | `git blame` localizes the fix → `file_boundary` | **Nexla** `blameFor()` |
| **Plan** | `plan.created` | Claude drafts a root-cause hypothesis + plan | **Zero.xyz** (Claude access) |
| **Route** | `route.assigned` | Assigns the true code owner — *blame beats the résumé* | **Nexla** `whoHasContext()` + **Pomerium** (authorize) |
| **Decompose** | `issue.created` (children) | An over-large plan is split into child issues | **Pomerium** (authorize each write) |
| **Implement** | `branch.created` → `push` → `ci.completed` | Opens a branch, writes the change, runs tests | **Pomerium** (`file_boundary` lock) |
| **Review** | `plan.revised` on rework | Human approves → merge, or requests changes → re-plan | — |
| **Scan (the close)** | `branch.merged` → `scan.found` → `issue.created` | Scans the merged diff, discovers a tool, files its own next issues | **Zero.xyz** `discoverTool()` + **Pomerium** (≤5/hr cap) |

### Under the hood

- **Contract-first.** Client and server share one frozen contract (`shared/api.ts` ↔ `src/contract/`):
  `Issue`, `Plan` (with `file_boundary` + `assignee.context_score`), `IssueDetail`, and a
  `Provenance` of `human | keeper_decomposer | keeper_scanner` — the last two are how Keeper marks
  the issues *it* filed.
- **Two interchangeable adapters** (`client/lib/keeper.ts`): a **mock** adapter backed by `localStorage`
  so the app demos fully offline, and an **http** adapter that speaks `/api/v1`. Flip between them with
  a single env var — `VITE_KEEPER_API_URL` — and nothing else in the UI changes.
- **The UI mirrors the bus.** Every lifecycle step on the timeline is named after the exact event the
  backend emits (`recall.hit`, `locate.done`, `route.assigned`, `plan.created`, `branch.created`,
  `ci.completed`, `branch.merged`), so what you watch on screen is the real event stream.
- **The engine** (`mainbackend`): an in-memory **event bus** (names map 1:1 to EventBridge), a seeded
  **store**, and one service per stage (`recall`, `locate`, `router`, `planner`, `decomposer`, `scanner`).
  Claude (`claude-opus-4-8`, `src/llm`) writes the plans and scans the diffs.

### Why the design holds

> **We write specs, not code — so Keeper never needs merge rights.**

Keeper produces plans and issues, not unreviewed commits, and every write it *does* make is routed
through the **Pomerium** guard: it can't touch a file outside the plan's `file_boundary`, and it can't
file more than 5 issues an hour. That's what makes an autonomous, write-capable agent safe to run.

## Sponsors — connected

Keeper integrates all three sponsor platforms. Each connects through its official client/SDK using
env-configured credentials, and falls back to a local implementation so the demo also runs fully offline.

- **Nexla** — connected as the **context & recall layer**. A Nexla client authenticates with a service
  key, and ownership/history are modelled as **Nexsets**, answering `whoHasContext(path)` and
  `priorArt(query)` so each issue routes to the true code owner (blame outranks the résumé).
- **Pomerium** — connected as the **write-authorization guardrail** (`@pomerium/js-sdk`). Every write
  (file-issue / branch / assign) is authorized through a Pomerium guard that enforces the plan's
  `file_boundary` and a ≤ 5-issues/hour filing cap, emitting an audit event on every decision.
- **Zero.xyz** — connected in **two places**: it brokers Claude API access (through the Anthropic base
  URL) and powers **on-the-fly tool discovery** (`discoverTool`), so the post-merge scanner picks the
  right tool for a detected signal (e.g. Terraform in the diff → an IaC scanner).

Set `NEXLA_API_KEY`, `POMERIUM_ISSUER` / `POMERIUM_AUDIENCE`, `ZERO_API_URL`, and `ANTHROPIC_API_KEY`
to run against the live services; leave them unset to use the built-in local fallbacks.

## Run locally

```bash
pnpm install
pnpm dev        # http://localhost:8080
```

## Deploy

Ships to **Vercel** out of the box — `vercel.json` sets the Vite build (`dist/spa`) and SPA routing.
The app runs standalone on local mock data; set `VITE_KEEPER_API_URL` to point it at the live Keeper backend.

## Repo layout

| Path / branch | What's there |
|---|---|
| `main` (this branch) | **Compass** frontend — composer, live issue lifecycle, human review |
| `client/` | React app — `pages/` (Index, AgentIssue, ReviewIssue), `lib/keeper.ts` (contract adapters) |
| `shared/api.ts` | The frozen contract shared with the backend |
| [`mainbackend`](https://github.com/Cheemasukh962/LoopHack2026/tree/mainbackend) | The event-driven engine — bus, store, services, and the Nexla / Pomerium / Zero.xyz integrations |
