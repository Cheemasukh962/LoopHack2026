# Teammate A — Spine & The Close  (LEAD)

**Branch:** `teammate-a`
**Read first:** `AGENTS.md`, `docs/PLAN.md`, everything in `src/contract/`.

You own the skeleton the whole system runs on **and** the closing loop that is the entire pitch.
If anything is going to be verified working before 4:30, it is your loop.

## Mission
Build the event bus, the store, the API server, the seed stage, and the **scanner** — the service
that reads a merged diff and files brand-new issues that re-enter the loop with **no human**.

## Files you OWN (only you edit these)
- `src/bus.ts` — implements `EventBus` from the contract. In-memory pub/sub. `publish` dispatches
  to all subscribers async; log every dispatch to console so we can see the loop on stage.
- `src/store.ts` — implements `Store`. In-memory maps seeded from `src/seed/seed.json`.
  `appendEvent` stamps `event_id` + ISO `ts` and is what makes the frontend trace light up.
- `src/server.ts` — Express app serving **every** `/api/v1` endpoint in `src/contract/api.ts`.
  It only READS the store (plus `POST /issues` to seed the first human issue). Enable CORS.
- `src/index.ts` — boot: create bus + store, load seed, `register(bus, store, deps)` for **every**
  service (stub-import B's and C's register fns so the app runs before they land), start server.
- `src/services/gateway.ts` — turn `POST /issues` and demo webhooks into bus events
  (`issue.created`, `push`, `ci.completed`, `main.merged`, `branch.merged`). Dedupe by delivery id.
- `src/services/scanner.ts` — **THE CLOSE.** Subscribes `branch.merged`. Reads the staged diff,
  emits `scan.started` → uses the LLM (C's `LlmClient`) to find latent issues → for anything outside
  its known toolset (Terraform!) calls C's `ToolDiscovery.discoverTool()` (Zero.xyz) → emits
  `scan.found` → files each as `issue.created` with `provenance: "keeper_scanner"` **through**
  C's `PomeriumGuard.authorizeWrite()`. Those issues MUST re-enter Loop 1.
- `src/seed/` — `seed.json` (the fake repo: ~4 people, file tree, ~20 closed issues/PRs, ownership
  map) + `staged-pr.diff` (the one PR you'll merge on stage, with a known latent bug). This is our
  #1 credibility risk — make the issues sound real.

## Files you IMPORT but never edit
`src/contract/*` (frozen), C's `src/llm/*`, `src/pomerium/*`, `src/zero/*`, B's `src/nexla/*`.
Depend on their **interfaces**, not their files — stub with a fake `LlmClient`/`PomeriumGuard` so
your loop runs before C is done.

## Events
Subscribe: `branch.merged` (scanner), plus gateway ingests HTTP.
Publish: `issue.created`, `push`, `ci.completed`, `main.merged`, `branch.merged`, `scan.started`,
`scan.found`, and `issue.created` ×N from the scanner.

## Definition of done (in priority order)
1. `npm run dev` boots: bus + store + seed + API on :8787, `GET /api/v1/events` returns rows.
2. `POST /api/v1/issues` → an `issue.created` event visibly flows to a subscriber.
3. **Loop 5 proven:** a `branch.merged` for the staged PR makes the scanner file a new
   `keeper_scanner` issue that shows up in `GET /issues?provenance=keeper_scanner` and re-triggers triage.
4. Seed data reads as a real repo with years of history.

## Do NOT
Build `watcher`, `invalidator`, or `graph`. Don't touch `src/contract/`. Don't write real code fixes —
Keeper files specs, never edits product code.
