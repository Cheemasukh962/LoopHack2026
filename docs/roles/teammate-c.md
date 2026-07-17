# Teammate C — Brain & Guardrails  (owns Pomerium + Zero.xyz)

**Branch:** `teammate-c`
**Read first:** `AGENTS.md`, `docs/PLAN.md`, everything in `src/contract/`.

You own the reasoning engine (the LLM planner + the recursive decomposer that makes the system
non-terminating) **and** the two guardrail sponsors that make an agent with write access deployable.

## Mission
Turn a located issue into a real plan artifact, split oversized plans into children that **re-enter
the loop**, and wrap every write in Pomerium so Keeper *physically* cannot misbehave. Unblock Claude
access with Zero and give the scanner a way to discover tools mid-loop.

## Files you OWN (only you edit these)
- `src/llm/index.ts` — implements `LlmClient` (`complete`, `completeJson`) over `@anthropic-ai/sdk`.
  **Access unblocked by Zero.xyz** — read the key/proxy from env, never hardcode. Model `claude-opus-4-8`.
- `src/services/planner.ts` — subscribes `locate.done`; calls the LLM to produce a `Plan`
  (root_cause_hypothesis, file_boundary, blast_radius, legacy_checklist, test_strategy). Runs the
  **sizer**: if the plan is too big, emit `plan.too_large`; else emit `plan.created`. Insert a new
  `PlanRecord` version — **never overwrite**.
- `src/services/decomposer.ts` — subscribes `plan.too_large`; splits into child issues with file
  boundaries; **republishes `issue.created` ×N with `provenance: "keeper_decomposer"`** → Loop 2
  re-entry. It bottoms out when every leaf is small enough (that's correct — it terminates).
- `src/pomerium/index.ts` — implements `PomeriumGuard.authorizeWrite()`. Enforce: (a) write scope ⊆
  the plan's `file_boundary`; (b) ≤5 `file_issue` actions per rolling hour. On pass emit
  `pomerium.authorized`; on fail emit `pomerium.denied` and return `false` (caller must escalate,
  not execute). Log an audit line for every decision.
- `src/zero/index.ts` — implements `ToolDiscovery.discoverTool()`. When the scanner hits an unknown
  signal (Terraform / a CVE bump / an unknown language), return a named tool + a `run()` that
  produces findings. For the demo a curated map of signal→tool is fine — the point is the agent's
  action space is **open**, not fixed.

## Files you IMPORT but never edit
`src/contract/*` (frozen), A's `store`/`bus` via interfaces. Always `store.appendEvent(...)`.
A's scanner and B's router will call YOUR modules — keep the interface signatures exactly as in
`src/contract/interfaces.ts` so they aren't blocked. Ship a stub early.

## Events
Subscribe: `locate.done` (planner), `plan.too_large` (decomposer).
Publish: `plan.created`, `plan.too_large`, `plan.revised`, `issue.created` ×N (decomposer),
`pomerium.authorized`, `pomerium.denied`.

## Definition of done
1. `planner` emits a `Plan` matching `src/contract/api.ts` exactly (frontend depends on it).
2. Sizer fires `plan.too_large`; `decomposer` files children that **re-enter Loop 1** (Loop 2 works).
3. Pomerium blocks a write outside `file_boundary` and denies the 6th issue in an hour with `pomerium.denied`.
4. `discoverTool()` returns an IaC scanner when handed a Terraform signal.

## Do NOT
Don't write real code fixes — Keeper emits specs, not diffs. Don't build `watcher`/`invalidator`.
Don't touch `src/contract/`. Ship the LLM + Pomerium stubs FIRST so A and B can integrate against them.
