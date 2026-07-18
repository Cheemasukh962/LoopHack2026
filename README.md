# Keeper — LoopHack 2026

An event-driven agent that turns **one** human-filed issue into a self-sustaining loop:
**recall → plan → assign → implement → review → merge → scan → file its own next issues → repeat.**
A human touches the system once; everything after runs on the event bus.

This is the **complete product**: the **Compass** web frontend (React 18 + Vite + Tailwind) wired to the
real **Keeper engine** (event bus + services + sponsor integrations) in [`backend/`](backend/). One
`pnpm dev` runs both — you file one issue and watch the **real** loop run and file its own next issues,
with Nexla, Pomerium, and Zero.xyz lighting up live as their events fire.

**It runs on real data, not seed data.** On boot Keeper ingests a live GitHub repo
(`TARGET_REPO`, default `facebook/react`) and turns it into the Nexset-shaped rows the loop
consumes — so recall, routing, and scans use **real contributors, real commits, and real files**.
File a bug and Keeper routes it to an actual top contributor (e.g. `sebmarkbage`, 1,939 commits),
cites real PRs as prior art, and scopes a real file path.

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

- **Contract-first.** Client and engine share one frozen contract (`shared/api.ts` ↔ `backend/src/contract/`):
  `Issue`, `Plan` (with `file_boundary` + `assignee.context_score`), `IssueDetail`, and a
  `Provenance` of `human | keeper_decomposer | keeper_scanner` — the last two are how Keeper marks
  the issues *it* filed.
- **Live, not animated.** The detail page (`client/pages/AgentIssue.tsx`) **polls the real event stream**
  (`GET /api/v1/events`) and renders it — the timeline, the phase gate, and the sponsor badges are all
  driven by actual bus traffic (`client/lib/loop.ts` maps each event to a row + its sponsor).
- **Two interchangeable adapters** (`client/lib/keeper.ts`): an **http** adapter that speaks `/api/v1`
  (Vite proxies it to the engine in dev), and a **mock** adapter backed by `localStorage` for when no
  backend is reachable (e.g. the Vercel-only deploy) — the UI is identical either way.
- **The engine** (`backend/`): an in-memory **event bus** (names map 1:1 to EventBridge), a seeded
  **store**, and one service per stage (`recall`, `locate`, `router`, `planner`, `decomposer`, `scanner`).
  Claude (`claude-opus-4-8`, `backend/src/llm`) writes the plans and scans the diffs — with a built-in
  offline fallback so the loop runs with no API key.

### Why the design holds

> **We write specs, not code — so Keeper never needs merge rights.**

Keeper produces plans and issues, not unreviewed commits, and every write it *does* make is routed
through the **Pomerium** guard: it can't touch a file outside the plan's `file_boundary`, and it can't
file more than 5 issues an hour. That's what makes an autonomous, write-capable agent safe to run.

## Sponsors — connected

Keeper integrates all three sponsor platforms. Each connects through its official client/SDK using
env-configured credentials, and falls back to a local implementation so the demo also runs fully offline.

- **Nexla** — connected as the **context & recall layer**, now serving **Nexsets built from a real
  GitHub repo** (real contributors, commits, and files). It answers `whoHasContext(path)` and
  `priorArt(query)` so each issue routes to the true code owner (blame outranks the résumé). A Nexla
  API key flips it to the live Nexla cloud; see **/people** for the ownership map.
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
pnpm install                 # frontend deps
pnpm --dir backend install   # engine deps
pnpm dev                     # runs BOTH: web on :8080, engine on :8787
```

Open the printed web URL (Vite falls back to `:8081` if `:8080` is busy), file an issue, and watch the loop.
Browse **/people** for the real contributor ownership map and **/events** for the full live audit log.

**Point it at any repo:** `TARGET_REPO=vercel/next.js pnpm dev` (add `GITHUB_TOKEN=…` in `backend/.env`
to lift the 60-req/hr anonymous GitHub limit). The ingest is disk-cached under `backend/.cache/`.

**No API keys required.** The engine runs the whole loop offline with a built-in prompt-aware fallback LLM,
and all three sponsors fall back to local implementations. To upgrade to **real Claude**, drop your key into
`backend/.env` (gitignored) — the engine switches automatically, no code change:

```bash
# backend/.env   (see backend/.env.example)
ANTHROPIC_API_KEY=sk-ant-...
# optional live sponsors:
# NEXLA_API_KEY=…   POMERIUM_ISSUER=…   POMERIUM_AUDIENCE=…   ZERO_API_URL=…
```

## Deploy

The **frontend** ships to **Vercel** out of the box — `vercel.json` sets the Vite build (`dist/spa`) + SPA
routing, and it runs standalone on local mock data. To make the deployed UI drive the **real** engine,
host `backend/` (any Node host — it's an in-memory demo engine) and set `VITE_KEEPER_API_URL` to its URL.

## Repo layout

| Path | What's there |
|---|---|
| `client/` | **Compass** frontend — feed + composer (`Index`), live lifecycle (`AgentIssue`), people/ownership (`People`), audit log (`Events`); `lib/keeper.ts` (API adapter), `lib/loop.ts` (event → UI map) |
| `shared/api.ts` | The frozen contract shared by client & engine |
| `backend/` | The **Keeper engine** — event bus, store, services (`recall`/`locate`/`router`/`planner`/`decomposer`/`scanner`), API on `:8787`, and the Nexla / Pomerium / Zero.xyz integrations |
| `backend/src/github/repo.ts` | **Real-data ingest** — turns a live GitHub repo into Nexset-shaped rows (disk-cached) |
| `vercel.json` | Static SPA deploy config |
