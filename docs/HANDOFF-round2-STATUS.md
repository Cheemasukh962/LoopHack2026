# Keeper — Round 2 STATUS / Reality-Check Handoff

**Written mid-round to answer "where are we" honestly.** Read this before `HANDOFF-round2.md` —
that doc is the *plan*; this doc is the *actual state*. Deadline is 4:30 PM today and we are behind.

---

## 0. TL;DR (read this if nothing else)

- ✅ **Backend works.** `mainbackend` typechecks clean and **30/30 tests pass**. The full loop runs
  live: `issue.created → recall.hit → locate.done → plan.created → route.assigned`, post-merge
  `scan`, decomposer, Pomerium guard, and **Zero tool-discovery** (terraform/CVE signals).
- ❌ **Round-2 integration is 0% built.** The frontend↔backend wiring, the phase-completion gate,
  Screen 3, and Zero-in-*planning* are all **unstarted**. The `eng-a/b/c` lane branches are empty.
- ❌ **Frontend is still a hardcoded shell.** `frontend` branch has no `client/lib/keeper.ts`, no
  data hooks — every screen is "Lorem ipsum".
- ⚠️ **Do NOT merge `teammate-a/b/c` into `mainbackend`.** They are round-1 snapshots that
  `mainbackend` already integrated; merging them **regresses** us (see §2).

**Bottom line:** we have a strong, demoable *backend* and *no wired frontend*. The pitch is visible
today only through API calls / logs unless we do the minimum wiring in §4.

---

## 1. What actually exists and works (verified, not claimed)

| Asset | Branch | State |
|---|---|---|
| Event bus, store, API server (`:8787`), seed | `mainbackend` | ✅ live, CORS open |
| Loop 1 (triage→plan→route) + Loop 5 (post-merge scan files new issues) | `mainbackend` | ✅ tested |
| Decomposer, Pomerium write-guard, Zero `discoverTool` (in scanner) | `mainbackend` | ✅ tested |
| Typecheck / test suite | `mainbackend` | ✅ `tsc --noEmit` clean, **30/30** |
| Round-2 plan + 3-lane briefs + recombination guide | `mainbackend:docs/roles/` | ✅ written |
| Vanilla-JS demo dashboard (`web/`) | `teammate-b` only | ⚠️ exists, unintegrated (possible fast frontend) |

## 2. What the branches really are (this is the confusing part)

- `mainbackend` = the **integrated** product. History shows it already merged all three round-1
  lanes (`Merge teammate-a/b/c`) plus integration fixes plus the round-2 planning commits. **This is
  HEAD of truth.**
- `teammate-a` (`1a41e8e`), `teammate-b` (`4d7c05d`), `teammate-c` (`248cbc8`) = **round-1
  single-lane snapshots**. Each diffs against `mainbackend` with **~6,400 deletions** — i.e. they
  are *missing* the integration. Merging them back = undoing the integration. **Leave them alone**
  (keep as historical/reference only).
- `eng-a-backend-phases`, `eng-b-frontend-wiring`, `eng-c-screen3-execution` = **empty** round-2
  lanes (0 commits beyond base). Nobody built on them.

## 3. What is NOT done (the round-2 scope, all of it)

1. `client/lib/keeper.ts` + React Query hooks — **not started**.
2. Home wiring (composer Send, feed, provenance badge, `/stats` counter) — **not started**.
3. Issue page wiring (`GET /issues/:id`, `/events` polling → timeline cards) — **not started**.
4. Phase state machine on the backend (`phase.updated`, `phase-tracker.ts`, `/issues/:id/phases`)
   and the client-side `derivePhases` fallback — **not started**.
5. Screen 3 (`/execution`), the ci.failed → auto-replan money shot — **not started**.
6. Zero tool-discovery moved into *planning* + `tool.discovered` event/card — **not started**.

## 4. Fastest path to a demo (triage — do in this order, stop when time runs out)

The demo only needs to *show the loop is real*. Cut ruthlessly. Priority order:

**P0 — prove it end-to-end at all (smallest possible frontend).**
- Option A (recommended if time is short): revive `teammate-b:web/` — a plain HTML/JS dashboard.
  Point its fetches at `http://localhost:8787/api/v1`, show the live `GET /events` stream + the
  `keeper_filed` counter from `/stats`. No build step, no React wiring. **This may be the single
  fastest way to a visible loop.**
- Option B: minimal `client/lib/keeper.ts` on `frontend` with just `useEvents` + `useStats` +
  `useCreateIssue`, wire the composer Send and the Issue timeline. Skip phases/Screen 3 for now.

**P1 — the merge-gate story.** Add the client-side `derivePhases(events)` fold (handoff §6) so the
`PlanningCard`/`MergeChecks` gate lights up from the event stream. **Skip the backend phase endpoint**
— derived-from-events is a sanctioned fallback and needs no `mainbackend` change.

**P2 — the money shot.** Screen 3 + `ci.failed → plan.revised`. If P0/P1 ate the clock, demo this
via a `curl POST /webhooks/ci.completed {status:"failure"}` and narrate the re-plan from the event
log instead of a built page.

**P3 — Zero-in-planning card.** Nice-to-have; only if everything above is solid.

## 5. Hard truths / risks

- **We have ~one frontend engineer's worth of work and little time.** Assume phases + Screen 3 may
  not ship as UI. That's OK — the backend already *does* all of it; we can narrate from events.
- **Don't touch `mainbackend`'s green state** except additive phase work. It's the only thing that
  definitely works on stage.
- **Don't re-merge `teammate-*`.** If someone asks "did we merge the teammates?" — yes, weeks ago,
  it's in `mainbackend`. The re-pushed branches are stale.

## 6. Recommended immediate next action

1. Pick P0 Option A or B (frontend approach) — this is the only real decision.
2. One person wires P0; if a second is available, they add `derivePhases` (P1) in parallel — no
   backend dependency, no conflict.
3. Re-check against `HANDOFF-round2.md` §8 at the end; demo whatever tier we reached, narrate the rest.
