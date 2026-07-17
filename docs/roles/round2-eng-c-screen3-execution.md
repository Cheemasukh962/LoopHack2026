# Engineer C — Screen 3: Execution & the Self-Correction Money Shot

**Branch:** `eng-c-screen3-execution` (off `frontend`)
**Read first:** `docs/HANDOFF-round2.md` (§3 is your job, plus §0 and §8.4), Engineer B's brief
(`round2-eng-b-frontend-wiring.md`) for the `client/lib/keeper.ts` hook signatures you consume, and
`client/pages/AgentIssue.tsx` to match the existing visual language.

You own **Screen 3** — the brand-new `/execution` route that shows the assignee executing the plan,
then CI going red, then **Keeper re-planning automatically** and the phase re-activating with no
human. This is the beat that turns "an app" into *loop engineering*. Make it legible on stage.

## Files you OWN (only you edit these)
- `client/App.tsx` — add one `<Route path="/execution" element={<Execution />} />` and its import.
  You own routing so your work never collides with Engineer B's page edits.
- `client/pages/Execution.tsx` — **NEW.** The Screen 3 page (`/execution?id=`). Read `id` from the
  query string. Show, in order:
  1. **Execution** — the assignee working the plan: `plan.file_boundary`, `plan.assignee`, the
     implementation phase marked `active` (from `usePhases(id)` / `useIssue(id)`).
  2. **CI red** — a "Trigger CI failure" button calling `useTriggerCi(id)`
     (`POST /webhooks/ci.completed {status:"failure"}`). On fire, the polled events surface
     `ci.failed` → implementation phase flips to **failed** (error state).
  3. **Self-correction** — the subsequent `plan.revised` event + new plan version appears and the
     implementation phase returns to **active**, all from the same `useEvents(id)` / `usePhases(id)`
     poll. **No page reload, no human.** Call this out visually — it's handoff §8.4. When the re-plan
     carries a `tool.discovered` event (Zero sponsor), surface it as the fix: "🧰 Keeper pulled in
     **{tool_name}** to fix it — {why}." That is Zero powering the self-correction, live on stage.
- `client/components/execution/*` — **NEW dir.** Any presentational subcomponents you need
  (ExecutionHeader, CiStatusBanner, RePlanCard, …). All new files, zero conflict with B.

## Files you IMPORT but never edit
`client/lib/keeper.ts` and `client/lib/phases.ts` (Engineer B's — use the documented hooks:
`useIssue`, `useEvents`, `usePhases`, `useTriggerCi`), existing components (`CommentCard`, `Layout`,
shadcn `components/ui/*`), `client/lib/utils.ts`. Do **not** edit `Index.tsx` or `AgentIssue.tsx`.

## Grounding rule (non-negotiable, handoff §0 & §9)
Every state you render must come from **real `loop_events`** (via B's hooks) — the derived phase fold
is the acceptable fallback, invented phase data is not. Screen 3 shows execution + re-plan; it does
**not** show Keeper editing product code (Keeper files specs, the re-plan is a new plan *version*).

## Dependencies & timing
You consume `client/lib/keeper.ts`, so code against B's published hook signatures. The real
self-correction (`ci.failed → plan.revised`) is delivered by **Engineer A's** backend handler; until
it lands, B's `derivePhases` still flips implementation to `failed` on the `ci.failed` event, so your
error state works. The auto-`active` re-plan is fully live once A merges.

## Definition of done (handoff §8.4)
1. `/execution?id=<a real issue>` renders the assignee + implementation phase from live data.
2. Clicking **Trigger CI failure** produces a visible error state driven by a real `ci.failed` event.
3. Without any reload or human action, the UI then shows the re-plan (`plan.revised` + new version)
   and the implementation phase returning to `active` — the loop fixing itself, on stage.

## Do NOT
Edit `keeper.ts`/`phases.ts` (ask B for a new hook instead). Fabricate phase/CI state. Touch
`Index.tsx` or `AgentIssue.tsx`. Show Keeper writing code.
