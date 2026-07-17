# Engineer A — Backend Phase Machine & Self-Correction

**Branch:** `eng-a-backend-phases` (off `mainbackend`)
**Read first:** `docs/HANDOFF-round2.md` (§5 is your whole job), `src/contract/events.ts`,
`src/contract/api.ts`, `src/services/gateway.ts`, `src/store.ts`.

You own the **real phase-completion loop** — the projection over `loop_events` that advances
`planning → implementation → review` and locks the merge gate until all three pass, plus the
CI-red → auto-replan self-correction that is the demo's money shot. You are the ONLY lane that
touches `mainbackend`.

## Mission
Turn the bus into a phase state machine and expose it, exactly per handoff §5. When you finish,
the frontend can swap its client-side fallback for your real endpoint with a one-line change.

## Files you OWN (only you edit these)
- `src/contract/events.ts` — add `"phase.updated"` to `EventType`. **This is the single sanctioned
  contract addition this round** (handoff §9). Do not touch any other field or type.
- `src/contract/api.ts` (or `models.ts`) — add the `PhaseView` type exactly as handoff §5.1:
  `{ issue_id, phases: {phase,status,detail,updated_at}[], merge_blocked, blocking_reason }`
  with `phase ∈ {planning,implementation,review}`, `status ∈ {pending,active,passed,failed}`.
- `src/services/phase-tracker.ts` — **NEW.** Subscribe to existing events; on each transition (§5.2
  table) `store.appendEvent` a `phase.updated` with payload `{issue_id,phase,status,detail}`.
- `src/server.ts` — add `GET /api/v1/issues/:id/phases` → `PhaseView`, implemented as a **fold over
  `store.getEvents()`** filtered to `phase.updated` for that issue (latest status per phase).
  `merge_blocked = !(all three passed)`. No Store interface change.
- `src/index.ts` — `register(bus, store, deps)` the phase-tracker alongside the other services.

## The self-correction handler (§5.3) — do NOT skip, it's the pitch
Gateway already turns `POST /webhooks/ci.completed {status:"failure"}` into a `ci.failed` event.
On `ci.failed`: insert a new plan **version** with `revised_because:"ci_failure:<run>"` and emit
`plan.revised`. Your §5.2 rules then flip `implementation: failed → active` with no human.

## State machine (handoff §5.2 — implement exactly)
`issue.created`→planning active · `plan.created`→planning passed, implementation active ·
`route.assigned`/`branch.created`/`push`→implementation active · `ci.failed`→implementation failed ·
`plan.revised`→implementation active · `branch.merged`→implementation passed, review active ·
`scan.started`→review active · review with no open blocking findings→review passed.

## Files you IMPORT but never edit
All other `src/contract/*` (frozen), every other `src/services/*`, `src/bus.ts`, `src/store.ts`.

## Definition of done
1. `npm run dev` still boots and **37/37 existing tests still pass** — you added, you didn't break.
2. `GET /api/v1/issues/:id/phases` returns a live `PhaseView` folded from real events.
3. Driving the loop for an issue advances phases; gate `merge_blocked` flips false only when all
   three are `passed`.
4. `POST /webhooks/ci.completed {status:"failure"}` → `ci.failed` → a new plan version +
   `plan.revised` → implementation returns to `active`, all emitted as real `loop_events`.
5. Add a focused test for the phase fold + the ci.failed→plan.revised transition.

## Do NOT
Change any existing contract shape or field name. Invent phase data not grounded in `loop_events`.
Touch the frontend. Write product-code fixes — Keeper files specs, the re-plan is a new plan
**version**, not a code edit.

## Contract you publish to B & C
The `phase.updated` payload and the `PhaseView` JSON. Freeze the shape early and post it in the team
channel so B's `derivePhases` fold (client-side fallback) matches yours byte-for-byte.
